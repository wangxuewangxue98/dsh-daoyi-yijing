// adapters/quote.mjs — 股票行情适配层（可选在线模式 · v0.5.0）
//
// 定位：插件的「在线数据入口」，与确定性引擎解耦——
//   1) 默认不使用；调用方显式传入 --live / fetchQuotes 才启用；
//   2) 任何取数失败/字段缺失 → 对应信号回退 NA（离线核心引擎不被污染）；
//   3) 归一化规则全部透明（RULES_TEXT 导出，可审计、可引用、可测试）。
//
// 数据源：腾讯财经 qt.gtimg.cn（批量单请求、免费、无需鉴权）。
// 响应为 GBK 编码的 v_ 行，字段以 ~ 分隔（旧式逗号分隔亦兼容）；数字字段为 ASCII，不影响解析。
// 字段索引（腾讯标准，实测对齐）：
//   [1]=名称 [2]=代码 [3]=现价 [4]=昨收 [5]=今开 [30]=时间 [31]=涨跌额 [32]=涨跌%
//   [33]=最高 [34]=最低 [36]=成交量(手) [37]=成交额(万) [38]=换手率%
//   [39]=市盈率(TTM) [44]=流通市值(亿) [45]=总市值(亿) [46]=市净率
//
// 归一化口径（与 scripts/divine_batch_stocks.mjs 基线一致地输出 {code, subIdx, delta}）：
//   GZ01 绝对估值：PE 分段锚定（便宜→阳，贵→阴）；PE≤0（亏损）→ NA 不评分
//   JS01 趋势方向：收盘价在当日振幅中的位置（(close-low)/(high-low) 居中化）
//   JS02 动量强度：当日涨跌幅 × 0.10（同基线口径）
//   JS04 量能配合：换手率分档 × 当日涨跌方向（放量涨=强 / 放量跌=弱；无历史均量，弱信号）
//   JS08 波动特征：振幅分档（平稳→阳 / 高波→阴）
//   ZJ01 主力资金：无免费实时资金流字段 → 沿用基线代理口径（涨跌幅代理，局限已声明）
//   HY01 行业景气：需板块→指数映射，由调用方可选提供（sectorIndexMap），默认不启用
//   JB 基本面 / HG 宏观面：腾讯源无财务/宏观字段 → NA（不造假填充）

import { spawn } from 'node:child_process'

/** 腾讯字段索引表（导出供测试/文档引用） */
export const TENCENT_FIELD_INDEX = {
  name: 1, code: 2, price: 3, prevClose: 4, open: 5, time: 30, change: 31, pct: 32,
  high: 33, low: 34, volume: 36, amount: 37, turnover: 38, pe: 39,
  floatCap: 44, totalCap: 45, pb: 46,
}

