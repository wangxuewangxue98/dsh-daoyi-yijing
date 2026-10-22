// quad-hexagram.mjs — 四连卦（分层连卦）投影模块（引擎 384 结构加法版，v0.7.0 阶段1）
//
// 设计目标（改进方案 §阶段1）：把同一批 384 检查点按 4 个正交轴各投影成 6 爻卦，并对每爻用
// **基线分位阈值**（而非绝对 0.5）编码，消"恒阳爻"；输出四卦 + 四卦一致性矩阵（分歧样本=最值得人工复核）。
//
// 四刀切分（每组均为 384 检查点的互斥/正交切片，四卦各覆盖同一批检查点）：
//   卦① 域卦   di：6 活跃域（与现有单卦同口径，复用 agg.domain_results + 域基线 p50）
//   卦② 子域位卦 si：按子域位置序号 1-6（引擎 8 子域取前 6 位）分 6 组，爻=同子域位阳率
//   卦③ 业务族卦 ci：按子域业务族(L/T/S/M/R/C)分 6 组（subfamily-map.mjs），爻=同族阳率
//   卦④ 爻位卦   xi：按 aspect 序号 1-6 分 6 组，爻=同 aspect 阳率
//
// 与附件 quad-hexagram.mjs 的关系：附件绑在 1296 四层结构 + LLM 评分（未并入本仓库）。本模块是
// **引擎 384 三层结构的等价适配**，机制一致（四正交投影 + 基线分位 + 一致性矩阵），可离线全跑、零回归。
// 附件的 1296 四层剧本重建属改进方案 §阶段2（依赖 LLM 流水线，沙箱不可达），本模块不依赖之。
//
// 成爻规则：组内非 NA 检查点的「阳率（yinYang 均值）」≥ 基线分位阈值 → 阳；缺基线回落绝对 0.5。

import { hexNameFromYaos } from './hexagram.mjs'
import { getHexagramText } from './hexagram-texts.mjs'
import { FAMILY_LABELS, FAMILY_ORDER, familyOf, familyOfV2 } from './subfamily-map.mjs'

// 与 checkpoints.mjs buildStockScript 的 ASPECTS 严格一致（用于 ci→aspect 名映射，构造 familyOf 的 aspectName）
const ASPECTS = ['强度', '持续性', '确定性', '边际变化', '安全边际', '催化']

// 检查点 id 解析（S2 泛化，v0.8.0）：
//   8 位（1296 / stock-trend-v2）：域(2) + 分域位(2) + 子域位(2) + aspect位(2) → {di, si, ci, xi}
//   6 位（384 / stock-trend 型）：域(2) + 子域位(2) + aspect位(2)           → {di, si, ci}（ci=aspect 位，兼容旧口径）
export function parseCp(id) {
  if (typeof id === 'string' && /^[A-Za-z]{2}\d{6}$/.test(id)) {
    return { di: id.slice(0, 2), si: Number(id.slice(2, 4)), ci: Number(id.slice(4, 6)), xi: Number(id.slice(6, 8)) }
  }
  return { di: id.slice(0, 2), si: Number(id.slice(2, 4)), ci: Number(id.slice(4, 6)) }
}

// id 形态 → 结构模式：'v2'（1296 四层）/ 'legacy'（384 三层）/ null（不支持，调用方诚实降级）
export function structureModeOf(id) {
  if (typeof id !== 'string') return null
  if (/^[A-Za-z]{2}\d{6}$/.test(id)) return 'v2'
  if (/^[A-Za-z]{2}\d{4}$/.test(id)) return 'legacy'
  return null
}

function aspectNameOf(id) {
  const ci = Number(id.slice(4, 6))
  return ASPECTS[ci - 1] || null
}

