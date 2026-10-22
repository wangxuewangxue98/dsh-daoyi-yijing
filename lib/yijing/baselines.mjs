// baselines.mjs — 卦象编码参照系（基线表，v0.6.0）
//
// 背景（P0-2 / 64 卦扩充）：v0.5.1 的 quantileThresholds 是「批次内」分位数 —— 批量推演
// 有参照系，但对话里单只/单事项调用没有批次 → 回落绝对阈值 0.5 → 各宫分挤同一侧 → 恒乾系。
// 本模块提供**独立于本次调用的参照系**：阈值来自离线校准出的总体分位（默认 P50 中位数），
// 使每个活跃爻≈50/50，单样本即可触达 64 卦空间。
//
// 语义变化（重要，向用户披露）：爻义从「绝对分 ≥0.5」变为「相对参照系偏强/偏弱」——
// 例如 JS 爻阳 = 技术面强于市场中位。这比绝对阈值更有信息量，也更符合「比较」直觉。
//
// 来源三路（见 baselines-stock.json 的 meta）：
//   A 全市场一次性校准（scripts/calibrate_stock_baselines.mjs，随包发布）
//   B LLM 打分分布（通用事项冷启动；LLM 路径语义为绝对自评 → 不用本表，走 absolute）
//   C 灰度日志自学习（后续版本：批次中位数滚动回写）
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_BASELINE_FILE = fileURLToPath(new URL('./baselines-stock.json', import.meta.url))

// 按剧本的基线文件映射（S2/S4：1296 与 384 基线分文件，防混用——设计文档 §八风险对策）
const SCRIPT_BASELINE_FILES = {
  'stock-trend': DEFAULT_BASELINE_FILE,
  'stock-trend-v2': fileURLToPath(new URL('./baselines-stock-v2.json', import.meta.url)),
}

/**
 * 加载基线表。
 * @param {string} scriptId 剧本 id（stock-trend 等）；剧本不匹配返回 null
 * @param {{file?: string}} [opts] 自定义路径（config.stockBaselinesPath）
 * @returns {object|null} { script_id, generated_at, sample_size, domains: {JS:{p25,p50,p75},...} }
 */
export function loadBaselines(scriptId = 'stock-trend', opts = {}) {
  const file = opts.file || SCRIPT_BASELINE_FILES[scriptId] || DEFAULT_BASELINE_FILE
  try {
    if (!existsSync(file)) return null
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (!data || data.script_id !== scriptId) return null
    if (!data.domains || typeof data.domains !== 'object') return null
    return data
  } catch {
    return null // 损坏文件按无基线处理（回落 absolute），不阻断推演
  }
}

/**
 * 基线 → 卦象编码阈值。q 取 'p25'（严）/'p50'（默认，满熵）/'p75'（宽）。
 * @returns {Record<string, number>} { JS: 0.52, ZJ: 0.48, ... }（缺域不出键 → 该爻回落 0.5）
 */
export function thresholdsFromBaselines(baselines, q = 'p50') {
  const out = {}
  for (const [code, v] of Object.entries((baselines && baselines.domains) || {})) {
    const t = v && v[q]
    if (typeof t === 'number' && Number.isFinite(t)) out[code] = t
  }
  return out
}

/**
 * 分组基线 → 卦②③④ 阈值（si 子域位 / ci 业务族 / xi aspect）。
 * @param {object} baselines 含 groups.{si,ci,xi} 的基线对象
 * @param {'si'|'ci'|'xi'} dim 分组维度
 * @param {string} q 'p25'|'p50'|'p75'
 * @returns {Record<string, number>} { '1': 0.52, L: 0.48, ... }（缺组不出键 → 该爻回落 0.5）
 */
export function groupThresholdsFromBaselines(baselines, dim, q = 'p50') {
  const g = (baselines && baselines.groups && baselines.groups[dim]) || {}
  const out = {}
  for (const [k, v] of Object.entries(g)) {
    const t = v && v[q]
    if (typeof t === 'number' && Number.isFinite(t)) out[k] = t
  }
  return out
}

/**
 * v0.9.1 N-2：基线版本画像 —— 让「用的是哪张基线表」在输出里可见。
 * 此前四连卦只把阈值算进去，输出不交代基线来源/生成时间/口径，
 *   同一只股票换台机器得出不同卦象时无从归因（报告 N-2）。
 * @param {object|null} baselines
 * @param {{engineVersion?:string, now?:number, staleDays?:number}} [opts]
 */
