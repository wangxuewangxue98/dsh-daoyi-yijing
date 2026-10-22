// test_stock_trend_v2.mjs — 1296 四层剧本结构断言（阶段 2 / S1，v0.8.0）
// 对齐附件 42 条结构断言在本仓库重写；同时守护「384 旧剧本零触」。
import {
  buildStockScript,
  buildCheckpointDatabase,
  getBuiltinScript,
  listBuiltinScripts,
} from '../lib/yijing/checkpoints.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { aggregate } from '../lib/yijing/aggregator.mjs'
import { parseCp, structureModeOf, resolveQuadHexagram, quadText } from '../lib/yijing/quad-hexagram.mjs'
import { buildOrderFromScript } from '../lib/yijing/hexagram.mjs'

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

const v2 = buildStockTrendV2Script()
const db = buildCheckpointDatabase(v2)
const ids = db.checkpoints.map((c) => c.id)

console.log('== 1. 总量与编号 ==')
ok(db.checkpoints.length === 1296, `检查点总数 1296（实际 ${db.checkpoints.length}）`)
ok(new Set(ids).size === 1296, 'id 全局唯一')
ok(ids.every((id) => /^[A-Z]{2}\d{6}$/.test(id)), '全部 id 为 域(2)+分域位(2)+子域位(2)+aspect位(2) 8 位形态')
ok(ids.every((id) => ['JB', 'HY', 'JS', 'ZJ', 'XX', 'FX'].includes(id.slice(0, 2))), '域码均属六域')
ok(
  ids.every((id) => {
    const p = parseCp(id)
    return p.si >= 1 && p.si <= 6 && p.ci >= 1 && p.ci <= 6 && p.xi >= 1 && p.xi <= 6
  }),
  '分域位/子域位/aspect位 全部在 1-6（全 6 进制）',
)

console.log('== 2. 分层计数 ==')
const perDomain = {}
for (const c of db.checkpoints) perDomain[c.domain] = (perDomain[c.domain] || 0) + 1
ok(Object.keys(perDomain).length === 6 && Object.values(perDomain).every((n) => n === 216), '每域 216 检查点（6 分域×6 子域×6 aspect）')
ok(db.subdomainIndex && Object.keys(db.subdomainIndex).length === 216, `引擎子域层 = 216 子域（实际 ${Object.keys(db.subdomainIndex).length}）`)
const strongIds = db.checkpoints.filter((c) => c.is_strong).map((c) => c.id)
ok(strongIds.length === 204, `is_strong = 216−12（FX02/XX06 代理豁免，实际 ${strongIds.length}）`)
ok(strongIds.every((id) => id.slice(6, 8) === '01'), '强关联均为 aspect 位 1（强度项）')
ok(strongIds.every((id) => !['FX02', 'XX06'].includes(id.slice(0, 4))), 'FX02/XX06 无强关联（代理豁免生效）')

console.log('== 3. 四刀切分（每组互斥、并集=全集、6 组×216）==')
for (const [dim, slice] of [['di', (id) => id.slice(0, 2)], ['si', (id) => id.slice(2, 4)], ['ci', (id) => id.slice(4, 6)], ['xi', (id) => id.slice(6, 8)]]) {
  const groups = new Map()
  for (const id of ids) {
    const k = slice(id)
    if (!groups.has(k)) groups.set(k, new Set())
    groups.get(k).add(id)
  }
  const sizes = [...groups.values()].map((s) => s.size)
  const union = new Set([...groups.values()].flatMap((s) => [...s]))
  ok(groups.size === 6 && sizes.every((n) => n === 216), `${dim} 刀 6 组×216（实际 ${groups.size} 组，size=${[...new Set(sizes)]}）`)
  ok(union.size === 1296, `${dim} 刀组内互斥且并集=全集`)
}

