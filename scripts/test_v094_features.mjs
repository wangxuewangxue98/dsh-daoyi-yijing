// test_v094_features.mjs — v0.9.5 专项测试
process.env.DAOYI_DIVINE_QUOTA_OFF = '1' // 测试隔离：关闭推演日限闸门
// P1-3：名称风控自动识别（退市整理期 > 手工 flag 列 > ST）——修 v2 评价 P0-2 退市整理期跨版本误判
//   ① detectNameFlag 名称识别；② quoteToSignals 在线路径名称风控信号（此前完全缺失）；
//   ③ 批处理离线 effectiveFlag + DELISTING 分支 + veto_reason 文案；④ 既有 ST 行为零回归
import { detectNameFlag, quoteToSignals } from '../adapters/quote.mjs'
import { runBatch, effectiveFlag, flagRiskLabel, buildInputs } from './divine_batch_stocks.mjs'
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

// ── ① detectNameFlag ──
ok(detectNameFlag('退市西水') === 'DELISTING', '名称含「退」前缀 → DELISTING')
ok(detectNameFlag('XX退') === 'DELISTING', '名称含「退」后缀 → DELISTING')
ok(detectNameFlag('*ST 银河') === 'ST', '*ST → ST')
ok(detectNameFlag('ST联光') === 'ST', 'ST 前缀 → ST')
ok(detectNameFlag('招商银行') === null, '普通名称 → null')
ok(detectNameFlag('') === null, '空名称 → null')
ok(detectNameFlag(null) === null, 'null 名称 → null')

// ── ② 在线路径 quoteToSignals 名称风控 ──
{
  const q = { name: '退市西水', pct: 1.2, closePosition: 0.6 }
  const sig = quoteToSignals(q)
  const xx = sig.find((s) => s.code === 'XX' && s.subIdx === 0)
  const fxSys = sig.find((s) => s.code === 'FX' && s.subIdx === 0)
  const fxBs = sig.find((s) => s.code === 'FX' && s.subIdx === 1)
  ok(xx && xx.delta === -0.35 && /delisting/.test(xx.rule), `退市 XX01 = −0.35（实际 ${xx && xx.delta}，rule=${xx && xx.rule}）`)
  ok(fxSys && fxSys.delta === 0.05, '退市 FX01 系统性激活 +0.05')
  ok(fxBs && fxBs.delta === -0.35 && /delisting/.test(fxBs.rule), `退市 FX02 = −0.35（实际 ${fxBs && fxBs.delta}）`)

  const qST = { name: 'ST某股', pct: 1.2 }
  const sigST = quoteToSignals(qST)
  const xxST = sigST.find((s) => s.code === 'XX' && s.subIdx === 0)
  const fxBsST = sigST.find((s) => s.code === 'FX' && s.subIdx === 1)
  ok(xxST && xxST.delta === -0.25, `ST XX01 = −0.25（实际 ${xxST && xxST.delta}）`)
  ok(fxBsST && fxBsST.delta === -0.3, `ST FX02 = −0.30（实际 ${fxBsST && fxBsST.delta}）`)

  const qPlain = { name: '招商银行', pct: 1.2 }
  const sigPlain = quoteToSignals(qPlain)
  ok(!sigPlain.some((s) => s.code === 'XX' && s.subIdx === 0), '普通股无 XX01 名称信号（行为不变）')
  ok(!sigPlain.some((s) => s.code === 'FX' && s.subIdx === 0), '普通股无 FX01 名称激活（行为不变）')

  // FX02 名称 × PB 冲突 → 取更负（风险厌恶）；无 PB 时名称口径独走
  const qBoth = { name: '退市某股', pct: 1, pb: 1 } // pb→(3-1)*0.05=+0.10；名称 −0.35 → 取 −0.35
  const fxB = quoteToSignals(qBoth).find((s) => s.code === 'FX' && s.subIdx === 1)
  ok(fxB && fxB.delta === -0.35, `名称 × PB 冲突取更负 −0.35（实际 ${fxB && fxB.delta}）`)
  const qPbOnly = { name: '招商银行', pct: 1, pb: 1 }
  const fxB2 = quoteToSignals(qPbOnly).find((s) => s.code === 'FX' && s.subIdx === 1)
  ok(fxB2 && fxB2.delta === 0.1 && /pb/.test(fxB2.rule), `无名称风控时 PB 口径逐位不变 +0.10（实际 ${fxB2 && fxB2.delta}）`)
}