export function baselineMetaOf(baselines, opts = {}) {
  const engineVersion = opts.engineVersion || readEngineVersion()
  if (!baselines) {
    return {
      present: false,
      engine_version: engineVersion,
      note: '无基线表 → 阈值回落绝对 0.5（爻义=绝对强弱，非「相对参照系偏强/偏弱」）',
    }
  }
  const meta = baselines.meta || {}
  const cal = meta.calibration || {}
  const gen = baselines.generated_at ? Date.parse(baselines.generated_at) : NaN
  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  const ageDays = Number.isFinite(gen) ? Math.round((now - gen) / 86400000) : null
  const staleDays = typeof opts.staleDays === 'number' ? opts.staleDays : 30
  const stale = ageDays != null && ageDays > staleDays
  const sampleSize = baselines.sample_size ?? meta.sample_count ?? null
  return {
    present: true,
    script_id: baselines.script_id || null,
    generated_at: baselines.generated_at || null,
    age_days: ageDays,
    sample_size: sampleSize,
    seed: baselines.seed ?? null,
    quantile: baselines.quantile ?? null,
    ci_grouping: cal.ci_grouping || meta.ci_grouping || null,
    calibration_days: cal.days ?? null,
    engine_version: engineVersion,
    stale,
    stale_days: staleDays,
    note: stale
      ? `基线已生成 ${ageDays} 天（> ${staleDays} 天）：分位阈值可能已漂移，建议用 scripts/calibrate_stock_baselines.mjs 重校准`
      : `基线 ${baselines.script_id || '?'} · ${baselines.generated_at || '时间未知'} · n=${sampleSize ?? '?'}` +
        (cal.ci_grouping ? ` · 卦③分组=${cal.ci_grouping}` : ''),
  }
}

let _engineVersion = null
/** 读引擎（包）版本，用于输出标注；读不到返回 ''（不影响推演） */
export function readEngineVersion() {
  if (_engineVersion !== null) return _engineVersion
  try {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    )
    _engineVersion = String(pkg.version || '')
  } catch {
    _engineVersion = ''
  }
  return _engineVersion
}

/** 基线摘要（供工具输出/日志展示，可审计） */
export function describeBaselines(baselines) {
  if (!baselines) return null
  return {
    script_id: baselines.script_id,
    generated_at: baselines.generated_at || null,
    sample_size: baselines.sample_size || null,
    domains: Object.fromEntries(
      Object.entries(baselines.domains).map(([k, v]) => [k, { p25: v.p25, p50: v.p50, p75: v.p75 }]),
    ),
  }
}

// ── v0.7.2 分层阈值（按层参照系）：市值带 × 涨跌带 ──
// 动机：分层校准审计（meta.strata.domain_p50_spread）实测 JS/ZJ/XX 跨层极差 0.26~0.5 ——
//   同一「市场中位」对小盘成长股与大盘蓝筹的偏强/偏弱语义不同。单股调用时 stratum 可由行情快照
//   直接得知（totalCap/pct），故阈值可按层取：爻义从「相对全市场」细化为「相对同市值+同动量层」。
// 带宽定义与 calibrate_stock_baselines.mjs 共用同一函数（校准与调用必须同源，否则分层无意义）。
export const capBand = (v) =>
  v == null ? 'u_未知' : v < 50 ? 'a_<50亿' : v < 200 ? 'b_50-200亿' : v < 1000 ? 'c_200-1000亿' : 'd_>1000亿'
export const pctBand = (v) =>
  v == null ? 'u_未知' : v <= -2 ? 'a_≤-2%' : v < 0 ? 'b_-2~0%' : v < 2 ? 'c_0~2%' : 'd_≥2%'
export const stratumOfQuote = (quote) =>
  `${capBand(quote && quote.totalCap)}|${pctBand(quote && quote.pct)}`

const MIN_STRATUM_N = 20 // 层内样本不足 → 回落总体阈值（防小样本分位噪声被当成市场差异）

/**
 * 分层阈值解析：stratumKey → 该层域阈值 + 分组阈值。
 * @returns {{domains: Record<string,number>, groups: {si:Object,ci:Object,xi:Object}}|null}
 *   层不存在 / 样本量不足 / 无分位 → null（调用方回落总体阈值）
 */