/** 归一化规则文本（透明口径，供报告/日志/文档引用） */
export const RULES_TEXT = [
  'GZ01 绝对估值 = PE 分段锚定：PE<10 → +0.25；10–20 → +0.10；20–40 → −0.05；40–80 → −0.20；>80 → −0.30；PE≤0（亏损）→ NA',
  'JS01 趋势方向 = (收盘−最低)/(最高−最低) 居中化 × 0.5（当日位置代理；单日快照，无历史趋势）',
  'JS02 动量强度 = clamp(涨跌% × 0.10, ±0.42)（同基线口径）',
  'JS04 量能配合 = 换手率分档 × 当日方向：放量(≥3%)同向 +0.15 / 反向 −0.15；缩量(≤1%)同向 −0.05 / 反向 +0.05；其余 0（无历史均量对比，弱信号）',
  'JS08 波动特征 = 振幅分档：≤2% → +0.10；2–5% → 0；>5% → −0.10',
  'ZJ01 主力资金 = clamp(涨跌% × 0.10, ±0.42)（无免费实时资金流字段的代理口径，局限已声明）',
  'HY01 行业景气 = clamp(板块指数涨跌% × 0.06, ±0.20)（仅当调用方提供 sectorIndexMap）',
  'JB 基本面 / HG 宏观面 / GZ05 股息回报：数据源无字段 → NA',
]

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/** 默认 HTTP 取数（全局 fetch + 超时；代理环境下请注入 createCurlFetcher({proxy})） */
async function defaultHttpGet(url, timeoutMs) {
  if (typeof fetch !== 'function') throw new Error('fetch-unavailable')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * curl 取数器（代理环境/无全局 fetch 时用）：createCurlFetcher({ proxy, timeoutMs })
 * 返回 async (url) => string。代理形如 http://127.0.0.1:62175。
 */
export function createCurlFetcher({ proxy, timeoutMs = 10000 } = {}) {
  return (url) =>
    new Promise((resolve, reject) => {
      const args = ['-s', '-m', String(Math.max(1, Math.ceil(timeoutMs / 1000)))]
      if (proxy) args.push('-x', String(proxy))
      args.push(String(url))
      let out = ''
      let err = ''
      try {
        const p = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
        p.stdout.on('data', (d) => (out += d))
        p.stderr.on('data', (d) => (err += d))
        p.on('error', (e) => reject(new Error(`curl-spawn-failed: ${e.message}`)))
        p.on('close', (code) =>
          code === 0 ? resolve(out) : reject(new Error(`curl exit ${code}: ${err.slice(0, 120)}`)),
        )
      } catch (e) {
        reject(new Error(`curl-spawn-failed: ${e.message}`))
      }
    })
}

/**
 * A 股代码 → 腾讯 secid（sh=1 / sz=0 / bj=2 前缀）
 * 6 开头（600/601/603/605/688）→ sh；0/3 开头（000/001/002/003/300）→ sz；8/4 开头 → bj
 */
export function secidOf(code) {
  const c = String(code || '').replace(/\D/g, '').padStart(6, '0')
  if (/^(6|9)/.test(c)) return `1.${c}`
  if (/^(8|4)/.test(c)) return `2.${c}`
  return `0.${c}`
}

/** 反向：secid → 6 位代码 */
export function codeFromSecid(secid) {
  return String(secid || '').split('.').pop().replace(/\D/g, '')
}

/**
 * 解析腾讯单行行情（如 v_sh601398="51~工商银行~601398~8.58~...";）
 * 字段以 ~ 分隔（逗号分隔的旧式响应亦兼容）；字段缺失/长度不足/非数字 → null（调用方回退 NA）
 */
export function parseTencentQuote(line) {
  if (typeof line !== 'string') return null
  const m = line.match(/v_(?:s_)?([a-z]{2}\d+)="([^"]*)"/i)
  if (!m) return null
  const secid = m[1]
  const parts = m[2].split(/[~,]/)
  const num = (i) => {
    const v = Number(parts[i])
    return Number.isFinite(v) ? v : null
  }
  const code = codeFromSecid(secid)
  const name = parts[TENCENT_FIELD_INDEX.name] || ''
  const price = num(TENCENT_FIELD_INDEX.price)
  if (!code || !name || price == null) return null
  const high = num(TENCENT_FIELD_INDEX.high)
  const low = num(TENCENT_FIELD_INDEX.low)
  const prevClose = num(TENCENT_FIELD_INDEX.prevClose)
  const pct = num(TENCENT_FIELD_INDEX.pct)
  const pe = num(TENCENT_FIELD_INDEX.pe)
  const pb = num(TENCENT_FIELD_INDEX.pb)
  const turnover = num(TENCENT_FIELD_INDEX.turnover)
  const amount = num(TENCENT_FIELD_INDEX.amount)
  return {
    secid,
    code,
    name,
    price,
    prevClose,
    open: num(TENCENT_FIELD_INDEX.open),
    high,
    low,
    change: num(TENCENT_FIELD_INDEX.change),
    pct,
    volume: num(TENCENT_FIELD_INDEX.volume),
    amount,
    turnover,
    pe,
    pb,
    totalCap: num(TENCENT_FIELD_INDEX.totalCap),
    // 派生：振幅%（昨收为基准；昨收缺失时退回最高−最低）
    amplitude:
      prevClose && high != null && low != null
        ? Number((((high - low) / prevClose) * 100).toFixed(3))
        : null,
    // 派生：收盘位置（当日振幅中的 0..1；一字线(高=低)取中性 0.5；字段缺失为 null→NA）
    closePosition:
      high != null && low != null
        ? high > low
          ? Number(((price - low) / (high - low)).toFixed(4))
          : 0.5
        : null,
  }
}