// 卦①爻序解析（v0.9.0 F-1：形状容错 + 诚实降级，修复使用报告 E-1「升级即崩」）
//
//   ① declared        ：hex_order 为「扁平字符串数组且长 ≥6」→ 用剧本声明序
//   ② fallback:domains ：声明了但形状不可用（对象 {lower,upper} / 短数组 / 含非字符串元素）
//                        → 回落剧本 domains 声明序，并把原因写进输出（可审计，不静默）
//   ③ sancai          ：未声明 hex_order（384 等旧剧本）→ 沿用三才切分 di[:3]+tian[:3]（行为逐位不变）
//   ④ fallback:domains-padded：域不足 6 且无三才 → 补空位（该爻恒阴）而非 throw
//
// ⚠ 与单卦 hexagram.mjs buildOrderFromScript 的差异：单卦对畸形形状静默降级（有 pick 兜底保 3+3），
//   v0.8.0 的四卦路径会 throw new Error('di 分组数 != 6')——本函数**恒返回 6 项**，杜绝升级即崩。
export function hexOrderOf(script) {
  const declared = script && script.hex_order
  const usable =
    Array.isArray(declared) && declared.length >= 6 && declared.every((c) => typeof c === 'string')
  if (usable) return { order: declared.slice(0, 6), status: 'declared', note: '剧本 hex_order 声明序' }
  const domainCodes = ((script && script.domains) || []).map((d) => d && d.code).filter(Boolean)
  if (declared != null) {
    const shape = Array.isArray(declared) ? `array(len=${declared.length})` : typeof declared
    const note = `hex_order 形状不可用（${shape}）→ 回落剧本 domains 声明序（v0.9.0 起不再 throw）`
    if (domainCodes.length >= 6) return { order: domainCodes.slice(0, 6), status: 'fallback:domains', note }
    const padded = domainCodes.slice(0, 6)
    while (padded.length < 6) padded.push(`__slot${padded.length + 1}`)
    return {
      order: padded,
      status: 'fallback:domains-padded',
      note: `${note}；域仅 ${domainCodes.length} 个 → 补空位（该爻恒阴）`,
    }
  }
  const sm = (script && script.sancai_mapping) || {}
  const legacy = [...(sm.di || []).slice(0, 3), ...(sm.tian || []).slice(0, 3)]
  if (legacy.length === 6) {
    return {
      order: legacy,
      status: 'sancai',
      note: '未声明 hex_order → 三才切分 di[:3]+tian[:3]（384 口径；ren 宫不进卦①）',
    }
  }
  const padded = domainCodes.slice(0, 6)
  while (padded.length < 6) padded.push(`__slot${padded.length + 1}`)
  return {
    order: padded,
    status: domainCodes.length >= 6 ? 'fallback:domains' : 'fallback:domains-padded',
    note:
      `无 hex_order 且三才不完整 → 回落 domains 声明序` +
      (domainCodes.length < 6 ? `（域仅 ${domainCodes.length} 个 → 补空位）` : ''),
  }
}

// 兼容旧签名：只返回 6 项爻序数组（历史调用方不感知状态字段）
function activeOrder(script) {
  return hexOrderOf(script).order
}

// 从基线对象取某维度的分组阈值；缺则回落 0.5；冻结组（全市场无分化）→ Infinity 恒阴（对齐 quantileThresholds 约定）
function groupThreshold(baselines, dim, key) {
  const g = baselines && baselines.groups && baselines.groups[dim]
  if (!g || !g[key]) return 0.5
  if (g[key].frozen) return Infinity
  const t = g[key].p50
  return typeof t === 'number' && Number.isFinite(t) ? t : 0.5
}
function domainThreshold(baselines, code) {
  const d = baselines && baselines.domains && baselines.domains[code]
  if (!d) return 0.5
  const t = d.p50
  return typeof t === 'number' && Number.isFinite(t) ? t : 0.5
}