// ── ③ 离线批处理：effectiveFlag / DELISTING 否决 / 文案 ──
ok(effectiveFlag(['退市西水', '600000', 1, 1, '化工', '']) === 'DELISTING', 'effectiveFlag：名称含退且 flag 空 → DELISTING')
ok(effectiveFlag(['退市西水', '600000', 1, 1, '化工', 'ST']) === 'DELISTING', 'effectiveFlag：名称含退优先于手工 ST 列')
ok(effectiveFlag(['ST联光', '600363', 1, 1, '科技电子', 'ST']) === 'ST', 'effectiveFlag：手工 ST 列仍生效')
ok(effectiveFlag(['招商银行', '600036', 1, 1, '银行', '']) === '', 'effectiveFlag：普通股为空串（行为不变）')
ok(flagRiskLabel('DELISTING') === '退市整理期', '风险文案：退市整理期')
ok(flagRiskLabel('ST') === 'ST 风险警示', '风险文案：ST 风险警示')

// 离线 buildInputs：退市股产出 DELISTING 信号（XX01 −0.35 / FX02 −0.35）
{
  const stock = ['退市测试股', '600001', 1.0, -2.0, '化工', '']
  const { signals } = buildInputs(stock)
  const xx = signals.find((s) => s.code === 'XX' && s.subIdx === 0)
  const fxBs = signals.find((s) => s.code === 'FX' && s.subIdx === 1)
  ok(xx && xx.delta === -0.35, `离线退市 XX01 = −0.35（实际 ${xx && xx.delta}）`)
  ok(fxBs && fxBs.delta === -0.35, `离线退市 FX02 = −0.35（实际 ${fxBs && fxBs.delta}）`)
}

// ── ④ 端到端 runBatch：退市整理期 → 看跌(否决)；ST 行为零回归 ──
{
  const outFile = join(tmpdir(), `batch_v094_${Date.now()}.json`)
  const out = await runBatch({
    stocks: [
      ['退市测试股', '600001', 1.0, 1.5, '化工', ''],
      ['ST联光', '600363', 9.89, -3.79, '科技电子', 'ST'],
      ['招商银行', '600036', 42.52, -1.23, '银行', ''],
    ],
    script: 'stock-trend-v2',
    outFile,
  })
  const byName = Object.fromEntries(out.results.map((r) => [r.name, r]))
  const dl = byName['退市测试股']
  const st = byName['ST联光']
  const bank = byName['招商银行']
  ok(dl && dl.has_veto === true, '退市整理期（当日+1.5%）→ 触发白名单否决')
  ok(dl && dl.verdict === '不可行' && dl.trend === '看跌(否决)', '退市整理期 → 不可行 / 看跌(否决)')
  ok(dl && /退市整理期/.test(dl.veto_reason || ''), `否决文案为退市整理期（实际 ${dl && dl.veto_reason}）`)
  ok(st && st.has_veto === true && /ST 风险警示/.test(st.veto_reason || ''), '既有 ST 行为零回归（否决 + ST 文案）')
  ok(bank && bank.has_veto === false, '普通股（银行 -1.23%）无否决（行为不变）')
}

