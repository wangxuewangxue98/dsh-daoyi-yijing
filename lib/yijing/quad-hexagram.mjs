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
import { FAMILY_LABELS, FAMILY_ORDER, familyOf } from './subfamily-map.mjs'

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

// 引擎 6 活跃爻（S2 泛化）：剧本声明 hex_order（1296 六域全进卦）优先；
// 否则回落 sancai 切分（384 口径：lower=di[:3] + upper=tian[:3]，ren 宫不进卦①）。
function activeOrder(script) {
  if (script && Array.isArray(script.hex_order) && script.hex_order.length >= 6) {
    return script.hex_order.slice(0, 6)
  }
  const sm = (script && script.sancai_mapping) || {}
  const lower = (sm.di || []).slice(0, 3)
  const upper = (sm.tian || []).slice(0, 3)
  return [...lower, ...upper]
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
function groupByDimension(db, evals, script, agg, dim, mode) {
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
      else if (dim === 'ci') key = p.ci
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
      ? activeOrder(script)
      : dim === 'si' || dim === 'xi'
        ? [1, 2, 3, 4, 5, 6]
        : mode === 'v2'
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
  if (groups.length !== 6) throw new Error(`${dim} 分组数 != 6: ${groups.length}`)
  return { dim, groups, total, na }
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
// 结构守卫：仅支持 stock-trend 型 6 位 id（384）与 8 位 id（1296）；
//   其他 id 形态（motor-design 'EM01C01'、demo-384 'D01S1C1'）不支持 → 返回 null（诚实降级，不出退化卦）。
export function resolveQuadHexagram(db, evals, script, baselines, agg) {
  const sample = ((db.checkpoints.find((c) => !c.na) || {}).id) || ''
  const mode = structureModeOf(sample)
  if (!mode) return null
  const dims = ['di', 'si', 'ci', 'xi']
  const meta =
    mode === 'v2'
      ? {
          di: { label: '域卦', desc: '6 域（JS/ZJ/XX/FX/JB/HY，六域全进卦）' },
          si: { label: '分域卦', desc: '域内同分域位 1-6' },
          ci: { label: '子域卦', desc: '分域内同子域位 1-6' },
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
    const grouped = groupByDimension(db, evals, script, agg, dim, mode)
    const thresholds = {}
    const groups = grouped.groups.map((g) => {
      let value
      let th
      if (dim === 'di') {
        value = g.score // 域分（与现有单卦同口径）
        th = domainThreshold(baselines, g.key)
      } else {
        value = g.yang // 阳率
        th = groupThreshold(baselines, dim, g.key)
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
        label: mode === 'legacy' && dim === 'ci' ? FAMILY_LABELS[g.key] : String(g.key),
        covered: g.covered,
        value: g.value == null ? null : Number(g.value.toFixed(4)),
        threshold: Number(g.threshold.toFixed(4)),
        yang: g.value != null ? (g.value >= g.threshold ? 1 : 0) : 0,
      })),
      coverage: { perHex: grouped.total, covered: groups.reduce((a, g) => a + g.covered, 0), na: grouped.na },
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
    structure: { mode, script_id: script && script.script_id, checks: db.checkpoints.length },
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
  return lines.join('\n')
}

export default { parseCp, structureModeOf, activeOrder, groupByDimension, resolveHexFromGroups, resolveQuadHexagram, quadText }
