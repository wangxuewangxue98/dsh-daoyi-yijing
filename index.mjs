// index.mjs — 道一-易经推演（dsh-daoyi-yijing）插件入口
// 沿用 dsh-motor-ai-l0 的 apply 生命周期；纯 JS、零求解器依赖（云模型调用走 DSH Runtime 注入）。
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { dirname, join } from 'node:path'
import { configureRegistry } from './lib/yijing/registry.mjs'
import { runSelfCheck } from './lib/yijing/selfcheck.mjs'
import { configureCloudModel, parseCustomModels, buildSessionCloudConfig } from './lib/yijing/cloud-model.mjs'
import { checkLlmQuota } from './lib/yijing/quota.mjs'

export const name = 'dsh-daoyi-yijing'

function readPluginVersion() {
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'))
    return pkg.version || ''
  } catch {
    return ''
  }
}
const PLUGIN_VERSION = readPluginVersion()

export const inject = ['tools']

export const Config = Schema.object({
  // ---- 剧本 ----
  defaultScript: Schema.string().default('motor-design').description('默认决策剧本 id（motor-design=电机电磁设计·万事决 / stock-trend=股票趋势研判 / commercial=商业成功率）'),
  allowCustomScript: Schema.boolean().default(true).description('允许 JSON 自定义剧本'),
  strongVetoEnabled: Schema.boolean().default(true).description('强关联一票否决（引擎灵魂，默认开）'),
  reportStyle: Schema.union(['classic', 'plain']).default('classic')
    .description('classic=易经卦象风 / plain=工程报表风'),

  // ---- 云模型（L1→L7 分解 / L1 卦象文案；OpenAI 兼容，离线自动降级为确定性模板）----
  cloudModelEnabled: Schema.boolean().default(false)
    .description(
      '启用真实云模型（厂商路径开关；默认 OFF；开启后 L1→L7 分解与卦象文案由模型生成）。' +
        '注意：本项**不控制** DSH 会话模型的自动启用（见 cloudModelAutoSession）——v0.9.0 起两者解耦，' +
        '避免 schema 默认 false 把会话层一起关掉（此前即因此导致会话模型永不激活）',
    ),
  cloudModelProvider: Schema.string().default('deepseek')
    .description('厂商：deepseek/qwen/glm/moonshot/minimax/openai/custom，或自定义模型清单里的 name，或 session=DSH 会话当前模型'),
  cloudModelApiKey: Schema.string().default('')
    .description('云模型 API Key（Bearer；绝不外发、不入日志；也可用环境变量 DAOYI_LLM_API_KEY）'),
  cloudModelName: Schema.string().default('')
    .description('模型名（留空取厂商默认，如 deepseek-chat / qwen-max / glm-4-plus）'),
  cloudModelBaseUrl: Schema.string().default('')
    .description('自定义 Base URL（留空取厂商默认；custom 厂商必填）'),
  cloudModelTimeoutMs: Schema.number().default(30000).description('单次调用超时（毫秒）'),
  cloudModelTemperature: Schema.number().default(0.3).description('采样温度（低值保稳）'),
  cloudModelEndpoint: Schema.string().default('')
    .description('旧版简易协议端点（POST {messages}）；留空则不用'),

  // ---- 自定义模型清单（v0.3.4）----
  cloudModelCustomModels: Schema.string().default('')
    .description(
      '自定义模型清单（JSON 数组字符串）：[{"name":"my-gpt","label":"我的 GPT","baseUrl":"https://.../v1","model":"gpt-4o","keyEnv":"OPENAI_API_KEY"}]；' +
        'name 即选用 id（cloudModelProvider 或工具 model 参数传它）；也可用环境变量 DAOYI_LLM_CUSTOM_MODELS',
    ),
  // ---- DSH 会话当前模型（v0.3.4，可选；v0.5.1 起默认自动）----
  cloudModelAutoSession: Schema.boolean().default(true)
    .description(
      '对话中自动使用 DSH 会话当前模型：Runtime 注入会话模型（config.sessionModel / ctx.sessionModel / ' +
        'ctx.llm.sessionModel）且用户未配置自有 apiKey、未显式选其他厂商时自动启用，无需手动开 cloudModelEnabled、' +
        '无需自备 Key（仍受免费额度速率闸门约束；费用计入用户会话）。**这是会话层的唯一开关**：设 false 即关闭，' +
        '此时完全离线模板。v0.9.0 修复：此前因 cloudModelEnabled 默认 false，本项虽为 true 也无法激活',
    ),
  cloudModelUseSessionModel: Schema.boolean().default(false)
    .description(
      '可选：使用 DSH 会话当前模型（等价 provider=session）。来源为 DSH Runtime 注入的 config.sessionModel' +
        '（函数或 {baseUrl,model,apiKey}）或环境变量 DAOYI_LLM_SESSION_BASE_URL/MODEL/API_KEY；未注入则离线模板',
    ),

  // ---- 免费额度本地闸门（v0.4.2：主节流改为「每分钟速率 + 队列等待」；每日硬上限降级为可选兜底）----
  freeQuotaEnabled: Schema.boolean().default(true)
    .description('本地闭环免费额度闸门（免费 LLM 节流总开关；false=运维/授权旁路，不限速不计数）'),
  freeLlmPerMinute: Schema.number().default(10)
    .description('免费 LLM 每分钟调用速率上限（滑动窗口 60s）；超出排队等待，不拒绝不降级。0=不限制'),
  freeLlmDailyLimit: Schema.number().default(0)
    .description('每日免费 LLM 硬上限（可选兜底，默认 0=关闭）；>0 时作为每日总闸，用尽降级离线模板'),
  freeDailyLimit: Schema.number().default(0)
    .description('（兼容别名，deprecated）设置后等同 freeLlmDailyLimit'),

  // ---- 股票行情自动适配（v0.6.0）----
  stockQuoteEnabled: Schema.boolean().default(true)
    .description('stock-trend 剧本下自动拉腾讯实时行情构建 384 爻 inputs（divine 传/提取到股票代码时）；false=关闭自动行情'),
  stockBaselinesPath: Schema.string().default('')
    .description('卦象编码基线表路径（JSON，缺省用内置 baselines-stock.json）；留空=内置。基线模式爻义=相对市场中位偏强/偏弱'),

  // ---- 合规：脱敏回传默认关 ----
  telemetryEnabled: Schema.boolean().default(false).description('脱敏回传默认关'),
  knowledgeBaseUrl: Schema.string().default('').description('在线知识库入口（可选）'),
})

