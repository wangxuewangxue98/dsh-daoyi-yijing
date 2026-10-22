// v0.9.0 特性专项测试（对应改进方案 F-1 / F-2 / F-4 / F-5 / F-6 / F-7 / F-8 / F-9 / F-10）
//
// 依据：《道一易经-v0.8.0使用效果评价-实证核对与改进方案》九项问题的修复验收线。
// 原则：全部为**加法断言**——v0.8.x 的既有行为逐位不变，只验证新增口径与「不再崩溃」。
import { hexOrderOf, resolveQuadHexagram } from '../lib/yijing/quad-hexagram.mjs'
import { buildCheckpointDatabase, buildStockScript, applyStrongOverride } from '../lib/yijing/checkpoints.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { FAMILY_ORDER, FAMILY_LABELS, familyOfV2, assertV2FamilyCoverage } from '../lib/yijing/subfamily-map.mjs'
import { loadBaselines } from '../lib/yijing/baselines.mjs'
import { runMigration } from './migrate_hex_order.mjs'
import { buildKlineUrl, parseDailyKlines, daysToSnapshots, fetchDailyKlines } from '../adapters/quote-history.mjs'
import { runBatch } from './divine_batch_stocks.mjs'
import { mapLimit, promptsPerStock, estimateLlmBatch, renderEstimateTable } from '../lib/yijing/concurrency.mjs'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) { pass++; console.log('PASS ' + msg) } else { fail++; console.log('FAIL ' + msg) }
}
const section = (t) => console.log('\n── ' + t + ' ──')

const V2 = buildStockTrendV2Script()
const SCRIPT_384 = buildStockScript()
// 全阳的假 evaluations + 固定域分（判定分组结构用，值本身不影响结构断言）
const fakeAgg = (script) => ({
  domain_results: Object.fromEntries(script.domains.map((d, i) => [d.code, { score: 0.5 + i * 0.03 }])),
})
const allYangEvals = (db) => new Map(db.checkpoints.filter((c) => !c.na).map((c) => [c.id, { yinYang: 1 }]))

section('F-1 爻序形状容错：畸形 hex_order 不再崩溃（报告 E-1 / P0）')
{
  // 崩点复现场景：v2 剧本的 hex_order 被写成对象 {lower, upper}（0.7.0 接口形状）
  const broken = { ...V2, hex_order: { lower: ['JS', 'ZJ', 'XX'], upper: ['FX', 'JB', 'HY'] } }
  const ho = hexOrderOf(broken)
  ok(ho.status === 'fallback:domains', `对象形状 → status=fallback:domains（实际 ${ho.status}）`)
  ok(ho.order.length === 6, `恒返回 6 项爻序（实际 ${ho.order.length}）`)
  ok(ho.note.includes('形状不可用'), '降级原因写进 note（可审计，不静默）')

  const db = buildCheckpointDatabase(broken)
  let quad = null
  let threw = null
  try {
    quad = resolveQuadHexagram(db, allYangEvals(db), broken, null, fakeAgg(broken))
  } catch (e) {
    threw = e
  }
  ok(threw === null, `四卦推演不再抛错（v0.8.0 此处会 throw 'di 分组数 != 6: 4'；实际 ${threw ? threw.message : '无异常'}）`)
  ok(quad && quad.hexes.hex_di.groups.length === 6, `卦① 6 组（实际 ${quad ? quad.hexes.hex_di.groups.length : '—'}）`)
  ok(quad && quad.structure.hex_order.status === 'fallback:domains', 'structure 携带降级状态')
  ok(quad && quad.structure.degraded === false, '未补空位（能用 domains 声明序兜住）→ degraded=false')

  // 短数组（长度 <6）同样容错
  const short = { ...V2, hex_order: ['JS', 'ZJ'] }
  ok(hexOrderOf(short).status === 'fallback:domains', '短数组 → fallback:domains')
  // 声明序完好 → declared（零回归）
  ok(hexOrderOf(V2).status === 'declared', `正常声明序 → declared（实际 ${hexOrderOf(V2).status}）`)
  ok(hexOrderOf(V2).order.join(',') === 'JS,ZJ,XX,FX,JB,HY', 'declared 序 = JS,ZJ,XX,FX,JB,HY')
  // 384 无声明 → sancai（行为逐位不变）
  const ho384 = hexOrderOf(SCRIPT_384)
  ok(ho384.status === 'sancai' && ho384.order.join(',') === 'JS,ZJ,GZ,HG,HY,FX', `384 → sancai 切分（实际 ${ho384.order.join(',')}）`)
}