// 按维度把检查点分桶 → 6 组。valueKind: 'score'（用 agg 域分，仅 di）/ 'yang'（组内阳率，si/ci/xi）
// mode='v2'（1296 四层）：si/ci/xi 均为 id 位次原生 1-6（分域位/子域位/aspect位）；
// mode='legacy'（384 三层）：si 取子域位 1-6（7-8 折叠不进卦②）、ci 取业务族、xi 取 aspect 位。
// opts.ciGrouping='semantic'（v0.9.0 F-9）：v2 的卦③改按业务族语义分族（familyOfV2，36 分域→六族），
//   默认 'position'（子域位，官方现行为）。
function groupByDimension(db, evals, script, agg, dim, mode, opts = {}) {
  const ciGrouping = opts.ciGrouping === 'semantic' ? 'semantic' : 'position'
  const buckets = new Map()
  let na = 0
  const total = db.checkpoints.filter((c) => !c.na).length
  for (const cp of db.checkpoints) {
    if (cp.na) {
      na++
      continue
    }
    let key
    if (dim === 'di') key = cp.domain
    else if (mode === 'v2') {
      const p = parseCp(cp.id)
      if (dim === 'si') key = p.si
      else if (dim === 'ci') key = ciGrouping === 'semantic' ? familyOfV2(cp.id.slice(0, 4)) : p.ci
      else key = p.xi
    } else if (dim === 'si') key = parseCp(cp.id).si // 1-8，取 1-6
    else if (dim === 'ci') key = familyOf(cp.domain, aspectNameOf(cp.id))
    else if (dim === 'xi') key = parseCp(cp.id).ci // 1-6
    if (key == null) continue
    if (mode === 'legacy' && dim === 'si' && key > 6) continue // 子域位 7-8 不单独成爻（折叠进覆盖，不进卦②）
    if (!buckets.has(key)) buckets.set(key, { yang: [], score: [] })
    const ev = evals.get(cp.id)
    // ⚠ judgeYinYang 返回 +1(阳)/-1(阴)（非 0/1）；与 aggregator.mjs 同口径：仅 ===1 记阳
    const y = ev && ev.yinYang === 1 ? 1 : 0
    buckets.get(key).yang.push(y)
    if (dim === 'di' && agg && agg.domain_results && agg.domain_results[key]) {
      buckets.get(key).score.push(agg.domain_results[key].score)
    }
  }
  // 维度 → 爻序（保证 6 组、顺序确定）
  const order =
    dim === 'di'
      ? hexOrderOf(script).order
      : dim === 'si' || dim === 'xi'
        ? [1, 2, 3, 4, 5, 6]
        : mode === 'v2' && ciGrouping === 'position'
          ? [1, 2, 3, 4, 5, 6]
          : FAMILY_ORDER
  const groups = order.map((k) => {
    const b = buckets.get(k) || { yang: [], score: [] }
    const yang = b.yang.length ? b.yang.reduce((a, x) => a + x, 0) / b.yang.length : null
    // di 的 score 桶内是同一域分的重复 push（每检查点一次）；必须直接取值而非求均值——
    // 浮点均值可能偏差 1 ulp，当域分恰好等于基线 p50 时会翻转边界阴阳（实测 7/56 只错位）。
    const score = b.score.length ? b.score[0] : null
    return { key: k, covered: b.yang.length, yang, score }
  })
  // v0.9.0 F-1：不再 throw（`${dim} 分组数 != 6`），改为补空位（值 null → 恒阴）+ degraded 标记。
  // 爻序由 hexOrderOf 保证 6 项；此处仅作最后防线，保证任何畸形剧本都不崩。
  if (groups.length !== 6) {
    while (groups.length < 6) {
      groups.push({ key: `__slot${groups.length + 1}`, covered: 0, yang: null, score: null })
    }
    if (groups.length > 6) groups.length = 6
  }
  const degraded = groups.some((g) => String(g.key).startsWith('__slot'))
  return { dim, groups, total, na, degraded }
}

