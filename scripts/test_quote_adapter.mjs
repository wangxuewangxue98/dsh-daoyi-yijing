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
  decodeTencentBytes,
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
    outerVol: 800000, innerVol: 434567, // 外盘+内盘 = volume（1234567）
    // v0.5.1 新增字段（补子域用）：不传则走下列默认，置 '' 可模拟字段缺失
    floatCap: 22782.23, limitUp: 9.44, limitDown: 7.76, volRatio: 1.1,
    weicha: -31489, avgPrice: 8.55, peDyn: 8.1, peStatic: 8.3, amplitudeRaw: 1.78,
  }
  Object.assign(f, overrides)
  const arr = new Array(54).fill('0')
  arr[0] = '51'
  arr[1] = f.name; arr[2] = f.code; arr[3] = String(f.price); arr[4] = String(f.prevClose)
  arr[5] = String(f.open); arr[7] = String(f.outerVol); arr[8] = String(f.innerVol)
  arr[30] = '150000'; arr[31] = String(f.change); arr[32] = String(f.pct)
  arr[33] = String(f.high); arr[34] = String(f.low); arr[36] = String(f.volume); arr[37] = String(f.amount)
  arr[38] = String(f.turnover); arr[39] = String(f.pe); arr[45] = String(f.totalCap); arr[46] = String(f.pb)
  arr[43] = String(f.amplitudeRaw); arr[44] = String(f.floatCap)
  arr[47] = String(f.limitUp); arr[48] = String(f.limitDown); arr[49] = String(f.volRatio)
  arr[50] = String(f.weicha); arr[51] = String(f.avgPrice)
  arr[52] = String(f.peDyn); arr[53] = String(f.peStatic)
  return `v_sh${f.code}="${arr.join('~')}";`
}
/** 指数行 fixture（与个股同构：pct[32] / amount[37] / turnover[38] / amplitude[43]） */
function indexLine(symbol = 'sh000001', { pct = -0.6, amount = 64275156, turnover = 0.78, amplitude = 1.07 } = {}) {
  const arr = new Array(54).fill('0')
  arr[0] = '1'; arr[1] = '上证指数'; arr[2] = '000001'; arr[3] = '3725.5'
  arr[32] = String(pct); arr[37] = String(amount); arr[38] = String(turnover); arr[43] = String(amplitude)
  return `v_${symbol}="${arr.join('~')}";`
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
  // GZ01 改为对数连续映射：(ln20 − ln PE) × 0.25，clamp ±0.40
  const gzExp = (pe) => Math.max(-0.4, Math.min(0.4, (Math.log(20) - Math.log(pe)) * 0.25))
  ok(gz && Math.abs(gz.delta - gzExp(8.05)) < 0.001, `PE 8.05 → GZ01 delta ${gzExp(8.05).toFixed(4)}（实际 ${gz && gz.delta}）`)

  const mid = parseTencentQuote(fixtureLine({ pe: 15 }))
  ok(Math.abs(quoteToSignals(mid).find((s) => s.code === 'GZ').delta - gzExp(15)) < 0.001, 'PE 15 → 对数映射值')

  const rich = parseTencentQuote(fixtureLine({ pe: 96 }))
  ok(Math.abs(quoteToSignals(rich).find((s) => s.code === 'GZ').delta - gzExp(96)) < 0.001, 'PE 96（贵）→ 对数映射负值')
  ok(gzExp(8.05) > gzExp(15) && gzExp(15) > gzExp(96), 'GZ01 单调：PE 越低分越高（连续可比）')

  const loss = parseTencentQuote(fixtureLine({ pe: '-' }))
  ok(!quoteToSignals(loss).some((s) => s.code === 'GZ'), 'PE 亏损(-) → GZ01 不评分（NA）')

  const flat = parseTencentQuote(fixtureLine({ pct: 0, high: 8.6, low: 8.6, price: 8.6 }))

  // ZJ01 真实资金流（外盘/内盘）——与涨跌幅不同源，是解耦独立爻的关键
  {
    const q = parseTencentQuote(fixtureLine({ outerVol: 800000, innerVol: 434567, pct: -0.23 }))
    ok(q.outerVol === 800000 && q.innerVol === 434567, '外盘/内盘字段解析正确')
    ok(Math.abs(q.netActiveBuyRatio - 0.2962) < 0.001, `净主动买入占比 = (外−内)/(外+内)（实际 ${q.netActiveBuyRatio}）`)
    const zj = quoteToSignals(q).find((s) => s.code === 'ZJ')
    ok(zj && zj.rule === 'ZJ01-net-active-buy', `ZJ01 走真实资金流（rule=${zj && zj.rule}）`)
    ok(zj && zj.delta > 0, '净买入 → ZJ delta 为正')
    // 关键：当日下跌(pct<0)但资金净流入 → ZJ 与 JS 动量反向，证明已解耦
    const js = quoteToSignals(q).find((s) => s.code === 'JS' && s.rule === 'JS02-pct')
    ok(js && js.delta < 0 && zj.delta > 0, '跌但净买入：JS 动量负 / ZJ 资金正 → 两爻独立')

    const qSell = parseTencentQuote(fixtureLine({ outerVol: 434567, innerVol: 800000, pct: 2.55 }))
    const zjSell = quoteToSignals(qSell).find((s) => s.code === 'ZJ')
    ok(zjSell.delta < 0, '净卖出 → ZJ delta 为负')

    // 无外盘/内盘 → 回退涨跌幅代理并标注 fallback
    const noFlow = parseTencentQuote(fixtureLine({ outerVol: '', innerVol: '' }))
    const zjFb = quoteToSignals(noFlow).find((s) => s.code === 'ZJ')
    ok(zjFb && zjFb.rule === 'ZJ01-pct-proxy-fallback', `无外盘/内盘 → 回退代理并标注（rule=${zjFb && zjFb.rule}）`)
  }
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

  // v0.5.1：JB/HG 由「无数据→全域 NA」改为「proxy 口径激活首个子域」；其余子域仍必须 NA（不造假）
  {
    const full = quoteToSignals(cheap)
    const jbSubs = full.filter((s) => s.code === 'JB').map((s) => s.subIdx + 1)
    const hgSubs = full.filter((s) => s.code === 'HG').map((s) => s.subIdx + 1)
    ok(
      jbSubs.length === 1 && jbSubs[0] === 1 && hgSubs.length === 1 && hgSubs[0] === 1,
      `JB/HG 仅 proxy 首子域出信号，其余仍 NA（JB=${jbSubs.join('/')||'无'}, HG=${hgSubs.join('/')||'无'}）`,
    )
    ok(full.find((s) => s.code === 'JB')?.rule === 'JB01-roe-proxy-pb-over-pe', 'JB01 走 ROE 代理口径（PB/PE）')
    ok(full.find((s) => s.code === 'HG')?.rule === 'HG01-totalcap-macro-sensitivity', 'HG01 走总市值敏感度口径')
    // ROE 代理方向：PB 不变而 PE 更低（更便宜）→ 隐含 ROE 更高 → delta 更阳
    const hiRoe = quoteToSignals(parseTencentQuote(fixtureLine({ pe: 5, pb: 1.0 }))).find((s) => s.code === 'JB')
    const loRoe = quoteToSignals(parseTencentQuote(fixtureLine({ pe: 40, pb: 1.0 }))).find((s) => s.code === 'JB')
    ok(hiRoe.delta > loRoe.delta, `ROE 代理单调：PE5/PB1 → ${hiRoe.delta} > PE40/PB1 → ${loRoe.delta}`)
  }

  // v0.5.1 补子域：新增信号各自独立取数，缺字段即不出信号（不臆造）
  {
    const q = parseTencentQuote(fixtureLine())
    ok(q.floatCap === 22782.23 && q.volRatio === 1.1 && q.avgPrice === 8.55, '新增原始字段解析正确（流通市值/量比/均价）')
    ok(Math.abs(q.gapPct - (-0.2326)) < 0.01, `跳空派生正确（${q.gapPct}%）`)
    ok(Math.abs(q.avgDev - (8.58 - 8.55) / 8.55) < 1e-4, `均价偏离派生正确（${q.avgDev}）`)
    // 距涨跌停较近一侧：上方空间 (9.44−8.58)/8.58=0.1002，下方 (8.58−7.76)/8.58=0.0956 → 取小
    ok(Math.abs(q.limitDist - 0.09557) < 0.001, `距涨跌停距离派生正确（${q.limitDist}）`)
    ok(Math.abs(q.floatRatio - 22782.23 / 30116) < 1e-4, `自由流通占比派生正确（${q.floatRatio}）`)
    ok(Math.abs(q.roeProxy - 0.77 / 8.05) < 1e-4, `ROE 代理派生正确（${q.roeProxy}）`)

    const has = (o, code, sub) => quoteToSignals(parseTencentQuote(fixtureLine(o))).some((s) => s.code === code && s.subIdx + 1 === sub)
    ok(has({}, 'JS', 6), 'JS06 均线系统（均价偏离）出信号')
    ok(has({}, 'ZJ', 3) && has({}, 'ZJ', 7), 'ZJ03 量比 / ZJ07 自由流通比 出信号')
    ok(has({}, 'GZ', 4), 'GZ04 业绩匹配（静态/动态 PE）出信号')
    ok(has({}, 'FX', 8), 'FX08 止损边界（涨跌停距离）出信号')
    ok(has({}, 'XX', 8), 'XX08 突发事件（跳空）出信号')
    ok(!has({ volRatio: '' }, 'ZJ', 3), '缺量比 → ZJ03 不出信号（NA）')
    ok(!has({ floatCap: '' }, 'ZJ', 7), '缺流通市值 → ZJ07 不出信号（NA）')
    ok(!has({ peStatic: '', peDyn: '' }, 'GZ', 4), '缺动态/静态 PE → GZ04 不出信号（NA）')
    ok(!has({ limitUp: '', limitDown: '' }, 'FX', 8), '缺涨跌停价 → FX08 不出信号（NA）')
    ok(!has({ pb: '' }, 'JB', 1), '缺 PB → JB01 不出信号（NA）')
  }

  // v0.5.1 宏观/行业的「相对量」口径：必须逐股分化，且不得在缺指数/缺板块时冒充
  {
    const q = parseTencentQuote(fixtureLine({ pct: 2.0 }))
    const idx = { symbol: 'sh000001', name: '上证指数', pct: -0.6, amountWan: 64275156, turnover: 0.78, amplitude: 1.07 }
    const withIdx = quoteToSignals(q, { sectorPct: 1.0, sectorAmountWan: 200000, indexCtx: idx })
    const hg03 = withIdx.find((s) => s.code === 'HG' && s.subIdx + 1 === 3)
    ok(hg03 && hg03.delta > 0, `HG03 相对大盘：个股 +2.0% vs 指数 −0.6% → delta 为正（${hg03 && hg03.delta}）`)
    const hy04 = withIdx.find((s) => s.code === 'HY' && s.subIdx + 1 === 4)
    ok(hy04 && hy04.delta > 0, `HY04 相对板块：个股 +2.0% vs 板块 +1.0% → delta 为正（${hy04 && hy04.delta}）`)
    ok(withIdx.some((s) => s.code === 'HG' && s.subIdx + 1 === 7), 'HG07 流动性占比 出信号')
    ok(withIdx.some((s) => s.code === 'HG' && s.subIdx + 1 === 8), 'HG08 相对换手 beta 代理 出信号')
    ok(withIdx.some((s) => s.code === 'HY' && s.subIdx + 1 === 8), 'HY08 产业链位置 出信号')
    // 无指数基准 → 三个相对量子域全部不激活（严防"市场常数"伪指标复活）
    const noIdx = quoteToSignals(q, { sectorPct: 1.0 })
    ok(!noIdx.some((s) => s.code === 'HG' && [3, 7, 8].includes(s.subIdx + 1)), '无指数基准 → HG03/07/08 不激活（不伪造宏观数据）')
  }

  // v0.5.1 指数基准取数与板块截面统计（六爻四爻 HG 的数据入口）
  {
    const { fetchIndexQuotes, buildIndexContext, buildSectorStats } = await import('../adapters/quote.mjs')
    const ir = await fetchIndexQuotes(['sh000001'], { fetcher: async () => indexLine() })
    ok(ir.indexContext && ir.indexContext.pct === -0.6, `指数基准解析：上证 pct=${ir.indexContext && ir.indexContext.pct}`)
    ok(ir.indexContext.amountWan === 64275156 && ir.indexContext.turnover === 0.78, '指数成交额/换手解析正确')
    const degraded = await fetchIndexQuotes(['sh000001'], { fetcher: async () => '' })
    ok(degraded.error === 'empty-response' && degraded.indexContext === null, '指数取数失败 → 上下文为 null（优雅降级）')
    const emptyMap = new Map([['sh000001', null]])
    ok(buildIndexContext(emptyMap) === null, '指数 Map 全空 → buildIndexContext 返回 null')

    const quotes = new Map([
      ['600036', { pct: -1.23, amount: 380000 }],
      ['601398', { pct: -0.23, amount: 106000 }],
      ['601899', { pct: -2.45, amount: 680000 }],
    ])
    const stocks = [['招行', '600036', 0, 0, '银行'], ['工行', '601398', 0, 0, '银行'], ['紫金', '601899', 0, 0, '有色']]
    const st = buildSectorStats(stocks, quotes)
    ok(Math.abs(st['银行'].pct - (-0.73)) < 1e-9, `板块截面均值：银行 pct=${st['银行'].pct}（源 ${st['银行'].source}）`)
    ok(st['银行'].n === 2 && st['有色'].n === 1, '板块样本计数正确')
    ok(st['银行'].source === 'batch-sample-mean', '未提供真实板块指数 → 口径标注为批次样本均值（可审计）')
    const external = buildSectorStats(stocks, quotes, { 银行: 1.5 })
    ok(external['银行'].pct === 1.5 && external['银行'].source === 'sector-index', '提供真实板块指数时优先使用并标注来源')
  }

  // 板块指数可选激活 HY01
  const withSector = quoteToSignals(cheap, { sectorPct: 2.0 })
  ok(withSector.some((s) => s.code === 'HY' && s.delta === 0.12), '提供 sectorPct → HY01 激活')
  ok(!quoteToSignals(cheap).some((s) => s.code === 'HY'), '不提供 sectorPct → HY01 不激活')
}
ok(RULES_TEXT.length >= 6, `规则文本导出（${RULES_TEXT.length} 条）`)