section('F-5 四卦阈值基准可配（报告 E-4）')
{
  const db = buildCheckpointDatabase(V2)
  const evals = allYangEvals(db)
  const agg = fakeAgg(V2)
  const qAbs = resolveQuadHexagram(db, evals, V2, null, agg, { thresholdBasis: 'absolute' })
  ok(qAbs.structure.threshold_basis === 'absolute', 'thresholdBasis=absolute 生效')
  const allHalf = ['hex_di', 'hex_si', 'hex_ci', 'hex_xi'].every((k) =>
    qAbs.hexes[k].groups.every((g) => g.threshold === 0.5),
  )
  ok(allHalf, 'absolute 口径下四卦所有分组阈值恒为 0.5（与单卦同源）')
  const bl = loadBaselines('stock-trend-v2')
  const qBase = resolveQuadHexagram(db, evals, V2, bl, agg, { thresholdBasis: 'baseline' })
  ok(qBase.structure.threshold_basis === 'baseline', 'thresholdBasis=baseline 生效（默认）')
  const fromBaseline = qBase.hexes.hex_ci.groups.some((g) => g.threshold !== 0.5)
  ok(fromBaseline, 'baseline 口径下阈值取自基线分位（非 0.5）')
  ok(Array.isArray(loadBaselines('stock-trend-v2').groups.ci ? Object.keys(loadBaselines('stock-trend-v2').groups.ci) : []), 'v2 基线含 ci 分组（P2 校准产物）')
}

section('F-9 v2 卦③语义分组开关（报告 E-7）')
{
  const db = buildCheckpointDatabase(V2)
  const evals = allYangEvals(db)
  const agg = fakeAgg(V2)
  const pos = resolveQuadHexagram(db, evals, V2, null, agg, { ciGrouping: 'position' })
  const sem = resolveQuadHexagram(db, evals, V2, null, agg, { ciGrouping: 'semantic' })
  ok(pos.structure.ci_grouping === 'position', '默认/显式 position')
  ok(sem.structure.ci_grouping === 'semantic', 'semantic 生效')
  ok(
    pos.hexes.hex_ci.groups.map((g) => g.key).join(',') === '1,2,3,4,5,6',
    `position → 键为子域位 1-6（实际 ${pos.hexes.hex_ci.groups.map((g) => g.key).join(',')}）`,
  )
  ok(
    sem.hexes.hex_ci.groups.map((g) => g.key).join(',') === FAMILY_ORDER.join(','),
    `semantic → 键为六业务族（实际 ${sem.hexes.hex_ci.groups.map((g) => g.key).join(',')}）`,
  )
  ok(
    sem.hexes.hex_ci.groups.every((g) => FAMILY_LABELS[g.key]),
    'semantic 分组带中文族名标签',
  )
  ok(sem.hexes.hex_ci.desc.includes('业务族'), 'semantic 的描述文本同步更新')
  // 36 分域映射自检：全部分域有族、六族非空
  const subs = []
  for (const d of V2.domains) for (let i = 1; i <= 6; i++) subs.push(`${d.code}${String(i).padStart(2, '0')}`)
  const cov = assertV2FamilyCoverage(subs)
  ok(cov.total === 36, `36 个分域全部有族（实际 ${cov.total}）`)
  ok(FAMILY_ORDER.every((f) => cov.counts[f] > 0), `六族均非空（counts=${JSON.stringify(cov.counts)}）`)
  ok(familyOfV2('JS01') === 'T' && familyOfV2('FX01') === 'R', `归类抽查：JS01→T 趋势 / FX01→R 风险（实际 ${familyOfV2('JS01')}/${familyOfV2('FX01')}）`)
  ok(familyOfV2('ZZ99') === null, '未收录分域 → null（不猜测归类）')
}

