// mapping.mjs — 参数取值解析 + 阴阳判定（确定性，零云模型依赖）
// 对应于 Python 原型 yijing_mapping.py:357 build_evaluation_data / :306 _resolve_fields / :260 _threshold_mid

// 缺失值保守兜底：返回“通过边界”值（缺值按达标计，需在 M1 调为风险厌恶口径并显式标注可审计）
export function thresholdMid(cp) {
  const t = cp.threshold || []
  switch (cp.threshold_type) {
    case 'min':
      return t[0] != null ? t[0] : 0
    case 'max':
      return t[1] != null ? t[1] : 0
    case 'range': {
      const [lo, hi] = t
      if (lo == null) return hi != null ? hi : 0
      if (hi == null) return lo
      return (lo + hi) / 2
    }
    case 'boolean':
      return true
    default:
      return null
  }
}

// 从输入取值；缺值返回 null（交由 judge 走阈值兜底），绝不伪造数据。
// v0.6.0 新增宫级简写：inputs 可直接给 {"JB":0.6}（八宫 code），该域全部活跃检查点同值。
// 动机：LLM 打分路径（yijing_factor_prompt 回填）按宫给分 —— 8 个数即可驱动全引擎。
// 取值优先级：检查点精确 id > 宫级 code > null。宫级取值时该域内 6 侧面同值（不臆造梯度）。
// origin 标记（v0.6.1）：宫级取值必须与工程量纲阈值解耦——motor-design 的阈值是
// 温升 K/温度 ℃/boolean[1,1] 等工程单位，把 LLM 的 0~1 自评分直接比阈值必然全阴
// （实测 6 宫全否决、连「乐观」场景也判不可行）。故宫级取值走归一化语义：>=0.5 为阳。
export function resolveValueWithOrigin(cp, inputs) {
  if (inputs && Object.prototype.hasOwnProperty.call(inputs, cp.id)) {
    return { value: inputs[cp.id], origin: 'checkpoint' }
  }
  if (inputs && cp.domain && Object.prototype.hasOwnProperty.call(inputs, cp.domain)) {
    return { value: inputs[cp.domain], origin: 'domain' }
  }
  return { value: null, origin: null }
}

export function resolveValue(cp, inputs) {
  return resolveValueWithOrigin(cp, inputs).value
}

/**
 * inputs 覆盖画像（v0.6.0）：兜底率可审计，杜绝「缺值退化」不可察觉。
 * 额外报 unmatched：传入的键既不匹配任何活跃检查点 id、也不匹配任何宫 code ——
 * 典型事故是 LLM/调用方用错宫码（如给 motor-design 传 JB/JS/ZJ），
 * 旧实现会静默忽略这些键并继续用缺值兜底出「100% 可行」，用户完全无法察觉。
 * provided 按「活跃检查点被覆盖数」计（宫级简写覆盖该域全部活跃检查点）。
 * @returns {{granularity, provided, active, coverage, unmatched: string[]}}
 */
export function inputsCoverage(db, inputs) {
  const active = db.checkpoints.filter((c) => !c.na)
  if (!active.length) return { granularity: 'none', provided: 0, active: 0, coverage: 0, unmatched: [] }
  const domainCodes = new Set(Object.keys(db.domainIndex || {}))
  const checkpointIds = new Set(active.map((c) => c.id))
  let checkpointHits = 0
  let domainHits = 0
  for (const cp of active) {
    if (inputs && Object.prototype.hasOwnProperty.call(inputs, cp.id)) checkpointHits++
    else if (inputs && cp.domain && Object.prototype.hasOwnProperty.call(inputs, cp.domain)) domainHits++
  }
  const unmatched = []
  for (const key of Object.keys(inputs || {})) {
    if (!checkpointIds.has(key) && !domainCodes.has(key)) unmatched.push(key)
  }
  const provided = checkpointHits + domainHits
  const granularity = checkpointHits > 0 ? 'checkpoint' : domainHits > 0 ? 'domain' : 'none'
  return {
    granularity,
    provided,
    active: active.length,
    coverage: provided / active.length,
    unmatched,
  }
}

// 阴阳判定：符合阈值=阳(+1)，不符合=阴(-1)
// v0.6.1：origin==='domain'（宫级自评）时走归一化语义 value>0.5，绕开工程量纲阈值
export function judgeYinYang(cp, value, origin = 'checkpoint') {
  if (origin === 'domain') {
    // 宫级自评语义（prompt 已明示：0=极弱/极不利，0.5=中性/无证据，1=极强/极有利；且明确「0.5 会被判为阳爻边界」）。
    // 故采用 ≥：0.5=中性边界即判阳，与 factor_prompt 指引一致（缺陷①修复）。
    // 全 0.5 自评→全阳→可行的假阳性顾虑，由 factor_prompt「无证据的宫给 0.45~0.55、避免恰好 0.5」
    // + 零有效输入时 verdict 强制为「不可行（数据不足）」（reviewer.mjs applyInsufficientDataOverride）共同化解。
    if (typeof value !== 'number' || !Number.isFinite(value)) return -1
    return value >= 0.5 ? 1 : -1
  }
  if (value == null) value = thresholdMid(cp)
  const t = cp.threshold || []
  let pass
  switch (cp.threshold_type) {
    case 'min':
      pass = typeof value === 'number' && value >= (t[0] ?? -Infinity)
      break
    case 'max':
      pass = typeof value === 'number' && value <= (t[1] ?? Infinity)
      break
    case 'range': {
      const [lo, hi] = t
      pass =
        (lo == null || (typeof value === 'number' && value >= lo)) &&
        (hi == null || (typeof value === 'number' && value <= hi))
      break
    }
    case 'boolean':
      // 对齐 Python 原型 _check_threshold：boolean 型 pass = (value == 1)。
      // 输入可为 1/0（数值）或 true/false（布尔），均按“阳=达标”判定。
      pass = value === 1 || value === true
      break
    default:
      pass = false
  }
  return pass ? 1 : -1 // 阳 +1 / 阴 -1
}
