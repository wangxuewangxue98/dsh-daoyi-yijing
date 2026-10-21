#!/usr/bin/env node
// compare_live_offline.mjs — 同版本在线(腾讯实时) vs 离线(截图快照) 模式对比
//
// 为什么要对比：
//   离线模式只用截图里的 pct/sector 两个原始量，8 宫中多数子域无值 → NA；
//   在线模式经 adapters/quote.mjs 拉腾讯行情，额外提供 PE/PB/市值/换手/外盘内盘/量比等字段。
//   本工具在**同一份代码**下把两条链路各跑一遍，量化「数据丰度」对卦象空间的影响，
//   避免把「版本差异」误当成「模式差异」。
//
// 用法：node scripts/compare_live_offline.mjs
//   会分别写入 logs/stock-batch-results.json（离线）与 logs/stock-batch-results-live.json（在线），
//   并生成对比报告 logs/mode-comparison.md
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBatch } from './divine_batch_stocks.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOG_DIR = join(ROOT, 'logs')
const F_OFF = join(LOG_DIR, 'stock-batch-results.json')
const F_ON = join(LOG_DIR, 'stock-batch-results-live.json')
const OUT_MD = join(LOG_DIR, 'mode-comparison.md')

const POS = ['初', '二', '三', '四', '五', '上']

function load(f) {
  return JSON.parse(readFileSync(f, 'utf8'))
}

function hexSpace(out) {
  const he = out.meta?.hex_encoding || {}
  const rs = out.results || []
  const n = rs.length
  const yangRatios = []
  for (let i = 0; i < 6; i++) {
    let yang = 0
    for (const r of rs) if (r.hexagram?.yaos?.[i] === '1') yang++
    yangRatios.push(n ? (yang / n) * 100 : 0)
  }
  return {
    n,
    kinds: Object.keys(out.hexagram_dist || {}).length,
    k: he.active_yao_count ?? 0,
    frozen: he.frozen_domains || [],
    inHex: he.in_hex_domains || [],
    distinct: Object.fromEntries(Object.entries(he.domain_distinct || {}).map(([c, s]) => [c, s.distinct])),
    yangRatios,
    // 数据丰度：每只股票平均激活的信号数（= 参与评分的子域检查点数）
    avgSignals: n ? rs.reduce((s, r) => s + (r.signals?.length || 0), 0) / n : 0,
    avgActive: n ? rs.reduce((s, r) => s + (r.active_domains?.length || 0), 0) / n : 0,
    // 注意：coverage 是对象 {total, na, active, coverage}，取内部比率才是数值
    avgCoverage: n ? rs.reduce((s, r) => s + (r.coverage?.coverage ?? 0), 0) / n : 0,
    avgActiveChecks: n ? rs.reduce((s, r) => s + (r.coverage?.active ?? 0), 0) / n : 0,
    avgYang: n ? rs.reduce((s, r) => s + (r.yang_ratio || 0), 0) / n : 0,
    avgScore: n ? rs.reduce((s, r) => s + (r.overall_score || 0), 0) / n : 0,
    verdictDist: rs.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {}),
    trendDist: (out.trend_dist || {}),
    veto: rs.filter((r) => r.has_veto).length,
  }
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

console.log('════════ 在线 vs 离线 模式对比（同一份代码 v0.5.1）════════\n')

console.log('▶ 运行离线模式（截图快照基线）…')
await runBatch({ live: false })
console.log('▶ 运行在线模式（腾讯实时行情）…')
await runBatch({ live: true })

const off = hexSpace(load(F_OFF))
const on = hexSpace(load(F_ON))
const OFF = load(F_OFF)
const ON = load(F_ON)

const pad = (s, w) => String(s).padEnd(w)
const row = (label, a, b, delta) =>
  console.log(`  ${pad(label, 16)}${pad(a, 12)}${pad(b, 12)}${delta ?? ''}`)