section('F-4 否决语义显式化（报告 E-3 + 骑墙 N-4）')
{
  ok(SCRIPT_384.veto_notes && SCRIPT_384.veto_notes.policy === 'proxy-exempt', '384 剧本带 veto_notes（policy=proxy-exempt）')
  ok(SCRIPT_384.veto_notes.exempt_count === 13, `384 豁免 13 个强度项（实际 ${SCRIPT_384.veto_notes.exempt_count}）`)
  ok(V2.veto_notes && V2.veto_notes.exempt_count === 12, `v2 豁免 12 个强度项（FX02/XX06 × 6 子域；实际 ${V2.veto_notes.exempt_count}）`)
  ok(String(V2.veto_notes.evidence).includes('60.7%'), 'veto_notes 含 v0.5.1 实测证据（否决率 5/56→34/56）')
  const countStrong = (script) =>
    script.domains.reduce((a, d) => a + d.subdomains.reduce((b, sd) => b + sd.checks.filter((c) => c.is_strong).length, 0), 0)
  const before = countStrong(V2)
  const after = countStrong(applyStrongOverride(V2))
  ok(before === 204, `现行为 v2 强关联 204 个（实际 ${before}）`)
  ok(after === 216, `include-proxies 覆盖后 216 个（补回 12 个代理项；实际 ${after}）`)
  ok(applyStrongOverride(V2).veto_override === 'include-proxies', '覆盖标记写进剧本（可审计）')
  ok(countStrong(applyStrongOverride(SCRIPT_384)) > countStrong(SCRIPT_384), '384 同样可被覆盖（A/B 复现旧口径）')
}

section('F-2 / F-3 / F-7 批量工具：四连卦透出 + 分层审计 + 动态版本 + v2')
{
  const outFile = join(tmpdir(), `batch_v090_${Date.now()}.json`)
  const out = await runBatch({
    stocks: [
      ['盛屯矿业', '600711', 9.26, -2.22, '有色金属', ''],
      ['三六零', '601360', 8.43, 1.81, '科技电子', ''],
      ['ST联光', '600363', 9.89, -3.79, '科技电子', 'ST'],
    ],
    script: 'stock-trend-v2',
    outFile,
  })
  ok(out.meta.script === 'stock-trend-v2', `batch 支持 1296 剧本（实际 ${out.meta.script}）`)
  ok(
    out.results.every((r) => r.quad_hexagram && r.quad_hexagram.hexes),
    `四连卦已透出到每条记录（原 0/56；实际 ${out.results.filter((r) => r.quad_hexagram).length}/${out.results.length}）`,
  )
  ok(out.quad_coverage.records_with_quad === out.results.length, 'quad_coverage 统计一致')
  ok(Object.keys(out.quad_kinds).length === 4, '四卦种类分布（①②③④）已汇总')
  ok(
    out.results.every((r) => typeof r.verdict_grade === 'string' && r.verdict_grade.length > 0),
    '每条记录带 verdict_grade（v0.8.1 分级）',
  )
  ok(
    out.results.every((r) => r.stratum_reason === 'unavailable:snapshot-no-cap' && r.stratum_used === false),
    '离线快照无总市值 → 分层诚实标注 unavailable（不伪造层）',
  )
  ok(
    out.results.every((r) => r.veto_score_conflict === (r.has_veto && r.overall_score >= 0.5)),
    '否决骑墙字段与判据一致（veto ∧ 分≥0.5）',
  )
  ok(typeof out.veto_borderline.rate === 'number', `骑墙率已汇总（rate=${out.veto_borderline.rate}）`)
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'))
  ok(out.meta.engine.includes(`v${pkg.version}`), `meta 版本串动态化（实际 ${out.meta.engine}）`)
  ok(!out.meta.engine.includes('v0.5.0'), '不再写死陈旧的 v0.5.0')
  ok(Array.isArray(out.meta.hex_encoding.in_hex_domains) && out.meta.hex_encoding.in_hex_domains.length === 6, 'v2 进卦域取 hex_order 六域')
}