// ── 3b. GBK 解码（v0.6.0 修复：腾讯响应是 GBK，按 UTF-8 解会把中文名变乱码）──
{
  // 「工商银行」GBK 编码 = b9a4 c9cc d2f8 d0d0（2026-10-22 穷举 GBK 空间反查，勿凭记忆改）
  const gbkBytes = Buffer.from([0xb9, 0xa4, 0xc9, 0xcc, 0xd2, 0xf8, 0xd0, 0xd0])
  ok(decodeTencentBytes(gbkBytes) === '工商银行', 'GBK 字节 → 工商银行（decodeTencentBytes）')
  ok(decodeTencentBytes('已是字符串') === '已是字符串', 'string 输入原样返回（不重复解码）')
  ok(decodeTencentBytes(null) === '', 'null → 空串')
  // 乱码现场复现与修复：v_sh601398="51~<GBK名>~..." 整行按 GBK 解
  const rawLine = `v_sh601398="51~${decodeTencentBytes(gbkBytes)}~601398~8.58~8.60~8.62~100~90~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~-0.02~-0.23~8.71~8.45~123456~106500~0.53~6.2~1.45~8000~10000~8.50~8.70~1.05~200~8.55~6.2~7.1";`
  const parsedGbk = parseTencentQuote(rawLine)
  ok(parsedGbk && parsedGbk.name === '工商银行', 'GBK 整行解析 → name=工商银行（非乱码）')
  // 若按 UTF-8 误解码（旧行为），名会变成含替换符的乱码
  const mojibake = Buffer.from([0xb9, 0xa4]).toString('utf8')
  ok(!mojibake.startsWith('工'), `旧行为确认会乱码（对照组：${JSON.stringify(mojibake)}）`)
  // 注入 fetcher 回 GBK 字节流（模拟真实腾讯响应）→ fetchQuotes 内部按 GBK 解
  const tailFields =
    '~601398~8.58~8.60~8.62~100~90~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~-0.02~-0.23~8.71~8.45~123456~106500~0.53~6.2~1.45~8000~10000~8.50~8.70~1.05~200~8.55~6.2~7.1'
  const gbkLineBytes = Buffer.concat([
    Buffer.from('v_sh601398="51~', 'utf8'),
    gbkBytes,
    Buffer.from(`${tailFields}";`, 'utf8'),
  ])
  const bufFetcher = async () => gbkLineBytes
  const bufRes = await fetchQuotes(['601398'], { fetcher: bufFetcher })
  ok(bufRes.fetched === 1 && bufRes.quotes.get('601398').name === '工商银行', 'fetcher 回 GBK Buffer → 按 GBK 解码')
  // 反向对照：同一份字节若按 UTF-8 误解码（旧行为）→ 必不等
  const utf8Misread = Buffer.concat([gbkLineBytes]).toString('utf8')
  ok(!utf8Misread.includes('工商银行'), '旧行为（UTF-8 误解码）对照：确实解不出工商银行')
}

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
