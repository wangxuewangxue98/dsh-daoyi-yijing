// divine_batch_stocks.mjs — 道一-易经推演 · 批量股票趋势推演（示例：56 只自选股 · 本周涨跌研判）
//
// 数据来源：用户提供的同花顺自选股截图（收盘快照，共 56 只完整行；另有 1 行被截断未纳入）。
//
// 【输入映射规则（透明、可审计；无数据不臆造 → 对应子域/检查点标 NA，不参与聚合）】
// 活跃信号（子域级，域内 6 个评估侧面按敏感度系数 [1.0,0.5,0.7,0.8,0.3,0.0] 铺开）：
//   JS 趋势方向   = 0.5 + clamp((涨跌% − 上证0.12) × 0.12, -0.42, +0.42)   （相对大盘强弱）
//   JS 动量强度   = 0.5 + clamp(涨跌% × 0.10, -0.42, +0.42)
//   ZJ 主力资金   = 0.5 + clamp(涨跌% × 0.10, -0.42, +0.42)  （当日涨跌作短线资金流代理——局限已声明）
//   HY 行业景气   = 0.5 + clamp(板块日均涨跌% × 0.06, -0.20, +0.20)（板块按名称归类，均值来自截图当日数据）
//   XX 公司公告   = ST → 0.25（风险警示=负面）；XD → 0.55（除息中性）；其余 NA（无公告数据不评分）
//   FX 系统性风险 = 0.55（仅当 FX 域存在其他信号时激活；指数微涨无系统性冲击）
//   FX 个股黑天鹅 = ST → 0.20；否则 NA
//   FX 止损边界   = 涨跌% ≤ −4.5 → 0.40（深跌风险暴露）；≥ +4.5 → 0.70（强动量、无警示）；否则 NA
//   JB 基本面 / GZ 估值面 / HG 宏观面：截图无任何数据 → 全域 NA（覆盖率如实暴露，不造假）
// 推演区间：本周内（截图为周三收盘快照 → 剩余周四/周五共 2 个交易日）。
// 结论映射：可行→看涨 / 有条件可行→震荡(观望) / 不可行→看跌；FX/XX 白名单否决→看跌(否决)。
// ⚠️ 免责声明：结构化多因子研判示意，不构成任何投资建议。

import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { resolveHexagramForScript } from '../lib/yijing/hexagram.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKET_PCT = 0.12 // 上证当日 +0.12%
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
const ASPECT_COEFS = [1.0, 0.5, 0.7, 0.8, 0.3, 0.0] // 强度/持续性/确定性/边际变化/安全边际/催化
const ASPECT_BIAS = [0, -0.08, 0.08, -0.04, 0.04, 0] // 侧面基准偏置（宽严差异，确定性常量；使涨跌幅量级产生梯度而非仅符号）

