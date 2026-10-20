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

// 从输入取值；缺值返回 null（交由 judge 走阈值兜底），绝不伪造数据
export function resolveValue(cp, inputs) {
  if (inputs && Object.prototype.hasOwnProperty.call(inputs, cp.id)) {
    return inputs[cp.id]
  }
  return null
}

// 阴阳判定：符合阈值=阳(+1)，不符合=阴(-1)
export function judgeYinYang(cp, value) {
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
