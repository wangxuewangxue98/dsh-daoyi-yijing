// quote-history.mjs — 历史日 K 适配层（v0.9.0 F-6：多日滚动校准的数据源）
//
// 为什么需要：单日 400 只快照校准出的分层阈值，15 层里有 8 层 n<20 → 只能回落总体阈值
// （使用报告 E-6：55 只里只有 31 只吃到层阈值）。要让层阈值有统计力，样本量必须提升一个量级，
// 而**横截面只能扩一次**——正解是沿时间轴滚动：同一批标的取最近 N 个交易日的快照。
//
// 数据源：腾讯前复权日 K（web.ifzq.gtimg.cn，与实时行情同源厂商；qfq 口径避免除权跳空被当成暴跌）。
// 诚实边界：
//   - 取数失败/返回空 → 返回 { days: [], error }，**调用方只落该只的实时快照**（不虚构历史）；
//   - 每只只补到「它自己有数据的那些天」，停牌/上市不足 N 天的标的不会凑数；
//   - 总市值（分层必需）历史值不随日 K 返回 → 沿用实时快照的 totalCap（口径在输出里标注）。
import { symbolOf } from './quote.mjs'

// ⚠ 端点实测（2026-10-22）：web.ifzq.gtimg.cn/appstock/app/**fqkline**/get 已被腾讯 WAF 拦截
//   （返回 501 跳转 HTML，非 JSON）；**newfqkline**/get 正常返回 qfqday。务必用后者，勿改回。
const KLINE_HOST = 'https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get'

/** 构造日 K URL：最近 count 个交易日前复权（qfq） */
export function buildKlineUrl(code, count = 20) {
  return `${KLINE_HOST}?param=${symbolOf(code)},day,,,${Math.max(1, Number(count) || 1)},qfq`
}

/**
 * 单只日 K → [{date, open, close, high, low, volume, pct}]
 * pct = 相对前一根 K 收盘的涨跌幅（首根无前值 → pct=null，调用方跳过，不用 0 冒充）。
 */
export function parseDailyKlines(raw) {
  const out = []
  if (!raw || typeof raw !== 'object') return out
  const node = raw.data || {}
  const first = Object.values(node)[0]
  if (!first) return out
  // qfq 请求优先返回 qfqday；无则回落 day（不复权）
  const rows = Array.isArray(first.qfqday) ? first.qfqday : Array.isArray(first.day) ? first.day : []
  let prevClose = null
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 3) continue
    const date = String(r[0] || '')
    const open = Number(r[1])
    const close = Number(r[2])
    const high = Number(r[3])
    const low = Number(r[4])
    const volume = Number(r[5])
    if (!Number.isFinite(close) || close <= 0) continue
    const pct = prevClose && prevClose > 0 ? Number((((close - prevClose) / prevClose) * 100).toFixed(2)) : null
    out.push({ date, open, close, high, low, volume, pct })
    prevClose = close
  }
  return out
}

/**
 * 取单只最近 count 根日 K。
 * @param {string} code
 * @param {{count?:number, fetcher?:Function, timeoutMs?:number}} opts fetcher 可注入（测试/代理环境）
 * @returns {Promise<{code:string, days:Array, error:string|null, fetched:number}>}
 */
export async function fetchDailyKlines(code, opts = {}) {
  const count = Math.max(1, Number(opts.count) || 1)
  const url = buildKlineUrl(code, count)
  const empty = { code, days: [], error: null, fetched: 0 }
  try {
    const fetcher = opts.fetcher || globalThis.fetch
    if (typeof fetcher !== 'function') return { ...empty, error: 'no-fetcher' }
    const res = await fetcher(url)
    const text = String(typeof res === 'string' ? res : await res.text() || '')
    // WAF/网关拦截时返回的是 HTML（501 跳转页）——明确报错，不要让它落进 JSON 解析的晦涩异常
    const t = text.trim()
    if (!t || t[0] === '<') return { ...empty, error: t ? 'non-json-response(waf/blocked)' : 'empty-response' }
    const json = JSON.parse(t.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, ''))
    if (json && Number(json.code) !== 0) return { ...empty, error: `api-code:${json.code}` }
    const days = parseDailyKlines(json)
    return { code, days, error: days.length ? null : 'empty-klines', fetched: days.length }
  } catch (e) {
    return { ...empty, error: String((e && e.message) || e) }
  }
}

