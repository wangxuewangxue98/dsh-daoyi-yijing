// test_v092_features.mjs — v0.9.2 专项：P0 工具描述首句反向委托摘要 / P1 降级结构化 next_action
import { runYijingDivine, TOOL_DESCRIPTION } from '../tools/yijing/divine.mjs'

let pass = 0
let fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log(`PASS ${msg}`)
  } else {
    fail++
    console.log(`FAIL ${msg}`)
  }
}
const section = (t) => console.log(`\n── ${t} ──`)

// ══════════ P0：工具描述首句即反向委托摘要 ═══════════
section('P0 yijing_divine 描述首句 = 反向委托摘要（无需 API Key）')
{
  ok(typeof TOOL_DESCRIPTION === 'string' && TOOL_DESCRIPTION.length > 0, 'TOOL_DESCRIPTION 为字符串且非空')
  // 首句必须以反向委托摘要开头（工具 schema 是插件与对话模型唯一共享面）
  ok(
    TOOL_DESCRIPTION.startsWith('可调 yijing_factor_prompt'),
    `首句以「可调 yijing_factor_prompt」开头（实际首 20 字：${TOOL_DESCRIPTION.slice(0, 20)}…）`,
  )
  ok(
    /yijing_factor_prompt/.test(TOOL_DESCRIPTION) && /无需 API Key/.test(TOOL_DESCRIPTION) && /inputs 回传/.test(TOOL_DESCRIPTION),
    '描述含 反向委托三要素：yijing_factor_prompt / 无需 API Key / inputs 回传',
  )
}

// ══════════ P1：降级返回带结构化 next_action ═══════════
section('P1 降级（无输入 / 覆盖<50% / LLM 补分降级）→ next_action:{reason,remedy}')

// 场景 A：motor-design 无 inputs → inputsSource='none' → degraded=true
const a = await runYijingDivine({ matter: '我要不要接这个 200kW 电机外包项目？', script: 'motor-design' }, {})
ok(a.degraded === true, `A 无输入 → degraded=true（实际 ${a.degraded}）`)
ok(a.next_action && typeof a.next_action.reason === 'string' && a.next_action.reason.length > 0, 'A next_action.reason 为字符串非空')
ok(
  a.next_action && a.next_action.remedy && a.next_action.remedy.tool === 'yijing_factor_prompt',
  `A next_action.remedy.tool === 'yijing_factor_prompt'（实际 ${a.next_action && a.next_action.remedy && a.next_action.remedy.tool}）`,
)
ok(
  a.next_action && a.next_action.remedy && a.next_action.remedy.args && a.next_action.remedy.args.script === 'motor-design',
  'A next_action.remedy.args.script === 本次 script',
)

// 场景 B：motor-design 八宫全填 → coverage=1.0 → degraded=false → 不应有 next_action
const fullInputs = { EM: 0.6, TH: 0.6, ME: 0.6, MT: 0.6, EF: 0.6, COST: 0.6, MANU: 0.6, RELIAB: 0.6 }
const b = await runYijingDivine(
  { matter: '我要不要接这个 200kW 电机外包项目？', script: 'motor-design', inputs: fullInputs },
  {},
)
ok(b.degraded === false, `B 八宫全填 → degraded=false（实际 ${b.degraded}）`)
ok(!b.next_action, 'B 非降级 → 无 next_action')

// 场景 C：stock-trend 无 symbols/inputs → 降级带 next_action（reason 提无输入或行情失败）
const c = await runYijingDivine({ matter: '研判某股票本周涨跌', script: 'stock-trend' }, {})
ok(c.degraded === true, `C stock-trend 无代码 → degraded=true（实际 ${c.degraded}）`)
ok(c.next_action && c.next_action.remedy && c.next_action.remedy.tool === 'yijing_factor_prompt', 'C 降级 next_action 指向 yijing_factor_prompt')

// ══════════ 断言汇总 ═══════════
console.log(`\n══ ${pass} PASS / ${fail} FAIL ══`)
process.exit(fail ? 1 : 0)