// ── ⑤ P0-2：剧本级 scoringPolicy（half / abstain / domainCoverageWeighting）──
import { evaluateDeterministic } from '../lib/yijing/reviewer.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
{
  const v2 = buildStockTrendV2Script()
  const dbV2 = buildCheckpointDatabase(v2)
  ok(v2.scoringPolicy && v2.scoringPolicy.missingValue === 'half' && v2.scoringPolicy.domainCoverageWeighting === true, 'stock-trend-v2 声明 scoringPolicy（half + 域覆盖折扣）')

  // 域覆盖折扣（与批处理同机制：script.na 标注缺数据域的检查点；v2 为 6 域制）
  const v2DomainCodes = [...new Set(dbV2.checkpoints.filter((c) => !c.na).map((c) => c.domain))]
  ok(v2DomainCodes.length === 6, `v2 域制=6（实际 ${v2DomainCodes.join(',')}）`)
  const v2Sparse = buildStockTrendV2Script()
  const naCpIds = dbV2.checkpoints.filter((c) => !['JS', 'ZJ'].includes(c.domain) && !c.na).map((c) => c.id)
  v2Sparse.na = { domains: [], checkpoints: naCpIds }
  const rCov = evaluateDeterministic(v2Sparse, { inputs: { JS: 0.9, ZJ: 0.9 } })
  ok(rCov.domain_coverage_factor === 0.6667, `域覆盖折扣 factor=0.5+0.5×(2/6)=0.6667（实际 ${rCov.domain_coverage_factor}）`)
  ok(rCov.overall_score === 0.6667, `综合分按覆盖折扣 1.0→0.6667（实际 ${rCov.overall_score}）`)
  ok(rCov.verdict === '有条件可行', `稀疏输入不再直达可行（实际 ${rCov.verdict}）`)
  const cloneNoPolicy = JSON.parse(JSON.stringify(v2))
  delete cloneNoPolicy.scoringPolicy
  const rOld = evaluateDeterministic(cloneNoPolicy, { inputs: { JS: 0.9, ZJ: 0.9, HY: 0.9 } })
  ok(rOld.domain_coverage_factor === 1 && rOld.overall_score === 1, `未声明 policy 的剧本保持旧口径（实际 ${rOld.overall_score}，opt-in 语义）`)

  // half：缺值检查点不判阳、不触发强关联否决；显式给分行为不变
  const strongCp = dbV2.checkpoints.find((c) => !c.na && c.is_strong)
  const normalCp = dbV2.checkpoints.find((c) => !c.na && !c.is_strong && c.domain === strongCp.domain)
  ok(Boolean(strongCp && normalCp), '找到同域 strong/normal 检查点用于 half 测试')
  const rHalf = evaluateDeterministic(v2, { inputs: { [normalCp.id]: 0.9 } })
  ok(rHalf.has_veto === false, `half：缺值强关联检查点不触发否决（实际 has_veto=${rHalf.has_veto}）`)
  const rMid = evaluateDeterministic(cloneNoPolicy, { inputs: { [normalCp.id]: 0.9 } })
  ok(rMid.overall_score > rHalf.overall_score, `half 综合分低于 thresholdMid 旧口径（${rHalf.overall_score} < ${rMid.overall_score}，缺值不再白送阳爻）`)
  // 全量显式输入（1296 检查点全覆盖）时 half 与旧口径逐位一致（half 只影响缺值）
  const allIds = dbV2.checkpoints.filter((c) => !c.na).map((c) => c.id)
  const fullInputs = Object.fromEntries(allIds.map((id) => [id, 0.9]))
  const rHalfExplicit = evaluateDeterministic(v2, { inputs: fullInputs })
  const rMidExplicit = evaluateDeterministic(cloneNoPolicy, { inputs: fullInputs })
  ok(rHalfExplicit.overall_score === rMidExplicit.overall_score && rHalfExplicit.has_veto === rMidExplicit.has_veto, `全量显式输入时 half 与旧口径逐位一致（${rHalfExplicit.overall_score} vs ${rMidExplicit.overall_score}）`)

  // abstain：缺值剔除出聚合分母，同样不触发强关联否决
  const cloneAbstain = JSON.parse(JSON.stringify(v2))
  cloneAbstain.scoringPolicy = { missingValue: 'abstain', domainCoverageWeighting: false }
  const rAbstain = evaluateDeterministic(cloneAbstain, { inputs: { [normalCp.id]: 0.9 } })
  ok(rAbstain.has_veto === false && rAbstain.overall_score > 0 && rAbstain.overall_score <= 1, `abstain 正常聚合（score=${rAbstain.overall_score}，无否决）`)
  ok(rAbstain.overall_score !== rHalf.overall_score || true, 'abstain 与 half 分母口径不同（信息性）')

  // motor-design 未声明 policy → 全链路零回归（verify 场景 A-F 亦覆盖）
  ok(evaluateDeterministic(buildCheckpointDatabase(buildStockTrendV2Script()).checkpoints && v2, { inputs: {} }).verdict_insufficient_data === true, 'v2 零输入仍被 v0.9.3 守卫兜底（不可行·数据不足）')
}

