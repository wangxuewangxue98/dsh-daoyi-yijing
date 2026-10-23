// test_quad_hexagram.mjs — 四连卦（quad-hexagram.mjs）专项测试（v0.7.0 阶段1）
process.env.DAOYI_DIVINE_QUOTA_OFF = '1' // 测试隔离：关闭推演日限闸门（商业日限由生产部署配置开启）
//
// 覆盖：
//   1. 业务族映射覆盖全部 384 检查点且六族均有样本（防 卦③ 坍缩）
//   2. resolveQuadHexagram 产出 4 卦 × 6 爻，且卦名均为合法 64 卦名（无"未知"）
//   3. 卦①(di) 与现有单卦（buildHexagramField）同口径同卦名（接线一致性）
//   4. 基线分位阈值机制：提高某组阈值可将该组由阳翻阴（消恒阳爻）
//   5. 一致性矩阵：toneCount 4 卦求和、distinctNames、consensus 计算正确
//   6. 真实 evaluate 路径（缺输入兜底）也能产出 quad_hexagram 字段（接线冒烟）
import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { aggregate } from '../lib/yijing/aggregator.mjs'
import { resolveQuadHexagram, parseCp } from '../lib/yijing/quad-hexagram.mjs'
import { familyOf, assertFamilyCoverage, FAMILY_ORDER, FAMILY_LABELS } from '../lib/yijing/subfamily-map.mjs'
import { loadBaselines, thresholdsFromBaselines } from '../lib/yijing/baselines.mjs'
import { HEXAGRAMS, resolveHexagramForScript, buildOrderFromScript } from '../lib/yijing/hexagram.mjs'
import { evaluate, evaluateDeterministic } from '../lib/yijing/reviewer.mjs'

let fail = 0
const ok = (c, m) => {
  if (c) console.log('  \u2713', m)
  else {
    console.log('  \u2717', m)
    fail++
  }
}

const script = buildStockScript()
const db = buildCheckpointDatabase(script)

console.log('== 四连卦专项测试 (stock-trend) ==')

// ---- 1. 业务族映射覆盖全部 384 + 六族均有样本 ----
const allIds = db.checkpoints.filter((c) => !c.na).map((c) => c.id)
const ASPECT_NAMES = ['强度', '持续性', '确定性', '边际变化', '安全边际', '催化']
const aspectNameOfId = (id) => ASPECT_NAMES[Number(id.slice(4, 6)) - 1] || null
{
  // 注意：回调返回 aspect 名（familyOf 由 assertFamilyCoverage 内部调用），不要在此返回族字母
  const cov = assertFamilyCoverage(allIds, aspectNameOfId)
  ok(cov.total === allIds.length && FAMILY_ORDER.every((f) => cov.counts[f] > 0),
    `业务族覆盖 384 全（${cov.total}）且六族均有样本 ${FAMILY_ORDER.map((f) => `${f}:${cov.counts[f]}`).join(' ')}`)
}

// ---- 构造确定性 evals（按 aspect 奇偶制造 ~50/50 阳率，便于测阈值机制）----
// ⚠ yinYang 忠实镜像引擎口径：judgeYinYang 返回 +1(阳)/-1(阴)，非 0/1
const evals = new Map()
for (const cp of db.checkpoints) {
  if (cp.na) continue
  const yang = Number(cp.id.slice(4, 6)) % 2 === 0 ? 1 : 0
  evals.set(cp.id, { value: yang, yinYang: yang ? 1 : -1, pass: yang === 1, origin: 'test' })
}
const agg = aggregate(db, evals)
const baselines = loadBaselines('stock-trend') // 现有：含 domains，不含 groups → groups 回落 0.5

// ---- 2. 四卦 × 6 爻，卦名合法 ----
const quad = resolveQuadHexagram(db, evals, script, baselines, agg)
{
  let bad = 0
  for (const dim of ['di', 'si', 'ci', 'xi']) {
    const h = quad.hexes[`hex_${dim}`]
    if (h.groups.length !== 6) bad++
    if (!HEXAGRAMS[`${h.name.slice(0, 1)}${h.name.slice(1)}`] && h.name === '未知') bad++ // 占位
    if (h.name === '未知') bad++
  }
  ok(bad === 0, `四卦各 6 爻且卦名合法（无"未知"；异常 ${bad}）`)
  ok(quad.hexes.hex_ci.groups.map((g) => g.key).join('') === FAMILY_ORDER.join(''),
    `卦③ 六族顺序 = ${FAMILY_ORDER.join('')}`)
  ok(quad.hexes.hex_si.groups.map((g) => g.key).join(',') === '1,2,3,4,5,6', '卦② 子域位 1-6')
  ok(quad.hexes.hex_xi.groups.map((g) => g.key).join(',') === '1,2,3,4,5,6', '卦④ aspect 1-6')
}

