// index.mjs — 道一-易经推演（dsh-daoyi-yijing）插件入口
// 沿用 dsh-motor-ai-l0 的 apply 生命周期；纯 JS、零求解器依赖（云模型调用走 DSH Runtime 注入）。
import Schema from '@deepseek-ai/schemastery'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { dirname, join } from 'node:path'
import { configureRegistry } from './lib/yijing/registry.mjs'
import { runSelfCheck } from './lib/yijing/selfcheck.mjs'
import { configureCloudModel } from './lib/yijing/cloud-model.mjs'

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
  defaultScript: Schema.string().default('motor-design').description('默认决策剧本 id（motor-design=电机电磁设计·万事决 / stock-trend=股票趋势研判）'),
  allowCustomScript: Schema.boolean().default(true).description('允许 JSON 自定义剧本'),
  strongVetoEnabled: Schema.boolean().default(true).description('强关联一票否决（引擎灵魂，默认开）'),
  reportStyle: Schema.union(['classic', 'plain']).default('classic')
    .description('classic=易经卦象风 / plain=工程报表风'),

  // ---- 云模型（L1→L7 分解 / L1 卦象文案；OpenAI 兼容，离线自动降级为确定性模板）----
  cloudModelEnabled: Schema.boolean().default(false)
    .description('启用真实云模型（默认 OFF；开启后 L1→L7 分解与卦象文案由模型生成）'),
  cloudModelProvider: Schema.string().default('deepseek')
    .description('厂商：deepseek/qwen/glm/moonshot/minimax/openai/custom'),
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

  // ---- 免费额度本地闸门（与 dsh-motor-ai-l0 同口径，本地闭环、断网也拦）----
  freeQuotaEnabled: Schema.boolean().default(true).description('本地闭环免费额度闸门'),
  freeDailyLimit: Schema.number().default(10).description('每日免费额度'),

  // ---- 合规：脱敏回传默认关 ----
  telemetryEnabled: Schema.boolean().default(false).description('脱敏回传默认关'),
  knowledgeBaseUrl: Schema.string().default('').description('在线知识库入口（可选）'),
})

export async function apply(ctx, config) {
  // 0) 云模型适配器（config + 环境变量双源；未启用/无密钥 → 离线确定性模板）
  const cloud = configureCloudModel(config)

  // 1) 自定义剧本 fs 持久化目录 → 启动回灌
  const dataDir = join(dirname(fileURLToPath(new URL('./', import.meta.url))), 'data', 'scripts')
  const loaded = configureRegistry(dataDir)

  // 2) 加载自校验（纯 lib，零 Runtime 依赖）
  const check = runSelfCheck(config)
  ctx.logger?.info?.(
    `[道一-易经推演] 自校验 ${check.ok ? '通过' : '失败:' + JSON.stringify(check.issues)}` +
      `；自定义剧本回灌 ${loaded} 个` +
      `；云模型 ${cloud.active ? `已启用(${cloud.provider}/${cloud.model})` : '未启用(离线模板)'}`,
  )

  // 3) 注册工具
  const { registerYijingTools } = await import('./tools/yijing/index.mjs')
  const tools = await registerYijingTools(ctx, config)
  ctx.logger?.info?.(
    `[道一-易经推演] v${PLUGIN_VERSION} 已加载，默认剧本=${config.defaultScript}，` +
      `强否决=${config.strongVetoEnabled}，工具=${tools.join(',')}`,
  )
}

export default { name, inject, Config, apply }
