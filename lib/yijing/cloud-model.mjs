// cloud-model.mjs — 云模型集成适配器（真实 LLM 接通版 v0.3.4）
//
// 设计边界（§2.1 架构纪律）：云模型只做“翻译器”——负责 L1→L7 自然语言分解 与 L1 卦象文案；
// 判定与聚合（L7→L2）永远走 aggregator.mjs 的确定性代码，云模型不介入 verdict 决策。
//
// 注入契约（优先级从高到低）：
//   1) 模块级 setCloudModelAdapter(fn)：fn(messages, opts) => Promise<string|null>（测试/运行时注入）
//   2) config.cloudModel：同上函数
//   3) config 云模型设置（cloudModelEnabled + provider/apiKey/...）→ OpenAI 兼容 /chat/completions
//   4) config.cloudModelEndpoint：POST { messages } JSON，期望响应含 text/reply/content（旧版简易协议）
//   5) 以上皆无或调用失败 → 返回 null，调用方走确定性模板（离线 / 断网可用）
//
// 密钥安全：API Key 只从 config / 环境变量读取，绝不出现在日志、回传与异常信息中。
import { buildCheckpointDatabase } from './checkpoints.mjs'

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

function readEnv() {
  return typeof process !== 'undefined' && process.env ? process.env : {}
}

// 设置解析：config 优先，环境变量兜底（DAOYI_LLM_* 通用 + 厂商专属 key 环境变量）
export function resolveCloudSettings(config = {}) {
  const env = readEnv()
  const provider = String(config.cloudModelProvider || env.DAOYI_LLM_PROVIDER || 'deepseek').toLowerCase()
  const preset = LLM_PROVIDER_PRESETS[provider] || LLM_PROVIDER_PRESETS.custom
  const baseUrl = String(
    config.cloudModelBaseUrl || env.DAOYI_LLM_BASE_URL || preset.baseUrl || '',
  ).replace(/\/+$/, '')
  const model = String(config.cloudModelName || env.DAOYI_LLM_MODEL || preset.model || '')
  const apiKey =
    config.cloudModelApiKey ||
    env.DAOYI_LLM_API_KEY ||
    (preset.keyEnv ? env[preset.keyEnv] : '') ||
    ''
  const enabled =
    config.cloudModelEnabled === true ||
    String(env.DAOYI_LLM_ENABLED || '').toLowerCase() === 'true' ||
    Boolean(apiKey) // 有密钥即视为启用（显式关闭仍优先：cloudModelEnabled===false）
      ? config.cloudModelEnabled !== false
      : false
  return {
    enabled,
    provider,
    baseUrl,
    model,
    apiKey: String(apiKey || ''),
    timeoutMs: Number(config.cloudModelTimeoutMs) > 0 ? Number(config.cloudModelTimeoutMs) : 30000,
    temperature: typeof config.cloudModelTemperature === 'number' ? config.cloudModelTemperature : 0.3,
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

// 按 config（+env）配置云模型；返回是否真正启用（供调用方日志/提示）
export function configureCloudModel(config = {}) {
  const settings = resolveCloudSettings(config)
  if (settings.enabled && settings.apiKey && settings.baseUrl && settings.model) {
    setCloudModelAdapter(createOpenAIAdapter(settings))
    return { ...settings, active: true }
  }
  setCloudModelAdapter(null)
  return { ...settings, active: false }
}

export async function callCloudModel(messages, opts = {}) {
  const cfg = opts.config || {}
  try {
    if (typeof injectedAdapter === 'function') return await injectedAdapter(messages, opts)
    if (typeof cfg.cloudModel === 'function') return await cfg.cloudModel(messages, opts)
    // config 直传设置（未经 configureCloudModel 时也可用，如脚本直接传 config）
    if (cfg.cloudModelEnabled !== false) {
      const settings = resolveCloudSettings(cfg)
      if (settings.enabled && settings.apiKey && settings.baseUrl && settings.model) {
        const adapter = createOpenAIAdapter(settings)
        return await adapter(messages, opts)
      }
    }
    if (cfg.cloudModelEndpoint && typeof fetch === 'function') {
      const settings = resolveCloudSettings(cfg)
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), settings.timeoutMs)
      try {
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
  } catch {
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
  const text = await callCloudModel(messages, opts)
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
  return await callCloudModel(messages, opts)
}
