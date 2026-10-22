// quad-divergence.mjs — 卦象分歧深度解读（v0.9.1 P1）
//
// 背景：四连卦是同一批检查点的 4 个正交投影（域 / 子域位 / 业务族 / aspect）。
// 四卦不同象 = 同一批证据在不同切面下给出不同结论 —— **这是信息量最高的样本**，
// 但 v0.7.0~v0.9.0 只输出一句「分歧（N 种卦象：…）建议人工复核」：
//   既不说明「分歧在哪」，也不说明「以哪个为准」，更不指出「哪几爻一抖就翻面」。
// 本模块把「分歧」从一句提示升级为可审计的结构化解读：
//   ① 基准卦（域卦）与分歧卦的对照；② 分歧形态归类；③ 严重度；
//   ④ 敏感爻（贴阈值、最易翻面）；⑤ 人工复核焦点；⑥ 成段解读文案。
//
// 全部确定性（零云模型依赖）；可选由云模型扩写（enhanceDivergenceReading，显式开启才调用）。

import { callCloudModel, resolveCloudSettings } from './cloud-model.mjs'

const DIMS = ['hex_di', 'hex_si', 'hex_ci', 'hex_xi']
const SEQ = { hex_di: '①', hex_si: '②', hex_ci: '③', hex_xi: '④' }
const TONE_CN = { auspicious: '吉', neutral: '平', ominous: '凶' }

/** 形态 → 中文名 + 释义（确定性；不引入玄学承诺） */
const PATTERNS = {
  uniform: {
    label: '四卦同象',
    desc: '四个正交切面结论一致，证据自洽，结论稳健度最高。',
  },
  polarized: {
    label: '吉凶对峙',
    desc: '同一批证据在不同切面分别落吉与落凶——典型「整体与局部相悖」，结论对切面选择高度敏感。',
  },
  'top-heavy': {
    label: '上强下弱（域强而执行弱）',
    desc: '域层（卦①）明显偏阳，而子域/aspect 等执行层偏阴：大方向成立，落到具体环节处处打折。',
  },
  'bottom-heavy': {
    label: '下强上弱（执行强而域弱）',
    desc: '执行层偏阳而域层偏阴：局部指标不差，但被少数弱域拖住整体，改善需先补短板域。',
  },
  'single-outlier': {
    label: '单卦离群',
    desc: '三卦一致、唯独一卦相反：分歧集中在单一正交轴，优先核查该轴覆盖的检查点是否失真。',
  },
  layered: {
    label: '层级错位',
    desc: '四卦两两不同但无吉凶对冲：属「同一事实的不同侧面」，按关注切面取用即可。',
  },
}

function yangsOf(hexes) {
  return DIMS.map((k) => (hexes[k] ? hexes[k].yang : null)).filter((v) => v != null)
}

function tonesOf(hexes) {
  return DIMS.map((k) => (hexes[k] ? hexes[k].tone : null)).filter(Boolean)
}

/**
 * 分歧形态归类（确定性规则，顺序即优先级）。
 * @returns {{pattern:string, label:string, desc:string, severity:'high'|'medium'|'low', outliers:string[]}}
 */