console.log('\n── A. 样本与取数 ──')
console.log(`  ${pad('', 16)}${pad('离线', 12)}${pad('在线', 12)}`)
row('样本数', off.n, on.n)
row('拉数成功', '—', `${ON.meta?.live?.fetched ?? '?'}`, '')
if (ON.meta?.live?.error) console.log(`  在线取数错误: ${ON.meta.live.error}`)
row('平均信号数', off.avgSignals.toFixed(1), on.avgSignals.toFixed(1), `Δ${(on.avgSignals - off.avgSignals).toFixed(1)}`)
row('平均活跃宫', off.avgActive.toFixed(2), on.avgActive.toFixed(2), `Δ${(on.avgActive - off.avgActive).toFixed(2)}`)
row('平均覆盖度', (off.avgCoverage * 100).toFixed(1) + '%', (on.avgCoverage * 100).toFixed(1) + '%')
row('平均活跃检查点', off.avgActiveChecks.toFixed(1), on.avgActiveChecks.toFixed(1), `/384`)

console.log('\n── B. 卦象空间（核心）──')
console.log(`  ${pad('', 16)}${pad('离线', 12)}${pad('在线', 12)}`)
row('有效爻 k', off.k, on.k)
row('卦空间上限', `2^${off.k}=${Math.pow(2, off.k)}`, `2^${on.k}=${Math.pow(2, on.k)}`)
row('冻结域', off.frozen.length, on.frozen.length, off.frozen.length ? `(${off.frozen.join(',')})` : '')
row('实得卦种数', off.kinds, on.kinds, `Δ${on.kinds - off.kinds >= 0 ? '+' : ''}${on.kinds - off.kinds}`)
const theo = 64 * (1 - Math.pow(1 - 1 / 64, on.n))
console.log(`  理论上界 min(N,64)=${Math.min(on.n, 64)}；随机满熵独立期望 ≈ ${theo.toFixed(1)} 种`)
console.log(`  在线达成率 vs 随机期望: ${((on.kinds / theo) * 100).toFixed(0)}%`)

console.log('\n── C. 各域分化度 distinct（7 档以下说明该宫子域太少）──')
console.log(`  ${pad('域', 16)}${pad('离线', 12)}${pad('在线', 12)}`)
for (const c of Object.keys(on.distinct)) {
  row(c, off.distinct[c] ?? '—', on.distinct[c], '')
}

console.log('\n── D. 六爻阳占比（理想 50%）──')
console.log(`  ${pad('爻位', 16)}${pad('离线', 12)}${pad('在线', 12)}`)
for (let i = 0; i < 6; i++) {
  const d = (i in off.yangRatios ? off.yangRatios[i] : 0).toFixed(1) + '%'
  const o = on.yangRatios[i].toFixed(1) + '%'
  const skewO = Math.abs(off.yangRatios[i] - 50) > 20 ? ' ←偏斜' : ''
  const skewN = Math.abs(on.yangRatios[i] - 50) > 20 ? ' ←偏斜' : ''
  row(`爻${i + 1}(${POS[i]}) ${on.inHex[i] || ''}`, d + skewO, o + skewN, '')
}

console.log('\n── E. 判读分布 ──')
console.log(`  ${pad('', 16)}${pad('离线', 12)}${pad('在线', 12)}`)
for (const v of new Set([...Object.keys(off.verdictDist), ...Object.keys(on.verdictDist)])) {
  row(v, off.verdictDist[v] || 0, on.verdictDist[v] || 0)
}
row('一票否决数', off.veto, on.veto, `Δ${on.veto - off.veto}`)
row('平均阳占比', (off.avgYang * 100).toFixed(1) + '%', (on.avgYang * 100).toFixed(1) + '%')
row('平均分', off.avgScore.toFixed(3), on.avgScore.toFixed(3))

