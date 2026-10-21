// cloud-model.mjs — 云模型集成适配器（真实 LLM 接通版 v0.3.4）
//
// 设计边界（§2.1 架构纪律）：云模型只做“翻译器”——负责 L1→L7 自然语言分解 与 L1 卦象文案；
// 判定与聚合（L7→L2）永远走 aggregator.mjs 的确定性代码，云模型不介入 verdict 决策。
//
// 注入契约（优先级从高到低）：
//   1) 每次调用的 config 显式云模型设置（provider/自定义模型名/sessionModel/...）
//      → 按本次调用解析（工具层 model 参数覆盖即走此路）
//   2) config.cloudModel：fn(messages, opts) => Promise<string|null>（测试/运行时注入）
//   3) 模块级 setCloudModelAdapter(fn)：apply() 启动时由 configureCloudModel 注入
//   4) config 云模型设置（cloudModelEnabled + provider/apiKey/...）→ OpenAI 兼容 /chat/completions
//   5) config.cloudModelEndpoint：POST { messages } JSON，期望响应含 text/reply/content（旧版简易协议）
//   6) 以上皆无或调用失败 → 返回 null，调用方走确定性模板（离线 / 断网可用）
//
// 模型来源（v0.3.4 扩展）：
//   - 6 厂商预设：deepseek / qwen / glm / moonshot / minimax / openai
//   - custom：自填 Base URL + 模型名（任意 OpenAI 兼容端点）
//   - **自定义模型清单**：config.cloudModelCustomModels（JSON 数组字符串）或 env
//     DAOYI_LLM_CUSTOM_MODELS，每项 {name,label,baseUrl,model,keyEnv}，按 name 选用
//   - **session（可选）**：provider='session' 或 cloudModelUseSessionModel=true 时，
//     使用 DSH 会话当前模型——来源 config.sessionModel（函数或 {baseUrl,model,apiKey}，
//     由 DSH Runtime 注入）或 env DAOYI_LLM_SESSION_BASE_URL/MODEL/API_KEY；
//     未注入时视为未启用（离线模板），不报错。另：注入 session 来源且未显式指定厂商时
//     自动启用（Runtime 注入即用；显式选了其他厂商则以用户为准）。
//
// 计费闸门（v0.3.4，按 LLM 调用计数）：每次真实外发前 assertLlmQuota（本地硬闸，
// 默认 20 次/天，见 lib/yijing/quota.mjs）；用尽时本次调用返回 null 并记录闸门事件，
// 推演自动降级确定性模板（verdict 不受影响）。离线（无外发）不计数。
//
// 密钥安全：API Key 只从 config / 环境变量读取，绝不出现在日志、回传与异常信息中。
import { buildCheckpointDatabase } from './checkpoints.mjs'
import { assertLlmQuota, acquireLlmRateLimit, LlmQuotaExceededError, checkLlmQuota } from './quota.mjs'

// ────────────────────────── 厂商预设（对齐 Core/cloud_services_config.py）──────────────────────────
export const LLM_PROVIDER_PRESETS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    label: '阿里云百炼 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    keyEnv: 'DASHSCOPE_API_KEY',
  },
  glm: {
    label: '智谱 AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    keyEnv: 'ZHIPU_API_KEY',
  },
  moonshot: {
    label: '月之暗面 (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyEnv: 'MOONSHOT_API_KEY',
  },
  minimax: {
    label: 'MiniMax (abab)',
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'abab6.5s-chat',
    keyEnv: 'MINIMAX_API_KEY',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY',
  },
  custom: {
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: '',
    keyEnv: '',
  },
}

/** session 提供商标签（DSH 会话当前模型） */
export const SESSION_PROVIDER_ID = 'session'

function readEnv() {
  return typeof process !== 'undefined' && process.env ? process.env : {}
}

// ────────────────────────── 自定义模型清单（v0.3.4 新增）──────────────────────────

/**
 * 解析自定义模型清单：config.cloudModelCustomModels（JSON 数组字符串或数组）
 * 或 env DAOYI_LLM_CUSTOM_MODELS（同构 JSON）。每项 {name,label,baseUrl,model,keyEnv}；
 * name 作为选用 id（工具层 model 参数 / cloudModelProvider 均可传它）。
 * 损坏/缺字段的条目静默跳过（不阻断其余条目）。
 * @returns {Array<{name:string,label:string,baseUrl:string,model:string,keyEnv:string}>}
 */
