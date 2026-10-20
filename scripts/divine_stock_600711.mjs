// divine_stock_600711.mjs — 道一-易经推演 · 盛屯矿业(600711) 未来一个月涨跌推演示例
//
// 说明：本脚本用「股票趋势研判·万事决」(stock-trend) 剧本，把公开数据映射为 8 域因子评分，
// 套入 384 爻→64 卦→8 宫→四象→三才→两仪→太极 六层确定性推演，输出结构化结论。
// 结果由公开数据映射的因子评分驱动，属多因子研判示意，【不构成任何投资建议】。

import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'

// ===== 0. 真实数据快照（检索于 2026-10-20，来源：腾讯证券/同花顺/证券之星/新浪财经）=====
const SNAPSHOT = {
  stock: '盛屯矿业',
  code: '600711.SH',
  price: 9.26, // 2026-10-20 收盘
  ytd: -0.3827, // 年内 -38.27%
  high52: 18.63, low52: 8.86, // 年内高/低（2026-01-29 / 2026-07-20）
  pe_ttm: 10.3, pb: 1.66, mktcap: 294, // 亿
  mid2026: {
    revenue_yoy: 0.3956, netprofit_yoy: 0.7137, roe: 0.1047, gross: 0.2287,
    debt_ratio: 0.6169, invest_loss: -6.03, finance_cost: 4.25, // 亿
  },
  biz: { energy_metal: 0.7549, basic_metal: 0.2187, overseas: 0.7171 },
  inst: { holders: 394, hold_ratio: 0.2797 }, // 机构持仓占流通 A 股
  tech: { avg_cost: 9.54, trend: '空头反弹减缓，中期谨慎' },
  fund: { diagnosis: 1.90, net_flow: '整体流出，10/16 主力小幅净流入 0.21 亿' },
  news: { rating: '多买入(浙商/国信/中邮/国联民生)', sentiment: 5.80 },
  cobalt_index_ytd: -0.1744, // 钴概念指数年内 -17.44%
}

// ===== 1. 八宫因子评分（0..1，越高越利于“一个月看多”；FX 为风险可控度，越高越安全）=====
// 评分依据 = 上表真实信号，逐宫透明推导（详见各宫 rationale）。
const DOMAIN_SCORES = {
  JB: 0.80, // 基本面·乾：业绩+71%、ROE 10.47%>行业、毛利率 22.87%、PE~10 合理；扣分：负债率 61.69%、投资收益 -6 亿
  HY: 0.55, // 行业面·坎：铜价历史高位利好能源金属(占 75%)，但钴概念指数年内 -17%、商品周期波动
  HG: 0.50, // 宏观面·离：商品周期/利率汇率中性；刚果(金)地缘与汇率为隐忧
  JS: 0.35, // 技术面·坤：年内 -38%、空头反弹减缓未反转、均价 9.54；弱
  ZJ: 0.42, // 资金面·震：资金面诊股 1.90 低、整体流出；加分：机构持仓 27.97%、10/16 小幅净流入
  GZ: 0.68, // 估值面·艮：PE~10、PB~1.66 估值合理偏低；缺明确目标价空间
  XX: 0.62, // 消息面·巽：业绩预增公告正面、研报多买入、无重大负面（消息面诊股 5.80）
  FX: 0.45, // 风险面·兑(可控度)：负债率偏高、境外 71.71% 地缘汇率、商品波动、财务费用 4.25 亿 → 可控度中等偏下
}

// ===== 2. 把八宫评分铺到 384 爻（同宫检查点取该宫评分，引擎按宫聚合，结果等价宫均分）=====
const script = buildStockScript()
const db = buildCheckpointDatabase(script)
const inputs = {}
for (const cp of db.checkpoints) {
  inputs[cp.id] = DOMAIN_SCORES[cp.domain]
}

// ===== 3. 六层推演（确定性引擎；云模型未注入→离线模板卦象文案）=====
const result = await evaluate('盛屯矿业(600711) 未来一个月涨跌研判', script, { inputs })

// ===== 4. 涨跌映射（引擎 verdict 为可行/有条件可行/不可行 → 看涨/震荡/看跌）=====
function mapTrend(r) {
  if (r.has_veto) return '看跌（偏空·一票否决）'
  if (r.verdict === '可行') return '看涨'
  if (r.verdict === '有条件可行') return '震荡（中性·观望）'
  return '看跌（偏空）'
}
const trend = mapTrend(result)

// ===== 5. 输出报告 =====
const line = '────────────────────────────────────────'
console.log('\n' + line)
console.log('  道一-易经推演 · 股票趋势研判')
console.log('  标的：盛屯矿业(600711.SH)  快照价：¥9.26（2026-10-20）')
console.log(line)
console.log(`  【太极·结论】推演 verdict = ${result.verdict}　→　一个月维度：${trend}`)
console.log(`  【综合分】${(result.overall_score * 100).toFixed(1)}%　风险等级：${result.risk_level}`)
console.log(`  【三才】天(基本面/行业/宏观) ${(result.sancai.tian.score * 100).toFixed(0)}%` +
  `　地(技术/资金/估值) ${(result.sancai.di.score * 100).toFixed(0)}%` +
  `　人(消息/风险) ${(result.sancai.ren.score * 100).toFixed(0)}%`)
console.log('  【八宫·卦象(阳/阴占比)】')
for (const d of Object.values(result.domain_results)) {
  const veto = d.strong_veto ? '  ← 强关联失守·否决' : ''
  console.log(`    ${d.bagua} ${d.name}：${(d.score * 100).toFixed(0)}%${veto}`)
}
console.log('  【八宫·连续评分(输入依据，≥50%=阳)】')
const DOMAIN_NAMES = { JB: '基本面', JS: '技术面', ZJ: '资金面', XX: '消息面', HY: '行业面', HG: '宏观面', GZ: '估值面', FX: '风险面(可控度)' }
for (const [code, sc] of Object.entries(DOMAIN_SCORES)) {
  const yinyang = sc >= 0.5 ? '阳' : '阴'
  console.log(`    ${DOMAIN_NAMES[code]}：${(sc * 100).toFixed(0)}% [${yinyang}]`)
}
console.log('  【推演文案】')
console.log('    ' + result.conclusion_text.split('\n').join('\n    '))
console.log(line)
console.log('  卦象引擎结论（确定性）：' + result.conclusion_text.split('\n')[0])
console.log(line)
console.log('  ⚠️ 免责声明：本推演由公开数据映射的因子评分驱动，属结构化多因子研判示意，')
console.log('     不构成任何投资建议。股市有风险，投资需谨慎。')
console.log(line + '\n')

// 同时落盘一份详细推演日志到 yijing_gray_logs/（不回传、纯本地）
try {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const outDir = join(dirname(fileURLToPath(new URL('../', import.meta.url))), 'logs')
  mkdirSync(outDir, { recursive: true })
  const out = { snapshot: SNAPSHOT, domain_scores: DOMAIN_SCORES, result }
  writeFileSync(join(outDir, `stock-600711-${Date.now()}.json`), JSON.stringify(out, null, 2), 'utf8')
} catch { /* 落盘失败不致命 */ }

// 导出供测试/联调复用
export { SNAPSHOT, DOMAIN_SCORES, trend }