// ───── 个股层面一致率 ─────
// ① 逐股配对：同一只股票在两种模式下结论是否相同
const mapOff = new Map(OFF.results.map((r) => [r.code, r]))
let sameHex = 0
let sameTrend = 0
let sameVerdict = 0
let compared = 0
let bitSame = 0
let bitTotal = 0
const flips = []
for (const r of ON.results) {
  const o = mapOff.get(r.code)
  if (!o) continue
  compared++
  if (o.hexagram?.name === r.hexagram?.name) sameHex++
  if (o.trend === r.trend) sameTrend++
  if (o.verdict === r.verdict) sameVerdict++
  if (o.verdict !== r.verdict) flips.push({ code: r.code, name: r.name, from: o.verdict, to: r.verdict })
  const a = o.hexagram?.yaos
  const b = r.hexagram?.yaos
  if (a && b && a.length === b.length) {
    for (let i = 0; i < a.length; i++) {
      bitTotal++
      if (a[i] === b[i]) bitSame++
    }
  }
}
// ② 集合口径：两种模式「能产出哪些卦」的重叠度（与逐股配对是两回事，别混读）
const setOff = new Set(Object.keys(OFF.hexagram_dist || {}))
const setOn = new Set(Object.keys(ON.hexagram_dist || {}))
const interHex = [...setOff].filter((x) => setOn.has(x))
const unionSize = new Set([...setOff, ...setOn]).size
const jaccard = unionSize ? interHex.length / unionSize : 0
console.log('\n── F. 一致性 ──')
console.log('  【逐股配对】同一只股票两种模式结论是否相同：')
row('卦象名', `${sameHex}/${compared}`, ((sameHex / compared) * 100).toFixed(1) + '%')
row('趋势', `${sameTrend}/${compared}`, ((sameTrend / compared) * 100).toFixed(1) + '%')
row('判决', `${sameVerdict}/${compared}`, ((sameVerdict / compared) * 100).toFixed(1) + '%')
row('6爻位bit', `${bitSame}/${bitTotal}`, ((bitSame / bitTotal) * 100).toFixed(1) + '%')
console.log('\n  【集合口径】两种模式「能产出哪些卦」的重叠（与逐股配对是两回事）：')
console.log(`    离线 ${setOff.size} 种 / 在线 ${setOn.size} 种；共有 ${interHex.length} 种：${interHex.join('、') || '（无）'}`)
console.log(`    Jaccard = ${(jaccard * 100).toFixed(1)}%；离线卦名被在线覆盖的比例 = ${setOff.size ? ((interHex.length / setOff.size) * 100).toFixed(1) : 0}%`)
if (flips.length) {
  console.log(`\n  判决翻转 ${flips.length} 只（前 15）:`)
  for (const f of flips.slice(0, 15)) console.log(`    ${f.code} ${f.name}: ${f.from} → ${f.to}`)
}

// ───── 域间相关性（在线）─────
const series = {}
for (const c of on.inHex) series[c] = ON.results.map((r) => r.domain_scores?.[c] ?? 0)
let strongest = 0
let pairTxt = ''
for (let i = 0; i < on.inHex.length; i++) {
  for (let j = i + 1; j < on.inHex.length; j++) {
    const r = pearson(series[on.inHex[i]], series[on.inHex[j]])
    if (Math.abs(r) > Math.abs(strongest)) {
      strongest = r
      pairTxt = `${on.inHex[i]}~${on.inHex[j]}`
    }
  }
}
console.log(`\n── G. 在线进卦域最强相关对: ${pairTxt} = ${strongest.toFixed(3)}（|r|>0.6 会吃掉比特）──`)