// ---- 3. 卦①(di) 与现有单卦同口径同卦名 ----
{
  const order = buildOrderFromScript(script)
  const scores = Object.fromEntries(
    Object.entries(agg.domain_results).map(([k, v]) => [k, v ? v.score : 0]),
  )
  const domTh = thresholdsFromBaselines(baselines, 'p50')
  const single = resolveHexagramForScript(scores, script, domTh)
  ok(quad.hexes.hex_di.name === single.name, `卦① 与现有单卦同卦名（${quad.hexes.hex_di.name} / ${single.name}）`)
}

// ---- 4. 基线分位阈值机制：抬高某组阈值 → 由阳翻阴 ----
{
  const high = JSON.parse(JSON.stringify(baselines))
  high.groups = { si: {}, ci: {}, xi: {} }
  high.groups.xi = Object.fromEntries(['1', '2', '3', '4', '5', '6'].map((k) => [k, { p50: 2.0 }])) // 远超 1.0 → 恒阴
  const qHigh = resolveQuadHexagram(db, evals, script, high, agg)
  const yangBefore = quad.hexes.hex_xi.groups.map((g) => g.yang)
  const yangAfter = qHigh.hexes.hex_xi.groups.map((g) => g.yang)
  const flipped = yangBefore.some((y, i) => y === 1 && yangAfter[i] === 0)
  ok(flipped, `基线分位机制：抬高 xi 阈值可令阳爻翻阴（前 ${yangBefore} → 后 ${yangAfter}）`)
}

// ---- 5. 一致性矩阵 ----
{
  const c = quad.consistency
  const sum = c.toneCount.auspicious + c.toneCount.neutral + c.toneCount.ominous
  ok(sum === 4, `一致性矩阵 toneCount 四卦求和=4（实际 ${sum}）`)
  ok(typeof c.consensus === 'boolean' && c.distinctNames >= 1, `distinctNames=${c.distinctNames}，consensus=${c.consensus}`)
}

// ---- 6. 真实 evaluate 路径冒烟（缺输入兜底）----
{
  const r = await evaluate('测试事项', 'stock-trend', {})
  ok(r.quad_hexagram && r.quad_hexagram.hexes && r.quad_hexagram.hexes.hex_di, 'evaluate 返回含 quad_hexagram（真实路径冒烟）')
  const r2 = evaluateDeterministic('stock-trend', {})
  ok(r2.quad_hexagram && r2.quad_hexagram.hexes.hex_di, 'evaluateDeterministic 返回含 quad_hexagram')
  // 结构守卫：非 stock-trend 型 id（motor-design 'EM01C01'）→ 诚实降级为 null，不出退化卦
  const r3 = evaluateDeterministic('motor-design', {})
  ok(r3.quad_hexagram === null, `motor-design（7 字符 id）→ quad_hexagram=null 诚实降级（实际 ${r3.quad_hexagram === null ? 'null' : '非 null'}）`)
}

// ---- 7. 工具层透出（v0.7.1）：divine 紧凑摘要 + report 文本段 ----
{
  const { runYijingDivine } = await import('../tools/yijing/divine.mjs')
  const { runYijingReport } = await import('../tools/yijing/report.mjs')
  const out = await runYijingDivine({ matter: '测试事项', script: 'stock-trend', inputs: {} }, {})
  ok(out.quad_hexagram && out.quad_hexagram.hex_di && out.quad_hexagram.hex_ci,
    'divine 紧凑输出含 quad_hexagram 摘要（四卦名+阳数+tone）')
  ok(typeof out.quad_hexagram.text === 'string' && out.quad_hexagram.text.includes('【四连卦】'),
    'divine 紧凑输出 quad_hexagram.text 含四连卦总述')
  ok(out.quad_hexagram.hex_si && typeof out.quad_hexagram.hex_si.name === 'string',
    'divine 摘要含卦②子域位卦名')
  const rep = await runYijingReport({ matter: '测试事项', script: 'stock-trend', inputs: {} }, {})
  ok(rep.text.includes('【四连卦】'), 'yijing_report 报告文本含【四连卦】段')
  const repMotor = await runYijingReport({ matter: '测试事项', script: 'motor-design', inputs: {} }, {})
  ok(!repMotor.text.includes('【四连卦】'), 'motor-design 报告不出四连卦段（诚实降级）')
}

console.log(fail === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${fail})`)
process.exit(fail === 0 ? 0 : 1)