// ===== 截图数据（名称, 代码, 现价, 当日涨跌%, 板块, 标记）=====
const STOCKS = [
  ['兰州银行', '001227', 2.1, -1.41, '银行', ''],
  ['中国能建', '601868', 2.33, -1.27, '基建', ''],
  ['通裕重工', '300185', 2.71, -1.09, '装备制造', ''],
  ['ST兴化', '002109', 2.73, 1.87, '化工', 'ST'],
  ['中国一重', '601106', 2.91, -0.68, '装备制造', ''],
  ['光大银行', '601818', 3.07, -1.29, '银行', ''],
  ['民生银行', '600016', 3.49, -1.69, '银行', ''],
  ['铁建重工', '688425', 3.98, -0.25, '装备制造', ''],
  ['贝因美', '002570', 4.28, 1.18, '消费', ''],
  ['瑞丰银行', '601528', 5.16, -0.39, '银行', ''],
  ['邮储银行', '601658', 5.65, -0.53, '银行', ''],
  ['ST南新', '688189', 6.15, 0.49, '医药', 'ST'],
  ['西藏天路', '600326', 6.29, -0.47, '基建', ''],
  ['交通银行', '601328', 8.23, 0.0, '银行', ''],
  ['三六零', '601360', 8.43, 1.81, '科技电子', ''],
  ['工商银行', '601398', 8.58, -0.23, '银行', ''],
  ['盛屯矿业', '600711', 9.26, -2.22, '有色金属', ''],
  ['中国核建', '601611', 9.69, 0.83, '核工', ''],
  ['ST联光', '600363', 9.89, -3.79, '科技电子', 'ST'],
  ['弘讯科技', '603015', 10.47, 2.85, '科技电子', ''],
  ['中银证券', '601696', 10.79, -0.46, '证券', ''],
  ['隆基绿能', '601012', 10.95, -1.26, '光伏', ''],
  ['平安银行', '000001', 11.44, -1.8, '银行', ''],
  ['建设银行', '601939', 11.5, -0.61, '银行', ''],
  ['西藏旅游', '600749', 11.97, 1.1, '消费', ''],
  ['金牛化工', '600722', 13.29, 0.08, '化工', ''],
  ['阳光乳业', '001318', 13.38, -2.62, '消费', ''],
  ['雪人集团', '002639', 13.8, -4.89, '装备制造', ''],
  ['洛阳钼业', '603993', 14.35, -7.0, '有色金属', ''],
  ['安泰科技', '000969', 15.0, 0.94, '新材料', ''],
  ['金风科技', '002202', 15.14, -0.39, '装备制造', ''],
  ['中核科技', '000777', 15.9, -0.31, '核工', ''],
  ['兴业银行', '601166', 18.51, 0.05, '银行', ''],
  ['广发证券', '000776', 18.88, -2.53, '证券', ''],
  ['华辰装备', '300809', 21.86, 2.82, '装备制造', ''],
  ['东方电气', '600875', 22.1, -0.9, '电力', ''],
  ['紫金矿业', '601899', 29.06, -2.45, '有色金属', ''],
  ['永鼎股份', '600105', 29.38, 1.07, '通信线缆', ''],
  ['长江电力', '600900', 29.69, 0.51, '电力', ''],
  ['西部矿业', '601168', 31.32, -3.24, '有色金属', ''],
  ['大金重工', '002487', 34.66, -0.35, '装备制造', ''],
  ['科大讯飞', '002230', 37.04, 2.55, '科技电子', ''],
  ['江西铜业', '600362', 38.07, -2.61, '有色金属', ''],
  ['纽威股份', '603699', 38.57, 1.02, '装备制造', 'XD'],
  ['飞龙股份', '002536', 39.85, 2.15, '汽车', ''],
  ['赤峰黄金', '600988', 40.97, -0.99, '有色金属', ''],
  ['招商银行', '600036', 42.52, -1.23, '银行', ''],
  ['国光电气', '688776', 42.96, 0.89, '科技电子', ''],
  ['赛力斯', '601127', 43.79, -2.41, '汽车', ''],
  ['日盈电子', '603286', 45.5, 6.46, '科技电子', ''],
  ['立讯精密', '002475', 47.6, 3.03, '科技电子', ''],
  ['长盛轴承', '300718', 48.76, 1.88, '装备制造', ''],
  ['工业富联', '601138', 48.77, 2.22, '科技电子', ''],
  ['英杰电气', '300820', 53.53, 2.33, '装备制造', ''],
  ['西部超导', '688122', 55.4, 0.4, '新材料', ''],
  ['夏厦精密', '001306', 57.15, 8.82, '装备制造', ''],
]

// ===== 板块日均涨跌（由截图数据自身统计，非外部臆造）=====
const sectorStats = {}
for (const [, , , pct, sector] of STOCKS) (sectorStats[sector] ||= []).push(pct)
const sectorAvg = Object.fromEntries(
  Object.entries(sectorStats).map(([s, arr]) => [s, arr.reduce((a, b) => a + b, 0) / arr.length]),
)

