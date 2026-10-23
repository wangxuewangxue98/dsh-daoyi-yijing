// test_v093_features.mjs — v0.9.3 两个高危边界缺陷修复专项测试
// 缺陷①：宫级自评 0.5 边界——>0.5 严格判定改为 ≥0.5（与 factor_prompt「0.5 判阳边界」对齐）
// 缺陷②：零有效输入（provided===0）→ 风险厌恶口径，verdict 不得伪装为「可行」
import { judgeYinYang, inputsCoverage } from '../lib/yijing/mapping.mjs'
import {
  evaluate,
  evaluateDeterministic,
  applyInsufficientDataOverride,
} from '../lib/yijing/reviewer.mjs'
import { getBuiltinScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { runYijingDivine } from '../tools/yijing/divine.mjs'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) {
    pass++
    console.log(`PASS  ${msg}`)
  } else {
    fail++
    console.log(`FAIL  ${msg}`)
  }
}

const md = getBuiltinScript('motor-design')
const db = buildCheckpointDatabase(md)
const engCp = db.checkpoints.find((c) => !c.na && c.threshold_type === 'range')

// ── 缺陷①：0.5 边界语义 ──
ok(judgeYinYang(engCp, 0.5, 'domain') === 1, '缺陷① 宫级恰好 0.5 → 阳（与 factor_prompt「0.5 判阳边界」一致）')
ok(judgeYinYang(engCp, 0.50001, 'domain') === 1, '缺陷① 宫级略高于 0.5 → 阳')
ok(judgeYinYang(engCp, 0.49, 'domain') === -1, '缺陷① 宫级 0.49 → 阴（中性以下仍算不利）')
ok(judgeYinYang(engCp, null, 'domain') === -1, '缺陷① 宫级 null（缺值兜底前）→ 阴')

// 端到端：8 宫全填 0.5（恰好中性边界）→ 真实输入（domain 粒度、覆盖全部活跃点）、全阳 → verdict 可行
{
  const inputs = { EM: 0.5, TH: 0.5, ME: 0.5, MT: 0.5, EF: 0.5, COST: 0.5, MANU: 0.5, RELIAB: 0.5 }
  const r = evaluateDeterministic(md, { inputs })
  ok(r.inputs_coverage.granularity === 'domain', `全 0.5 宫级输入 → domain 粒度（实际 ${r.inputs_coverage.granularity}）`)
  ok(r.inputs_coverage.coverage > 0.5, `全 0.5 宫级输入 → 覆盖全部活跃点（实际 ${(r.inputs_coverage.coverage * 100).toFixed(0)}%）`)
  ok(r.verdict === '可行', `全 0.5（恰好边界，全阳）→ verdict 可行（实际 ${r.verdict}）`)
  ok(r.verdict_insufficient_data !== true, '全 0.5 为真实输入，不触发数据不足覆盖')
}

// 端到端对照：8 宫全填 0.45（中性偏下）→ 全阴 → verdict 不可行（确认 0.49 以下仍判阴）
{
  const inputs = { EM: 0.45, TH: 0.45, ME: 0.45, MT: 0.45, EF: 0.45, COST: 0.45, MANU: 0.45, RELIAB: 0.45 }
  const r = evaluateDeterministic(md, { inputs })
  ok(r.verdict === '不可行', `全 0.45（全阴）→ verdict 不可行（实际 ${r.verdict}）`)
}

// ── 缺陷②：零有效输入 → 风险厌恶口径 ──
ok(
  applyInsufficientDataOverride({ verdict: '可行', overall_score: 1, risk_level: '低' }, { provided: 0 }, undefined)
    .verdict === '不可行',
  '缺陷② 守卫：provided=0 → verdict 强制为不可行',
)
ok(
  applyInsufficientDataOverride({ verdict: '可行' }, { provided: 5 }, undefined).verdict === '可行',
  '缺陷② 守卫：provided>0（部分输入）→ 不覆盖原 verdict',
)
ok(
  applyInsufficientDataOverride({ verdict: '可行', overall_score: 1 }, { provided: 0 }, undefined)
    .overall_score === 0,
  '缺陷② 守卫：provided=0 → 综合分强制为 0（不伪装满分）',
)

// 引擎层：evaluate 零输入 → 不可行（数据不足）
{
  const r = await evaluate('测试事项', 'motor-design', {})
  ok(r.verdict === '不可行', `缺陷② evaluate 零输入 → 不可行（实际 ${r.verdict}）`)
  ok(r.verdict_insufficient_data === true, '缺陷② evaluate 零输入 → verdict_insufficient_data=true')
  ok(r.overall_score === 0, `缺陷② evaluate 零输入 → overall_score=0（实际 ${r.overall_score}）`)
  ok(r.risk_level === '高', `缺陷② evaluate 零输入 → risk=高（实际 ${r.risk_level}）`)
}

// 引擎层：部分输入（coverage>0）→ 不触发覆盖（仍是常规判定）
{
  const r = await evaluate('测试事项', 'motor-design', { inputs: { EM: 0.8, TH: 0.7 } })
  ok(r.inputs_coverage.granularity === 'domain' && r.inputs_coverage.provided > 0, `部分输入 → domain 粒度、provided>0（实际 ${r.inputs_coverage.provided}）`)
  ok(r.verdict_insufficient_data !== true, '部分输入 → 不标记 verdict_insufficient_data')
}

// 工具层：runYijingDivine 零输入（无 inputs 无 symbols）→ verdict 不可行 + degraded + next_action
{
  const out = await runYijingDivine({ matter: '测试事项', script: 'motor-design' })
  ok(out.verdict === '不可行', `缺陷② 工具零输入 → verdict 不可行（实际 ${out.verdict}）`)
  ok(out.degraded === true, '缺陷② 工具零输入 → degraded=true')
  ok(out.verdict_insufficient_data === true, '缺陷② 工具零输入 → verdict_insufficient_data=true')
  ok(out.next_action && out.next_action.remedy && out.next_action.remedy.tool === 'yijing_factor_prompt', '缺陷② 工具零输入 → next_action.remedy 指向 yijing_factor_prompt（引导回填）')
}

// 工具层：runYijingDivine 全 0.5 宫级输入 → verdict 可行（确认缺陷①在工具链路生效，且非数据不足）
{
  const out = await runYijingDivine({
    matter: '测试事项',
    script: 'motor-design',
    inputs: { EM: 0.5, TH: 0.5, ME: 0.5, MT: 0.5, EF: 0.5, COST: 0.5, MANU: 0.5, RELIAB: 0.5 },
  })
  ok(out.verdict === '可行', `缺陷① 工具全 0.5 → verdict 可行（实际 ${out.verdict}）`)
  ok(out.verdict_insufficient_data !== true, '缺陷① 工具全 0.5 → 非数据不足')
}

console.log(`\n== v0.9.3 专项测试：${pass} PASS / ${fail} FAIL ==`)
if (fail > 0) process.exit(1)