/**
 * 批量取日 K（串行 + 轻量节流，避免打爆行情源）。
 * @returns {Promise<{byCode:Map<string,Array>, fetched:number, failed:number, errors:string[]}>}
 */
export async function fetchDailyKlinesBatch(codes, opts = {}) {
  const byCode = new Map()
  let fetched = 0
  let failed = 0
  const errors = []
  const gapMs = Number(opts.gapMs) > 0 ? Number(opts.gapMs) : 0
  for (const c of codes) {
    const r = await fetchDailyKlines(c, opts)
    if (r.days.length) {
      byCode.set(String(c), r.days)
      fetched++
    } else {
      failed++
      if (errors.length < 8) errors.push(`${c}:${r.error || 'empty'}`)
    }
    if (gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs))
  }
  return { byCode, fetched, failed, errors }
}

/**
 * 日 K → 每日快照（供校准按日重放）
 * @param {object} base 实时快照（提供 name / totalCap 等不随日变化或历史不可得的字段）
 * @param {Array} days fetchDailyKlines 的 days
 * @param {number} limit 最多取最近几个交易日（含 pct 为 null 的首根会被丢弃）
 * @returns {Array<{code,name,price,pct,totalCap,date}>}
 */
export function daysToSnapshots(base, days, limit = 1) {
  const out = []
  if (!Array.isArray(days)) return out
  const usable = days.filter((d) => d && d.pct != null && Number.isFinite(d.close))
  const take = usable.slice(Math.max(0, usable.length - Math.max(1, limit)))
  for (const d of take) {
    out.push({
      code: base && base.code,
      name: (base && base.name) || '',
      price: d.close,
      pct: d.pct,
      totalCap: base && base.totalCap != null ? base.totalCap : null,
      date: d.date,
      history: true,
    })
  }
  return out
}

/**
 * 日 K → 趋势体制统计（v0.9.4 P0-1 周趋势体制门的数据底座）。
 *   ret   = 最近 retN 根累计涨跌%（(末根收盘 / retN 根前收盘 − 1)×100；需 n ≥ retN+1）
 *   maDev = 末根收盘相对 maN 日均线的偏离%（需 n ≥ maN，不足则 null 不凑数）
 * 诚实边界：历史不足 → ok=false / 对应字段 null，调用方回落单日口径（不虚构趋势）。
 * @param {Array} days fetchDailyKlines 的 days
 * @param {{retN?:number, maN?:number}} opts
 * @returns {{ok:boolean, ret:number|null, maDev:number|null, n:number, retN:number, maN:number}}
 */
export function klineStatsOf(days, opts = {}) {
  const retN = Math.max(1, Number(opts.retN) || 5)
  const maN = Math.max(2, Number(opts.maN) || 20)
  const out = { ok: false, ret: null, maDev: null, n: 0, retN, maN }
  if (!Array.isArray(days)) return out
  const usable = days.filter((d) => d && Number.isFinite(d.close) && d.close > 0)
  out.n = usable.length
  if (usable.length >= retN + 1) {
    const last = usable[usable.length - 1].close
    const base = usable[usable.length - 1 - retN].close
    out.ret = Number((((last - base) / base) * 100).toFixed(3))
    out.ok = true
  }
  if (usable.length >= maN) {
    const slice = usable.slice(-maN)
    const ma = slice.reduce((a, d) => a + d.close, 0) / slice.length
    out.maDev = Number((((usable[usable.length - 1].close - ma) / ma) * 100).toFixed(3))
  }
  return out
}

export default { buildKlineUrl, parseDailyKlines, fetchDailyKlines, fetchDailyKlinesBatch, daysToSnapshots, klineStatsOf }