// ===== 子域级信号 → 检查点输入 + NA 标记 =====
const SUB_IDX = { JS趋势: 0, JS动量: 1, ZJ主力: 0, HY景气: 0, XX公告: 0, FX系统: 0, FX黑天鹅: 1, FX止损: 7 }
function buildInputs(stock) {
  const [, , , pct, sector, flag] = stock
  const rel = pct - MARKET_PCT
  // 每个活跃子域：base = 0.5 + delta；6 侧面按系数铺开
  const signals = []
  const add = (code, subIdx, delta) => signals.push({ code, subIdx, delta })
  add('JS', SUB_IDX.JS趋势, clamp(rel * 0.12, -0.42, 0.42))
  add('JS', SUB_IDX.JS动量, clamp(pct * 0.1, -0.42, 0.42))
  add('ZJ', SUB_IDX.ZJ主力, clamp(pct * 0.1, -0.42, 0.42))
  add('HY', SUB_IDX.HY景气, clamp(sectorAvg[sector] * 0.06, -0.2, 0.2))
  if (flag === 'ST') {
    add('XX', SUB_IDX.XX公告, -0.25)
    add('FX', SUB_IDX.FX系统, 0.05)
    add('FX', SUB_IDX.FX黑天鹅, -0.3)
  } else if (flag === 'XD') {
    add('XX', SUB_IDX.XX公告, 0.05)
  }
  if (pct <= -4.5) {
    if (!signals.some((s) => s.code === 'FX' && s.subIdx === SUB_IDX.FX系统)) add('FX', SUB_IDX.FX系统, 0.05)
    add('FX', SUB_IDX.FX止损, -0.1)
  } else if (pct >= 4.5) {
    if (!signals.some((s) => s.code === 'FX' && s.subIdx === SUB_IDX.FX系统)) add('FX', SUB_IDX.FX系统, 0.05)
    add('FX', SUB_IDX.FX止损, 0.2)
  }

  const activeKeys = new Set(signals.map((s) => `${s.code}${String(s.subIdx + 1).padStart(2, '0')}`))
  const inputs = {}
  const naIds = []
  for (const cp of db.checkpoints) {
    const key = cp.id.slice(0, 4) // 如 JS01
    if (!activeKeys.has(key)) {
      naIds.push(cp.id)
      continue
    }
    const sig = signals.find((s) => `${s.code}${String(s.subIdx + 1).padStart(2, '0')}` === key)
    const ci = Number(cp.id.slice(5, 7)) - 1 // 侧面序号 0..5
    inputs[cp.id] = Number(
      clamp(0.5 + sig.delta * ASPECT_COEFS[ci] + ASPECT_BIAS[ci], 0.02, 0.98).toFixed(4),
    )
  }
  return { inputs, naIds, signals }
}

// ===== 批量推演 =====
const script = buildStockScript()
const db = buildCheckpointDatabase(script)

function mapTrend(r) {
  if (r.has_veto) return '看跌(否决)'
  if (r.verdict === '可行') return '看涨'
  if (r.verdict === '有条件可行') return '震荡(观望)'
  return '看跌'
}

function assess(stock, r, activeDomainCount, coverage) {
  const [, , , , , flag] = stock
  const margin = Math.min(Math.abs(r.overall_score - 0.75), Math.abs(r.overall_score - 0.5))
  const conf =
    margin <= 0.03
      ? '临界（综合分距档位阈值 ≤3 个百分点，输入微变即可翻档）'
      : margin <= 0.08
        ? '中低（距档位边界较近）'
        : '中（距档位边界较远，档位相对稳定）'
  const notes = [
    `输入完备度：低——仅 ${activeDomainCount}/8 个域有数据支撑的信号（JS/ZJ 来自当日行情，HY 为板块当日均值代理，XX/FX 仅 ST·XD·大涨大跌情形激活）；` +
      `JB/GZ/HG 无数据 → 全域 NA（覆盖率 ${(coverage * 100).toFixed(1)}%），384 爻框架下如实暴露信息缺口而非造假填充。`,
    `结论置信：${conf}` +
      (r.has_veto
        ? `；触发 FX/XX 白名单否决（${flag === 'ST' ? 'ST 风险警示' : '当日深跌风险暴露'}），档位由风控规则主导，对输入鲁棒。`
        : `；无否决，档位由 ${activeDomainCount} 个活跃域的通过率均值决定。`),
    `可复核性：全部输入由截图涨跌幅按公开规则线性映射，无隐藏参数；确定性引擎（离线、零 LLM 消耗），同一输入必得同一结论，可用下周末行情回看校验。`,
  ]
  return { margin: Number(margin.toFixed(4)), notes }
}

