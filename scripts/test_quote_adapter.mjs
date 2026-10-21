// test_quote_adapter.mjs — 行情适配层专项测试（v0.5.0）
// 覆盖：secid 换算、腾讯行解析、归一化规则、取数回退、批处理在线/离线集成。
import {
  secidOf,
  symbolOf,
  codeFromSecid,
  parseTencentQuote,
  buildTencentUrl,
  fetchQuotes,
  quoteToSignals,
  createCurlFetcher,
  RULES_TEXT,
} from '../adapters/quote.mjs'
import { runBatch, mergeSignals, STOCKS } from './divine_batch_stocks.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) {
    pass++
    console.log(`PASS  ${msg}`)
  } else {
    fail++
    console.log(`FAIL  ${msg}`)
  }
}

// ── 1. secid 换算 ──
ok(secidOf('601398') === '1.601398', `6 开头 → sh（实际 ${secidOf('601398')}）`)
ok(secidOf('688122') === '1.688122', `688 科创板 → sh（实际 ${secidOf('688122')}）`)
ok(secidOf('000001') === '0.000001', `0 开头 → sz（实际 ${secidOf('000001')}）`)
ok(secidOf('300718') === '0.300718', `3 开头创业板 → sz（实际 ${secidOf('300718')}）`)
ok(codeFromSecid('1.601398') === '601398', `secid 反解代码（实际 ${codeFromSecid('1.601398')}）`)
ok(symbolOf('601398') === 'sh601398', `6 开头 → sh 符号（实际 ${symbolOf('601398')}）`)
ok(symbolOf('000001') === 'sz000001', `0 开头 → sz 符号（实际 ${symbolOf('000001')}）`)
ok(symbolOf('300718') === 'sz300718', `3 开头创业板 → sz 符号（实际 ${symbolOf('300718')}）`)
ok(buildTencentUrl(['601398', '000001']) === 'http://qt.gtimg.cn/q=sh601398,sz000001', '批量 URL 用市场前缀符号（gtimg 口径）')

// ── 2. 腾讯行解析（fixture：工行实测字段口径，~ 分隔）──
// 字段：[0]市场 [1]名 [2]码 [3]现价 [4]昨收 [5]开 [30]时间 [31]涨跌 [32]涨跌% [33]高 [34]低 [36]量(手) [37]额(万) [38]换手 [39]PE [45]总市值(亿) [46]PB
// 注意：腾讯 v_ 行第 0 位是市场标识（51），名称/代码顺延一位——以实测 2026-10-21 工行行为准
function fixtureLine(overrides = {}) {
  const f = {
    name: '工商银行', code: '601398', price: 8.58, prevClose: 8.6, open: 8.58,
    change: -0.02, pct: -0.23, high: 8.65, low: 8.52, volume: 1234567, amount: 106000,
    turnover: 0.05, pe: 8.05, totalCap: 30116, pb: 0.77,
  }
  Object.assign(f, overrides)
  const arr = new Array(47).fill('0')
  arr[0] = '51'
  arr[1] = f.name; arr[2] = f.code; arr[3] = String(f.price); arr[4] = String(f.prevClose)
  arr[5] = String(f.open); arr[30] = '150000'; arr[31] = String(f.change); arr[32] = String(f.pct)
  arr[33] = String(f.high); arr[34] = String(f.low); arr[36] = String(f.volume); arr[37] = String(f.amount)
  arr[38] = String(f.turnover); arr[39] = String(f.pe); arr[45] = String(f.totalCap); arr[46] = String(f.pb)
  return `v_sh${f.code}="${arr.join('~')}";`
}
{
  const q = parseTencentQuote(fixtureLine())
  ok(Boolean(q), '工行 fixture 行解析成功')
  ok(q.code === '601398' && q.name === '工商银行', `代码/名称正确（${q.code}/${q.name}）`)
  ok(Math.abs(q.pct - -0.23) < 1e-9, `涨跌幅字段正确（${q.pct}）`)
  ok(Math.abs(q.pe - 8.05) < 1e-9, `PE 字段正确（${q.pe}）`)
  ok(Math.abs(q.pb - 0.77) < 1e-9, `PB 字段正确（${q.pb}）`)
  ok(Math.abs(q.totalCap - 30116) < 1e-9, `总市值字段正确（${q.totalCap}）`)
  const expAmp = ((8.65 - 8.52) / 8.6) * 100
  ok(Math.abs(q.amplitude - expAmp) < 0.01, `振幅派生正确（${q.amplitude} ≈ ${expAmp.toFixed(2)}）`)
  const expPos = (8.58 - 8.52) / (8.65 - 8.52)
  ok(Math.abs(q.closePosition - expPos) < 0.001, `收盘位置派生正确（${q.closePosition} ≈ ${expPos.toFixed(3)}）`)
}
ok(parseTencentQuote('v_sh601398="1,2";') === null, '字段不足 → null（回退 NA）')
ok(parseTencentQuote('garbage line') === null, '非行情行 → null')
ok(parseTencentQuote(42) === null, '非字符串 → null')