section('F-6 多日滚动校准：历史日 K 适配层（报告 E-6）')
{
  ok(buildKlineUrl('600711', 5).includes('newfqkline'), `URL 用 newfqkline（fqkline 已被 WAF 拦截）：${buildKlineUrl('600711', 5)}`)
  ok(buildKlineUrl('600711', 5).includes('sh600711'), '代码归一为腾讯符号（sh600711）')
  const klines = parseDailyKlines({
    code: 0,
    data: { sh600711: { qfqday: [['2026-10-16', '10', '10.2', '10.3', '9.9', '1000'], ['2026-10-17', '10.2', '10.5', '10.6', '10.1', '1200']] } },
  })
  ok(klines.length === 2, `解析 2 根日 K（实际 ${klines.length}）`)
  ok(klines[0].pct === null, '首根无前收盘 → pct=null（不用 0 冒充）')
  ok(Math.abs(klines[1].pct - 2.94) < 0.01, `第二根 pct 正确（实际 ${klines[1].pct}%）`)
  const snaps = daysToSnapshots({ code: '600711', name: 'X', totalCap: 300 }, klines, 5)
  ok(snaps.length === 1, `可用快照 1 条（首根 pct=null 被丢弃；实际 ${snaps.length}）`)
  ok(snaps[0].history === true && snaps[0].date === '2026-10-17', '快照带日期与历史标记')
  // WAF/网关返回 HTML 时必须明确报错，不落到晦涩的 JSON 解析异常
  const htmlRes = await fetchDailyKlines('600711', { fetcher: async () => '<!DOCTYPE html><html>WAF</html>' })
  ok(htmlRes.error === 'non-json-response(waf/blocked)', `HTML 响应 → 明确错误（实际 ${htmlRes.error}）`)
  ok(htmlRes.days.length === 0, '失败时 days 为空（调用方只落实时快照）')
  const okRes = await fetchDailyKlines('600711', {
    fetcher: async () => JSON.stringify({ code: 0, data: { sh600711: { qfqday: [['2026-10-20', '9', '9.2', '9.3', '8.9', '1']] } } }),
  })
  ok(okRes.fetched === 1 && okRes.error === null, 'mock fetcher 正常路径可用（单测无需网络）')
}

section('F-8 canonical 爻序规范 + 历史卦象迁移（报告 E-2）')
{
  // 构造 3 条「历史日志」记录：域分 + 用字典序产出的卦名
  const records = [
    { code: 'A', domain_scores: { JS: 0.8, ZJ: 0.7, XX: 0.6, FX: 0.5, JB: 0.4, HY: 0.3, HG: 0.2, GZ: 0.1 } },
    { code: 'B', domain_scores: { JS: 0.2, ZJ: 0.3, XX: 0.4, FX: 0.5, JB: 0.6, HY: 0.7, HG: 0.8, GZ: 0.9 } },
    { code: 'C', domain_scores: { JS: 0.5, ZJ: 0.5, XX: 0.9, FX: 0.1, JB: 0.5, HY: 0.5, HG: 0.5, GZ: 0.5 } },
  ]
  const mig = runMigration({ records, from: 'dictionary', scriptId: 'stock-trend' })
  ok(mig.rows.length === 3, `迁移 3 条（实际 ${mig.rows.length}）`)
  ok(mig.canonical.status === 'sancai', `384 canonical = sancai 切分（实际 ${mig.canonical.status}）`)
  ok(mig.canonical.order.join(',') === 'JS,ZJ,GZ,HG,HY,FX', `canonical 序（实际 ${mig.canonical.order.join(',')}）`)
  // dictionary 旧序 = 「记录到的全部域码」排序取前 6（记录含 8 个域：JS/ZJ/XX/FX/JB/HY/HG/GZ）
  // 故期望值为 FX,GZ,HG,HY,JB,JS —— 由实现口径推导，避免手写常量与实现脱节
  const recordedCodes = Object.keys(records[0].domain_scores)
  const expectedOld = [...recordedCodes].sort().slice(0, 6).join(',')
  ok(mig.rows[0].old_order === expectedOld, `旧序=字典序前 6（期望 ${expectedOld}，实际 ${mig.rows[0].old_order}）`)
  ok(
    mig.rows.every((r) => typeof r.canonical_hex === 'string' && r.canonical_hex !== '未知'),
    'canonical 卦名可解析',
  )
  ok(typeof mig.summary.changed_to_canonical === 'string', `变更统计已产出：${mig.summary.changed_to_canonical}`)
  ok(mig.thresholds.source === 'fallback:absolute-0.5', '未记录阈值时诚实回落绝对 0.5 并标注')
}

