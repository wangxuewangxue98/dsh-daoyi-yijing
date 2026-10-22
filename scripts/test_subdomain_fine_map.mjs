// test_subdomain_fine_map.mjs — P2 规则→子域名精映射单测（v0.8.1）
//
// 覆盖：① FINE_MAP 结构与 MIGRATION_MAP 一致性自检；② signalsToInputsV2 双粒度行为
// （L2 回归金样 + P2 子域落点 + NA 诚实）；③ 端到端：P2 下卦③（子域位）阳率分化 vs L2 坍缩。
import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { buildStockTrendV2Script, MIGRATION_MAP, DOMAINS_V2 } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { evaluateDeterministic } from '../lib/yijing/reviewer.mjs'
import { signalsToInputsV2 } from '../adapters/stock-inputs.mjs'
import { FINE_MAP, fineTargetOf, assertFineMapConsistency, describeFineMap } from '../lib/yijing/subdomain-fine-map.mjs'

let pass = 0
let fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log(`  ✓ ${msg}`)
  } else {
    fail++
    console.log(`  ✗ FAIL: ${msg}`)
  }
}

console.log('== 1. FINE_MAP 结构自检 ==')
ok(Object.keys(FINE_MAP).length === 64, `FINE_MAP 64 条（旧 64 子域全覆盖，实际 ${Object.keys(FINE_MAP).length}）`)
const chk = assertFineMapConsistency(MIGRATION_MAP, DOMAINS_V2)
ok(chk.mismatches.length === 0, `与 MIGRATION_MAP 分域归属零冲突（${chk.mismatches.join(';') || '无'}）`)
ok(chk.outOfRange.length === 0, `子域位全部 1-6 且分域存在（${chk.outOfRange.join(';') || '无'}）`)
ok(fineTargetOf('JS06') && fineTargetOf('JS06').sd === 'JS01' && fineTargetOf('JS06').sub === 2, 'JS06 均线系统 → JS01 趋势方向·子域2（均线排列）')
ok(fineTargetOf('HG07') && fineTargetOf('HG07').sd === 'ZJ06' && fineTargetOf('HG07').sub === 3, 'HG07 流动性环境 → ZJ06 宏观与市场流动性·子域3（成交额水平）')
ok(fineTargetOf('GZ04') && fineTargetOf('GZ04').sd === 'ZJ05' && fineTargetOf('GZ04').sub === 4, 'GZ04 业绩匹配 → ZJ05 估值水平·子域4（业绩匹配）')
ok(fineTargetOf('NOPE') === null, '未知子域码 → null（调用方丢弃，不猜）')
const desc = describeFineMap(buildStockScript(), DOMAINS_V2)
ok(desc.length === 64 && desc.every((r) => r.oldName !== '?' && r.sdName !== '?' && r.subName !== '?'), 'describeFineMap 64 行全部有旧/新域名（无 ? 漂移）')

console.log('== 2. signalsToInputsV2 双粒度行为 ==')
const v2 = buildStockTrendV2Script()
const db = buildCheckpointDatabase(v2)
// 合成 384 形态信号（覆盖 5 个子域位，制造 ≥3 种卦③阳率）：
//   JS01(趋势方向)+0.3 / JS06(均线系统)-0.3 / JS08(波动特征)+0.2 / GZ04(业绩匹配)-0.2 /
//   HG08(风险偏好)+0.1 / JS04(量能配合)+0.05 / HG03(经济数据)-0.05
const sigs = [
  { code: 'JS', subIdx: 0, delta: 0.3 }, // JS01
  { code: 'JS', subIdx: 5, delta: -0.3 }, // JS06
  { code: 'JS', subIdx: 7, delta: 0.2 }, // JS08
  { code: 'GZ', subIdx: 3, delta: -0.2 }, // GZ04
  { code: 'HG', subIdx: 7, delta: 0.1 }, // HG08
  { code: 'JS', subIdx: 3, delta: 0.05 }, // JS04
  { code: 'HG', subIdx: 2, delta: -0.05 }, // HG03
]
const L2 = signalsToInputsV2(sigs, db, MIGRATION_MAP)
const P2 = signalsToInputsV2(sigs, db, MIGRATION_MAP, FINE_MAP)
ok(L2.granularity === 'L2' && P2.granularity === 'subdomain', 'granularity 标注 L2 / subdomain')
ok(L2.fineHits === 0 && P2.fineHits === 7, 'fineHits：L2=0，P2=7（七条信号全部命中精映射）')

// L2 金样（回归护栏）：JS01 分域 = avg(+0.3, -0.3) = 0 → aspect1 恒 0.5；aspect2 = 0.5-0.08 = 0.42
ok(Math.abs(L2.inputs['JS010101'] - 0.5) < 1e-9, `L2 金样 JS010101=0.5（JS01 分域 delta 均值 0，实际 ${L2.inputs['JS010101']}）`)
ok(Math.abs(L2.inputs['JS010102'] - 0.42) < 1e-9, `L2 金样 JS010102=0.42（持续性 coef 0.5 + bias -0.08，实际 ${L2.inputs['JS010102']}）`)
ok(L2.naIds.length === 1296 - Object.keys(L2.inputs).length, 'L2：NA = 未铺开项（口径自洽）')
// L2 铺开整个分域：JS01 分域 36 项全有值
ok(Object.keys(L2.inputs).filter((k) => k.startsWith('JS01')).length === 36, 'L2：JS01 分域 36 项同 delta 铺开')