// 6 组（每组 {key, value, threshold}）→ 6 爻 → 卦名 + 判词 + 阳计数
function resolveHexFromGroups(groups, thresholds, getLabel) {
  const yaos = groups.map((g) => {
    if (g.value == null) return 0
    const th = thresholds[g.key] != null ? thresholds[g.key] : 0.5
    return g.value >= th ? 1 : 0
  })
  const name = hexNameFromYaos(yaos)
  const text = getHexagramText(name)
  const yang = yaos.reduce((a, b) => a + b, 0)
  return {
    yaos,
    name,
    yang,
    judgment: text.fallback ? '' : text.judgment,
    advice: text.fallback ? '' : text.advice,
    tone: text.fallback ? 'neutral' : text.tone,
    thresholds,
  }
}

// 主入口：四连卦（S2 泛化：384 legacy / 1296 v2 双结构）。
//   db = buildCheckpointDatabase(script)；evals = Map(cpId→{yinYang})；
//   agg = aggregate(db, evals)（卦① 复用其域分）；baselines = loadBaselines(script.script_id)。
//   opts.thresholdBasis = 'baseline'(默认，基线分位 p50) | 'absolute'（绝对 0.5，四卦与单卦同源）〔v0.9.0 F-5〕
//   opts.ciGrouping     = 'position'(默认，子域位) | 'semantic'（六业务族，仅 v2 生效）〔v0.9.0 F-9〕
// 结构守卫：仅支持 stock-trend 型 6 位 id（384）与 8 位 id（1296）；
//   其他 id 形态（motor-design 'EM01C01'、demo-384 'D01S1C1'）不支持 → 返回 null（诚实降级，不出退化卦）。
export function resolveQuadHexagram(db, evals, script, baselines, agg, opts = {}) {
  const sample = ((db.checkpoints.find((c) => !c.na) || {}).id) || ''
  const mode = structureModeOf(sample)
  if (!mode) return null
  const basis = opts.thresholdBasis === 'absolute' ? 'absolute' : 'baseline'
  const ciGrouping = opts.ciGrouping === 'semantic' ? 'semantic' : 'position'
  const ho = hexOrderOf(script)
  const dims = ['di', 'si', 'ci', 'xi']
  const meta =
    mode === 'v2'
      ? {
          di: { label: '域卦', desc: '6 域（JS/ZJ/XX/FX/JB/HY，六域全进卦）' },
          si: { label: '分域卦', desc: '域内同分域位 1-6' },
          ci: {
            label: '子域卦',
            desc:
              mode === 'v2' && ciGrouping === 'semantic'
                ? '六业务族 L/T/S/M/R/C（36 分域按语义分族）'
                : '分域内同子域位 1-6',
          },
          xi: { label: '爻位卦', desc: '六 aspect（强度/持续性/确定性/边际变化/安全边际/催化）' },
        }
      : {
          di: { label: '域卦', desc: '6 活跃域（JS/ZJ/GZ/HG/HY/FX）' },
          si: { label: '子域位卦', desc: '子域位置 1-6（前 6 类子域构成）' },
          ci: { label: '业务族卦', desc: '六业务族 L/T/S/M/R/C' },
          xi: { label: '爻位卦', desc: '六 aspect（强度/持续性/确定性/边际变化/安全边际/催化）' },
        }
  const hexes = {}
  for (const dim of dims) {
    const grouped = groupByDimension(db, evals, script, agg, dim, mode, { ciGrouping })
    const thresholds = {}
    const groups = grouped.groups.map((g) => {
      let value
      let th
      if (dim === 'di') {
        value = g.score // 域分（与现有单卦同口径）
        th = basis === 'absolute' ? 0.5 : domainThreshold(baselines, g.key)
      } else {
        value = g.yang // 阳率
        th = basis === 'absolute' ? 0.5 : groupThreshold(baselines, dim, g.key)
      }
      thresholds[g.key] = th
      return { key: g.key, covered: g.covered, value, threshold: th }
    })
    const hex = resolveHexFromGroups(groups, thresholds, null)
    hexes[`hex_${dim}`] = {
      from: dim,
      label: meta[dim].label,
      desc: meta[dim].desc,
      groups: groups.map((g) => ({
        key: g.key,
        label:
          dim === 'ci' && (mode === 'legacy' || ciGrouping === 'semantic')
            ? FAMILY_LABELS[g.key]
            : String(g.key),
        covered: g.covered,
        value: g.value == null ? null : Number(g.value.toFixed(4)),
        threshold: Number(g.threshold.toFixed(4)),
        yang: g.value != null ? (g.value >= g.threshold ? 1 : 0) : 0,
      })),
      coverage: { perHex: grouped.total, covered: groups.reduce((a, g) => a + g.covered, 0), na: grouped.na },
      degraded: Boolean(grouped.degraded),
      ...hex,
      yang_ratio: hex.yaos.reduce((a, b) => a + b, 0) / 6,
    }
  }
  // 一致性矩阵：四卦 tone 计数（分歧样本 = 最值得人工复核）
  const tones = ['auspicious', 'neutral', 'ominous']
  const toneCount = Object.fromEntries(
    tones.map((t) => [t, Object.values(hexes).filter((h) => h.tone === t).length]),
  )
  const distinctNames = new Set(Object.values(hexes).map((h) => h.name))
  return {
    structure: {
      mode,
      script_id: script && script.script_id,
      checks: db.checkpoints.length,
      // v0.9.0：编码口径与爻序来源全部显式化（报告 E-1/E-2/E-4 的可审计性要求）
      threshold_basis: basis,
      ci_grouping: ciGrouping,
      hex_order: { status: ho.status, order: ho.order, note: ho.note },
      degraded: Object.values(hexes).some((h) => h.degraded),
    },
    hexes,
    consistency: {
      toneCount,
      distinctNames: distinctNames.size,
      names: [...distinctNames],
      consensus: distinctNames.size === 1,
      // 分歧解读（用户报告 P1）：分歧时以卦①域卦为基准趋势卦，其余为辅助视角
      base_hex: distinctNames.size > 1 ? 'hex_di' : null,
    },
    coverage: { perHex: Object.values(hexes)[0].coverage.perHex, totalChecks: db.checkpoints.length, na: hexes.hex_di.coverage.na },
  }
}