// ───── Markdown 报告 ─────
const md = `# 在线 vs 离线 模式对比报告

> 同一份代码（v0.5.1）下，对 ${on.n} 只自选股分别以「离线截图快照」与「在线腾讯实时行情」两条数据链路各跑一遍，量化数据丰度对卦象空间的影响。
> 生成时间：${new Date().toISOString()}

## 结论摘要

| 指标 | 离线 | 在线 | 差异 |
|---|---|---|---|
| 样本数 | ${off.n} | ${on.n} | — |
| 平均信号数（数据丰度） | ${off.avgSignals.toFixed(1)} | ${on.avgSignals.toFixed(1)} | ${(on.avgSignals - off.avgSignals).toFixed(1)} |
| 平均活跃宫 / 8 | ${off.avgActive.toFixed(2)} | ${on.avgActive.toFixed(2)} | ${(on.avgActive - off.avgActive).toFixed(2)} |
| 有效爻 k | ${off.k} | ${on.k} | — |
| 卦空间上限 2^k | ${Math.pow(2, off.k)} | ${Math.pow(2, on.k)} | — |
| 冻结域 | ${off.frozen.length} | ${on.frozen.length} | — |
| **实得卦种数** | **${off.kinds}** | **${on.kinds}** | **${on.kinds - off.kinds >= 0 ? '+' : ''}${on.kinds - off.kinds}** |
| 平均活跃检查点 /384 | ${off.avgActiveChecks.toFixed(1)} | ${on.avgActiveChecks.toFixed(1)} | — |
| 检查点覆盖度 | ${(off.avgCoverage * 100).toFixed(1)}% | ${(on.avgCoverage * 100).toFixed(1)}% | — |
| 一票否决数 | ${off.veto} | ${on.veto} | ${on.veto - off.veto} |

理论上界为 min(N,64) = ${Math.min(on.n, 64)}；随机满熵且爻间独立时期望覆盖约 ${theo.toFixed(1)} 种，在线实际达成率 **${((on.kinds / theo) * 100).toFixed(0)}%**。

## 六爻阳占比

| 爻位 | 域 | 离线 | 在线 |
|---|---|---|---|
${on.inHex.map((c, i) => `| 爻${i + 1}（${POS[i]}） | ${c} | ${off.yangRatios[i].toFixed(1)}% | ${on.yangRatios[i].toFixed(1)}% |`).join('\n')}

## 各域分化度 distinct

| 域 | 离线 | 在线 |
|---|---|---|
${Object.keys(on.distinct).map((c) => `| ${c} | ${off.distinct[c] ?? '—'} | ${on.distinct[c]} |`).join('\n')}

## 判读分布

| 判决 | 离线 | 在线 |
|---|---|---|
${[...new Set([...Object.keys(off.verdictDist), ...Object.keys(on.verdictDist)])].map((v) => `| ${v} | ${off.verdictDist[v] || 0} | ${on.verdictDist[v] || 0} |`).join('\n')}

## 一致性

**逐股配对**（同一只股票在两种模式下的结论是否相同）：

- 卦象名一致：${sameHex}/${compared}（${((sameHex / compared) * 100).toFixed(1)}%）
- 趋势一致：${sameTrend}/${compared}（${((sameTrend / compared) * 100).toFixed(1)}%）
- 判决一致：${sameVerdict}/${compared}（${((sameVerdict / compared) * 100).toFixed(1)}%）
- 6 个爻位 bit 逐位一致：${bitSame}/${bitTotal}（${((bitSame / bitTotal) * 100).toFixed(1)}%）

**集合口径**（两种模式「能产出哪些卦」的重叠，与逐股配对是两回事）：

- 离线 ${setOff.size} 种 / 在线 ${setOn.size} 种，共有 ${interHex.length} 种：${interHex.join('、') || '（无）'}
- Jaccard = ${(jaccard * 100).toFixed(1)}%；离线卦名空间被在线覆盖的比例 = ${setOff.size ? ((interHex.length / setOff.size) * 100).toFixed(1) : 0}%

${flips.length ? `判决翻转 ${flips.length} 只，前 15 只：\n\n${flips.slice(0, 15).map((f) => `- ${f.code} ${f.name}：${f.from} → ${f.to}`).join('\n')}` : '（无判决翻转）'}

## 读法说明

1. **两份数据的采集时刻不同**：离线基线来自同花顺自选股截图（收盘快照），在线取自腾讯最新收盘。若两者日期不同，个股差异中含「时间差」成分，不完全归因于模式。
2. **卦名一致率低属正常**：两条链路输入量不同 → 8 宫分不同 → 二值化阈值不同，卦名自然不同；应关注的 discriminative 指标是「有效爻 k、冻结域、卦种数」。
3. **N=${on.n} 时物理上不可能覆盖 64 种**（鸽笼原理上限 ${Math.min(on.n, 64)}）。要到满 64 需把样本扩到 ~300 只。
`
writeFileSync(OUT_MD, md, 'utf8')
console.log(`\n对比报告已写入 ${OUT_MD}`)