export function parseCustomModels(config = {}) {
  const env = readEnv()
  const raw = config.cloudModelCustomModels ?? env.DAOYI_LLM_CUSTOM_MODELS ?? ''
  let arr = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      arr = Array.isArray(parsed) ? parsed : []
    } catch {
      arr = []
    }
  }
  return arr
    .filter((m) => m && typeof m === 'object' && m.name && m.baseUrl && m.model)
    .map((m) => ({
      name: String(m.name),
      label: String(m.label || m.name),
      baseUrl: String(m.baseUrl).replace(/\/+$/, ''),
      model: String(m.model),
      keyEnv: String(m.keyEnv || ''),
    }))
}

/**
 * 列出全部可选模型（供 yijing_model_list 工具 / 日志展示）：
 * 6 厂商预设 + 自定义模型清单 + session（DSH 会话当前模型）。
 */
export function listCloudModels(config = {}) {
  const out = Object.entries(LLM_PROVIDER_PRESETS).map(([id, p]) => ({
    id,
    label: p.label,
    baseUrl: p.baseUrl,
    model: p.model,
    kind: 'preset',
  }))
  for (const c of parseCustomModels(config)) {
    out.push({ id: c.name, label: c.label, baseUrl: c.baseUrl, model: c.model, kind: 'custom' })
  }
  out.push({ id: SESSION_PROVIDER_ID, label: 'DSH 会话当前模型', baseUrl: '', model: '', kind: 'session' })
  return out
}

/**
 * 解析 DSH 会话当前模型来源（provider='session' 或 cloudModelUseSessionModel=true 时用）：
 *  - config.sessionModel 为函数 → 直接作为适配器（DSH Runtime 注入的最高优先级形态）；
 *  - config.sessionModel 为对象 / env DAOYI_LLM_SESSION_* → OpenAI 兼容设置；
 *  - 皆无 → kind='none'（未启用，离线模板）。
 */
export function resolveSessionModel(config = {}) {
  const sm = config.sessionModel
  if (typeof sm === 'function') return { kind: 'function', fn: sm, baseUrl: '', model: '', apiKey: '' }
  const env = readEnv()
  const obj = sm && typeof sm === 'object' ? sm : {}
  return {
    kind: 'openai',
    fn: null,
    baseUrl: String(obj.baseUrl || env.DAOYI_LLM_SESSION_BASE_URL || '').replace(/\/+$/, ''),
    model: String(obj.model || env.DAOYI_LLM_SESSION_MODEL || ''),
    apiKey: String(obj.apiKey || env.DAOYI_LLM_SESSION_API_KEY || ''),
  }
}

