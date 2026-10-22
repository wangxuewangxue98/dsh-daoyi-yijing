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

/**
 * v2（1296 / stock-trend-v2）版 inputs 构建（阶段 2 / S3，v0.8.0；P2 精映射 v0.8.1）。
 * 与 signalsToInputs 的差异：
 *   ① 迁移映射：384 形态信号（子域码 JS01..FX08）经 migrationMap 汇聚到 36 分域
 *      （同分域多子域信号取均值；无信号分域 → 全部 NA，不造假）；
 *   ② aspect 位取 id **末两位**（8 位 id 的第 7-8 位；6 位口径取 5-7 位，勿混）；
 *   ③ 粒度两档：
 *      - fineMap=null（L2）：每分域 36 项同 delta 铺开——卦②/卦③激活、卦④同质
 *        （文档化局限；L3 子域级数据由 llm-scoring.mjs 补分升级）；
 *      - fineMap=FINE_MAP（P2 子域粒度）：信号落到「分域×子域位」→ 卦③（子域位）
 *        在无 LLM 时部分激活（未命中子域 NA，aspect 仍同质 → 卦④不变）。
 * @param {Array} signals quoteToSignals 产物（384 形态）
 * @param {object} db buildCheckpointDatabase(v2Script)
 * @param {Record<string,string>} migrationMap 旧子域码 → 新分域码（v2.migrated_from.mapping）
 * @param {object|null} [fineMap] 旧子域码 → {sd, sub}（subdomain-fine-map.mjs FINE_MAP；P2 精映射）
 */
export function signalsToInputsV2(signals, db, migrationMap, fineMap = null) {
  // ① 迁移汇聚：旧子域码 → 分域 delta 均值（L2）；fineMap 命中 → 分域×子域位 delta 均值（P2）
  const acc = new Map() // key = 分域码（L2）或 `${分域码}|${子域位}`（fine）
  let fineHits = 0
  for (const s of signals || []) {
    const oldSub = `${s.code}${String(s.subIdx + 1).padStart(2, '0')}`
    const fine = fineMap && fineMap[oldSub]
    const sd = fine ? fine.sd : (migrationMap || {})[oldSub]
    if (!sd) continue // 无迁移目标的信号丢弃（不猜）
    const key = fine ? `${sd}|${fine.sub}` : sd
    if (!acc.has(key)) acc.set(key, { sum: 0, n: 0 })
    acc.get(key).sum += s.delta
    acc.get(key).n += 1
    if (fine) fineHits++
  }
  const cellDelta = new Map()
  for (const [k, v] of acc) cellDelta.set(k, v.sum / v.n)
  // ② 铺开到 1296 检查点（aspect 位 = id 末两位）
  const inputs = {}
  const naIds = []
  for (const cp of db.checkpoints) {
    if (cp.na) {
      naIds.push(cp.id)
      continue
    }
    const subKey = cp.id.slice(0, 4) // 分域码
    const delta = fineMap ? cellDelta.get(`${subKey}|${Number(cp.id.slice(4, 6))}`) : cellDelta.get(subKey)
    if (delta === undefined) {
      naIds.push(cp.id)
      continue
    }
    const ai = Number(cp.id.slice(6, 8)) - 1 // aspect 位 0..5（8 位 id 末两位）
    inputs[cp.id] = Number(
      clamp(0.5 + delta * ASPECT_COEFS[ai] + ASPECT_BIAS[ai], 0.02, 0.98).toFixed(4),
    )
  }
  const activeDomains = [...new Set([...cellDelta.keys()].map((k) => k.slice(0, 2)))]
  return {
    inputs,
    naIds,
    activeDomains,
    granularity: fineMap ? 'subdomain' : 'L2',
    migratedSubdomains: acc.size, // 有 delta 的格子数（L2=分域数 / P2=分域×子域数）
    fineHits, // P2：命中精映射的旧子域信号条数（L2 模式恒 0）
  }
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
 * 拉行情并为每只股票构建 inputs（对话单只 / 校准批量共用）。
 * @param {string[]} codes 6 位代码
 * @param {object} opts fetchQuotes/fetchIndexQuotes 透传（fetcher/timeoutMs/indexSymbols）+ sectorPctOf(code)
 *   + inputsBuilder(signals, {db, migrationMap, fineMap}) 自定义 inputs 构建（v2 剧本用 signalsToInputsV2）
 *   + fineMap（P2 精映射，v2 用；透传给 inputsBuilder）
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
    const buildInputs = opts.inputsBuilder || ((sig) => signalsToInputs(sig))
    byCode.set(code, {
      quote: q,
      name: q.name,
      signals,
      ...buildInputs(signals, { db: opts.db, migrationMap: opts.migrationMap, fineMap: opts.fineMap || null }),
    })
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