const results = []
for (const stock of STOCKS) {
  const [name, code, price, pct, sector, flag] = stock
  const { inputs, naIds, signals } = buildInputs(stock)
  const s = buildStockScript()
  s.na = { domains: [], checkpoints: naIds }
  const matter = `${name}(${code}) 本周内涨跌研判`
  const r = await evaluate(matter, s, { inputs })

  // 卦象：8 宫分 = 实际聚合分（NA 宫取 0.5 中性），保持 64 卦层可用
  const scores8 = {}
  for (const d of s.domains) {
    scores8[d.code] = r.domain_results[d.code]?.score ?? 0.5
  }
  const hx = resolveHexagramForScript(scores8, s)

  const activeDomains = [...new Set(signals.map((x) => x.code))]
  const a = assess(stock, r, activeDomains.length, r.coverage.coverage)
  results.push({
    name, code, price, pct, sector, flag,
    sector_avg: Number(sectorAvg[sector].toFixed(2)),
    signals: signals.map((x) => ({ domain: x.code, sub: x.subIdx + 1, delta: Number(x.delta.toFixed(4)) })),
    active_domains: activeDomains,
    domain_scores: Object.fromEntries(Object.entries(scores8).map(([k, v]) => [k, Number(v.toFixed(4))])),
    verdict: r.verdict,
    trend: mapTrend(r),
    has_veto: r.has_veto,
    veto_reason: r.has_veto ? (flag === 'ST' ? 'ST 风险警示 → FX/XX 白名单强关联失守' : '当日深跌风险暴露 → FX 白名单强关联失守') : null,
    risk_level: r.risk_level,
    overall_score: r.overall_score,
    yang_ratio: r.yang_ratio,
    coverage: r.coverage,
    sancai: r.sancai,
    hexagram: {
      name: hx.name,
      desc: hx.desc,
      yaos: hx.yaos.join(''),
      moving_yao: hx.movingYao.yaoIndex >= 0 ? hx.movingYao.yaoIndex + 1 : null,
      changed: hx.changed ? hx.changed.name : null,
    },
    taiji_line: (r.conclusion_text || '').split('\n').find((l) => l.startsWith('【太极】')) || null,
    assess: a,
  })
}

// ===== 汇总输出 =====
const dist = {}
for (const r of results) dist[r.trend] = (dist[r.trend] || 0) + 1
const hxDist = {}
for (const r of results) hxDist[r.hexagram.name] = (hxDist[r.hexagram.name] || 0) + 1

const out = {
  meta: {
    generated_at: new Date().toISOString(),
    snapshot: '同花顺自选股截图（收盘快照，周三 21:50）',
    market: { 上证: '+0.12%', 深成: '-0.14%', 创业板: '-0.26%' },
    horizon: '本周内（剩余周四/周五共 2 个交易日）',
    script: script.script_id,
    engine: 'dsh-daoyi-yijing v0.4.0（确定性离线引擎，零 LLM 额度消耗）',
    rules: '见脚本头注释；无数据域一律 NA，不造假填充',
    count: results.length,
    disclaimer: '结构化多因子研判示意，不构成任何投资建议',
  },
  sector_avg: Object.fromEntries(Object.entries(sectorAvg).map(([k, v]) => [k, Number(v.toFixed(2))])),
  trend_dist: dist,
  hexagram_dist: hxDist,
  results,
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs')
mkdirSync(OUT, { recursive: true })
const file = join(OUT, 'stock-batch-results.json')
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')

console.log(`共推演 ${results.length} 只 · 趋势分布:`, dist)
console.log(`卦象种类: ${Object.keys(hxDist).length} 种 →`, hxDist)
console.log('结果已写入', file)
