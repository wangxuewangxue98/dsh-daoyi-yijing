#!/usr/bin/env node
// analyze_hex_space.mjs — 卦象空间诊断（定位「卦种数上不去」的卡点）
//
// 数学原理（6 爻 = 6 bit = 2^6 = 64 卦）：
//   卦种上限 = 2^k，k = 有效独立爻数。任何一爻出现下列情况都会吃掉一个比特：
//     ① 冻结（批次内取值唯一 → 恒阴，其实根本没在编码信息）
//     ② 偏斜（阴阳比例远离 50% → 该爻熵 < 1 bit）
//     ③ 相关（与其他爻同源 → 实际信息量不叠加）
//   另：样本量是硬天花板——N 个样本投入 64 个桶，期望非空桶 ≈ 64*(1-(1-1/64)^N)。
//
// 用法：node scripts/analyze_hex_space.mjs [results.json]
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEF = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs', 'stock-batch-results-live.json')
const file = process.argv[2] || DEF
const out = JSON.parse(readFileSync(file, 'utf8'))
const rs = out.results || []
const n = rs.length
const POS = ['初', '二', '三', '四', '五', '上']

console.log(`样本文件: ${file}`)
console.log(`样本数   N = ${n}`)
console.log(`卦种数     = ${Object.keys(out.hexagram_dist || {}).length}`)
const expCovered = 64 * (1 - Math.pow(1 - 1 / 64, n))
console.log(`理论上限   = min(N,64) = ${Math.min(n, 64)}；随机满熵且爻间独立时期望 ≈ ${expCovered.toFixed(1)} 种`)
console.log(`（集齐 64 种 coupon collector 期望需 ≈ 303 个样本；N<64 时物理上不可能覆盖 64 种）`)

const he = out.meta?.hex_encoding || {}
console.log(`\nfrozen 域   = ${JSON.stringify(he.frozen_domains || [])}`)
console.log(`进卦域      = ${JSON.stringify(he.in_hex_domains || [])}`)
console.log(`有效爻 k    = ${he.active_yao_count ?? '?'}  → 卦空间上限 2^k = ${Math.pow(2, he.active_yao_count ?? 0)}`)

console.log('\n── ① 各域分化度（distinct=1 即冻结，该爻不编码信息）──')
for (const [code, st] of Object.entries(he.domain_distinct || {})) {
  console.log(`  ${code}: n=${st.n} distinct=${st.distinct}${st.distinct <= 1 ? '  ← 冻结' : ''}`)
}

console.log('\n── ② 6 爻位阳占比（理想 50%，偏离过大则该爻熵不足 1 bit）──')
for (let i = 0; i < 6; i++) {
  let yang = 0
  for (const r of rs) {
    const y = r.hexagram?.yaos
    if (y && y[i] === '1') yang++
  }
  const pct = n ? (yang / n) * 100 : 0
  console.log(`  爻${i + 1}(${POS[i]}): 阳 ${yang}/${n} = ${pct.toFixed(1)}%${Math.abs(pct - 50) > 20 ? '  ← 偏斜' : ''}`)
}

function pearson(a, b) {
  const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

const codes = he.in_hex_domains || []
const series = {}
for (const c of codes) series[c] = rs.map((r) => (r.domain_scores && r.domain_scores[c]) || 0)

console.log('\n── ③ 进卦域间 Pearson 相关（|r| > 0.6 视为同源，比特不叠加）──')
let worst = 0
let worstPair = ''
for (let i = 0; i < codes.length; i++) {
  for (let j = i + 1; j < codes.length; j++) {
    const r = pearson(series[codes[i]], series[codes[j]])
    if (Math.abs(r) > Math.abs(worst)) {
      worst = r
      worstPair = `${codes[i]}~${codes[j]}`
    }
    if (Math.abs(r) > 0.6) console.log(`  ${codes[i]} ~ ${codes[j]}: r = ${r.toFixed(3)}  ← 强相关`)
  }
}
console.log(`  最强相关对: ${worstPair || '无'} = ${worst.toFixed(3)}`)

console.log('\n── ④ 卦象分布（Top）──')
const hx = Object.entries(out.hexagram_dist || {}).sort((a, b) => b[1] - a[1])
for (const [name, c] of hx.slice(0, 12)) console.log(`  ${name}: ${c}`)
if (hx.length > 12) console.log(`  … 其余 ${hx.length - 12} 种各 1~${hx[12][1]} 只`)
