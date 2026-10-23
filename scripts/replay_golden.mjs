// replay_golden.mjs — golden replay 版本回归门（v0.9.4 P1-4，治「版本迭代虚化」）
//
// 问题：v0.8.0 → v0.9.1 五路 53 只逐股完全同构（v2 汇总评价发现「核心评分零演化」），
//   同构只能在事后评价报告里被发现。本门把 54 只固定输入（v0.9.1 官方引擎轮B 实测注入信号，
//   逐股原样冻结于 golden_cases.json）在每次版本改动后重放，与快照逐股比对——
//   「本版本是否动了核心评分」必须在发布前显式回答（配合 CHANGELOG 模板声明）。
//
// 用法：
//   node scripts/replay_golden.mjs            # 断言模式：与快照比对，不一致 → 逐股列出差异并 exit 1
//   node scripts/replay_golden.mjs --update   # 更新模式：以当前引擎重算并写入快照
//                                             #   （只允许在 CHANGELOG 明确声明「核心评分变化」时使用）
//
// 重放链路（与 divine_batch_stocks.mjs 在线模式同构）：
//   signals → signalsToInputsV2(migrationMap+FINE_MAP) → s.na 标注 → evaluate(baseline 口径)
//   → 8 宫分 → 批次 quantileThresholds → resolveHexagramForScript
// 不含：quoteToSignals（行情不可复现；golden 信号已是最终形态）、分层（需真实市值）。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { quantileThresholds, resolveHexagramForScript } from '../lib/yijing/hexagram.mjs'
import { signalsToInputsV2 } from '../adapters/stock-inputs.mjs'
import { FINE_MAP } from '../lib/yijing/subdomain-fine-map.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CASES_PATH = join(HERE, 'golden_cases.json')
const SNAPSHOT_PATH = join(HERE, 'golden_snapshot.json')
const r4 = (x) => Number(Number(x).toFixed(4))

export async function runReplayGolden() {
  const golden = JSON.parse(readFileSync(CASES_PATH, 'utf8'))
  const script = buildStockTrendV2Script()
  const db = buildCheckpointDatabase(script)
  const migrationMap = script.migrated_from ? script.migrated_from.mapping : {}

  // 阶段 1：逐只重放（与 batch 同构：inputs → s.na → evaluate → 8 宫分）
  const pending = []
  for (const c of golden.cases) {
    const matter = `${c.name}(${c.code}) golden replay`
    const built = signalsToInputsV2(c.signals, db, migrationMap, FINE_MAP)
    const s = buildStockTrendV2Script()
    s.na = { domains: [], checkpoints: built.naIds }
    const r = await evaluate(matter, s, { inputs: built.inputs, thresholdBasis: 'baseline' })
    const scores8 = {}
    for (const d of s.domains) scores8[d.code] = r.domain_results[d.code]?.score ?? 0.5
    pending.push({ name: c.name, code: c.code, r, s, scores8 })
  }

  // 阶段 2：批次分位数 → 卦象（与 batch 一致，满熵编码）
  const qt = quantileThresholds(pending.map((p) => p.scores8))
  const results = pending.map((p) => ({
    name: p.name,
    code: p.code,
    verdict: p.r.verdict,
    verdict_grade: p.r.verdict_grade,
    overall_score: r4(p.r.overall_score),
    has_veto: p.r.has_veto,
    hexagram: resolveHexagramForScript(p.scores8, p.s, qt.thresholds).name,
    domain_scores: Object.fromEntries(Object.entries(p.scores8).map(([k, v]) => [k, r4(v)])),
    coverage: r4(p.r.coverage.coverage),
  }))

  const summary = {
    n: results.length,
    verdict_dist: results.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {}),
    veto_n: results.filter((r) => r.has_veto).length,
  }
  return { results, summary }
}

function diffSnapshot(cur, snap) {
  const diffs = []
  const snapByName = new Map(snap.results.map((r) => [r.name, r]))
  for (const r of cur.results) {
    const o = snapByName.get(r.name)
    if (!o) {
      diffs.push(`${r.name}: 快照缺失该股（用例集变更？）`)
      continue
    }
    for (const k of ['verdict', 'verdict_grade', 'overall_score', 'has_veto', 'hexagram', 'coverage']) {
      if (JSON.stringify(r[k]) !== JSON.stringify(o[k])) diffs.push(`${r.name}.${k}: ${o[k]} → ${r[k]}`)
    }
    for (const k of Object.keys(r.domain_scores)) {
      if (r.domain_scores[k] !== o.domain_scores?.[k])
        diffs.push(`${r.name}.domain_scores.${k}: ${o.domain_scores?.[k]} → ${r.domain_scores[k]}`)
    }
  }
  for (const o of snap.results) {
    if (!cur.results.some((r) => r.name === o.name)) diffs.push(`${o.name}: 当前用例集不含该股`)
  }
  if (JSON.stringify(cur.summary) !== JSON.stringify(snap.summary)) {
    diffs.push(`summary: ${JSON.stringify(snap.summary)} → ${JSON.stringify(cur.summary)}`)
  }
  return diffs
}

const isMain = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
if (isMain) {
  const update = process.argv.includes('--update')
  const { results, summary } = await runReplayGolden()
  if (update) {
    writeFileSync(
      SNAPSHOT_PATH,
      JSON.stringify({ _meta: { note: 'golden replay 快照：更新必须同步 CHANGELOG「核心评分是否变化」声明' }, summary, results }, null, 2),
    )
    console.log(`[update] 快照已写入 ${SNAPSHOT_PATH}`)
    console.log('summary:', JSON.stringify(summary))
  } else {
    let snap = null
    try {
      snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    } catch {
      console.error('未找到快照，请先 --update 生成基线')
      process.exit(2)
    }
    const diffs = diffSnapshot({ results, summary }, snap)
    if (diffs.length === 0) {
      console.log(`GOLDEN REPLAY: PASS（${summary.n} 只逐股一致；verdict 分布 ${JSON.stringify(summary.verdict_dist)}；否决 ${summary.veto_n}）`)
    } else {
      console.error(`GOLDEN REPLAY: FAIL（${diffs.length} 处差异）`)
      for (const d of diffs.slice(0, 40)) console.error('  -', d)
      if (diffs.length > 40) console.error(`  ... 其余 ${diffs.length - 40} 处省略`)
      process.exit(1)
    }
  }
}