// 文本输出（改进方案 §5.3 风格；S2：结构自适应 384/1296）
export function quadText(quad) {
  const order = ['hex_di', 'hex_si', 'hex_ci', 'hex_xi']
  const seq = ['①', '②', '③', '④']
  const structLabel = quad.structure && quad.structure.mode === 'v2' ? '1296 检查点（四层）' : '384 检查点'
  const lines = [`【四连卦】（${structLabel} · 四卦各覆盖 ${quad.coverage.perHex} ／ NA ${quad.coverage.na}）`]
  order.forEach((k, i) => {
    const h = quad.hexes[k]
    const j = h.judgment ? `：${h.judgment}（${h.advice}）` : ''
    lines.push(`  卦${seq[i]} ${h.label} ${h.name}${j} [阳${h.yang}/6 · ${h.tone}]`)
  })
  const cons = quad.consistency.consensus
    ? '四卦同象'
    : `分歧（${quad.consistency.distinctNames} 种卦象：${quad.consistency.names.join('、')}）` +
      (quad.consistency.base_hex ? `——以卦①域卦「${quad.hexes.hex_di.name}」为基准趋势卦，建议人工复核` : '，建议人工复核')
  lines.push(`  ——四卦一致性：${cons}`)
  const st = quad.structure || {}
  const foot = [
    `阈值基准=${st.threshold_basis === 'absolute' ? '绝对 0.5' : '基线分位 p50'}`,
    `卦③分组=${st.ci_grouping === 'semantic' ? '业务族语义' : '位置序号'}`,
    `爻序=${st.hex_order ? st.hex_order.status : '—'}`,
  ].join(' · ')
  if (st.degraded) lines.push(`  ——⚠ 结构降级：${foot}（爻序/分组不可用已补空位，该爻恒阴）`)
  else lines.push(`  ——编码口径：${foot}`)
  return lines.join('\n')
}

export default { parseCp, structureModeOf, hexOrderOf, activeOrder, groupByDimension, resolveHexFromGroups, resolveQuadHexagram, quadText }