/**
 * A 股代码 → 市场前缀符号（腾讯 qt.gtimg.cn 口径：sh601398 / sz000001 / bj8xxxx）
 * 6/9 开头 → sh；8/4 开头 → bj；其余（0/3 开头）→ sz
 */
export function symbolOf(code) {
  const c = String(code || '').replace(/\D/g, '').padStart(6, '0')
  if (/^(6|9)/.test(c)) return `sh${c}`
  if (/^(8|4)/.test(c)) return `bj${c}`
  return `sz${c}`
}

/** 构造腾讯批量行情 URL（qt.gtimg.cn 口径，市场前缀符号；一次请求最多约 60 只，超出自动分批） */
export function buildTencentUrl(codes) {
  const q = codes.map(symbolOf).join(',')
  return `http://qt.gtimg.cn/q=${q}`
}

/**
 * 批量取行情。返回 { quotes: Map<code, quote|null>, fetched: number, error }。
 * - fetcher 可注入（测试/代理环境）：async (url) => string；未注入时用全局 fetch
 *   （代理环境建议注入 createCurlFetcher({proxy})，因 undici 不读代理环境变量）
 * - 任何单只解析失败 → quotes 里该 code 为 null（调用方回退 NA），不影响其余
 * - 整体失败 → { quotes: 全 null, error }（调用方整体回退基线）
 */
export async function fetchQuotes(codes, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 8000
  const httpGet = typeof opts.fetcher === 'function' ? opts.fetcher : (u) => defaultHttpGet(u, timeoutMs)
  const unique = [...new Set(codes.map((c) => String(c).replace(/\D/g, '')).filter(Boolean))]
  const quotes = new Map(unique.map((c) => [c, null]))
  if (unique.length === 0) return { quotes, fetched: 0, error: 'no-codes' }
  let fetched = 0
  for (let i = 0; i < unique.length; i += 60) {
    const batch = unique.slice(i, i + 60)
    const url = buildTencentUrl(batch)
    let text = null
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        text = await httpGet(url)
      } finally {
        clearTimeout(timer)
      }
    } catch (e) {
      return { quotes: new Map(unique.map((c) => [c, null])), fetched, error: `fetch-failed: ${e && e.message}` }
    }
    if (typeof text !== 'string' || !text.trim()) {
      return { quotes: new Map(unique.map((c) => [c, null])), fetched, error: 'empty-response' }
    }
    for (const line of text.split(';')) {
      const q = parseTencentQuote(line)
      if (q && quotes.has(q.code)) {
        quotes.set(q.code, q)
        fetched++
      }
    }
  }
  return { quotes, fetched, error: null }
}

/**
 * 单只行情 → 子域级信号（与基线 divine_batch_stocks.mjs 的 {code, subIdx, delta} 同构）。
 * 数据不足的子域不出现在返回里（调用方对其余检查点标 NA，不造假）。
 * @param {object} quote parseTencentQuote 的产物
 * @param {object} [extra] { sectorPct } 板块指数涨跌%（可选，激活 HY01）
 */
