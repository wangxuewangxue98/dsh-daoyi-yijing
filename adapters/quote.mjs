// adapters/quote.mjs — 股票行情适配层（可选在线模式 · v0.5.0）
//
// 定位：插件的「在线数据入口」，与确定性引擎解耦——
//   1) 默认不使用；调用方显式传入 --live / fetchQuotes 才启用；
//   2) 任何取数失败/字段缺失 → 对应信号回退 NA（离线核心引擎不被污染）；
//   3) 归一化规则全部透明（RULES_TEXT 导出，可审计、可引用、可测试）。
//
// 数据源：腾讯财经 qt.gtimg.cn（批量单请求、免费、无需鉴权）。
// 响应为 GBK 编码的 v_ 行，字段以 ~ 分隔（旧式逗号分隔亦兼容）；数字字段为 ASCII，不影响解析。
// 字段索引（腾讯标准，2026-10-21 实测对齐；个股与指数口径一致）：
//   [1]=名称 [2]=代码 [3]=现价 [4]=昨收 [5]=今开 [7]=外盘 [8]=内盘
//   [31]=涨跌额 [32]=涨跌% [33]=最高 [34]=最低 [36]=成交量(手) [37]=成交额(万) [38]=换手率%
//   [39]=市盈率 [43]=振幅% [44]=流通市值(亿) [45]=总市值(亿) [46]=市净率
//   [47]=涨停价 [48]=跌停价 [49]=量比 [50]=委差 [51]=均价 [52]=市盈(动) [53]=市盈(静)
//
// v0.5.1「补子域」原则（解冻爻位的关键）：
//   1) 一个原始量只映射到一个子域（同源规避）——否则新增的爻与旧爻相关，卦种不增反成冗余比特；
//   2) 凡涉及「市场/板块整体」的量必须转成**个股相对量**（如 个股涨跌−指数涨跌），
//      因为市场常数对批次内所有标的同值 → 该域必然被判 frozen（这正是旧版"宏观面全市场常数"的病根）；
//   3) 代理量一律在 rule 后缀与 RULES_TEXT 中显式标注 proxy/limit，不冒充真实财报或宏观数据。

import { spawn } from 'node:child_process'

/** 腾讯字段索引表（导出供测试/文档引用） */
export const TENCENT_FIELD_INDEX = {
  name: 1, code: 2, price: 3, prevClose: 4, open: 5,
  outerVol: 7, innerVol: 8, // 外盘(主动买成交量) / 内盘(主动卖成交量)，恒等式：外盘+内盘=成交量
  change: 31, pct: 32, high: 33, low: 34, volume: 36, amount: 37, turnover: 38, pe: 39,
  amplitudeRaw: 43,
  floatCap: 44, totalCap: 45, pb: 46,
  limitUp: 47, limitDown: 48, volRatio: 49, weicha: 50, avgPrice: 51, peDyn: 52, peStatic: 53,
}

/** 默认指数基准（六爻中的「四爻·宏观面」取数口径；用户第 4 问的答案所在层） */
export const DEFAULT_INDEX_SYMBOLS = ['sh000001'] // 上证指数