// P2：信号只落对应子域位；JS01 分域仅子域1/2 有值，子域3-6 全 NA
ok(Math.abs(P2.inputs['JS010101'] - 0.8) < 1e-9, `P2：JS010101=0.8（JS01 信号 +0.3 落子域1，实际 ${P2.inputs['JS010101']}）`)
ok(Math.abs(P2.inputs['JS010201'] - 0.2) < 1e-9, `P2：JS010201=0.2（JS06 信号 -0.3 落子域2，实际 ${P2.inputs['JS010201']}）`)
const js01Filled = Object.keys(P2.inputs).filter((k) => k.startsWith('JS01'))
ok(js01Filled.length === 12, `P2：JS01 分域仅 2 子域×6 aspect=12 项有值（实际 ${js01Filled.length}）`)
ok(['JS010301', 'JS010401', 'JS010501', 'JS010601'].every((k) => P2.inputs[k] === undefined), 'P2：JS01 分域子域3-6 无信号 → NA（不造假）')
ok(P2.naIds.includes('JS010301') && P2.naIds.includes('JS010606'), 'P2：无信号子域检查点进 NA 名单')
ok(Math.abs(P2.inputs['JS060301'] - 0.7) < 1e-9, `P2：JS060301=0.7（JS08 +0.2 落 JS06 分域·子域3 波动率水平，实际 ${P2.inputs['JS060301']}）`)
ok(Math.abs(P2.inputs['ZJ050401'] - 0.3) < 1e-9, `P2：ZJ050401=0.3（GZ04 -0.2 落 ZJ05 估值水平·子域4 业绩匹配，实际 ${P2.inputs['ZJ050401']}）`)
ok(Math.abs(P2.inputs['HY040501'] - 0.6) < 1e-9, `P2：HY040501=0.6（HG08 +0.1 落 HY04 宏观环境·子域5 风险偏好，实际 ${P2.inputs['HY040501']}）`)
ok(Math.abs(P2.inputs['HY040301'] - 0.45) < 1e-9, `P2：HY040301=0.45（HG03 -0.05 落 HY04 宏观环境·子域3 经济数据，实际 ${P2.inputs['HY040301']}）`)
ok(Math.abs(P2.inputs['JS040101'] - 0.55) < 1e-9, `P2：JS040101=0.55（JS04 +0.05 落 JS04 量能配合·子域1 量能水平，实际 ${P2.inputs['JS040101']}）`)
ok(P2.migratedSubdomains === 7, `P2：7 个「分域×子域」格子有 delta（实际 ${P2.migratedSubdomains}）`)

// 同格聚合：两条信号进同一 (sd,sub) → 取均值
const dupSigs = [
  { code: 'JS', subIdx: 0, delta: 0.3 }, // JS01 → JS01·1
  { code: 'JS', subIdx: 1, delta: -0.1 }, // JS02 → JS02·1（不同格）
]
const P2dup = signalsToInputsV2(dupSigs, db, MIGRATION_MAP, FINE_MAP)
ok(Math.abs(P2dup.inputs['JS010101'] - 0.8) < 1e-9 && Math.abs(P2dup.inputs['JS020101'] - 0.4) < 1e-9, 'P2：不同格信号各落各自子域（JS01·1=0.8 / JS02·1=0.4）')

console.log('== 3. 端到端：卦③（子域位）分化 vs L2 坍缩 ==')
// 同一合成信号过 evaluateDeterministic → 按 ci（子域位）统计阳率
function ciYangRates(built) {
  const script = { ...v2, na: { domains: [], checkpoints: built.naIds } }
  const r = evaluateDeterministic(script, { inputs: built.inputs, returnEvaluations: true })
  const byCi = {}
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    const ev = r.evaluations && r.evaluations[cp.id]
    if (!ev) continue // NA 不计入（与校准同口径）
    const ci = cp.id.slice(4, 6)
    byCi[ci] ||= { s: 0, c: 0 }
    byCi[ci].s += ev.yinYang === 1 ? 1 : 0
    byCi[ci].c += 1
  }
  return Object.fromEntries(Object.entries(byCi).map(([k, v]) => [k, v.c ? v.s / v.c : null]))
}
const ciL2 = ciYangRates(L2)
const ciP2 = ciYangRates(P2)
const ratesL2 = [...new Set(Object.values(ciL2).filter((v) => v != null))]
const ratesP2 = [...new Set(Object.values(ciP2).filter((v) => v != null))]
console.log(`  L2 卦③各组阳率：${JSON.stringify(ciL2)}`)
console.log(`  P2 卦③各组阳率：${JSON.stringify(ciP2)}`)
ok(ratesL2.length === 1, `L2：卦③各组阳率全同（坍缩签名，实际 ${ratesL2.length} 种）`)
ok(ratesP2.length >= 3, `P2：卦③阳率分化 ≥3 种（部分激活，实际 ${ratesP2.length} 种）`)
ok(ciP2['06'] === undefined || ciP2['06'] === null, 'P2：子域位 6 无任何规则命中 → 该组无覆盖（恒阴，文档化局限）')

console.log(fail === 0 ? `\nRESULT: PASS (${pass})` : `\nRESULT: FAIL (${fail}/${pass + fail})`)
process.exit(fail === 0 ? 0 : 1)
