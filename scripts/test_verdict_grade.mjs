// test_verdict_grade.mjs — 「有条件可行」分级 + verdict_margin 单测（v0.8.1）
//
// 分级口径（aggregator.mjs）：有条件可行带 [0.5, 0.75) 按中位 0.625 切偏强/偏弱；
//   verdict 原值不变（零回归）；margin = 距上一条通过线的带符号余量；否决 → null。
import { aggregate } from '../lib/yijing/aggregator.mjs'
import { getBuiltinScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { resolveValue, judgeYinYang } from '../lib/yijing/mapping.mjs'

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

// ── 合成微型库：2 域 × 2 子域 × 5 检查点，域分 = 阳率，可精确构造综合分 ──
function microDb() {
  const checkpoints = []
  const subdomainIndex = {}
  const domainIndex = {}
  for (const [code, bagua, name] of [
    ['DA', '乾', '域甲'],
    ['DB', '坤', '域乙'],
  ]) {
    const sdKeys = []
    for (let s = 1; s <= 2; s++) {
      const sdKey = `${code}${s}`
      const checks = []
      for (let c = 1; c <= 5; c++) {
        const id = `${sdKey}C${c}`
        checks.push(id)
        checkpoints.push({ id, domain: code, name: id, weight: 1, is_strong: s === 1 && c === 1, na: false, threshold: [0.5, null], threshold_type: 'min' })
      }
      subdomainIndex[sdKey] = { key: sdKey, code, bagua, name: `子域${s}`, checks }
      sdKeys.push(sdKey)
    }
    domainIndex[code] = { code, name, bagua, subdomains: sdKeys }
  }
  return { checkpoints, subdomainIndex, domainIndex, sancai_mapping: { tian: ['DA'], di: ['DB'], ren: [] } }
}

// yangPerCheckpoint: Map(id -> 0/1)；强关联项 c1 置 0 可触发否决
function microAgg(yangMap) {
  const db = microDb()
  const ev = new Map()
  for (const cp of db.checkpoints) {
    const y = yangMap[cp.id] === 1 ? 1 : -1
    ev.set(cp.id, { value: y === 1 ? 0.9 : 0.1, yinYang: y, pass: y === 1 })
  }
  return aggregate(db, ev)
}

// 域分构造：DA 阳率 a/5，DB 阳率 b/5 → 综合分 = (a+b)/10
function yangMapOf(a, b, veto = false) {
  const m = {}
  for (let c = 1; c <= 5; c++) {
    m[`DA1C${c}`] = c <= a ? 1 : 0
    m[`DA2C${c}`] = c <= a ? 1 : 0
    m[`DB1C${c}`] = veto && c === 1 ? 0 : c <= b ? 1 : 0
    m[`DB2C${c}`] = c <= b ? 1 : 0
  }
  return m
}

console.log('== 1. 分级边界（合成微型库，综合分精确可控）==')
// 综合分 = (a+b)/10；0.625 → a+b=12.5 不可达，用 12/10=1.2 超了；改口径：每域 10 检查点更细。
// 简化：直接用 4 检查点/子域不可行——这里改用「按需阳数」近似边界 ±0.05 内断言。
const g125 = microAgg(yangMapOf(5, 5)) // 1.0 → 可行
ok(g125.verdict === '可行' && g125.verdict_grade === '可行', `综合分 1.0 → 可行（grade 不降级，实际 ${g125.verdict_grade}）`)
ok(Math.abs(g125.verdict_margin - 0.25) < 1e-9, `可行 margin = score-0.75 = 0.25（实际 ${g125.verdict_margin}）`)

const g75 = microAgg(yangMapOf(4, 3)) // DA=0.8, DB=0.6 → 0.7 → 有条件可行·偏强
ok(g75.verdict === '有条件可行' && g75.verdict_grade === '有条件可行·偏强', `综合分 0.7 ≥0.625 → 有条件可行·偏强（实际 ${g75.verdict_grade}, score=${g75.overall_score}）`)
ok(Math.abs(g75.verdict_margin - 0.05) < 1e-9, `偏强 margin = 0.75-score = 0.05（实际 ${g75.verdict_margin}）`)

const gWeak = microAgg(yangMapOf(3, 2)) // DA=0.6, DB=0.4 → 0.5 → 有条件可行·偏弱
ok(gWeak.verdict === '有条件可行' && gWeak.verdict_grade === '有条件可行·偏弱', `综合分 0.5 <0.625 → 有条件可行·偏弱（实际 ${gWeak.verdict_grade}, score=${gWeak.overall_score}）`)
ok(Math.abs(gWeak.verdict_margin - 0.25) < 1e-9, `偏弱 margin = 0.75-score = 0.25（实际 ${gWeak.verdict_margin}）`)

const gFail = microAgg(yangMapOf(2, 1)) // DA=0.4, DB=0.2 → 0.3 → 不可行
ok(gFail.verdict === '不可行' && gFail.verdict_grade === '不可行', `综合分 0.3 <0.5 → 不可行（grade 不变，实际 ${gFail.verdict_grade}）`)
ok(Math.abs(gFail.verdict_margin - (-0.2)) < 1e-9, `不可行 margin = score-0.5 = -0.2（实际 ${gFail.verdict_margin}）`)

const gVeto = microAgg(yangMapOf(5, 5, true)) // DB 子域1 强关联失守 → 否决
ok(gVeto.has_veto === true && gVeto.verdict === '不可行' && gVeto.verdict_margin === null, '否决 → 不可行 + margin=null（分距对否决无意义）')

// 0.625 精确边界：DA=0.75(阳 3.75 不可达)→ 用 8 检查点子域重算太繁；
// 直接用 aggregate 口径验证 COND_MID：DA=5/5=1.0, DB=2.5/5 不可达 → 以 0.6/0.65 双侧夹逼
const gHi = microAgg(yangMapOf(4, 3)) // 0.7（上文）
const gLo = microAgg(yangMapOf(3, 3)) // DA=0.6, DB=0.6 → 0.6 <0.625 → 偏弱
ok(gLo.verdict_grade === '有条件可行·偏弱', `综合分 0.6 <0.625 → 偏弱（边界下方，实际 ${gLo.verdict_grade}, score=${gLo.overall_score}）`)
ok(gHi.overall_score > 0.625 && gLo.overall_score < 0.625, '0.625 两侧样例夹逼正确（0.7 偏强 / 0.6 偏弱）')

console.log('== 2. 真实剧本集成（stock-trend）==')
const script = getBuiltinScript('stock-trend')
const db = buildCheckpointDatabase(script)
function run(scoreMap) {
  const ev = new Map()
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    const v = resolveValue(cp, scoreMap)
    const yy = judgeYinYang(cp, v)
    ev.set(cp.id, { value: v, yinYang: yy, pass: yy === 1 })
  }
  return aggregate(db, ev)
}
// 场景：四域 0.3（阴倾向）四域 0.9 → 域分混合，综合分落入中间带
const base = {}
for (const cp of db.checkpoints) base[cp.id] = ['JS', 'ZJ', 'GZ', 'HY'].includes(cp.domain) ? 0.3 : 0.9
const r = run(base)
console.log(`  集成场景 verdict=${r.verdict} grade=${r.verdict_grade} score=${r.overall_score} margin=${r.verdict_margin}`)
const GRADES = ['可行', '有条件可行·偏强', '有条件可行·偏弱', '不可行']
ok(GRADES.includes(r.verdict_grade), `verdict_grade 在五值集合内（实际 ${r.verdict_grade}）`)
ok(
  r.verdict === '有条件可行'
    ? r.verdict_grade === (r.overall_score >= 0.625 ? '有条件可行·偏强' : '有条件可行·偏弱')
    : r.verdict_grade === r.verdict,
  'grade 与 verdict/score 自洽（有条件可行时按 0.625 切档，其余等同 verdict）',
)
// 全 0.95 → 可行；强关联失守 → 否决不可行
const rAll = run(Object.fromEntries(db.checkpoints.map((c) => [c.id, 0.95])))
ok(rAll.verdict === '可行' && rAll.verdict_grade === '可行', '全达标 → 可行（grade 不变）')
const rVeto = run(
  Object.fromEntries(db.checkpoints.map((c) => [c.id, c.domain === 'FX' && c.is_strong ? 0.1 : 0.95])),
)
ok(rVeto.verdict === '不可行' && rVeto.verdict_margin === null, 'FX 强关联失守 → 否决不可行 + margin null')

console.log(fail === 0 ? `\nRESULT: PASS (${pass})` : `\nRESULT: FAIL (${fail}/${pass + fail})`)
process.exit(fail === 0 ? 0 : 1)