export function quoteToSignals(quote, extra = {}) {
  if (!quote || typeof quote !== 'object') return []
  const signals = []
  const add = (code, subIdx, delta, rule) => signals.push({ code, subIdx, delta: Number(delta.toFixed(4)), rule, source: 'tencent' })

  // GZ01 绝对估值：PE 分段锚定（亏损 → NA）
  const pe = quote.pe
  if (pe != null && pe > 0) {
    let d
    if (pe < 10) d = 0.25
    else if (pe < 20) d = 0.1
    else if (pe < 40) d = -0.05
    else if (pe < 80) d = -0.2
    else d = -0.3
    add('GZ', 0, d, 'GZ01-PE-anchor')
  }

  // JS01 趋势方向：收盘位置居中化
  if (quote.closePosition != null) {
    add('JS', 0, (quote.closePosition - 0.5) * 0.5, 'JS01-close-pos')
  }

  // JS02 动量强度：当日涨跌幅（同基线）
  if (quote.pct != null) {
    add('JS', 1, clamp(quote.pct * 0.1, -0.42, 0.42), 'JS02-pct')
  }

  // JS04 量能配合：换手率分档 × 当日方向（无历史均量，弱信号）
  if (quote.turnover != null && quote.pct != null) {
    const up = quote.pct > 0
    const down = quote.pct < 0
    let d = 0
    if (quote.turnover >= 3) d = up ? 0.15 : down ? -0.15 : 0
    else if (quote.turnover <= 1) d = up ? -0.05 : down ? 0.05 : 0
    add('JS', 3, d, 'JS04-turnover-dir')
  }

  // JS08 波动特征：振幅分档
  if (quote.amplitude != null) {
    const d = quote.amplitude <= 2 ? 0.1 : quote.amplitude <= 5 ? 0 : -0.1
    add('JS', 7, d, 'JS08-amplitude')
  }

  // ZJ01 主力资金：无免费实时资金流字段 → 基线代理口径（局限已声明）
  if (quote.pct != null) {
    add('ZJ', 0, clamp(quote.pct * 0.1, -0.42, 0.42), 'ZJ01-pct-proxy')
  }

  // HY01 行业景气：仅当调用方提供板块指数涨跌%
  const sectorPct = extra && Number(extra.sectorPct)
  if (Number.isFinite(sectorPct)) {
    add('HY', 0, clamp(sectorPct * 0.06, -0.2, 0.2), 'HY01-sector-index')
  }

  return signals
}

/**
 * 便捷：整批 stocks → { signalsByCode, quotes, fetched, error }
 * stocks 支持两种形态：位置数组 [name, code, price, pct, sector, flag]（批处理脚本口径）
 * 或对象 {name, code, sector}。
 * signalsByCode: Map<code, signals[]>（quote 缺失的 code 不出现在 Map 里 → 调用方按 NA 处理）
 */
export async function fetchSignalsForStocks(stocks, opts = {}) {
  const codeOf = (s) => (Array.isArray(s) ? s[1] : s && s.code)
  const sectorOf = (s) => (Array.isArray(s) ? s[4] : s && s.sector)
  const codes = stocks.map(codeOf).filter(Boolean)
  const { quotes, fetched, error } = await fetchQuotes(codes, opts)
  const signalsByCode = new Map()
  for (const s of stocks) {
    const q = quotes.get(String(codeOf(s)).replace(/\D/g, ''))
    if (!q) continue
    const sector = sectorOf(s)
    const sectorPct = opts.sectorIndexMap && opts.sectorIndexMap[sector]
    signalsByCode.set(q.code, quoteToSignals(q, { sectorPct }))
  }
  return { signalsByCode, quotes, fetched, error }
}

export default {
  TENCENT_FIELD_INDEX,
  RULES_TEXT,
  secidOf,
  symbolOf,
  codeFromSecid,
  parseTencentQuote,
  buildTencentUrl,
  fetchQuotes,
  quoteToSignals,
  fetchSignalsForStocks,
  createCurlFetcher,
}
