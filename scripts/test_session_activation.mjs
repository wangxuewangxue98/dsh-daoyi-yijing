// 会话模型（session LLM）激活与透传专项测试（v0.9.0）
//
// 背景（用户报「session LLM 层需激活」）：
//   ① 透传缺陷：apply() 只读 config.sessionModel，Runtime 若经 ctx.sessionModel / ctx.llm.sessionModel
//      注入则静默丢失，会话层不激活且无任何告警。
//   ② 激活缺陷：Config schema 的 cloudModelEnabled 默认 false（schemastery 会填进 config），
//      而 resolveCloudSettings 的自动会话分支用 `cloudModelEnabled !== false` 判启用 →
//      默认配置下恒为 false → 文档承诺的「无需手动开 cloudModelEnabled」失效，
//      用户侧表现为：L1 分解 / 卦象文案 / LLM 补分全部走离线模板，拿不到任何 LLM 推理补充。
// 本测试用桩会话模型模拟 DSH Runtime 注入，验证透传、激活与「LLM 推理补充」三件事。
import { resolveSessionInjection, buildSessionCloudConfig, resolveCloudSettings, configureCloudModel, safeContextService, providerAllowsSessionTakeover } from '../lib/yijing/cloud-model.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { runLlmScoring, buildEvidencePack } from '../lib/yijing/llm-scoring.mjs'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) { pass++; console.log('PASS ' + msg) } else { fail++; console.log('FAIL ' + msg) }
}
const section = (t) => console.log('\n── ' + t + ' ──')

// 清理环境，避免外部 env 干扰
const SAVED = {}
const ENV_KEYS = ['DAOYI_LLM_API_KEY', 'DAOYI_LLM_PROVIDER', 'DAOYI_LLM_ENABLED',
  'DAOYI_LLM_SESSION_BASE_URL', 'DAOYI_LLM_SESSION_MODEL', 'DAOYI_LLM_SESSION_API_KEY']
for (const k of ENV_KEYS) { SAVED[k] = process.env[k]; delete process.env[k] }
const restore = () => { for (const k of ENV_KEYS) { if (SAVED[k] == null) delete process.env[k]; else process.env[k] = SAVED[k] } }

const MARK = '《SESSION-LLM》'
let calls = []
// 桩会话模型：模拟 DSH Runtime 注入的当前对话大模型
const sessionFn = async (messages, opts) => {
  calls.push(opts && opts.tool ? opts.tool : 'scoring')
  // LLM 补分（llm-scoring 用 expectedKeys 约定）
  if (opts && Array.isArray(opts.expectedKeys) && opts.expectedKeys.length) {
    const obj = {}
    for (const k of opts.expectedKeys) obj[k] = 0.62
    return JSON.stringify(obj)
  }
  // L1→L7 分解
  if (opts && opts.tool === 'decompose') {
    return `{"layers":[{"level":"太极","note":"${MARK}分解落点"}],"key_factors":[{"domain":"JS","factor":"趋势","reason":"关键"}],"missing_data":["板块数据"]}`
  }
  // L1 卦象文案
  return `${MARK}卦象总评：最弱之宫在技术与资金，宜先固本。`
}

// schemastery 填充后的「默认配置」形态（cloudModelEnabled 默认 false —— 缺陷②的触发条件）
const SCHEMA_DEFAULT_CONFIG = {
  defaultScript: 'motor-design',
  cloudModelEnabled: false,
  cloudModelProvider: 'deepseek',
  cloudModelApiKey: '',
  cloudModelAutoSession: true,
  cloudModelUseSessionModel: false,
}

section('1. 透传：三种注入位置都能取到')
{
  ok(resolveSessionInjection({ sessionModel: sessionFn }).source === 'config', 'config.sessionModel → source=config')
  ok(resolveSessionInjection({}, { sessionModel: sessionFn }).source === 'ctx', 'ctx.sessionModel → source=ctx')
  // v0.9.1：llm 是 DSH 真实服务名，source 标签由 'ctx.llm' 改为 'llm.sessionModel'
  ok(resolveSessionInjection({}, { llm: { sessionModel: sessionFn } }).source === 'llm.sessionModel', 'ctx.get("llm").sessionModel → source=llm.sessionModel')
  ok(resolveSessionInjection({}, { llm: { chat: sessionFn } }).source === 'llm', 'llm 服务含 chat() → 归一为适配器 source=llm')
  ok(resolveSessionInjection({}, { llm: { foo: 1 } }).source === null, 'llm 形状未知 → 不猜，source=null（诚实离线）')
  ok(resolveSessionInjection({}, {}).source === null, '无注入 → source=null')
  ok(resolveSessionInjection({}, { sessionModel: sessionFn }).sessionModel === sessionFn, 'ctx 注入的函数原样透传（未被包装/丢弃）')
}