// 设置解析：config 优先，环境变量兜底（DAOYI_LLM_* 通用 + 厂商专属 key 环境变量）
export function resolveCloudSettings(config = {}) {
  const env = readEnv()
  const providerRaw = String(config.cloudModelProvider || env.DAOYI_LLM_PROVIDER || 'deepseek').toLowerCase()
  // session 启用条件（优先级从高到低）：
  //   1) providerRaw==='session' 或 cloudModelUseSessionModel===true（显式选择）；
  //   2) 注入了 session 来源（config.sessionModel / env DAOYI_LLM_SESSION_*）且未显式指定厂商
  //      （DSH Runtime 注入即用；用户显式选了其他厂商则以用户为准）。
  const hasExplicitProvider = Boolean(config.cloudModelProvider || env.DAOYI_LLM_PROVIDER)
  const hasSessionInjection =
    Boolean(config.sessionModel) || Boolean(env.DAOYI_LLM_SESSION_BASE_URL && env.DAOYI_LLM_SESSION_MODEL)
  // 是否"自动借用会话模型"：Runtime 注入了 sessionModel、且用户未配置自有 apiKey
  // → 自动启用当前对话的大模型（无需手动开 cloudModelEnabled；cloudModelAutoSession:false 可关）
  const hasOwnApiKey = Boolean(config.cloudModelApiKey) || Boolean(env.DAOYI_LLM_API_KEY)
  const autoSession =
    config.cloudModelAutoSession !== false && hasSessionInjection && !hasOwnApiKey
  const useSession =
    providerRaw === SESSION_PROVIDER_ID ||
    config.cloudModelUseSessionModel === true ||
    autoSession ||
    // 有自有 Key 时不再抢会话模型：用户已自备凭证，应走其显式/默认的厂商路径
    (hasSessionInjection && !hasExplicitProvider && !hasOwnApiKey)
  const timeoutMs = Number(config.cloudModelTimeoutMs) > 0 ? Number(config.cloudModelTimeoutMs) : 30000
  const temperature = typeof config.cloudModelTemperature === 'number' ? config.cloudModelTemperature : 0.3

  // ── session：DSH 会话当前模型（可选；未注入 = 未启用）──
  if (useSession) {
    const s = resolveSessionModel(config)
    const active = s.kind === 'function' ? true : Boolean(s.baseUrl && s.model)
    // 自动模式（autoSession）：有会话模型即启用，不受 cloudModelEnabled 默认 false 影响；
    //   但显式 cloudModelEnabled:false 仍优先（用户主动关闭）。手动模式需显式开启。
    const enabled = active
      ? autoSession
        ? config.cloudModelEnabled !== false
        : config.cloudModelEnabled === true && config.cloudModelEnabled !== false
      : false
    return {
      enabled,
      auto: autoSession,
      provider: SESSION_PROVIDER_ID,
      kind: 'session',
      session_kind: s.kind,
      session_fn: s.fn || null,
      label: 'DSH 会话当前模型',
      baseUrl: s.baseUrl,
      model: s.model,
      apiKey: String(s.apiKey || ''),
      timeoutMs,
      temperature,
    }
  }

  // ── 厂商预设 / 自定义模型清单 ──
  const customs = parseCustomModels(config)
  const customHit = customs.find((c) => c.name.toLowerCase() === providerRaw)
  const preset = LLM_PROVIDER_PRESETS[providerRaw] || customHit || LLM_PROVIDER_PRESETS.custom
  const baseUrl = String(
    config.cloudModelBaseUrl || env.DAOYI_LLM_BASE_URL || preset.baseUrl || '',
  ).replace(/\/+$/, '')
  const model = String(config.cloudModelName || env.DAOYI_LLM_MODEL || preset.model || '')
  const apiKey =
    config.cloudModelApiKey ||
    env.DAOYI_LLM_API_KEY ||
    (preset.keyEnv ? env[preset.keyEnv] : '') ||
    (customHit && customHit.keyEnv ? env[customHit.keyEnv] : '') ||
    ''
  const enabled =
    config.cloudModelEnabled === true ||
    String(env.DAOYI_LLM_ENABLED || '').toLowerCase() === 'true' ||
    Boolean(apiKey) // 有密钥即视为启用（显式关闭仍优先：cloudModelEnabled===false）
      ? config.cloudModelEnabled !== false
      : false
  return {
    enabled,
    auto: false,
    provider: providerRaw,
    kind: customHit ? 'custom' : 'preset',
    session_kind: null,
    session_fn: null,
    label: preset.label || providerRaw,
    baseUrl,
    model,
    apiKey: String(apiKey || ''),
    timeoutMs,
    temperature,
  }
}

function joinChatCompletionsUrl(baseUrl) {
  if (!baseUrl) return ''
  if (/\/chat\/completions\/?$/.test(baseUrl)) return baseUrl.replace(/\/+$/, '')
  return `${baseUrl}/chat/completions`
}

let injectedAdapter = null
export function setCloudModelAdapter(fn) {
  injectedAdapter = fn
}
export function getCloudModelAdapter() {
  return injectedAdapter
}