// ── 3. 归一化规则 ──
{
  const cheap = parseTencentQuote(fixtureLine({ pe: 8.05 }))
  const gz = quoteToSignals(cheap).find((s) => s.code === 'GZ')
  ok(gz && gz.delta === 0.25, `PE 8（便宜）→ GZ01 delta +0.25（实际 ${gz && gz.delta}）`)

  const mid = parseTencentQuote(fixtureLine({ pe: 15 }))
  ok(quoteToSignals(mid).find((s) => s.code === 'GZ').delta === 0.1, 'PE 15 → +0.10')

  const rich = parseTencentQuote(fixtureLine({ pe: 96 }))
  ok(quoteToSignals(rich).find((s) => s.code === 'GZ').delta === -0.3, 'PE 96（贵）→ −0.30')

  const loss = parseTencentQuote(fixtureLine({ pe: '-' }))
  ok(!quoteToSignals(loss).some((s) => s.code === 'GZ'), 'PE 亏损(-) → GZ01 不评分（NA）')

  const flat = parseTencentQuote(fixtureLine({ pct: 0, high: 8.6, low: 8.6, price: 8.6 }))
  const js01 = quoteToSignals(flat).find((s) => s.code === 'JS' && s.subIdx === 0)
  ok(js01 && js01.delta === 0, `平盘无振幅 → JS01 delta 0（实际 ${js01 && js01.delta}）`)

  const volUp = parseTencentQuote(fixtureLine({ pct: 2.5, turnover: 5 }))
  const js04Up = quoteToSignals(volUp).find((s) => s.code === 'JS' && s.subIdx === 3)
  ok(js04Up && js04Up.delta === 0.15, `放量上涨 → JS04 +0.15（实际 ${js04Up && js04Up.delta}）`)

  const volDown = parseTencentQuote(fixtureLine({ pct: -2.5, turnover: 5 }))
  const js04Down = quoteToSignals(volDown).find((s) => s.code === 'JS' && s.subIdx === 3)
  ok(js04Down && js04Down.delta === -0.15, `放量下跌 → JS04 −0.15（实际 ${js04Down && js04Down.delta}）`)

  const calm = parseTencentQuote(fixtureLine({ pct: 0.3, high: 8.62, low: 8.58, prevClose: 8.6, turnover: 0.5 }))
  const js08 = quoteToSignals(calm).find((s) => s.code === 'JS' && s.subIdx === 7)
  ok(js08 && js08.delta === 0.1, `低振幅(≈0.47%) → JS08 +0.10（实际 ${js08 && js08.delta}）`)

  const wild = parseTencentQuote(fixtureLine({ pct: -6, high: 9.1, low: 8.3, prevClose: 8.6, turnover: 8 }))
  const js08w = quoteToSignals(wild).find((s) => s.code === 'JS' && s.subIdx === 7)
  ok(js08w && js08w.delta === -0.1, `高振幅(≈9.3%) → JS08 −0.10（实际 ${js08w && js08w.delta}）`)

  // 无数据不出信号（JB/HG 不应出现）
  ok(!quoteToSignals(cheap).some((s) => ['JB', 'HG'].includes(s.code)), 'JB/HG 无字段 → 不出信号（NA）')

  // 板块指数可选激活 HY01
  const withSector = quoteToSignals(cheap, { sectorPct: 2.0 })
  ok(withSector.some((s) => s.code === 'HY' && s.delta === 0.12), '提供 sectorPct → HY01 激活')
  ok(!quoteToSignals(cheap).some((s) => s.code === 'HY'), '不提供 sectorPct → HY01 不激活')
}
ok(RULES_TEXT.length >= 6, `规则文本导出（${RULES_TEXT.length} 条）`)

