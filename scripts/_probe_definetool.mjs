// _probe_definetool.mjs — 真实 @deepseek-ai/dsh-tools defineTool 编译器 schema 校验（v0.3.4）
// 目的：注册全部 5 个工具并端到端直调 execute，schema 不合规（如联合数组 type:['string','object']）
// 或 execute 漏 await async 纯函数（0.3.3 report.mjs / 本次 divine.mjs 同类事故）都会在此现形。
//
// 依赖准备（node_modules/@deepseek-ai/dsh-tools 及其 peer 树，.gitignore 已忽略 node_modules/）：
//   1) 临时工程：mkdir /tmp/dshprobe && cd /tmp/dshprobe
//      package.json = {"name":"dshprobe","private":true,"type":"module",
//                      "dependencies":{"@deepseek-ai/dsh-tools":"0.0.1-rc.1"}}
//   2) 循环补依赖：node -e "import('@deepseek-ai/dsh-tools')" 报 Cannot find package X →
//      把 X 加进 package.json dependencies 后 npm install --legacy-peer-deps，直至 import 成功
//      （实测需补 dsh-scope/cordis/dsh-llm/dsh-timeout/dsh-session 五个 peer）。
//   3) cp -r /tmp/dshprobe/node_modules <插件根>/  后运行本脚本。
import { registerYijingTools, YIJING_TOOL_NAMES } from '../tools/yijing/index.mjs'

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) {
    pass++
    console.log('  PASS', msg)
  } else {
    fail++
    console.error('  FAIL', msg)
  }
}

const registered = []
const ctx = {
  tools: { register: (t) => registered.push(t) },
  logger: { info: () => {} },
}

let threw = null
try {
  await registerYijingTools(ctx, {
    defaultScript: 'motor-design',
    reportStyle: 'classic',
    freeQuotaEnabled: true,
    freeLlmDailyLimit: 20,
    cloudModelProvider: 'deepseek',
  })
} catch (e) {
  threw = e
}

assert(threw === null, `defineTool 编译无异常${threw ? `：${threw.message}` : ''}`)
assert(registered.length === YIJING_TOOL_NAMES.length, `注册工具数 = ${YIJING_TOOL_NAMES.length}（实际 ${registered.length}）`)

for (const name of YIJING_TOOL_NAMES) {
  const t = registered.find((r) => r.name === name)
  assert(!!t, `工具 ${name} 已注册`)
  if (!t) continue
  assert(typeof t.description === 'string' && t.description.length > 0, `工具 ${name} 有 description`)
  assert(t.parameters && typeof t.parameters === 'object', `工具 ${name} 有 parameters`)
  assert(typeof t.execute === 'function', `工具 ${name} 有 execute`)
  assert(!!t.output && typeof t.output.render === 'function', `工具 ${name} 有 output.render`)
}

// 关键 schema 断言（defineTool 归一化后：{type:'object', properties:{...}, required:[...]}）
const divine = registered.find((r) => r.name === 'yijing_divine')
assert(divine && Array.isArray(divine.parameters.required) && divine.parameters.required.includes('matter'), 'yijing_divine.matter required=true（归一化进 required 数组）')
assert(
  divine && divine.parameters.properties.script && Array.isArray(divine.parameters.properties.script.oneOf),
  'yijing_divine.script oneOf（联合类型合规形态）',
)
assert(divine && divine.parameters.properties.model && divine.parameters.properties.model.type === 'string', 'yijing_divine.model type=string（v0.3.4 新增）')
assert(divine && !divine.parameters.required.includes('model'), 'yijing_divine.model 非必选')

const report = registered.find((r) => r.name === 'yijing_report')
assert(report && report.parameters.properties.model && report.parameters.properties.model.type === 'string', 'yijing_report.model type=string（v0.3.4 新增）')

const modelList = registered.find((r) => r.name === 'yijing_model_list')
assert(modelList && modelList.parameters && modelList.parameters.type === 'object', 'yijing_model_list parameters 为对象（v0.3.4 新增工具）')

// ── execute 端到端：真实 defineTool 返回对象上直调（防 Promise 未 await 类事故）──
const execOut = {}
for (const t of registered) {
  try {
    execOut[t.name] = String(await t.execute(t.name === 'yijing_divine' || t.name === 'yijing_report' ? { matter: 'execute 探针：是否承接外包' } : {}))
  } catch (e) {
    execOut[t.name] = 'THROW: ' + (e && e.message)
  }
}
for (const [name, out] of Object.entries(execOut)) {
  assert(out.length > 2 && out !== '{}' && !out.startsWith('THROW'), `工具 ${name} execute 端到端有真实输出（${out.length} 字符）`)
}
{
  const d = JSON.parse(execOut.yijing_divine)
  assert(typeof d.verdict === 'string', 'yijing_divine execute 输出含 verdict')
  assert(d.llm && typeof d.llm.quota === 'string', 'yijing_divine execute 输出含 llm 额度信息（v0.3.4）')
  const m = JSON.parse(execOut.yijing_model_list)
  assert(Array.isArray(m.models) && m.models.some((x) => x.id === 'session'), 'yijing_model_list execute 输出含 session 模型')
  assert(m.quota && typeof m.quota.limit === 'number', 'yijing_model_list execute 输出含额度快照')
}

console.log(`\n===== DEFINE-TOOL SCHEMA PROBE: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail ? 1 : 0)