// OpenAI 兼容适配器：返回 fn(messages, opts) => Promise<string|null>
export function createOpenAIAdapter(settings) {
  const url = joinChatCompletionsUrl(settings.baseUrl)
  const model = settings.model
  const timeoutMs = settings.timeoutMs || 30000
  return async function openaiChatAdapter(messages) {
    if (!url || !model || !settings.apiKey) return null
    if (typeof fetch !== 'function') return null
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: settings.temperature,
          stream: false,
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      const choice = data && Array.isArray(data.choices) ? data.choices[0] : null
      const content =
        (choice && choice.message && choice.message.content) ||
        (choice && typeof choice.text === 'string' ? choice.text : '') ||
        ''
      return content.trim() || null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

// 按 settings 执行一次调用（session 函数形态直调；其余走 OpenAI 兼容适配器）
async function invokeSettings(settings, messages, opts) {
  if (settings.kind === 'session' && settings.session_kind === 'function' && typeof settings.session_fn === 'function') {
    return await settings.session_fn(messages, opts)
  }
  const adapter = createOpenAIAdapter(settings)
  return await adapter(messages, opts)
}

/** settings 是否具备真实外发条件（enabled + session 函数/baseUrl+model[/apiKey]）——计费计数判据 */
export function isCloudSettingsViable(settings) {
  if (!settings || !settings.enabled) return false
  if (settings.kind === 'session') {
    return settings.session_kind === 'function' || Boolean(settings.baseUrl && settings.model)
  }
  return Boolean(settings.apiKey && settings.baseUrl && settings.model)
}

// 按 config（+env）配置云模型；返回是否真正启用（供调用方日志/提示）
export function configureCloudModel(config = {}) {
  const settings = resolveCloudSettings(config)
  if (settings.enabled) {
    if (settings.kind === 'session' && settings.session_kind === 'function') {
      setCloudModelAdapter(settings.session_fn)
      return { ...settings, active: true }
    }
    if (settings.apiKey && settings.baseUrl && settings.model) {
      setCloudModelAdapter(createOpenAIAdapter(settings))
      return { ...settings, active: true }
    }
  }
  setCloudModelAdapter(null)
  return { ...settings, active: false }
}

// ────────────────────────── 计费闸门事件（v0.3.4）──────────────────────────
// callCloudModel 捕获 LlmQuotaExceededError 时记录，reviewer/evaluate 取走后清除，
// 供结果里向用户说明「为何本次走了离线模板」。
let _lastQuotaBlock = null

/** 取走并清除最后一次闸门拦截事件（无则返回 null） */
export function consumeLlmQuotaBlock() {
  const b = _lastQuotaBlock
  _lastQuotaBlock = null
  return b
}

/** 取走并清除最后一次速率队列许可信息（无则返回 null）；含 queued/waitMs，供结果向用户说明排队等待 */
let _lastRate = null
export function consumeLlmRateInfo() {
  const r = _lastRate
  _lastRate = null
  return r
}

/** 本次调用的 config 是否携带显式云模型设置（决定走 per-call 解析还是模块级适配器） */
function hasExplicitCloudSettings(cfg) {
  return Boolean(
    cfg.cloudModelProvider ||
      cfg.cloudModelName ||
      cfg.cloudModelBaseUrl ||
      cfg.cloudModelApiKey ||
      cfg.cloudModelCustomModels ||
      cfg.sessionModel ||
      cfg.cloudModelUseSessionModel === true ||
      cfg.cloudModelEnabled === true,
  )
}

// 计费闸门包裹：真实外发前先查每日硬上限（用尽抛错→外层降级），再走每分钟速率队列等待
async function dispatchWithQuota(fn, messages, opts, cfg, tool) {
  // 1) 可选每日硬上限（默认关闭，0=禁用）：用尽则抛 LlmQuotaExceededError，由 callCloudModel 捕获降级
  assertLlmQuota(tool || 'llm', cfg)
  // 2) 每分钟速率限制 + 队列等待（免费 LLM 主节流：窗口满则排队，超出不拒不降级）
  const rate = await acquireLlmRateLimit(cfg, opts.tool || tool || 'llm')
  _lastRate = rate
  return await fn(messages, opts)
}

export async function callCloudModel(messages, opts = {}) {
  const cfg = opts.config || {}
  try {
    // 显式关闭优先于一切注入（运维开关）
    if (cfg.cloudModelEnabled === false) return null
    // 1) 每次调用的 config 显式设置（工具层 model 覆盖走此路）
    if (hasExplicitCloudSettings(cfg)) {
      const settings = resolveCloudSettings(cfg)
      if (isCloudSettingsViable(settings)) {
        return await dispatchWithQuota((m, o) => invokeSettings(settings, m, o), messages, opts, cfg, opts.tool)
      }
    }
    // 2) config 直传适配器函数
    if (typeof cfg.cloudModel === 'function') {
      return await dispatchWithQuota(cfg.cloudModel, messages, opts, cfg, opts.tool)
    }
    // 3) 模块级适配器（apply() 启动时注入）
    if (typeof injectedAdapter === 'function') {
      return await dispatchWithQuota(injectedAdapter, messages, opts, cfg, opts.tool)
    }
    // 4) 旧版简易协议端点
    if (cfg.cloudModelEndpoint && typeof fetch === 'function') {
      const settings = resolveCloudSettings(cfg)
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), settings.timeoutMs)
      try {
        assertLlmQuota(opts.tool || 'llm', cfg)
        const res = await fetch(cfg.cloudModelEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages }),
          signal: ctrl.signal,
        })
        if (!res.ok) return null
        const data = await res.json().catch(() => null)
        return (data && (data.text || data.reply || data.content)) || null
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }
  } catch (e) {
    if (e instanceof LlmQuotaExceededError) {
      _lastQuotaBlock = { ...e.quota, message: e.message, at: Date.now() }
      return null
    }
    return null
  }
  return null
}