console.log('== 4. 爻序 / 三才 / 否决门 ==')
ok(JSON.stringify(v2.hex_order) === JSON.stringify(['JS', 'ZJ', 'XX', 'FX', 'JB', 'HY']), 'hex_order = JS/ZJ/XX/FX/JB/HY（六域全进卦）')
ok(new Set(v2.hex_order).size === 6, 'hex_order 无重复')
ok(
  v2.yao_semantics.every((y, i) => y.domain === v2.hex_order[i] && y.pos === i + 1),
  'yao_semantics 与 hex_order 逐位一致',
)
const sm = v2.sancai_mapping
ok(sm.tian.length === 2 && sm.di.length === 2 && sm.ren.length === 2, '三才 2/2/2')
ok(
  [...sm.tian, ...sm.di, ...sm.ren].every((c) => v2.hex_order.includes(c)) && new Set([...sm.tian, ...sm.di, ...sm.ren]).size === 6,
  '三才覆盖全部六域',
)
ok(v2.veto && v2.veto.mode === 'whiteList' && JSON.stringify(v2.veto.domains) === JSON.stringify(['FX', 'XX']) && v2.veto.minCount === 1, '否决门白名单 FX/XX minCount 1')

console.log('== 5. 迁移映射（64/64）==')
const map = v2.migrated_from.mapping
ok(Object.keys(map).length === 64, `迁移表 64 条（实际 ${Object.keys(map).length}）`)
const validTargets = new Set()
for (const d of v2.domains) for (let s = 1; s <= 6; s++) validTargets.add(`${d.code}${String(s).padStart(2, '0')}`)
ok(Object.values(map).every((t) => validTargets.has(t)), '迁移目标全部属新 36 分域')
ok(new Set(Object.values(map)).size === 36, '迁移目标覆盖全部 36 分域')
// 与旧剧本 64 子域对账
const old = buildStockScript()
const oldSubCodes = new Set()
for (const d of old.domains) for (let s = 1; s <= 8; s++) oldSubCodes.add(`${d.code}${String(s).padStart(2, '0')}`)
ok(
  [...oldSubCodes].every((c) => map[c]),
  '旧 384 每个子域都有迁移目标（64/64）',
)

console.log('== 6. 注册与 384 零触 ==')
ok(Boolean(getBuiltinScript('stock-trend-v2')), 'stock-trend-v2 已注册')
ok(listBuiltinScripts().some((s) => s.script_id === 'stock-trend-v2'), 'listBuiltinScripts 含 v2')
const oldDb = buildCheckpointDatabase(old)
ok(oldDb.checkpoints.length === 384, '旧 stock-trend 仍 384 检查点')
ok(oldDb.checkpoints.every((c) => /^[A-Z]{2}\d{4}$/.test(c.id)), '旧 id 仍 6 位形态')
ok(parseCp('JS0104').di === 'JS' && parseCp('JS0104').si === 1 && parseCp('JS0104').ci === 4, 'parseCp 旧 6 位口径不变')
// 384 单卦 order 不受 hex_order 影响（旧剧本无该字段）
ok(!('hex_order' in old), '旧剧本无 hex_order 字段')

console.log('== 7. 1296 聚合冒烟（合成 evals）==')
{
  const evals = new Map()
  for (const c of db.checkpoints) {
    if (c.na) continue
    evals.set(c.id, { value: 0.6, yinYang: 1, pass: true, origin: 'test' })
  }
  const agg = aggregate(db, evals)
  ok(agg.domain_results && Object.keys(agg.domain_results).length === 6, '1296 聚合产出 6 域分')
  ok(agg.verdict != null, `1296 聚合产出 verdict（${agg.verdict}）`)
}

