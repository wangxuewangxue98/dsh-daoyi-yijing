// 自动会话模型专项测试（v0.5.1）：
// 需求——插件在 DSH 对话中被调用时，可自动使用当前对话的大模型（无需手动开 enabled、无需自备 Key）。
import { resolveCloudSettings } from '../lib/yijing/cloud-model.mjs'

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

// 模拟 DSH Runtime 注入的会话模型（函数形态，最高优先级）
const sessionFn = async () => 'MOCK-SESSION-REPLY'
// 模拟对象形态
const sessionObj = { baseUrl: 'https://llm.internal/v1', model: 'current-chat-model', apiKey: 'internal' }

section('1. 自动启用：注入会话模型 + 无自有 Key')
{
  const s = resolveCloudSettings({ sessionModel: sessionFn })
  ok(s.enabled === true, `自动启用（enabled=${s.enabled}）`)
  ok(s.provider === 'session', `provider=session（实际 ${s.provider}）`)
  ok(s.auto === true, `auto 标记为真（实际 ${s.auto}）`)
  ok(s.kind === 'session', 'kind=session')
  ok(s.session_kind === 'function' || s.session_kind === 'object', `会话形态识别（${s.session_kind}）`)
}
{
  const s = resolveCloudSettings({ sessionModel: sessionObj })
  ok(s.enabled === true && s.model === 'current-chat-model', `对象形态也自动启用（model=${s.model}）`)
}

section('2. 不自动的场景（尊重用户选择）')
{
  // 用户自备了 apiKey → 用用户自己的，不抢会话模型
  const s = resolveCloudSettings({ sessionModel: sessionFn, cloudModelApiKey: 'sk-my-own' })
  ok(s.auto === false, `有自有 apiKey → 不自动（auto=${s.auto}）`)
  ok(s.provider !== 'session', `provider 不为 session（实际 ${s.provider}）`)
}
{
  // 显式关闭自动
  const s = resolveCloudSettings({ sessionModel: sessionFn, cloudModelAutoSession: false })
  ok(s.enabled === false, `cloudModelAutoSession:false → 不自动启用（enabled=${s.enabled}）`)
}
{
  // 显式 cloudModelEnabled:false（用户主动关）→ 自动模式也尊重
  const s = resolveCloudSettings({ sessionModel: sessionFn, cloudModelEnabled: false })
  ok(s.enabled === false, `显式 enabled:false → 关闭（enabled=${s.enabled}）`)
}
{
  // 未注入会话模型 → 无从自动，保持离线
  const s = resolveCloudSettings({})
  ok(s.enabled === false, `无会话注入 → 不启用（离线模板，enabled=${s.enabled}）`)
  ok(s.provider !== 'session', '无会话注入时 provider 不为 session')
}

section('3. 手动模式仍可用')
{
  const s = resolveCloudSettings({ sessionModel: sessionObj, cloudModelUseSessionModel: true, cloudModelEnabled: true, cloudModelAutoSession: false })
  ok(s.enabled === true && s.provider === 'session', `显式 useSessionModel+enabled → 启用会话（enabled=${s.enabled}）`)
  ok(s.auto === false, '手动模式 auto=false')
}

section('4. env 形态的会话注入')
{
  process.env.DAOYI_LLM_SESSION_BASE_URL = 'https://llm.internal/v1'
  process.env.DAOYI_LLM_SESSION_MODEL = 'env-session-model'
  const s = resolveCloudSettings({})
  ok(s.enabled === true && s.model === 'env-session-model', `env 注入也自动启用（model=${s.model}）`)
  delete process.env.DAOYI_LLM_SESSION_BASE_URL
  delete process.env.DAOYI_LLM_SESSION_MODEL
}

restore()
console.log(`\n===== 自动会话模型专项: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail === 0 ? 0 : 1)