// ────────────────────────── 提示词（L1→L7 分解 / L1 卦象总评）──────────────────────────

function scriptOutline(script, db) {
  const domains = Object.values(db.domainIndex)
    .map((d) => `${d.code}(${d.name}·${d.bagua})`)
    .join('、')
  return domains
}

// L1→L7 分解：把决策事项逐层拆解到剧本的 384 关键考虑因数（云模型驱动；离线返回结构化因数清单）
export async function decomposeWithCloudModel(matter, script, opts = {}) {
  const db = buildCheckpointDatabase(script)
  const active = db.checkpoints.filter((c) => !c.na)
  const domains = scriptOutline(script, db)
  const messages = [
    {
      role: 'system',
      content:
        '你是《道一-易经推演》的分解官。依据「太极→两仪→三才→四象→八宫→六十四卦→三百八十四爻」的层级，' +
        '把决策事项逐层分解为可评估的关键考虑因数。只输出 JSON，不要输出多余文字。',
    },
    {
      role: 'user',
      content:
        `决策事项：${matter}\n` +
        `剧本：${script.name}（八宫：${domains}；共 ${active.length} 个活跃关键考虑因数）。\n` +
        '请按六层层级分解本案，严格输出如下 JSON（不要包裹 markdown 代码块）：\n' +
        '{"layers":[{"level":"太极|两仪|三才|四象|八宫|六十四卦|384爻","note":"该层对本案的落点说明"}],' +
        '"key_factors":[{"domain":"八宫code","factor":"最关键的考虑因数","reason":"为何关键"}],' +
        '"missing_data":["推演前建议补齐的数据"]}',
    },
  ]
  const text = await callCloudModel(messages, { ...opts, tool: 'decompose' })
  let json = null
  if (text) {
    try {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start >= 0 && end > start) json = JSON.parse(text.slice(start, end + 1))
    } catch {
      json = null
    }
  }
  return {
    script_id: script.script_id,
    factor_count: active.length,
    factors: active.map((c) => ({ id: c.id, name: c.name, domain: c.domain, is_strong: c.is_strong })),
    decomposition_text: text || null,
    decomposition_json: json,
  }
}

// L1 结论文案：把六层聚合结果翻译为易经卦象总评（云模型；离线返回 null 走模板）
export async function concludeWithCloudModel(agg, script, matter, opts = {}) {
  const bagua = Object.values(agg.domain_results)
    .map((d) => `${d.bagua}(${d.name}) ${(d.score * 100).toFixed(0)}%${d.strong_veto ? '[否决]' : ''}`)
    .join('；')
  const messages = [
    { role: 'system', content: '你是《道一-易经推演》的卦象总评官。把六层聚合结果翻译为面向决策者的易经卦象总评，言必及卦，简洁有力。' },
    {
      role: 'user',
      content:
        `决策事项：${matter}\n剧本：${script.name}\n结论：${agg.verdict}` +
        `（风险${agg.risk_level}，综合${(agg.overall_score * 100).toFixed(0)}%）\n八宫：${bagua}\n` +
        `请给出一段面向决策者的卦象总评（不超过 120 字），须点明最弱的宫与补救之道。`,
    },
  ]
  return await callCloudModel(messages, { ...opts, tool: 'conclude' })
}

/** 当前 LLM 额度快照（只读，不消耗；供工具/日志展示） */
export function getLlmQuotaSnapshot(config = {}) {
  return checkLlmQuota(config)
}

export default {
  LLM_PROVIDER_PRESETS,
  SESSION_PROVIDER_ID,
  resolveCloudSettings,
  resolveSessionModel,
  parseCustomModels,
  listCloudModels,
  isCloudSettingsViable,
  configureCloudModel,
  createOpenAIAdapter,
  setCloudModelAdapter,
  getCloudModelAdapter,
  callCloudModel,
  decomposeWithCloudModel,
  concludeWithCloudModel,
  getLlmQuotaSnapshot,
  consumeLlmQuotaBlock,
}