export function classifyDivergence(hexes, consistency) {
  const names = new Set(DIMS.map((k) => hexes[k] && hexes[k].name).filter(Boolean))
  if (names.size <= 1) {
    return { pattern: 'uniform', ...PATTERNS.uniform, severity: 'low', outliers: [] }
  }
  const tones = tonesOf(hexes)
  const hasGood = tones.includes('auspicious')
  const hasBad = tones.includes('ominous')
  const ys = yangsOf(hexes)
  const base = hexes.hex_di ? hexes.hex_di.yang : null
  const rest = DIMS.slice(1).map((k) => (hexes[k] ? hexes[k].yang : null)).filter((v) => v != null)
  const restAvg = rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : 0
  const spread = ys.length ? Math.max(...ys) - Math.min(...ys) : 0

  // 离群卦：与基准卦 tone 相反，或阳数偏离基准 ≥3
  const outliers = DIMS.slice(1).filter((k) => {
    const h = hexes[k]
    if (!h) return false
    const toneFlip = hexes.hex_di && h.tone !== hexes.hex_di.tone && (h.tone === 'ominous' || hexes.hex_di.tone === 'ominous')
    const yangGap = base != null && Math.abs(h.yang - base) >= 3
    return Boolean(toneFlip || yangGap)
  })
  const nonOutliers = DIMS.slice(1).filter((k) => !outliers.includes(k))

  if (hasGood && hasBad) {
    return { pattern: 'polarized', ...PATTERNS.polarized, severity: 'high', outliers }
  }
  if (outliers.length === 1 && nonOutliers.length === 2) {
    return { pattern: 'single-outlier', ...PATTERNS['single-outlier'], severity: 'medium', outliers }
  }
  if (base != null && base - restAvg >= 2) {
    return { pattern: 'top-heavy', ...PATTERNS['top-heavy'], severity: spread >= 3 ? 'high' : 'medium', outliers }
  }
  if (base != null && restAvg - base >= 2) {
    return { pattern: 'bottom-heavy', ...PATTERNS['bottom-heavy'], severity: spread >= 3 ? 'high' : 'medium', outliers }
  }
  return { pattern: 'layered', ...PATTERNS.layered, severity: spread >= 3 ? 'medium' : 'low', outliers }
}

/**
 * 敏感爻：距阈值最近的若干爻（|value-threshold| 最小）——「一抖就翻面」的点，
 * 也是分歧最可能的成因。按 |gap| 升序取前 n 个。
 */
export function fragileYaos(hexes, n = 4) {
  const rows = []
  for (const k of DIMS) {
    const h = hexes[k]
    if (!h || !Array.isArray(h.groups)) continue
    for (const g of h.groups) {
      if (g.value == null || g.threshold == null) continue
      const gap = Number((g.value - g.threshold).toFixed(4))
      rows.push({
        dim: k,
        dim_label: h.label,
        key: g.key,
        label: g.label,
        value: g.value,
        threshold: g.threshold,
        gap,
        abs_gap: Math.abs(gap),
        yang: g.yang,
      })
    }
  }
  rows.sort((a, b) => a.abs_gap - b.abs_gap)
  return rows.slice(0, n)
}

/**
 * 主入口：四连卦 → 分歧深度解读。
 * @param {object} quad resolveQuadHexagram 的返回值
 * @param {{fragileN?:number}} [opts]
 */
export function resolveDivergence(quad, opts = {}) {
  if (!quad || !quad.hexes) return null
  const hexes = quad.hexes
  const cons = quad.consistency || {}
  const cls = classifyDivergence(hexes, cons)
  const baseKey = cons.base_hex || 'hex_di'
  const baseHex = hexes[baseKey]
  if (!baseHex) return null

  const toneMap = Object.fromEntries(DIMS.map((k) => [k, hexes[k] ? hexes[k].tone : null]))
  const yangMap = Object.fromEntries(DIMS.map((k) => [k, hexes[k] ? hexes[k].yang : null]))
  const nameMap = Object.fromEntries(DIMS.map((k) => [k, hexes[k] ? hexes[k].name : null]))
  const fragile = fragileYaos(hexes, opts.fragileN || 4)

  // 阳数极差：四卦分歧的「幅度」
  const ys = yangsOf(hexes)
  const spread = ys.length ? Math.max(...ys) - Math.min(...ys) : 0

  // 分歧卦（与基准不同象）
  const divergentKeys = DIMS.filter((k) => hexes[k] && hexes[k].name !== baseHex.name)
  const focus = []
  for (const k of cls.outliers.length ? cls.outliers : divergentKeys) {
    const h = hexes[k]
    if (h) focus.push(`${SEQ[k]}${h.label}「${h.name}」（阳 ${h.yang}/6 · ${TONE_CN[h.tone] || h.tone}）`)
  }
  for (const f of fragile.slice(0, 2)) {
    focus.push(`${SEQ[f.dim]}${f.dim_label} 的「${f.label}」爻贴阈值仅 ${f.abs_gap.toFixed(4)}（值 ${f.value} vs 阈 ${f.threshold}）`)
  }

  const reading = buildReading({
    divergent: Boolean(cons.consensus === false),
    baseKey,
    baseHex,
    hexes,
    cls,
    divergentKeys,
    fragile,
    spread,
    quad,
  })

  return {
    divergent: Boolean(cons.consensus === false),
    base: baseKey,
    base_name: baseHex.name,
    base_tone: baseHex.tone,
    distinct_names: cons.distinctNames != null ? cons.distinctNames : new Set(Object.values(nameMap).filter(Boolean)).size,
    names: cons.names || [...new Set(Object.values(nameMap).filter(Boolean))],
    tone_map: toneMap,
    yang_map: yangMap,
    name_map: nameMap,
    yang_spread: spread,
    pattern: cls.pattern,
    pattern_label: cls.label,
    pattern_desc: cls.desc,
    severity: cls.severity,
    outliers: cls.outliers,
    divergent_keys: divergentKeys,
    fragile_yaos: fragile,
    focus,
    reading,
    reading_source: 'deterministic',
  }
}