section('F-10 LLM 批量补分：并发工具 + 成本估算（报告 E-9）')
{
  // prompt 口径必须与 llm-scoring.mjs 的构造一致：L2=6 域×1，L3=6 域×6 aspect
  ok(promptsPerStock('L2') === 6, `L2 = 6 问/只（实际 ${promptsPerStock('L2')}）`)
  ok(promptsPerStock('L3') === 36, `L3 = 36 问/只（实际 ${promptsPerStock('L3')}）`)
  ok(promptsPerStock('L3', { domains: 4, aspects: 3 }) === 12, '形状可配（4 域 × 3 aspect = 12）')

  // 耗时预算：总 prompt / 速率门，且与并发度无关（这是 E-9 的核心结论）
  const e56 = estimateLlmBatch({ level: 'L3', stocks: 56, perMinute: 10 })
  ok(e56.prompts === 2016, `56 只 L3 = 2016 问（实际 ${e56.prompts}）`)
  ok(Math.abs(e56.minutes - 201.6) < 0.01, `默认门 10/min → 201.6 分钟（实际 ${e56.minutes}）`)
  const eFast = estimateLlmBatch({ level: 'L3', stocks: 56, perMinute: 60 })
  ok(Math.abs(eFast.minutes - 33.6) < 0.01, `放宽到 60/min → 33.6 分钟（实际 ${eFast.minutes}）`)
  const eFree = estimateLlmBatch({ level: 'L3', stocks: 56, perMinute: 0 })
  ok(eFree.perMinute === 'Infinity' && eFree.minutes === 0, 'perMinute=0 → 不限速（不伪装成 0 分钟耗时）')
  ok(e56.note.includes('并发度提高不提升吞吐'), 'note 明写「并发不提升吞吐」（不误导使用者）')

  // 表格：行数=输入+表头+分隔；中文列宽按显示宽度对齐
  const tbl = renderEstimateTable([e56, eFast])
  const lines = tbl.split('\n')
  ok(lines.length === 4, `表格 4 行（表头+分隔+2 数据，实际 ${lines.length}）`)
  ok(lines[0].startsWith('| ') && lines[1].includes('---'), '含表头与分隔行')

  // mapLimit：顺序返回、单条失败不炸整批、非法 limit 退化为串行
  const items = [5, 1, 3, 2]
  const res = await mapLimit(items, 2, async (v) => {
    await new Promise((r) => setTimeout(r, v * 4))
    return v * 10
  })
  ok(res.map((r) => r.value).join(',') === '50,10,30,20', '结果按输入顺序返回（与完成顺序无关）')
  ok(res.every((r) => r.ok === true), '全部成功')

  const withErr = await mapLimit([1, 2, 3], 3, async (v) => {
    if (v === 2) throw new Error('boom')
    return v
  })
  ok(withErr.length === 3, `失败项也占位返回（长度 ${withErr.length}）`)
  ok(withErr[0].ok === true && withErr[0].value === 1, '失败不影响其他项成功')
  ok(withErr[1].ok === false && withErr[1].error instanceof Error, '失败项带 Error 对象（可重试判定）')

  const serial = await mapLimit([1, 2, 3], 0, async (v) => v)
  ok(serial.length === 3 && serial[0].value === 1, 'limit=0 → 退化为串行而非无限并发')

  // 空数组不应挂住
  const empty = await mapLimit([], 4, async (v) => v)
  ok(Array.isArray(empty) && empty.length === 0, '空输入安全返回')
}

console.log(`\n===== v0.9.0 特性专项: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail === 0 ? 0 : 1)
