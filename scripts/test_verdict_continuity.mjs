// test_verdict_continuity.mjs — P0-B 连续分 verdict + P0-C 否决收窄 单测
import { getBuiltinScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { resolveValue, judgeYinYang } from '../lib/yijing/mapping.mjs'
import { aggregate } from '../lib/yijing/aggregator.mjs'
import { generateConclusionText } from '../lib/yijing/reviewer.mjs'

let fail = 0
const ok = (c, m) => {
  if (c) console.log('  \u2713', m)
  else {
    console.log('  \u2717', m)
    fail++
  }
}

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

console.log('== 连续分 verdict + 否决收窄单测 (stock-trend) ==')

// 场景 A：非白名单域失守（拉低均分），白名单域(FX/XX)全过 → 无否决 + 均分∈[0.5,0.75)
const SET_LOW = new Set(['JS', 'ZJ', 'GZ', 'HY'])
const baseA = {}
for (const cp of db.checkpoints) baseA[cp.id] = SET_LOW.has(cp.domain) ? 0.3 : 0.9
const aggA = run(baseA)
console.log(`  场景A verdict=${aggA.verdict} overall=${aggA.overall_score} has_veto=${aggA.has_veto}`)
ok(aggA.has_veto === false, '场景A 非白名单域失守不触发全局否决')
ok(aggA.verdict === '有条件可行', '场景A 无否决且均分∈[0.5,0.75) → 有条件可行（中间态复活）')

// 场景 B：白名单域 FX 强关联失败 → 触发否决 → 不可行
const baseB = {}
for (const cp of db.checkpoints) baseB[cp.id] = 0.9
for (const cp of db.checkpoints) if (cp.domain === 'FX' && cp.is_strong) baseB[cp.id] = 0.1
const aggB = run(baseB)
ok(aggB.has_veto === true && aggB.verdict === '不可行', '场景B FX 强关联失败 → 白名单否决 → 不可行')

// 场景 C：卦象多样性（动态映射应远超旧两卦）
const guas = new Set()
const sixCodes = [...script.domains.map((d) => d.code)] // 8 域顺序
for (let i = 0; i < sixCodes.length; i++) {
  const inp = {}
  for (const cp of db.checkpoints) inp[cp.id] = cp.domain === sixCodes[i] ? 0.3 : 0.9
  const a = run(inp)
  guas.add(generateConclusionText(a, script, 'classic').split('\n')[0])
}
// 叠加全阳基准
{
  const inp = {}
  for (const cp of db.checkpoints) inp[cp.id] = 0.95
  guas.add(generateConclusionText(run(inp), script, 'classic').split('\n')[0])
}
console.log(`  场景C 出现卦象种类=${guas.size}`)
ok(guas.size >= 4, `场景C 卦象种类≥4（实际 ${guas.size}，动态映射生效）`)

console.log(fail === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${fail})`)
process.exit(fail === 0 ? 0 : 1)
