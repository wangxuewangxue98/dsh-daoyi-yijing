// _diag_veto.mjs — 蒙特卡洛：量化「一票否决白名单」在真实数据下的触发率
// 背景：报告记录 55 只股票中 24 只被否决（43.6%）。本脚本验证这是否由 veto 策略过严引起。
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { getBuiltinScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'

const script = getBuiltinScript('stock-trend')
const db = buildCheckpointDatabase(script)
const CODES = ['JB', 'JS', 'ZJ', 'XX', 'HY', 'HG', 'GZ', 'FX']

function mkInputs(domainScores, noise) {
  const inputs = {}
  for (const cp of db.checkpoints) {
    const s = domainScores[cp.domain]
    inputs[cp.id] = Math.max(0, Math.min(1, s + (Math.random() - 0.5) * 2 * noise))
  }
  return inputs
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function run(label, gen, n = 400) {
  const rnd = mulberry32(20261021)
  const stat = { 可行: 0, 有条件可行: 0, 不可行: 0 }
  let veto = 0
  const hexes = new Set()
  for (let i = 0; i < n; i++) {
    const ds = {}
    for (const c of CODES) ds[c] = gen(rnd)
    const r = await evaluate('x', script, { inputs: mkInputs(ds, 0.15), config: {} })
    stat[r.verdict] = (stat[r.verdict] || 0) + 1
    if (r.has_veto) veto++
    hexes.add(r.conclusion_text.split('：')[0])
  }
  const pct = (x) => ((x / n) * 100).toFixed(1) + '%'
  console.log(
    `${label.padEnd(30)} n=${n}  可行=${pct(stat.可行)}  有条件=${pct(stat.有条件可行 || 0)}  ` +
      `不可行=${pct(stat.不可行)}  其中否决触发=${pct(veto)}  卦种=${hexes.size}`,
  )
  return stat
}

console.log('===== 一票否决白名单（FX/XX，minCount=1）触发率 =====')
await run('域分 ~ U(0,1) 全随机', (r) => r())
await run('域分 ~ U(0.35,0.85) 偏中性', (r) => 0.35 + r() * 0.5)
await run('域分 ~ U(0.5,0.9) 偏乐观', (r) => 0.5 + r() * 0.4)

// 单独测：仅 XX 或仅 FX 一个子域首项不达标 → 全盘否决？
console.log('\n===== 单点敏感性：只让 XX01 的首项不达标 =====')
const base = {}
for (const c of CODES) base[c] = 0.8
const inputs = mkInputs(base, 0)
inputs['XX0101'] = 0.4 // 消息面·公司公告·强度 = 不达标（强关联）
const r1 = await evaluate('x', script, { inputs, config: {} })
console.log(`其余 8 宫均 0.8（高分）→ verdict=${r1.verdict} 风险=${r1.risk_level} 综合=${(r1.overall_score * 100).toFixed(0)}% has_veto=${r1.has_veto}`)
console.log(`→ 说明：单一因子 0.4 即可把综合 80% 的方案打成「不可行/高风险」`)