section('2. 激活：默认配置 + ctx 注入 → 会话层必须启用')
{
  const built = buildSessionCloudConfig(SCHEMA_DEFAULT_CONFIG, { sessionModel: sessionFn })
  ok(built.session.enabled === true, `自动会话已激活（enabled=${built.session.enabled}）`)
  ok(built.session.source === 'ctx', `来源标记为 ctx（实际 ${built.session.source}）`)
  ok(built.config.cloudModelEnabled === true, '修复关键：显式置 cloudModelEnabled=true（抵消 schema 默认 false）')
  ok(built.config.cloudModelProvider === 'session', `provider 归一为 session（实际 ${built.config.cloudModelProvider}）`)
  const s = resolveCloudSettings(built.config)
  ok(s.enabled === true, `resolveCloudSettings 判为启用（enabled=${s.enabled}）`)
  ok(s.kind === 'session' && s.provider === 'session', `kind/provider=session（${s.kind}/${s.provider}）`)
  ok(s.session_kind === 'function', `会话形态=函数（${s.session_kind}）`)
  const cfg = configureCloudModel(built.config)
  ok(cfg.active === true, `configureCloudModel 装配适配器成功（active=${cfg.active}）`)
}

section('3. 缺陷回归护栏：不经 buildSessionCloudConfig 时确实不激活（证明修复必要）')
{
  const raw = { ...SCHEMA_DEFAULT_CONFIG, sessionModel: sessionFn }
  const s = resolveCloudSettings(raw)
  ok(s.enabled === false, `未修复路径下 enabled=false（实际 ${s.enabled}）← 这正是用户遇到的「会话层不激活」`)
  ok(s.kind === 'session', '仍识别为 session 通道（只是被 enabled:false 关掉）')
}

section('4. 尊重用户选择（不该抢会话模型的场景）')
{
  const off = buildSessionCloudConfig({ ...SCHEMA_DEFAULT_CONFIG, cloudModelAutoSession: false }, { sessionModel: sessionFn })
  ok(off.session.enabled === false && off.session.reason === 'cloudModelAutoSession:false', 'cloudModelAutoSession:false → 不激活')
  const own = buildSessionCloudConfig({ ...SCHEMA_DEFAULT_CONFIG, cloudModelApiKey: 'sk-my' }, { sessionModel: sessionFn })
  ok(own.session.enabled === false && own.session.reason === 'user-has-own-apikey', '用户自备 apiKey → 不抢会话模型')
  const other = buildSessionCloudConfig({ ...SCHEMA_DEFAULT_CONFIG, cloudModelProvider: 'qwen' }, { sessionModel: sessionFn })
  ok(other.session.enabled === false && other.session.reason === 'user-provider:qwen', '用户显式选了其他厂商 → 尊重用户')
  const none = buildSessionCloudConfig(SCHEMA_DEFAULT_CONFIG, {})
  ok(none.session.enabled === false && none.session.reason === 'no-session-injection', '无注入 → 保持离线模板')
}

section('5. 端到端：LLM 推理补充真正落到推演结果')
{
  calls = []
  const built = buildSessionCloudConfig(SCHEMA_DEFAULT_CONFIG, { sessionModel: sessionFn })
  const r = await evaluate('测试事项：某电机方案评审', 'motor-design', { config: built.config, inputs: {} })
  ok(r.llm && r.llm.active === true, `LLM 画像 active=true（实际 ${r.llm && r.llm.active}）`)
  ok(r.llm && r.llm.provider === 'session', `provider=session（实际 ${r.llm && r.llm.provider}）`)
  ok(r.llm && r.llm.kind === 'session', `kind=session（实际 ${r.llm && r.llm.kind}）`)
  ok(
    r.decomposition && r.decomposition.decomposition_text && r.decomposition.decomposition_text.includes(MARK),
    `L1→L7 分解由会话模型产出（非离线模板）：${String(r.decomposition && r.decomposition.decomposition_text).slice(0, 24)}…`,
  )
  ok(
    r.decomposition && r.decomposition.decomposition_json && r.decomposition.decomposition_json.layers.length === 1,
    '分解 JSON 可被解析（防幻觉解析链路通）',
  )
  ok(
    typeof r.conclusion_text === 'string' && r.conclusion_text.includes(MARK),
    `L1 卦象文案由会话模型产出（非模板）：${String(r.conclusion_text).slice(0, 24)}…`,
  )
  ok(calls.includes('decompose') && calls.includes('conclude'), `两次真实调用已发生（tools=${calls.join('/')}）`)
}