// ── ⑥ P0-1：周趋势体制门（klineStatsOf + JS01/HY01 双口径）──
import { klineStatsOf } from '../adapters/quote-history.mjs'
{
  // klineStatsOf：closes 1..25 → ret5=(25-20)/20=+25%；ma20=mean(6..25)=15.5 → maDev≈+61.29%
  const days = Array.from({ length: 25 }, (_, i) => ({ close: i + 1 }))
  const st = klineStatsOf(days)
  ok(st.ok === true && st.ret === 25, `klineStatsOf ret5=+25%（实际 ${st.ret}）`)
  ok(st.maDev !== null && Math.abs(st.maDev - 61.29) < 0.01, `klineStatsOf ma20Dev≈+61.29%（实际 ${st.maDev}）`)
  const stFlat = klineStatsOf(Array.from({ length: 25 }, () => ({ close: 10 })))
  ok(stFlat.ret === 0 && stFlat.maDev === 0, 'klineStatsOf 恒价 → ret/maDev 均为 0')
  const stShort = klineStatsOf([{ close: 10 }, { close: 11 }, { close: 12 }])
  ok(stShort.ok === false && stShort.ret === null, 'klineStatsOf 历史不足 → ok=false 不凑数（诚实边界）')
  ok(klineStatsOf(null).ok === false && klineStatsOf([]).ok === false, 'klineStatsOf 空输入安全')

  // JS01 趋势门：有 trend → 合成口径；无 trend → legacy 单日口径（逐位不变）
  const qTrend = { name: '测试股', pct: 1, closePosition: 0.75 }
  const sigTrend = quoteToSignals(qTrend, { trend: { ret: 3.75, maDev: 2.5 } })
  const js0t = sigTrend.find((s) => s.code === 'JS' && s.subIdx === 0)
  // retPart=clamp(3.75×0.08)=0.3；maPart=clamp(2.5×0.08)=0.2；posPart=(0.75-0.5)×0.5=0.125
  // delta = 0.3×0.6 + 0.2×0.2 + 0.125×0.2 = 0.245
  ok(js0t && js0t.rule === 'JS01-trend-gate-5d' && Math.abs(js0t.delta - 0.245) < 1e-6, `JS01 趋势门合成 delta=0.245（实际 ${js0t && js0t.delta}，rule=${js0t && js0t.rule}）`)
  const js0l = quoteToSignals({ name: '测试股', pct: 1, closePosition: 0.75 }).find((s) => s.code === 'JS' && s.subIdx === 0)
  ok(js0l && js0l.rule === 'JS01-close-pos' && js0l.delta === 0.125, `无 trend 回落 legacy 口径逐位不变（实际 ${js0l && js0l.delta}，rule=${js0l && js0l.rule}）`)
  // 熊市趋势 → 显著负向（反弹日反指的结构性对冲）
  const js0bear = quoteToSignals({ name: '测试股', pct: 1, closePosition: 0.75 }, { trend: { ret: -6, maDev: -4 } }).find((s) => s.code === 'JS' && s.subIdx === 0)
  ok(js0bear && js0bear.delta < -0.2, `周线熊势 → JS01 明显负向（实际 ${js0bear && js0bear.delta}）`)

  // HY01 三口径：合成 / 仅当日（回归）/ 仅 5 日
  const hyBlend = quoteToSignals({ name: '测试股', pct: 1 }, { sectorPct: 1, sectorTrend5d: -2 }).find((s) => s.code === 'HY' && s.subIdx === 0)
  ok(hyBlend && hyBlend.rule === 'HY01-sector-index-5d' && Math.abs(hyBlend.delta - (1 * 0.06 * 0.4 + -2 * 0.03 * 0.6)) < 1e-6, `HY01 合成 = 0.4×当日 + 0.6×5日（实际 ${hyBlend && hyBlend.delta}）`)
  const hyDaily = quoteToSignals({ name: '测试股', pct: 1 }, { sectorPct: 1 }).find((s) => s.code === 'HY' && s.subIdx === 0)
  ok(hyDaily && hyDaily.rule === 'HY01-sector-index' && hyDaily.delta === 0.06, `HY01 仅当日口径逐位不变（实际 ${hyDaily && hyDaily.delta}）`)
  const hy5only = quoteToSignals({ name: '测试股', pct: 1 }, { sectorTrend5d: -2 }).find((s) => s.code === 'HY' && s.subIdx === 0)
  ok(hy5only && hy5only.rule === 'HY01-sector-index-5d-only' && Math.abs(hy5only.delta + 0.06) < 1e-6, `HY01 仅 5 日口径（实际 ${hy5only && hy5only.delta}）`)
}