// ── 4. fetchQuotes（注入 fetcher，不打网络）──
{
  const good = fixtureLine()
  const fetcher = async (url) => `v_sh601398="${good.split('="')[1].split('"')[0]}";`
  const { quotes, fetched, error } = await fetchQuotes(['601398'], { fetcher })
  ok(fetched === 1 && !error, `注入 fetcher 成功（fetched=${fetched}, error=${error}）`)
  ok(quotes.get('601398') && quotes.get('601398').name === '工商银行', 'Map 命中该代码')

  const bad = await fetchQuotes(['601398'], { fetcher: async () => { throw new Error('boom') } })
  ok(bad.error && bad.fetched === 0 && bad.quotes.get('601398') === null, 'fetcher 抛错 → error + 全 null（整体回退基线）')

  const empty = await fetchQuotes(['601398'], { fetcher: async () => '' })
  ok(empty.error === 'empty-response', '空响应 → empty-response 错误')

  const partial = await fetchQuotes(['601398', '000001'], {
    fetcher: async () => fixtureLine() + 'v_sz000001="bad";',
  })
  ok(partial.fetched === 1 && partial.quotes.get('000001') === null && partial.quotes.get('601398'), '部分失败 → 单只 null，其余正常')

  const none = await fetchQuotes([], { fetcher })
  ok(none.error === 'no-codes', '空代码列表 → no-codes')

  // 默认取数路径：临时替换全局 fetch（确定性，不打网络）
  {
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (!String(url).includes('sh601398')) throw new Error('bad-url')
      return { text: async () => fixtureLine() }
    }
    try {
      const def = await fetchQuotes(['601398'], { timeoutMs: 3000 })
      ok(def.fetched === 1 && !def.error, `未注入 fetcher → 默认全局 fetch 生效（fetched=${def.fetched}）`)
      ok(def.quotes.get('601398') && def.quotes.get('601398').name === '工商银行', '默认路径解析正确')
      const defBad = await fetchQuotes(['601398'], { timeoutMs: 3000 })
      ok(defBad.error === null, '默认路径 URL 正确（无 bad-url 触发）')
    } finally {
      globalThis.fetch = origFetch
    }
    ok(typeof createCurlFetcher({ proxy: 'http://127.0.0.1:1' }) === 'function', 'createCurlFetcher 可构造（代理环境注入用）')
  }
}

// ── 5. mergeSignals 口径覆盖 ──
{
  const merged = mergeSignals(
    [
      { code: 'JS', subIdx: 1, delta: 0.3 },
      { code: 'ZJ', subIdx: 0, delta: 0.3 },
    ],
    [
      { code: 'JS', subIdx: 1, delta: 0.5 }, // 覆盖同键
      { code: 'GZ', subIdx: 0, delta: 0.25 }, // 新键追加
    ],
  )
  ok(merged.length === 3, `合并后 3 条（实际 ${merged.length}）`)
  ok(merged.find((s) => s.code === 'JS' && s.subIdx === 1).delta === 0.5, '同 (code,subIdx) 以适配信号为准')
  ok(merged.some((s) => s.code === 'GZ'), '新子域追加')
}

// ── 6. 集成：runBatch 在线 vs 离线（mock fetcher，6 只跨板块样本）──
const SAMPLE = [
  ['工商银行', '601398', 8.58, -0.23, '银行', ''],
  ['招商银行', '600036', 42.52, -1.23, '银行', ''],
  ['紫金矿业', '601899', 29.06, -2.45, '有色金属', ''],
  ['科大讯飞', '002230', 37.04, 2.55, '科技电子', ''],
  ['赛力斯', '601127', 43.79, -2.41, '汽车', ''],
  ['长盛轴承', '300718', 48.76, 1.88, '装备制造', ''],
]
const MOCK_QUOTES = {
  601398: { price: 8.58, prevClose: 8.6, open: 8.58, change: -0.02, pct: -0.23, high: 8.65, low: 8.52, volume: 1234567, amount: 106000, turnover: 0.05, pe: 8.05, totalCap: 30116, pb: 0.77 },
  600036: { price: 42.52, prevClose: 43.05, open: 42.6, change: -0.53, pct: -1.23, high: 42.9, low: 42.3, volume: 890123, amount: 380000, turnover: 0.12, pe: 6.9, totalCap: 10700, pb: 0.82 },
  601899: { price: 29.06, prevClose: 29.79, open: 29.5, change: -0.73, pct: -2.45, high: 29.8, low: 28.9, volume: 2345678, amount: 680000, turnover: 1.2, pe: 18.5, totalCap: 7600, pb: 4.1 },
  '002230': { price: 37.04, prevClose: 36.12, open: 36.5, change: 0.92, pct: 2.55, high: 37.6, low: 36.4, volume: 3456789, amount: 1290000, turnover: 2.1, pe: 96.0, totalCap: 8600, pb: 5.8 },
  '601127': { price: 43.79, prevClose: 44.87, open: 44.0, change: -1.08, pct: -2.41, high: 44.2, low: 43.2, volume: 1567890, amount: 685000, turnover: 1.8, pe: 56.0, totalCap: 6600, pb: 8.2 },
  '300718': { price: 48.76, prevClose: 47.86, open: 48.0, change: 0.9, pct: 1.88, high: 49.5, low: 47.5, volume: 234567, amount: 114000, turnover: 3.6, pe: 45.0, totalCap: 146, pb: 8.25 },
}
const mockFetcher = async (url) => {
  const syms = decodeURIComponent(url).match(/q=([\w.,]+)/)[1].split(',')
  const codes = syms.map((s) => s.replace(/^(sh|sz|bj)/, ''))
  return codes
    .map((c) => {
      const o = MOCK_QUOTES[c]
      if (!o) return ''
      return fixtureLine({ code: c, ...o })
    })
    .join('')
}