section('6. 端到端：LLM 补分（L2）经会话模型拿到推理补充')
{
  const built = buildSessionCloudConfig(SCHEMA_DEFAULT_CONFIG, { sessionModel: sessionFn })
  const script = buildStockTrendV2Script()
  const db = buildCheckpointDatabase(script)
  const pack = buildEvidencePack({ code: '600711', name: '盛屯矿业', price: 9.26, pct: -2.22 }, { pct: 0.12 })
  const run = await runLlmScoring({
    script,
    db,
    pack,
    llmCall: (m, o) => sessionFn(m, o),
    level: 'L2',
    config: built.config,
    throttle: async () => ({ queued: false, waitMs: 0 }), // 单测绕过速率排队等待
  })
  ok(run.degraded === false, `未降级（degraded=${run.degraded}）`)
  ok(Object.keys(run.scores).length > 0, `会话模型补出 ${Object.keys(run.scores).length} 个分域分`)
  ok(run.coverage.prompts === 6, `L2 = 6 次 prompt（实际 ${run.coverage.prompts}）`)
  // filled 计数单位 = 补到的分域键数（6 域 × 6 分域 = 36），与 prompt 次数不同单位，勿混
  ok(
    run.coverage.filled === Object.keys(run.scores).length && run.coverage.filled === 36,
    `全部填充成功（filled=${run.coverage.filled} / scores=${Object.keys(run.scores).length}，单位=分域键）`,
  )
}

section('7. 费用承担方：会话模型 → 用户会话')
{
  const built = buildSessionCloudConfig(SCHEMA_DEFAULT_CONFIG, { sessionModel: sessionFn })
  const s = resolveCloudSettings(built.config)
  ok(s.kind === 'session', 'kind=session → 工具层回报 cost_bearer=user-session（费用计入用户会话）')
}

section('8. v0.9.1 P0：cordis inject 守卫下不得抛错（「更新成功、重启失败」根因护栏）')
{
  // 复刻 DSH/cordis 的 ctx：Proxy 拦截未声明服务的属性读取 → 抛
  //   Error: cannot get property "sessionModel" without inject
  // 且提供官方安全通道 ctx.get(name)（无该服务返回 undefined，不抛）。
  // 实网形态 = 有 llm 服务、无 sessionModel 服务（app.asar 全文检索 sessionModel 命中 0 次）。
  const llmService = {
    chat: (messages) => `{"layers":[{"level":"太极","note":"${MARK}会话"}],"key_factors":[],"missing_data":[]}`,
  }
  const makeGuardedCtx = (services) => {
    const target = {
      get: (name) => (Object.prototype.hasOwnProperty.call(services, name) ? services[name] : undefined),
      ...services,
    }
    return new Proxy(target, {
      get(t, prop) {
        if (prop === 'get') return t.get
        if (Object.prototype.hasOwnProperty.call(services, prop)) return services[prop]
        if (typeof prop === 'string' && prop !== 'then' && prop !== 'constructor') {
          throw new Error(`cannot get property "${String(prop)}" without inject`)
        }
        return undefined
      },
      has: (t, prop) => prop === 'get' || Object.prototype.hasOwnProperty.call(services, prop),
    })
  }
  const ctxReal = makeGuardedCtx({ llm: llmService })
  const ctxLegacy = makeGuardedCtx({ sessionModel: sessionFn })

  // ① 实网形态：v0.9.0 的直读会抛；v0.9.1 必须不抛且能拿到 llm
  let threw = null
  let inj = null
  try {
    inj = resolveSessionInjection(SCHEMA_DEFAULT_CONFIG, ctxReal)
  } catch (e) {
    threw = e
  }
  ok(threw === null, `守卫 ctx 下 resolveSessionInjection 不抛（实际 ${threw ? threw.message : '未抛'}）`)
  ok(inj && inj.source === 'llm', `经 ctx.get("llm") 拿到会话模型（source=${inj && inj.source}）`)

  // ② 端到端：apply 的第一行不得因 ctx 形态崩溃
  let applyThrew = null
  try {
    const built = buildSessionCloudConfig(SCHEMA_DEFAULT_CONFIG, ctxReal)
    ok(built.session.enabled === true, `守卫 ctx 下会话层仍激活（enabled=${built.session.enabled}）`)
    const s = resolveCloudSettings(built.config)
    ok(s.provider === 'session', `provider 归一 session（实际 ${s.provider}）`)
  } catch (e) {
    applyThrew = e
  }
  ok(applyThrew === null, `buildSessionCloudConfig 不抛（实际 ${applyThrew ? applyThrew.message : '未抛'}）`)

  // ③ 兼容形态：宿主确实注入了 sessionModel 服务时也不抛
  let legacyThrew = null
  try {
    const i2 = resolveSessionInjection(SCHEMA_DEFAULT_CONFIG, ctxLegacy)
    ok(i2.source === 'ctx', `ctx.get("sessionModel") 兼容通道可用（source=${i2.source}）`)
  } catch (e) {
    legacyThrew = e
  }
  ok(legacyThrew === null, `兼容通道不抛（实际 ${legacyThrew ? legacyThrew.message : '未抛'}）`)

  // ④ 守卫下访问不存在的服务 → 返回 null，绝不外抛（回归护栏）
  ok(safeContextService(ctxReal, 'sessionModel') === null, '无 sessionModel 服务 → 返回 null（不外抛）')
  ok(safeContextService(null, 'llm') === null, 'ctx=null → 返回 null')
}