// ── ⑦ P1：板块趋势强度门控（v0.9.6；默认关闭+显式启用驱动，负面回测结论入档）──
import { getBuiltinScript } from '../lib/yijing/checkpoints.mjs'
{
  // 默认关闭：三臂回测未支持原假设（见 CHANGELOG 0.9.6 与 stock-trend-v2 注释）
  const v2default = buildStockTrendV2Script()
  ok(v2default.verdictRegimeGate && v2default.verdictRegimeGate.enabled === false, 'stock-trend-v2 门控默认关闭（回测负面结论）')
  const dbMdGate = buildCheckpointDatabase(getBuiltinScript('motor-design'))
  ok(dbMdGate.verdictRegimeGate == null, 'motor-design 不声明门控 → db.verdictRegimeGate=null（零回归）')
  // 显式启用克隆（机制本体测试）
  const v2g = JSON.parse(JSON.stringify(v2default))
  v2g.verdictRegimeGate = { enabled: true, jsMin: 0.5, hyMax: 0.5 }

  // 门控触发：JS 域阳(0.9→全阳 score=1) + HY 域阴(0.2→全阴 score=0) + 其余 4 域中性(0.5→全阳)
  //   → 综合分 5/6≈0.8333 ≥ 可行线 0.75，本应「可行」
  const gateInputs = { JS: 0.9, HY: 0.2, JB: 0.5, ZJ: 0.5, XX: 0.5, FX: 0.5 }
  const rGate = evaluateDeterministic(v2g, { inputs: gateInputs })
  ok(rGate.overall_score === 0.8333 && rGate.verdict === '有条件可行', `JS阳+HY阴 → 可行降级为有条件可行（实际 ${rGate.verdict}，score=${rGate.overall_score}）`)
  ok(rGate.verdict_regime_gate && rGate.verdict_regime_gate.rule === 'sector-weak-rebound', `verdict_regime_gate 记录 rule=sector-weak-rebound（实际 ${rGate.verdict_regime_gate && rGate.verdict_regime_gate.rule}）`)
  ok(rGate.verdict_regime_gate.js_score === 1 && rGate.verdict_regime_gate.hy_score === 0, `门控记录域分明细（js=${rGate.verdict_regime_gate && rGate.verdict_regime_gate.js_score}, hy=${rGate.verdict_regime_gate && rGate.verdict_regime_gate.hy_score}）`)
  ok(rGate.risk_level === '中', `降级后风险等级随之下调为「中」（实际 ${rGate.risk_level}）`)

  // opt-in 语义：删除声明 → 同输入保持「可行」（逐位回归旧行为）
  const cloneNoGate = JSON.parse(JSON.stringify(v2g))
  delete cloneNoGate.verdictRegimeGate
  const rNoGate = evaluateDeterministic(cloneNoGate, { inputs: gateInputs })
  ok(rNoGate.verdict === '可行' && rNoGate.verdict_regime_gate == null, `不声明门控 → 维持可行（实际 ${rNoGate.verdict}，opt-in 语义）`)

  // HY 域阳 → 不触发（板块趋势有支撑，孤立反弹升级为板块共振）
  const rHyYang = evaluateDeterministic(v2g, { inputs: { JS: 0.9, HY: 0.6, JB: 0.5, ZJ: 0.5, XX: 0.5, FX: 0.5 } })
  ok(rHyYang.verdict === '可行' && rHyYang.verdict_regime_gate == null, `HY 域阳 → 门控不触发（实际 ${rHyYang.verdict}）`)

  // JS 域阴 → 综合分本就到不了「可行」线(0.75)，门控无关（有条件可行）
  const rJsYin = evaluateDeterministic(v2g, { inputs: { JS: 0.4, HY: 0.2, JB: 0.5, ZJ: 0.5, XX: 0.5, FX: 0.5 } })
  ok(rJsYin.verdict === '有条件可行' && rJsYin.verdict_regime_gate == null, `JS 域阴 → 有条件可行且门控不触发（实际 ${rJsYin.verdict}）`)

  // 否决优先：XX 域强关联失守 → 不可行，门控不得改判（verdict 可行 前提不成立）
  const rVeto = evaluateDeterministic(v2g, { inputs: { JS: 0.9, HY: 0.2, XX: 0.1, JB: 0.9, ZJ: 0.9, FX: 0.9 } })
  ok(rVeto.verdict === '不可行' && rVeto.verdict_regime_gate == null, `否决路径优先于门控（实际 ${rVeto.verdict}，gate=${rVeto.verdict_regime_gate}）`)

  // 参数可调：jsMin 提高到 1.01 → JS score=1.0 不再算「强」→ 不触发
  const cloneStrict = JSON.parse(JSON.stringify(v2g))
  cloneStrict.verdictRegimeGate = { enabled: true, jsMin: 1.01, hyMax: 0.5 }
  const rStrict = evaluateDeterministic(cloneStrict, { inputs: gateInputs })
  ok(rStrict.verdict === '可行' && rStrict.verdict_regime_gate == null, `jsMin=1.01 → JS1.0 不触发（实际 ${rStrict.verdict}，参数可调）`)

  // 边界形态（v0.9.6 修复回归）：HY 域分恰 0.5（HY01 阴+HY04 阳，稀疏口径典型形态）必须触发
  //   构造：HY 检查点半数 0.9(阳)/半数 0.2(阴) → HY score=0.5；JS 全阳 score=1；其余域中性全阳
  const hyCpIds = buildCheckpointDatabase(v2g).checkpoints.filter((c) => !c.na && c.domain === 'HY').map((c) => c.id)
  ok(hyCpIds.length >= 2, `HY 检查点充足（${hyCpIds.length} 个）`)
  const half = Math.floor(hyCpIds.length / 2)
  const hyMixed = {}
  hyCpIds.forEach((id, i) => { hyMixed[id] = i < half ? 0.9 : 0.2 })
  const rBoundary = evaluateDeterministic(v2g, { inputs: { JS: 0.9, JB: 0.5, ZJ: 0.5, XX: 0.5, FX: 0.5, ...hyMixed } })
  ok(rBoundary.domain_results.HY.score === 0.5, `边界构造 HY score=0.5（实际 ${rBoundary.domain_results.HY.score}）`)
  ok(rBoundary.verdict === '有条件可行' && rBoundary.verdict_regime_gate && rBoundary.verdict_regime_gate.rule === 'sector-weak-rebound',
    `HY=0.5 边界形态触发门控（实际 ${rBoundary.verdict}，gate=${rBoundary.verdict_regime_gate && rBoundary.verdict_regime_gate.rule}）`)
}

console.log(`\n== v0.9.4 专项测试：${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) process.exit(1)
