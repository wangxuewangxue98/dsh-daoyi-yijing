// stock-inputs.mjs — 股票剧本「行情 → 384 爻 inputs」共享适配（v0.6.0）
//
// 背景（P0-1，见 2026-10-22 测试记录分析）：yijing_divine 对话调用时 inputs 恒空 →
// 384 爻缺值兜底恒阳 → 八宫恒 100%、卦象恒乾为天。本模块把「腾讯行情 → 子域信号 →
// 检查点 inputs」的口径从批处理脚本抽出共享，供两条路径使用：
//   1) tools/yijing/divine.mjs（对话单只，symbol 参数 / matter 里自动提取代码）
//   2) scripts/calibrate_stock_baselines.mjs（全市场校准基线）
// 两条路径必须用同一口径 —— 基线分位数才有可比性。
//
// 无板块标签时的降级口径（诚实披露，rule 名与 meta 均标注）：
//   HY01 sectorPct 用大盘涨跌代理（无真实板块指数）；HY08 不出信号（避免与 HG07 同源）。
import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import {
  fetchQuotes,
  fetchIndexQuotes,
  quoteToSignals,
  createCurlFetcher,
  RULES_TEXT,
  DEFAULT_INDEX_SYMBOLS,
} from './quote.mjs'

// 与 scripts/divine_batch_stocks.mjs 保持一致的侧面铺开系数（强度/持续性/确定性/边际变化/安全边际/催化）
export const ASPECT_COEFS = [1.0, 0.5, 0.7, 0.8, 0.3, 0.0]
export const ASPECT_BIAS = [0, -0.08, 0.08, -0.04, 0.04, 0]

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/**
 * 从自然语言/参数中提取 A 股 6 位代码（去重、保序）。
 * 误抓风险（如日期 202610、电话号码）由「行情拉取失败 → 该代码无 quote」自然过滤。
 */
export function extractCodes(text, max = 8) {
  const s = String(text || '')
  const out = []
  const re = /\b(\d{6})\b/g
  let m
  while ((m = re.exec(s)) !== null) {
    const c = m[1]
    // 排除明显非代码：全 0 / 全同数字 / 以 9 开头（B 股除外规则从简，交由行情校验）
    if (/^(\d)\1{5}$/.test(c) || c === '000000') continue
    if (!out.includes(c)) out.push(c)
    if (out.length >= max) break
  }
  return out
}

/**
 * 子域级信号 → 384 检查点 inputs + NA 名单（与批处理脚本 buildInputs 同口径）。
 * 活跃子域的 6 个评估侧面按 ASPECT_COEFS/BIAS 铺开；未激活子域全部 NA（不造假）。
 * @returns {{inputs: Record<string,number>, naIds: string[], activeDomains: string[]}}
 */
export function signalsToInputs(signals, db = buildCheckpointDatabase(buildStockScript())) {
  const activeKeys = new Set(
    (signals || []).map((s) => `${s.code}${String(s.subIdx + 1).padStart(2, '0')}`),
  )
  const inputs = {}
  const naIds = []
  for (const cp of db.checkpoints) {
    const key = cp.id.slice(0, 4) // 如 JS01
    if (!activeKeys.has(key)) {
      naIds.push(cp.id)
      continue
    }
    const sig = (signals || []).find(
      (s) => `${s.code}${String(s.subIdx + 1).padStart(2, '0')}` === key,
    )
    const ci = Number(cp.id.slice(5, 7)) - 1 // 侧面序号 0..5
    inputs[cp.id] = Number(
      clamp(0.5 + sig.delta * ASPECT_COEFS[ci] + ASPECT_BIAS[ci], 0.02, 0.98).toFixed(4),
    )
  }
  const activeDomains = [...new Set((signals || []).map((s) => s.code))]
  return { inputs, naIds, activeDomains }
}

/** 取数器解析：显式 fetcher > 代理环境 curl > 全局 fetch（quote.mjs 默认） */
function resolveFetcher(opts = {}) {
  if (typeof opts.fetcher === 'function') return opts.fetcher
  const env = (typeof process !== 'undefined' && process.env) || {}
  const proxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || ''
  if (proxy) return createCurlFetcher({ proxy, timeoutMs: opts.timeoutMs || 10000 })
  return undefined // 交回 quote.mjs 的默认 fetch
}

/**
 * 拉行情并为每只股票构建 384 爻 inputs（对话单只 / 校准批量共用）。
 * @param {string[]} codes 6 位代码
 * @param {object} opts fetchQuotes/fetchIndexQuotes 透传（fetcher/timeoutMs/indexSymbols）+ sectorPctOf(code)
 * @returns {{byCode: Map<string,{quote,signals,inputs,naIds,activeDomains}>,
 *            meta:{requested,fetched,error,indexContext,indexError,rules,sector_proxy}}}
 */
export async function buildStockInputs(codes, opts = {}) {
  const wanted = [...new Set((codes || []).map((c) => String(c).replace(/\D/g, '')).filter(Boolean))]
  const fetcher = resolveFetcher(opts)
  const { quotes, fetched, error } = await fetchQuotes(wanted, { ...opts, fetcher })

  // 指数基准（HG 相对量口径的数据入口）；失败不致命 → 相关子域自动 NA
  let indexContext = null
  let indexError = null
  const idxSymbols = opts.indexSymbols === null ? null : opts.indexSymbols || DEFAULT_INDEX_SYMBOLS
  if (idxSymbols) {
    const r = await fetchIndexQuotes(idxSymbols, { ...opts, fetcher })
    indexContext = r.indexContext
    indexError = r.error
  }

  // 板块口径：调用方可注入 sectorPctOf(code)（如校准/批处理有板块标签时）；
  // 无板块信息 → 回退大盘代理（HY01），并如实标注。
  const sectorProxy = !opts.sectorPctOf
  const byCode = new Map()
  for (const [code, q] of quotes) {
    if (!q) continue
    const sectorPct = opts.sectorPctOf
      ? opts.sectorPctOf(code, q)
      : indexContext && Number.isFinite(indexContext.pct)
        ? indexContext.pct
        : undefined
    const signals = quoteToSignals(q, {
      sectorPct,
      // 无板块成交额均值 → 不给 sectorAmountWan（HY08 不出信号，避免与 HG07 同源）
      sectorAmountWan: undefined,
      indexCtx: indexContext,
    })
    byCode.set(code, { quote: q, name: q.name, signals, ...signalsToInputs(signals) })
  }

  return {
    byCode,
    meta: {
      requested: wanted.length,
      fetched,
      error,
      indexContext,
      indexError,
      rules: RULES_TEXT,
      sector_proxy: sectorProxy
        ? '无板块标签：HY01 用大盘涨跌代理、HY08 不出信号（避免与 HG07 同源）'
        : null,
    },
  }
}

export default { extractCodes, signalsToInputs, buildStockInputs, ASPECT_COEFS, ASPECT_BIAS }