function buildReading({ divergent, baseKey, baseHex, hexes, cls, divergentKeys, fragile, spread, quad }) {
  if (!divergent) {
    const g = quad && quad.structure ? quad.structure : {}
    return (
      `四卦同象「${baseHex.name}」（${baseHex.judgment || '—'}）：四个正交切面（域/子域位/业务族/aspect）` +
      `给出一致结论，证据自洽度最高，可直接采用卦①口径` +
      `（口径：阈值=${g.threshold_basis || '—'} / 卦③分组=${g.ci_grouping || '—'}）。`
    )
  }
  const lines = []
  lines.push(
    `【分歧定性】四卦呈现${cls.label}——${cls.desc}` +
      `阳爻数极差 ${spread}（${DIMS.map((k) => `${SEQ[k]}${yangNum(hexes[k])}`).join('/')}），严重度 ${cls.severity}。`,
  )
  lines.push(
    `【以何为准】卦①域卦「${baseHex.name}」为基准趋势卦（${baseHex.judgment || '—'}${baseHex.advice ? `；${baseHex.advice}` : ''}）：` +
      `域卦与既有单卦同口径、且由八宫加权分编码，是四卦中唯一与 verdict 同源的投影；` +
      `卦②③④ 是同一批证据的横切视角，用于校验而非推翻基准。`,
  )
  const other = divergentKeys
    .map((k) => `${SEQ[k]}${hexes[k].label}「${hexes[k].name}」（${TONE_CN[hexes[k].tone] || hexes[k].tone}·阳${hexes[k].yang}/6${hexes[k].judgment ? `：${hexes[k].judgment}` : ''}）`)
    .join('；')
  if (other) lines.push(`【分歧所在】与基准不同象者：${other}。`)
  if (fragile.length) {
    const f = fragile[0]
    lines.push(
      `【最脆弱处】${SEQ[f.dim]}${f.dim_label}的「${f.label}」爻值 ${f.value}，阈值 ${f.threshold}，` +
        `仅差 ${f.abs_gap.toFixed(4)} —— 该爻是当前分歧的首要敏感点，行情/数据微变即可能翻面换卦。`,
    )
  }
  lines.push(
    `【怎么用】${severityAdvice(cls, baseHex)}`,
  )
  return lines.join('\n')
}

function yangNum(h) {
  return h ? h.yang : '—'
}

function severityAdvice(cls, baseHex) {
  if (cls.severity === 'high') {
    return (
      `分歧已达「高」级：不要把任一单卦结论当作最终判据。` +
      `建议 ① 以卦①「${baseHex.name}」定方向；② 按上方焦点清单人工核查对应检查点；` +
      `③ 结论对外表述须带区间（"偏强/偏弱"而非"可行/不可行"）。`
    )
  }
  if (cls.severity === 'medium') {
    return `分歧中等：方向可采信卦①「${baseHex.name}」，但强度需打折；按焦点清单复核离群轴覆盖的检查点后再定档。`
  }
  return `分歧轻微：四卦差异在 1~2 爻内，属正常投影噪声；采信卦①即可，无需额外复核。`
}

/**
 * 文本渲染（供 quadText / 工具紧凑输出复用）。
 */