{
  const offOut = join(tmpdir(), `batch_off_${Date.now()}.json`)
  const off = await runBatch({ stocks: SAMPLE, outFile: offOut })
  const onOut = join(tmpdir(), `batch_on_${Date.now()}.json`)
  const on = await runBatch({ stocks: SAMPLE, outFile: onOut, live: true, fetcher: mockFetcher })

  ok(off.meta.mode === 'offline' && on.meta.mode === 'online', `模式标记正确（${off.meta.mode}/${on.meta.mode}）`)
  ok(on.meta.live.fetched === 6, `在线拉取 6/6（实际 ${on.meta.live.fetched}）`)

  const offKinds = Object.keys(off.hexagram_dist).length
  const onKinds = Object.keys(on.hexagram_dist).length
  ok(onKinds > offKinds, `在线卦象种类多于离线（${offKinds} → ${onKinds}）`)

  const offGz = off.results.every((r) => r.domain_scores.GZ === 0.5)
  const onGzActive = on.results.filter((r) => r.domain_scores.GZ !== 0.5).length
  ok(offGz, '离线：GZ 恒 0.5（冻结）')
  ok(onGzActive === 6, `在线：6/6 只 GZ 域被真实 PE 激活（实际 ${onGzActive}）`)

  // 便宜组 vs 昂贵组的 GZ 分方向正确
  const cheap = on.results.find((r) => r.code === '600036') // 招行 PE6.9
  const rich = on.results.find((r) => r.code === '002230') // 讯飞 PE96
  ok(cheap.domain_scores.GZ > 0.5, `招行(PE6.9) GZ 分 >0.5（实际 ${cheap.domain_scores.GZ}）`)
  ok(rich.domain_scores.GZ < 0.5, `讯飞(PE96) GZ 分 <0.5（实际 ${rich.domain_scores.GZ}）`)

  // 在线失败整体回退：fetcher 抛错 → 与离线结果一致
  const failOut = join(tmpdir(), `batch_fail_${Date.now()}.json`)
  const fallback = await runBatch({
    stocks: SAMPLE,
    outFile: failOut,
    live: true,
    fetcher: async () => {
      throw new Error('offline-now')
    },
  })
  ok(fallback.meta.live.error && fallback.meta.live.degraded_to_baseline, '在线失败 → 标记降级')
  ok(
    JSON.stringify(fallback.results.map((r) => r.trend)) === JSON.stringify(off.results.map((r) => r.trend)),
    '在线失败回退后趋势与离线完全一致',
  )

  // 回归：默认 56 只离线跑（防重构破坏旧行为）
  const regOut = join(tmpdir(), `batch_reg_${Date.now()}.json`)
  const reg = await runBatch({ outFile: regOut })
  const d = reg.trend_dist
  ok(
    d['看涨'] === 16 && d['震荡(观望)'] === 19 && d['看跌'] === 16 && d['看跌(否决)'] === 5,
    `56 只离线回归：16/19/16/5（实际 ${JSON.stringify(d)}）`,
  )
  ok(Object.keys(reg.hexagram_dist).length === 5, `56 只离线卦象仍 5 种（实际 ${Object.keys(reg.hexagram_dist).length}）`)
  ok(reg.results[0].signals.every((s) => s.rule === null || s.rule === undefined), '离线信号无 rule 标记（与旧版同构）')
}

console.log(`\n适配层专项：${pass} PASS / ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
