// index.mjs — 道一-易经推演（dsh-daoyi-yijing）插件入口
// 沿用 dsh-motor-ai-l0 的 apply 生命周期；纯 JS、零求解器依赖（云模型调用走 DSH Runtime 注入）。
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { dirname, join } from 'node:path'
import { configureRegistry } from './lib/yijing/registry.mjs'
import { runSelfCheck } from './lib/yijing/selfcheck.mjs'
// v0.9.1：改为命名空间导入 + 兜底 —— 若出现「更新时文件未完整替换」
// （新 index.mjs 配旧 cloud-model.mjs），命名导入会直接抛
// "does not provide an export named 'buildSessionCloudConfig'"，宿主加载即失败。
// 兜底后降级为「不激活会话层、插件照常可用」，不把一个可降级特性变成启动崩溃。
import * as cloudModelModule from './lib/yijing/cloud-model.mjs'
const { configureCloudModel, parseCustomModels } = cloudModelModule
const buildSessionCloudConfig =
  typeof cloudModelModule.buildSessionCloudConfig === 'function'
    ? cloudModelModule.buildSessionCloudConfig
    : (cfg = {}) => ({
        config: cfg,
        session: { source: null, enabled: false, reason: 'buildSessionCloudConfig-missing(partial-update)', tookOver: false },
      })
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
      '对话中自动使用 DSH 会话当前模型：Runtime 注入会话模型（config.sessionModel / ctx.get("llm")）' +
        '且用户未配置自有 apiKey、未显式选其他厂商时自动启用，无需手动开 cloudModelEnabled、' +
        '无需自备 Key（仍受免费额度速率闸门约束；费用计入用户会话）。**这是会话层的唯一开关**：设 false 即关闭，' +
        '此时完全离线模板。v0.9.0 修复：此前因 cloudModelEnabled 默认 false，本项虽为 true 也无法激活；' +
        'v0.9.1 修复：此前直读 ctx.sessionModel 触发 cordis inject 守卫 → 插件启动崩溃（改用 ctx.get 安全通道）',
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

  // ---- 商业授权门控（v0.9.4 Phase 1/2：两轴 tier×registered）----
  divineQuotaEnabled: Schema.boolean().default(true)
    .description('推演调用日限闸门总开关（商业门控，独立于 LLM 速率闸）。false=运维/授权旁路，不计数不拦截。' +
      '日限口径=每次 yijing_divine 计 1 次；free 无码 9 / free 注册 99 / full=plus 9999，自然日重置'),
  freeDailyDivineLimit: Schema.number().default(9)
    .description('免费·免注册 每日推演上限（次/日）'),
  freeRegisteredDailyDivineLimit: Schema.number().default(99)
    .description('免费·已注册（DR 口令激活）每日推演上限（次/日）'),
  fullDailyDivineLimit: Schema.number().default(9999)
    .description('完整版 每日推演上限（次/日）'),
  plusDailyDivineLimit: Schema.number().default(9999)
    .description('Plus 版 每日推演上限（次/日）'),
  licensePublicKey: Schema.string().default('')
    .description('Ed25519 离线激活码验签公钥（PEM/SPKI）。留空则离线码通道不可用（仅免费态 + 在线口令）。' +
      '须由作者私钥配对生成（见 scripts/gen_license_keys.mjs），切勿入库'),
  licensePubKeyPath: Schema.string().default('')
    .description('Ed25519 公钥文件路径（与 licensePublicKey 二选一；留空=用内联/环境变量 DAOYI_LICENSE_PUBKEY）'),
  licenseApiBase: Schema.string().default('')
    .description('在线口令（DM-/DR-）验证后端基址；留空则在线通道不可用（仅免费态 + 离线码）。如 https://your-host'),

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
  //    透传：Runtime 可经 config.sessionModel / ctx.get('llm')（DSH 真实 LLM 服务）注入，
  //      v0.8.x 只读第一种，其余静默丢失 → 会话层不激活且无告警。
  //    ⚠ v0.9.1 P0：ctx 是带 inject 守卫的 Proxy，直读未声明服务（ctx.sessionModel）会抛
  //      "cannot get property ... without inject" → 插件 required → 宿主启动失败。
  //      现统一走 safeContextService / ctx.get 安全通道（详见 cloud-model.mjs），绝不外抛。
  //    激活：Config schema 的 cloudModelEnabled 默认 false 会被填进 config，
  //      使 resolveCloudSettings 的自动会话分支恒判为「未启用」（详见 buildSessionCloudConfig 注释）。
  //      故由本层在自动会话条件成立时显式置 enabled=true，恢复「无需手动开 enabled」的文档承诺。
  // v0.9.1：会话层是「可降级增强」，不是启动必需 —— 任何异常都不得拖垮插件加载。
  //
  // 【P0 同类防护】ctx 是带 inject 守卫的 Proxy：任何**未声明/非内置**的属性直读都可能抛错，
  //   而 apply() 内抛错 = 插件 required = 整个宿主启动失败（v0.9.0 已因此挂过一次）。
  //   故 apply() 内所有 ctx.* 访问一律经 safeLog/安全通道，日志失败也只丢日志、不丢插件。
  const safeLog = (msg) => {
    try {
      ctx?.logger?.info?.(msg)
    } catch {
      /* 守卫/日志器不可用 → 静默降级，绝不影响插件加载 */
    }
  }
  let built
  try {
    built = buildSessionCloudConfig(config, ctx)
  } catch (err) {
    built = {
      config,
      session: { source: null, enabled: false, reason: `session-build-error:${String(err?.message || err)}`, tookOver: false },
    }
  }
  const cloudConfig = built?.config || config
  const sess = built?.session || { source: null, enabled: false, reason: 'unknown', tookOver: false }

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
  safeLog(
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
  safeLog(
    `[道一-易经推演] v${PLUGIN_VERSION} 已加载，默认剧本=${config.defaultScript}，` +
      `强否决=${config.strongVetoEnabled}，工具=${tools.join(',')}`,
  )

  // 4.1) 商业授权态（v0.9.4 Phase 1/2，两轴）：读本地 license.json，不阻断加载
  try {
    const { getActivationState, getEffectiveTier, isRegistered, getDailyDivineLimit } = await import('./lib/yijing/license.mjs')
    const authState = getActivationState()
    const tier = getEffectiveTier(authState)
    safeLog(
      `[道一-易经推演] 授权态 tier=${tier} registered=${isRegistered(authState)} ` +
        `日限=${getDailyDivineLimit(authState, config)} 次/日` +
        `；推演闸门=${config.divineQuotaEnabled === false ? '关闭' : '开启'}` +
        `；离线码=${config.licensePublicKey || config.licensePubKeyPath || process.env.DAOYI_LICENSE_PUBKEY ? '已配公钥' : '未配(不可用)'}` +
        `；在线口令=${config.licenseApiBase || process.env.DAOYI_LICENSE_API ? '已配后端' : '未配(不可用)'}`,
    )
  } catch (e) {
    safeLog(`[道一-易经推演] 授权态读取失败（不影响加载）：${String((e && e.message) || e)}`)
  }
}

export default { name, inject, Config, apply }
