// verify.mjs — 裸 Node 离线自检（零依赖，不依赖 DSH Runtime）
// 复用 Python 原型的“规范 384 结构”向量做交叉校验：同一组输入，判定/聚合结论可复现。
import {
  buildFullScript,
  getBuiltinScript,
  buildCheckpointDatabase,
} from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'

let failures = 0
function assert(cond, msg) {
  if (cond) console.log('  \u2713', msg)
  else {
    console.log('  \u2717', msg)
    failures++
  }
}

console.log('== 易经推演-万事决 verify ==')

// ── 规范 384 结构（demo-384）──
const demo = buildFullScript()
const dbDemo = buildCheckpointDatabase(demo)
assert(dbDemo.checkpoints.length === 384, `demo 检查点总数=384 (实际 ${dbDemo.checkpoints.length})`)
assert(Object.keys(dbDemo.subdomainIndex).length === 64, `demo 子领域数=64 (实际 ${Object.keys(dbDemo.subdomainIndex).length})`)
assert(Object.keys(dbDemo.domainIndex).length === 8, `demo 顶层域数=8 (实际 ${Object.keys(dbDemo.domainIndex).length})`)

// ── 真实 motor-design 剧本 ──
const md = getBuiltinScript('motor-design')
assert(!!md, 'motor-design 内置剧本已注册')
const dbMd = buildCheckpointDatabase(md)
assert(dbMd.checkpoints.length === 384, `motor-design 检查点总数=384 (实际 ${dbMd.checkpoints.length})`)
const activeMd = dbMd.checkpoints.filter((c) => !c.na).length
const naMd = dbMd.checkpoints.filter((c) => c.na).length
assert(activeMd === 226, `motor-design 活跃检查点=226 (实际 ${activeMd})`)
assert(naMd === 158, `motor-design NA 检查点=158 (实际 ${naMd})`)
assert(dbMd.coverage === undefined, 'buildCheckpointDatabase 不自带 coverage（由 aggregate 计算）')
assert(dbMd.checkpoints.find((c) => c.id === 'EM01C01')?.na === false, 'EM01C01 活跃（非 NA）')
assert(dbMd.checkpoints.find((c) => c.id === 'COST01C01')?.na === true, 'COST01C01 属 NA 域')
assert(dbMd.checkpoints.find((c) => c.id === 'EM07C01')?.na === true, 'EM07C01 单点 NA')

// ── 场景 A：demo 全达标 → 可行（无否决，综合分=1）──
const allPass = Object.fromEntries(dbDemo.checkpoints.map((c) => [c.id, 1.0]))
const rA = await evaluate('测试事项', demo, { inputs: allPass })
assert(rA.verdict === '可行', `场景A demo 全达标 verdict=可行 (实际 ${rA.verdict})`)
assert(rA.has_veto === false, '场景A demo 无否决')
assert(Math.abs(rA.overall_score - 1) < 1e-9, `场景A demo 综合分=1 (实际 ${rA.overall_score})`)

// ── 场景 B：demo 单个强关联失败 → 一票否决 → 不可行 ──
const rB = await evaluate('测试事项', demo, { inputs: { D01S1C1: 0.1 } })
assert(rB.has_veto === true, '场景B demo 触发强关联一票否决')
assert(rB.verdict === '不可行', `场景B demo verdict=不可行 (实际 ${rB.verdict})`)

// ── 场景 C：demo 缺输入走阈值兜底 → 全达标 → 可行（默认剧本 id 解析）──
const rC = await evaluate('测试事项', 'demo-384', {})
assert(rC.script_id === 'demo-384', '场景C 默认剧本 demo-384 解析成功')
assert(rC.verdict === '可行', `场景C demo 缺输入兜底 → 可行 (实际 ${rC.verdict})`)

// ── 场景 D：motor-design 缺输入（默认阈值兜底，全达标）→ 可行 + 覆盖率 ──
const rD = await evaluate('测试事项', 'motor-design', {})
assert(rD.script_id === 'motor-design', '场景D motor-design 解析成功')
assert(rD.coverage.active === 226, `场景D 活跃=226 (实际 ${rD.coverage.active})`)
assert(rD.coverage.na === 158, `场景D NA=158 (实际 ${rD.coverage.na})`)
assert(Math.abs(rD.coverage.coverage - 226 / 384) < 1e-9, `场景D 覆盖率=${rD.coverage.coverage.toFixed(4)}`)
assert(rD.na_domains.includes('COST') && rD.na_domains.includes('MANU'), '场景D NA 域含 COST/MANU')
assert(rD.verdict === '可行', `场景D 缺输入兜底 → 可行 (实际 ${rD.verdict})`)

// ── 场景 E：motor-design 强关联失败（EM01C01=0，气隙磁密超下界）→ 否决 不可行 ──
const rE = await evaluate('测试事项', 'motor-design', { inputs: { EM01C01: 0.1 } })
assert(rE.has_veto === true, '场景E motor-design 触发强关联一票否决')
assert(rE.verdict === '不可行', `场景E motor-design verdict=不可行 (实际 ${rE.verdict})`)

// ── 场景 F：motor-design boolean 项口径（TH02C01 冷却方式适配 boolean(1,1)，传 1→阳）──
const rF = await evaluate('测试事项', 'motor-design', { inputs: { TH02C01: 1 } })
const th02 = (rF.subdomain_results['TH/冷却效率']) || null
assert(th02 && th02.strong_veto === false, '场景F TH/冷却效率 无否决（boolean=1 判阳）')

console.log(failures === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