console.log('== 8. S2 四连卦泛化（合成数据四刀 + 384 逐位回归）==')
{
  // 8 位 id 解析
  const p = parseCp('JS010203')
  ok(p.di === 'JS' && p.si === 1 && p.ci === 2 && p.xi === 3, `parseCp 8 位口径 {di,si,ci,xi}（实际 ${JSON.stringify(p)}）`)
  ok(structureModeOf('JS010203') === 'v2', 'structureModeOf 8 位 → v2')
  ok(structureModeOf('JS0104') === 'legacy', 'structureModeOf 6 位 → legacy')
  ok(structureModeOf('EM01C01') === null, 'structureModeOf 异形 id → null（结构守卫）')

  // 合成 evals：多数决公式（单组 evals 驱动四刀的差异化——si≤3 / ci偶 / xi奇 三项取多数）
  const evals = new Map()
  for (const c of db.checkpoints) {
    if (c.na) continue
    const pp = parseCp(c.id)
    const A = pp.si <= 3
    const B = pp.ci % 2 === 0
    const C = pp.xi % 2 === 1
    const yang = (A ? 1 : 0) + (B ? 1 : 0) + (C ? 1 : 0) >= 2 ? 1 : -1
    evals.set(c.id, { value: yang === 1 ? 0.8 : 0.2, yinYang: yang, pass: true, origin: 'test' })
  }
  const agg = aggregate(db, evals)
  const quad = resolveQuadHexagram(db, evals, v2, null, agg)
  ok(Boolean(quad), '1296 resolveQuadHexagram 非 null')
  ok(quad.structure.mode === 'v2' && quad.structure.checks === 1296, `structure = v2/1296（实际 ${quad.structure.mode}/${quad.structure.checks}）`)
  const names = ['hex_di', 'hex_si', 'hex_ci', 'hex_xi'].map((k) => quad.hexes[k].name)
  ok(new Set(names).size >= 3, `四刀卦象互异（合成差异化数据，实际 ${names.join('/')}）`)
  ok(quad.hexes.hex_di.groups.map((g) => g.key).join(',') === 'JS,ZJ,XX,FX,JB,HY', '卦①爻序 = hex_order')
  ok(quad.hexes.hex_si.yaos.join('') === '111000', `卦②爻型 = si 位 1-3 阳（实际 ${quad.hexes.hex_si.yaos.join('')}）`)
  ok(quad.hexes.hex_ci.yaos.join('') === '010101', `卦③爻型 = ci 位偶数阳（实际 ${quad.hexes.hex_ci.yaos.join('')}）`)
  ok(quad.hexes.hex_xi.yaos.join('') === '101010', `卦④爻型 = xi 位奇数阳（实际 ${quad.hexes.hex_xi.yaos.join('')}）`)
  ok(quadText(quad).includes('1296 检查点'), 'quadText 结构自适应（1296）')

  // 384 逐位回归：legacy 模式四卦与 v0.7.2 行为一致（golden）
  const oldDb = buildCheckpointDatabase(old)
  const oldEvals = new Map()
  for (const c of oldDb.checkpoints) {
    if (c.na) continue
    oldEvals.set(c.id, { value: 0.7, yinYang: 1, pass: true, origin: 'test' })
  }
  const oldAgg = aggregate(oldDb, oldEvals)
  const oldQuad = resolveQuadHexagram(oldDb, oldEvals, old, null, oldAgg)
  ok(oldQuad && oldQuad.structure.mode === 'legacy', '384 resolveQuadHexagram 仍 legacy 模式')
  ok(
    ['hex_di', 'hex_si', 'hex_ci', 'hex_xi'].map((k) => oldQuad.hexes[k].name).join(',') === '乾为天,乾为天,乾为天,乾为天',
    '384 四卦 golden 不变（全阳合成 → 四卦皆乾）',
  )
  // 旧剧本 order 不受 hex_order 逻辑影响
  const o = buildOrderFromScript(old)
  ok(o.lower.join(',') === 'JS,ZJ,GZ' && o.upper.join(',') === 'HG,HY,FX', '384 buildOrderFromScript 逐位不变')
  const ov = buildOrderFromScript(v2)
  ok(ov.lower.join(',') === 'JS,ZJ,XX' && ov.upper.join(',') === 'FX,JB,HY', '1296 buildOrderFromScript 走 hex_order')
}

console.log(fail === 0 ? `\nRESULT: PASS (${pass})` : `\nRESULT: FAIL (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