export async function apply(ctx, config) {
  // 0) DSH 会话当前模型注入（v0.9.0 修复：透传 + 激活）
  //    透传：Runtime 可经 config.sessionModel / ctx.sessionModel / ctx.llm.sessionModel 注入，
  //      v0.8.x 只读第一种，其余两种静默丢失 → 会话层不激活且无告警。
  //    激活：Config schema 的 cloudModelEnabled 默认 false 会被填进 config，
  //      使 resolveCloudSettings 的自动会话分支恒判为「未启用」（详见 buildSessionCloudConfig 注释）。
  //      故由本层在自动会话条件成立时显式置 enabled=true，恢复「无需手动开 enabled」的文档承诺。
  const built = buildSessionCloudConfig(config, ctx)
  const cloudConfig = built.config
  const sess = built.session

  // 1) 云模型适配器（config + env 双源；未启用/无密钥 → 离线确定性模板）
  const cloud = configureCloudModel(cloudConfig)
  const customModels = parseCustomModels(cloudConfig)
  const quota = checkLlmQuota(cloudConfig)

  // 2) 自定义剧本 fs 持久化目录 → 启动回灌
  const dataDir = join(dirname(fileURLToPath(new URL('./', import.meta.url))), 'data', 'scripts')
  const loaded = configureRegistry(dataDir)

  // 3) 加载自校验（纯 lib，零 Runtime 依赖）
  const check = runSelfCheck(config)
  const sessionLog = sess.source
    ? `；会话模型 ${sess.enabled ? `已激活（来源 ${sess.source}）` : `未启用（来源 ${sess.source}，原因 ${sess.reason}）`}`
    : '；会话模型 未注入（离线模板）'
  ctx.logger?.info?.(
    `[道一-易经推演] 自校验 ${check.ok ? '通过' : '失败:' + JSON.stringify(check.issues)}` +
      `；自定义剧本回灌 ${loaded} 个` +
      `；云模型 ${cloud.active ? `已启用(${cloud.provider}/${cloud.model || '(默认)'})` : '未启用(离线模板)'}` +
      sessionLog +
      (customModels.length ? `；自定义模型 ${customModels.length} 个` : '') +
      `；LLM 额度 ${quota.enabled ? `速率 ${quota.rate?.rateLimit === Infinity ? '不限' : quota.rate?.rateLimit + '次/分钟(排队)'}（每日上限 ${quota.limit > 0 ? quota.limit + '次' : '关闭'}）` : '闸门关闭'}`,
  )

  // 4) 注册工具
  const { registerYijingTools } = await import('./tools/yijing/index.mjs')
  const tools = await registerYijingTools(ctx, cloudConfig)
  ctx.logger?.info?.(
    `[道一-易经推演] v${PLUGIN_VERSION} 已加载，默认剧本=${config.defaultScript}，` +
      `强否决=${config.strongVetoEnabled}，工具=${tools.join(',')}`,
  )
}

export default { name, inject, Config, apply }