section('9. v0.9.1 S-5：显式厂商不得被会话层静默替换')
{
  // 形态 a：用户显式启用 qwen + 自有 Key（此前会被静默换成 session）
  // 形态 b：用户显式启用 qwen 但无 Key（此前会被静默切成离线）
  // 注：厂商路径的开关是 cloudModelEnabled（文档口径），故两形态均置 true 才叫「显式启用」
  for (const [label, cfg] of [
    ['形态a(有Key)', { ...SCHEMA_DEFAULT_CONFIG, cloudModelEnabled: true, cloudModelProvider: 'qwen', cloudModelApiKey: 'sk-qwen' }],
    ['形态b(无Key)', { ...SCHEMA_DEFAULT_CONFIG, cloudModelEnabled: true, cloudModelProvider: 'qwen' }],
  ]) {
    const built = buildSessionCloudConfig(cfg, { sessionModel: sessionFn })
    const s = resolveCloudSettings(built.config)
    ok(built.session.enabled === false, `${label}: buildSessionCloudConfig 拒绝接管（enabled=${built.session.enabled}）`)
    ok(s.provider === 'qwen', `${label}: 用户显式 qwen 被保留（provider=${s.provider}）`)
    ok(built.config.sessionModel == null, `${label}: 拒绝时不注入 sessionModel（防下游绕过）`)
    if (label.startsWith('形态a')) {
      ok(s.enabled === true, `${label}: 有 Key → qwen 正常启用（enabled=${s.enabled}）`)
    }
  }
  // 单一判据：两处口径必须一致
  ok(
    providerAllowsSessionTakeover('qwen', true) === false &&
      providerAllowsSessionTakeover('deepseek', false) === true &&
      providerAllowsSessionTakeover('session', true) === true &&
      providerAllowsSessionTakeover('', false) === true,
    'providerAllowsSessionTakeover 判据自洽（qwen 拒 / 缺省 deepseek 收 / session 收 / 空收）',
  )
}

section('10. v0.9.1 S-6：cloudModelAutoSession:false 必须关得干净')
{
  const off = { ...SCHEMA_DEFAULT_CONFIG, cloudModelAutoSession: false }
  const built = buildSessionCloudConfig(off, { sessionModel: sessionFn })
  const s = resolveCloudSettings(built.config)
  ok(built.session.enabled === false, `自动接管关闭（enabled=${built.session.enabled}）`)
  ok(s.provider !== 'session', `provider 未被改成 session（provider=${s.provider}）`)
  ok(s.kind !== 'session', `kind 不为 session（kind=${s.kind}）`)
  ok(s.session_kind === null, `session_kind=null（实际 ${s.session_kind}）`)
  // 显式 session 意图优先于 autoSession:false（否则用户无法选择性开启）
  const explicit = buildSessionCloudConfig(
    { ...off, cloudModelUseSessionModel: true },
    { sessionModel: sessionFn },
  )
  ok(explicit.session.enabled === true && explicit.session.reason === 'explicit-session', `显式会话意图仍生效（enabled=${explicit.session.enabled}, reason=${explicit.session.reason}）`)
}

restore()
console.log(`\n===== 会话模型激活与透传专项: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail === 0 ? 0 : 1)