export function stratumThresholdsFromBaselines(baselines, stratumKey, q = 'p50') {
  const cell = baselines && baselines.strata && baselines.strata.cells && baselines.strata.cells[stratumKey]
  if (!cell || !(cell.n >= MIN_STRATUM_N)) return null
  // 阈值形状归一：校准输出的 domain_thresholds 是扁平数值 {JS:0.7}，分组是对象 {p50:…}——两种都收
  const pick = (v) => (typeof v === 'number' ? v : v && v[q])
  const out = { domains: {}, groups: { si: {}, ci: {}, xi: {} } }
  for (const [code, v] of Object.entries(cell.domain_thresholds || {})) {
    const t = pick(v)
    if (typeof t === 'number' && Number.isFinite(t)) out.domains[code] = t
  }
  for (const dim of ['si', 'ci', 'xi']) {
    for (const [k, v] of Object.entries((cell.group_thresholds || {})[dim] || {})) {
      // 层内冻结组：与总体口径一致（frozen → Infinity 恒阴）
      if (v && v.frozen) {
        out.groups[dim][k] = Infinity
        continue
      }
      const t = pick(v)
      if (typeof t === 'number' && Number.isFinite(t)) out.groups[dim][k] = t
    }
  }
  if (!Object.keys(out.domains).length) return null
  return out
}

/**
 * 分层基线对象：把某层阈值包装成与 loadBaselines 同构的 baselines（供 resolveQuadHexagram 直接吃）。
 * 缺层 / 样本不足 → null（调用方用总体 baselines）。
 */
export function baselinesForStratum(baselines, stratumKey, q = 'p50') {
  const st = stratumThresholdsFromBaselines(baselines, stratumKey, q)
  if (!st) return null
  const wrap = (flat) => Object.fromEntries(Object.entries(flat).map(([k, t]) => [k, { [q]: t }]))
  const wrapFrozen = (flat) => {
    // frozen（Infinity）需保留标记：quad-hexagram 的 groupThreshold 依赖 frozen 字段判恒阴
    const src = ((baselines.strata.cells[stratumKey] || {}).group_thresholds) || {}
    const o = {}
    for (const [dim, g] of Object.entries(flat)) {
      o[dim] = Object.fromEntries(
        Object.entries(g).map(([k, t]) => [k, t === Infinity ? { frozen: true } : { [q]: t }]),
      )
    }
    // 无分组阈值时回落总体 groups（层内样本够了但某维缺键 → 用总体，不用绝对 0.5）
    for (const dim of ['si', 'ci', 'xi']) {
      if (!Object.keys(o[dim]).length && baselines.groups && baselines.groups[dim]) {
        o[dim] = baselines.groups[dim]
      }
    }
    return o
  }
  return {
    script_id: baselines.script_id,
    generated_at: baselines.generated_at || null,
    sample_size: baselines.sample_size || null,
    stratum: stratumKey,
    domains: wrap(st.domains),
    groups: wrapFrozen(st.groups),
  }
}

/**
 * 分层审计元数据（v0.9.0 F-2）：给定 baselines 与行情快照，返回该标的所属层、层内样本量与是否生效。
 * 用于把「分层阈值是否真的吃到」写进每条推演记录（此前只有 divine 单只路径有，batch 完全没有）。
 * @returns {{stratum:string, n:number, used:boolean, reason:string|null}}
 */
export function stratumMetaOf(baselines, quote) {
  const stratum = stratumOfQuote(quote)
  const cell = baselines && baselines.strata && baselines.strata.cells && baselines.strata.cells[stratum]
  const n = cell && cell.n != null ? cell.n : 0
  if (!cell) return { stratum, n: 0, used: false, reason: 'stratum-not-calibrated' }
  if (!(n >= MIN_STRATUM_N)) return { stratum, n, used: false, reason: `n<${MIN_STRATUM_N}` }
  return { stratum, n, used: true, reason: null }
}

export default {
  loadBaselines,
  thresholdsFromBaselines,
  groupThresholdsFromBaselines,
  describeBaselines,
  stratumThresholdsFromBaselines,
  baselinesForStratum,
  stratumOfQuote,
  stratumMetaOf,
  capBand,
  pctBand,
}