export function divergenceText(div) {
  if (!div) return []
  const lines = []
  if (!div.divergent) {
    lines.push(`  ——卦象一致：${div.base_name}（${div.pattern_label}）`)
    return lines
  }
  lines.push(
    `  ——【分歧解读】${div.pattern_label}（严重度 ${div.severity}）：${div.pattern_desc}`,
  )
  lines.push(`  ——【基准】卦①域卦「${div.base_name}」为准；阳爻分布 ${DIMS.map((k) => `${SEQ[k]}${div.yang_map[k] ?? '—'}`).join('/')}（极差 ${div.yang_spread}）`)
  if (div.divergent_keys.length) {
    lines.push(
      `  ——【异象卦】${div.divergent_keys
        .map((k) => `${SEQ[k]}${div.name_map[k]}（${TONE_CN[div.tone_map[k]] || div.tone_map[k]}）`)
        .join('、')}`,
    )
  }
  if (div.fragile_yaos.length) {
    const f = div.fragile_yaos[0]
    lines.push(`  ——【最敏感爻】${SEQ[f.dim]}${f.dim_label}·${f.label}：值 ${f.value} vs 阈 ${f.threshold}（差 ${f.abs_gap.toFixed(4)}，一抖即翻）`)
  }
  for (const line of String(div.reading || '').split('\n')) {
    if (line.trim()) lines.push(`     ${line}`)
  }
  return lines
}

/**
 * 可选：用云模型扩写分歧解读（仅当调用方显式开启 opts.deepReading 且云模型已激活）。
 *
 * 设计约束（防幻觉）：
 *   ① 事实全部由引擎给出（四卦名/阳数/tone/敏感爻/verdict），模型只做**解读与建议**，不得改数；
 *   ② 要求模型先复述关键事实再解读（可核对），并要求标注「不确定处」；
 *   ③ 调用失败/返回空/明显跑题 → 原样保留确定性解读，reading_source 仍为 deterministic。
 * @returns {Promise<object>} div（原地增强后的副本）
 */
export async function enhanceDivergenceReading(div, quad, opts = {}) {
  if (!div || !div.divergent) return div
  const config = opts.config || {}
  let settings
  try {
    settings = resolveCloudSettings(config)
  } catch {
    settings = { enabled: false }
  }
  if (!settings.enabled) return div

  const hexes = (quad && quad.hexes) || {}
  const facts = {
    基准卦: `${div.base} ${div.base_name}（${div.base_tone}）`,
    四卦: DIMS.map((k) => (hexes[k] ? `${SEQ[k]}${hexes[k].label} ${hexes[k].name} 阳${hexes[k].yang}/6 ${hexes[k].tone}` : null))
      .filter(Boolean),
    阳爻极差: div.yang_spread,
    形态: `${div.pattern}（${div.pattern_label}）`,
    严重度: div.severity,
    敏感爻: (div.fragile_yaos || []).slice(0, 3).map((f) => `${SEQ[f.dim]}${f.dim_label}·${f.label} 值${f.value} 阈${f.threshold} 差${f.gap}`),
    结论: opts.verdict ? `${opts.verdict}（综合分 ${opts.score ?? '—'}）` : null,
    事项: opts.matter || null,
  }
  const system =
    '你是决策分析助手。以下是同一批证据在四个正交切面上投影出的卦象结果（事实由引擎算出，不得修改）。' +
    '请先复述关键事实（四卦名与阳数、分歧形态、敏感爻），再给出 200~350 字的中文深度解读，' +
    '说明：① 分歧意味着什么；② 应以哪个卦为准、为什么；③ 人工复核应优先看哪里；④ 明确列出你不确定的地方。' +
    '禁止编造数据、禁止给出确定的涨跌/成败承诺，只输出解读正文。'
  const user =
    `事实：\n${JSON.stringify(facts, null, 1)}\n\n` +
    `确定性基线解读（供参考，可深化但不得与事实冲突）：\n${div.reading}`
  let text = null
  try {
    text = await callCloudModel(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { config, tool: 'quad-divergence', temperature: 0.3 },
    )
  } catch {
    text = null
  }
  const clean = String(text || '').replace(/```[\s\S]*?```/g, '').trim()
  if (!clean || clean.length < 40) return div
  return {
    ...div,
    reading_template: div.reading,
    reading: clean,
    reading_source: 'llm',
    reading_model: settings.model || settings.provider || null,
  }
}

export default { resolveDivergence, classifyDivergence, fragileYaos, divergenceText, enhanceDivergenceReading }