/** 归一化规则文本（透明口径，供报告/日志/文档引用；与 quoteToSignals 逐一对应，改动请同步） */
export const RULES_TEXT = [
  // ── 技术面 JS（初爻·起始/基础）──
  'JS01 趋势方向 = (收盘−最低)/(最高−最低) 居中化 × 0.5（当日位置代理；单日快照，无历史趋势）',
  'JS02 动量强度 = clamp(涨跌% × 0.10, ±0.42)（同基线口径）',
  'JS04 量能配合 = 换手率分档 × 当日方向：放量(≥3%)同向 +0.15 / 反向 −0.15；缩量(≤1%)同向 −0.05 / 反向 +0.05；其余 0（无历史均量对比，弱信号）',
  'JS06 均线系统 = clamp((均价偏离%) × 0.08, ±0.30)，均价偏离 = (现价−日内均价)/均价（站上均价=多头；proxy 日内均线）',
  'JS08 波动特征 = 振幅分档：≤2% → +0.10；2–5% → 0；>5% → −0.10',
  // ── 资金面 ZJ（二爻·内部/稳定）──
  'ZJ01 主力资金 = 净主动买入占比 (外盘−内盘)/(外盘+内盘) × 2.5，clamp ±0.40（真实资金流，与涨跌%不同源；无外盘/内盘字段时回退涨跌%代理并标注 -fallback）',
  'ZJ03 融资融券(proxy) = clamp((量比 − 1) × 0.10, ±0.25)：量比＝短线杠杆/增量资金活跃度代理（字段 [49]）',
  'ZJ07 解禁压力(proxy) = clamp((流通市值/总市值 − 0.75) × 0.5, ±0.25)：自由流通占比越高，后续解禁冲击越小',
  // ── 估值面 GZ（三爻·过渡/风险）──
  'GZ01 绝对估值 = (ln20 − ln PE) × 0.25，clamp ±0.40（对数尺度连续映射：PE 越低越阳；分段锚定会把多只压成同值、削弱爻分化，故改连续；PE≤0 亏损→NA）',
  'GZ04 业绩匹配(proxy) = clamp((市盈(静)/市盈(动) − 1) × 1.2, ±0.25)：>1 表示最新盈利年化好于上年，业绩动能改善（字段 [52][53]）',
  // ── 宏观面 HG（四爻·外部/行动：股市指数 + 国际国内经济形势）──
  'HG01 宏观敏感度(proxy) = clamp((ln 总市值 − ln300) × 0.06, ±0.25)：大市值股与大盘/宏观联动更强（beta 的规模代理；纯快照口径，非真实回归 beta）',
  'HG03 相对大盘强弱 = clamp((个股涨跌% − 上证指数涨跌%) × 0.06, ±0.25)：个股对宏观/经济形势的即时弹性（必须用相对量；指数本身的绝对涨跌对全批是常数→必 frozen）',
  'HG07 流动性环境占比 = clamp(ln(个股成交额 / 指数成交额 × 100) × 0.10, ±0.25)：个股成交额占全市场成交额的比重（流动性关注度代理）',
  'HG08 风险偏好弹性(proxy) = clamp(ln(个股换手率 / 指数换手率) × 0.10, ±0.25)：高于市场平均换手＝高 beta/高风险偏好弹性',
  // ── 行业面 HY（五爻·主导/核心·君位）──
  'HY01 行业景气 = clamp(板块景气% × 0.06, ±0.20)（优先用调用方给定的真实板块指数，否则取本批样本板块内实时均值，口径已标注）',
  'HY04 竞争格局(proxy) = clamp((个股涨跌% − 板块均值%) × 0.10, ±0.30)：跑赢同行＝行业内地位强',
  'HY08 产业链位置(proxy) = clamp(ln(个股成交额 / 板块均值成交额) × 0.12, ±0.25)：资金在板块内的聚焦位置',
  // ── 风险面 FX（上爻·终点/极端）──
  'FX02 个股黑天鹅（估值泡沫/商誉） = clamp((3 − PB) × 0.05, ±0.30)：PB 越高，泡沫与商誉减值风险越大 → 阴',
  'FX08 止损边界 = clamp((距涨跌停较近一侧的距离% − 6%) × 3.0, ±0.25)：距停板越远＝离极端越远＝安全边界越大（limit：距离含板块涨跌幅限制差异，ST/创业板口径不同，已如实标注）',
  // ── 基本面 JB / 消息面 XX（人宫：不占爻位，用于判决语义与覆盖率）──
  'JB01 盈利能力(proxy) = clamp((ROE代理 − 0.10) × 1.2, ±0.35)，ROE代理 = PB / PE（恒等式 PB/PE = E/B = ROE；同一快照两个公开字段导出，非财报原文）',
  'XX08 突发事件(proxy) = clamp(跳空% × 0.06, ±0.25)，跳空% = (今开 − 昨收)/昨收 × 100：向上跳空＝利好消息冲击代理',
  'JB 其余 7 个子域（成长/偿债/营运/现金/资产质量/分红/拐点）与 XX 前 7 个子域（公告/政策/媒体/研报/舆情/增减持/诉讼）：需财报与舆情数据源，当前仍 NA（不造假填充）',
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
    const raw = parts[i]
    // ⚠ 空字段必须判为「无数据」而非 0：腾讯响应中缺失字段常表现为空串，
    //   而 Number('') === 0 会让「缺失」伪装成 0 参与计算（如 pb='' → ROE 代理 0/PE → 假信号）。
    if (raw === undefined || raw === '' || raw === '-') return null
    const v = Number(raw)
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
    // 外盘/内盘（主动买/主动卖成交量，手）
    outerVol: num(TENCENT_FIELD_INDEX.outerVol),
    innerVol: num(TENCENT_FIELD_INDEX.innerVol),
    // 派生：净主动买入占比 = (外盘−内盘)/(外盘+内盘)，范围 −1..1
    //   恒等式校验：外盘+内盘 应等于成交量（实测误差 ≤1 手，因取整）
    netActiveBuyRatio: (() => {
      const o = num(TENCENT_FIELD_INDEX.outerVol)
      const i = num(TENCENT_FIELD_INDEX.innerVol)
      if (o == null || i == null) return null
      const total = o + i
      if (!(total > 0)) return null
      return Number(((o - i) / total).toFixed(4))
    })(),

    // —— v0.5.1 新增原始字段（每个字段只服务一个子域，避免新爻与旧爻同源） ——
    floatCap: num(TENCENT_FIELD_INDEX.floatCap),
    volRatio: num(TENCENT_FIELD_INDEX.volRatio), // 量比
    weicha: num(TENCENT_FIELD_INDEX.weicha), // 委差（买盘−卖盘挂单量，手）
    avgPrice: num(TENCENT_FIELD_INDEX.avgPrice), // 日内均价
    limitUp: num(TENCENT_FIELD_INDEX.limitUp),
    limitDown: num(TENCENT_FIELD_INDEX.limitDown),
    peDyn: num(TENCENT_FIELD_INDEX.peDyn), // 市盈(动)
    peStatic: num(TENCENT_FIELD_INDEX.peStatic), // 市盈(静)
    amplitudeRaw: num(TENCENT_FIELD_INDEX.amplitudeRaw),

    // —— v0.5.1 派生量（口径全部见 RULES_TEXT，可审计） ——
    // 跳空% = (今开 − 昨收)/昨收 × 100：隔夜消息冲击的即时痕迹
    gapPct: (() => {
      const op = num(TENCENT_FIELD_INDEX.open)
      return prevClose > 0 && op != null
        ? Number((((op - prevClose) / prevClose) * 100).toFixed(3))
        : null
    })(),
    // 均价偏离 = (现价 − 均价)/均价：股价被压/托在日内均价上下的强弱
    avgDev: (() => {
      const ap = num(TENCENT_FIELD_INDEX.avgPrice)
      return ap > 0 && price != null ? Number(((price - ap) / ap).toFixed(5)) : null
    })(),
    // 距涨跌停较近一侧的距离（占现价比）：越大＝离极端价位越远＝止损边界越大
    limitDist: (() => {
      const lu = num(TENCENT_FIELD_INDEX.limitUp)
      const ld = num(TENCENT_FIELD_INDEX.limitDown)
      return lu > 0 && ld > 0 && price > 0
        ? Number((Math.min(lu - price, price - ld) / price).toFixed(5))
        : null
    })(),
    // 自由流通占比 = 流通市值/总市值
    floatRatio: (() => {
      const fc = num(TENCENT_FIELD_INDEX.floatCap)
      const tc = num(TENCENT_FIELD_INDEX.totalCap)
      return fc > 0 && tc > 0 ? Number((fc / tc).toFixed(5)) : null
    })(),
    // ROE 代理 = PB / PE（恒等式 PB/PE = E/B = ROE；同一快照两个公开字段导出，非财报原文）
    roeProxy: pb != null && pe > 0 ? Number((pb / pe).toFixed(5)) : null,
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
 * @param {object} [extra] 截面环境变量（缺省项对应子域自动不出信号 → NA）：
 *   - sectorPct      板块景气%（优先用真实板块指数，否则取本批样本板块内实时均值）
 *   - sectorAmountWan 板块成交额均值（万元）
 *   - indexCtx       { pct, amountWan, turnover } 指数基准（默认上证）
 */
export function quoteToSignals(quote, extra = {}) {
  if (!quote || typeof quote !== 'object') return []
  const signals = []
  const add = (code, subIdx, delta, rule) => signals.push({ code, subIdx, delta: Number(delta.toFixed(4)), rule, source: 'tencent' })

  // GZ01 绝对估值：PE 对数连续锚定（便宜→阳，贵→阴）；PE≤0（亏损）→ NA
  //   用对数尺度而非分段：PE 分布长尾，分段会把多只压成同一值（削弱该爻分化能力）
  const pe = quote.pe
  if (pe != null && pe > 0) {
    const d = clamp((Math.log(20) - Math.log(pe)) * 0.25, -0.4, 0.4)
    add('GZ', 0, d, 'GZ01-PE-log')
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

  // ZJ01 主力资金：真实主动买卖力量（外盘−内盘 净主动买入占比），与涨跌幅不同源；
  //   数据缺失（无外盘/内盘字段）→ 回退涨跌幅代理口径，并标注 -fallback 以示局限
  if (quote.netActiveBuyRatio != null) {
    add('ZJ', 0, clamp(quote.netActiveBuyRatio * 2.5, -0.4, 0.4), 'ZJ01-net-active-buy')
  } else if (quote.pct != null) {
    add('ZJ', 0, clamp(quote.pct * 0.1, -0.42, 0.42), 'ZJ01-pct-proxy-fallback')
  }

  // ——— 行业面 HY（五爻·主导/核心·君位）：m=3（景气 / 竞争格局 / 产业链位置）———
  // 关键：这三个量必须逐股分化。HY01 是板块共享量（同板块同值），故必须再补两个"个股相对板块"的量，
  //       否则该域取值数≈板块数（十几档），中位数切不开 → 该爻阳占比严重偏斜（此前实测 89.3%）。
  const sectorPct = extra && Number(extra.sectorPct)
  if (Number.isFinite(sectorPct)) {
    add('HY', 0, clamp(sectorPct * 0.06, -0.2, 0.2), 'HY01-sector-index')
  }
  // HY04 竞争格局代理：跑赢同行＝行业内地位更强
  if (Number.isFinite(sectorPct) && quote.pct != null) {
    add('HY', 3, clamp((quote.pct - sectorPct) * 0.1, -0.3, 0.3), 'HY04-vs-sector-pct')
  }
  // HY08 产业链位置代理：成交额在板块内的相对体量
  const sectorAmount = extra && Number(extra.sectorAmountWan)
  if (Number.isFinite(sectorAmount) && sectorAmount > 0 && quote.amount > 0) {
    add('HY', 7, clamp(Math.log(quote.amount / sectorAmount) * 0.12, -0.25, 0.25), 'HY08-sector-capital-share')
  }

  // ——— 宏观面 HG（四爻·外部/行动：股市指数 + 国际国内经济形势）：m=4 ———
  // ⚠ 铁律：宏观量若直接用"指数本身的涨跌幅"，对全批 56 只是同一个常数（同批次同时取数）→
  //   该域 distinct=1 → 被 quantileThresholds 判 frozen → 恒阴、失去分化能力（旧版病根）。
  //   因此四个子域全部用「个股 × 宏观」的交互项（相对量/占比/弹性），保证逐股分化。
  const idx = (extra && extra.indexCtx) || null
  const totalCap = quote.totalCap
  if (totalCap != null && totalCap > 0) {
    add('HG', 0, clamp((Math.log(totalCap) - Math.log(300)) * 0.06, -0.25, 0.25), 'HG01-totalcap-macro-sensitivity')
  }
  // HG03 相对大盘强弱（对指数/经济形势的即时弹性）
  if (idx && Number.isFinite(idx.pct) && quote.pct != null) {
    add('HG', 2, clamp((quote.pct - idx.pct) * 0.06, -0.25, 0.25), 'HG03-vs-index-pct')
  }
  // HG07 流动性环境：个股成交额占全市场成交额比重（×100 使 ln 落在合理量级）
  if (idx && Number.isFinite(idx.amountWan) && idx.amountWan > 0 && quote.amount > 0) {
    add('HG', 6, clamp(Math.log((quote.amount / idx.amountWan) * 100) * 0.1, -0.25, 0.25), 'HG07-market-liquidity-share')
  }
  // HG08 风险偏好弹性：相对市场的换手强度（高换手＝高 beta/风险偏好敏感）
  if (idx && Number.isFinite(idx.turnover) && idx.turnover > 0 && quote.turnover > 0) {
    add('HG', 7, clamp(Math.log(quote.turnover / idx.turnover) * 0.1, -0.25, 0.25), 'HG08-relative-turnover-beta-proxy')
  }

  // ——— 风险面 FX（上爻·终点/极端）：m=2~3 ———
  // FX02 个股黑天鹅（商誉/估值泡沫）：高 PB → 商誉减值与泡沫回撤风险大
  //   同源规避：驱动量为 PB（资产口径），与 GZ01 的 PE（盈利口径）、HG01 的总市值均不同源。
  const pb = quote.pb
  if (pb != null && pb > 0) {
    add('FX', 1, clamp((3 - pb) * 0.05, -0.3, 0.3), 'FX02-pb-goodwill-bubble')
  }
  // FX08 止损边界：距涨跌停较近一侧的剩余空间（离极端越远＝安全边界越大）
  if (quote.limitDist != null) {
    add('FX', 7, clamp((quote.limitDist - 0.06) * 3.0, -0.25, 0.25), 'FX08-limit-distance')
  }

  // ——— 技术面 JS（初爻）：补 JS06 均线系统（m: 4 → 5）———
  if (quote.avgDev != null) {
    add('JS', 5, clamp(quote.avgDev * 100 * 0.08, -0.3, 0.3), 'JS06-avg-price-deviation')
  }

  // ——— 资金面 ZJ（二爻）：补 ZJ03/ZJ07（m: 1 → 3）———
  // ZJ03 融资融券代理：量比（增量资金/短线杠杆活跃度）
  if (quote.volRatio != null && quote.volRatio > 0) {
    add('ZJ', 2, clamp((quote.volRatio - 1) * 0.1, -0.25, 0.25), 'ZJ03-vol-ratio-margin-proxy')
  }
  // ZJ07 解禁压力代理：自由流通占比越高，未来解禁冲击越小
  if (quote.floatRatio != null) {
    add('ZJ', 6, clamp((quote.floatRatio - 0.75) * 0.5, -0.25, 0.25), 'ZJ07-float-ratio-unlock-proxy')
  }

  // ——— 估值面 GZ（三爻）：补 GZ04 业绩匹配（m: 1 → 2）———
  //   guard：亏损股（TTM PE ≤ 0 / 缺失）不评业绩匹配——连 GZ01 都不该评分时，谈"业绩动能"无意义。
  if (quote.pe > 0 && quote.peStatic > 0 && quote.peDyn > 0) {
    add('GZ', 3, clamp((quote.peStatic / quote.peDyn - 1) * 1.2, -0.25, 0.25), 'GZ04-pe-static-vs-dynamic')
  }

  // ——— 基本面 JB（人宫·不占爻位，但解除全域 NA，提升覆盖率与判决语义）———
  // JB01 盈利能力代理：ROE = PB/PE（恒等式推导，非财报原文，已标注 proxy）
  if (quote.roeProxy != null) {
    add('JB', 0, clamp((quote.roeProxy - 0.1) * 1.2, -0.35, 0.35), 'JB01-roe-proxy-pb-over-pe')
  }

  // ——— 消息面 XX（人宫·不占爻位）：XX08 突发事件代理（开盘跳空）———
  if (quote.gapPct != null) {
    add('XX', 7, clamp(quote.gapPct * 0.06, -0.25, 0.25), 'XX08-gap-open-event-proxy')
  }

  return signals
}

/**
 * 便捷：整批 stocks → { signalsByCode, quotes, fetched, error }
 * stocks 支持两种形态：位置数组 [name, code, price, pct, sector, flag]（批处理脚本口径）
 * 或对象 {name, code, sector}。
 * signalsByCode: Map<code, signals[]>（quote 缺失的 code 不出现在 Map 里 → 调用方按 NA 处理）
 */
/** 模块级取值器：支持 [name, code, ...] 数组与 {name, code} 对象两种形态 */
const codeOf = (s) => (Array.isArray(s) ? s[1] : s && s.code)
const sectorOf = (s) => (Array.isArray(s) ? s[4] : s && s.sector)

/** 构造指数行情 URL（指数必须用原始符号，不能过 symbolOf——后者会把 000001 判成深市个股） */
export function buildIndexUrl(symbols) {
  return `http://qt.gtimg.cn/q=${[...symbols].join(',')}`
}

/**
 * 由指数行情构造「宏观基准上下文」，供四爻 HG 的"相对大盘"口径使用。
 * 取 symbols 中第一个有效者为主基准。
 */
export function buildIndexContext(indexQuotes) {
  const iter = indexQuotes instanceof Map ? indexQuotes : new Map()
  for (const [sym, q] of iter) {
    if (!q) continue
    return {
      symbol: sym,
      name: q.name,
      pct: q.pct,
      amountWan: q.amount,
      turnover: q.turnover,
      amplitude: q.amplitudeRaw != null ? q.amplitudeRaw : q.amplitude,
    }
  }
  return null
}

/**
 * 指数行情取数（六爻中「四爻·宏观面」的数据入口；也是用户第 4 问"股市指数归哪一爻"的落点）。
 * @param {string[]} [symbols] 默认 ['sh000001'] 上证指数
 * @returns {{quotes: Map<string, object|null>, indexContext: object|null, error: string|null}}
 */
export async function fetchIndexQuotes(symbols = DEFAULT_INDEX_SYMBOLS, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 8000
  const httpGet = typeof opts.fetcher === 'function' ? opts.fetcher : (u) => defaultHttpGet(u, timeoutMs)
  const quotes = new Map(symbols.map((s) => [s, null]))
  if (!symbols.length) return { quotes, indexContext: null, error: 'no-codes' }
  let raw
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      raw = await httpGet(buildIndexUrl(symbols))
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    return { quotes, indexContext: null, error: `fetch-failed: ${e && e.message}` }
  }
  if (typeof raw !== 'string' || !raw.trim()) return { quotes, indexContext: null, error: 'empty-response' }
  for (const line of raw.split(';')) {
    const q = parseTencentQuote(line)
    if (q && quotes.has(q.secid)) quotes.set(q.secid, q)
  }
  return { quotes, indexContext: buildIndexContext(quotes), error: null }
}

/**
 * 板块截面统计：由本批样本的实时行情自身统计（非外部臆造）。
 * 若调用方提供真实板块指数（sectorIndexMap），板块景气优先用之；成交额均值始终由样本统计。
 */
export function buildSectorStats(stocks, quotes, sectorIndexMap = null) {
  const acc = {}
  for (const s of stocks) {
    const q = quotes.get(String(codeOf(s)).replace(/\D/g, ''))
    const sector = sectorOf(s)
    if (!q || !sector) continue
    const slot = (acc[sector] ||= { pcts: [], amounts: [] })
    if (typeof q.pct === 'number' && Number.isFinite(q.pct)) slot.pcts.push(q.pct)
    if (typeof q.amount === 'number' && Number.isFinite(q.amount)) slot.amounts.push(q.amount)
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const out = {}
  for (const [sector, v] of Object.entries(acc)) {
    const hasExternal = sectorIndexMap && sectorIndexMap[sector] != null
    out[sector] = {
      n: v.pcts.length,
      pct: hasExternal ? Number(sectorIndexMap[sector]) : mean(v.pcts),
      amountWan: mean(v.amounts),
      source: hasExternal ? 'sector-index' : 'batch-sample-mean',
    }
  }
  return out
}

/**
 * 便捷：整批 stocks → { signalsByCode, quotes, fetched, error, indexContext, sectorStats }
 * stocks 支持两种形态：位置数组 [name, code, price, pct, sector, flag]（批处理脚本口径）
 * 或对象 {name, code, sector}。
 * signalsByCode: Map<code, signals[]>（quote 缺失的 code 不出现在 Map 里 → 调用方按 NA 处理）
 * opts.indexSymbols = [] 可关闭指数基准（HG03/HG07/HG08 随之降级 NA）。
 */
export async function fetchSignalsForStocks(stocks, opts = {}) {
  const codes = stocks.map(codeOf).filter(Boolean)
  const { quotes, fetched, error } = await fetchQuotes(codes, opts)

  // 指数基准：默认上证；失败不致命 → indexContext=null，HG 的相对量子域自动不出信号
  const idxSymbols = opts.indexSymbols === undefined ? DEFAULT_INDEX_SYMBOLS : opts.indexSymbols
  let indexContext = null
  let indexError = null
  if (idxSymbols && idxSymbols.length) {
    const r = await fetchIndexQuotes(idxSymbols, opts)
    indexContext = r.indexContext
    indexError = r.error
  }

  const sectorStats = buildSectorStats(stocks, quotes, opts.sectorIndexMap)
  const signalsByCode = new Map()
  for (const s of stocks) {
    const q = quotes.get(String(codeOf(s)).replace(/\D/g, ''))
    if (!q) continue
    const st = sectorStats[sectorOf(s)] || {}
    signalsByCode.set(
      q.code,
      quoteToSignals(q, {
        sectorPct: st.pct,
        sectorAmountWan: st.amountWan,
        indexCtx: indexContext,
      }),
    )
  }
  return { signalsByCode, quotes, fetched, error, indexContext, indexError, sectorStats }
}

export default {
  TENCENT_FIELD_INDEX,
  RULES_TEXT,
  DEFAULT_INDEX_SYMBOLS,
  secidOf,
  symbolOf,
  codeFromSecid,
  parseTencentQuote,
  buildTencentUrl,
  buildIndexUrl,
  fetchQuotes,
  fetchIndexQuotes,
  buildIndexContext,
  buildSectorStats,
  quoteToSignals,
  fetchSignalsForStocks,
  createCurlFetcher,
}
