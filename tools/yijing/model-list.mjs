// model-list.mjs — 工具 yijing_model_list（模型清单 + 当前选择 + LLM 额度快照，v0.3.4 新增）
import {
  listCloudModels,
  resolveCloudSettings,
  isCloudSettingsViable,
  getLlmQuotaSnapshot,
} from '../../lib/yijing/cloud-model.mjs'

export const TOOL_PARAMS = {}

// 纯函数主入口（零 DSH 依赖，可单测）
export function runYijingModelList(config = {}) {
  const settings = resolveCloudSettings(config)
  const models = listCloudModels(config)
  const quota = getLlmQuotaSnapshot(config)
  return {
    current: {
      provider: settings.provider,
      model: settings.model || null,
      kind: settings.kind, // preset / custom / session
      label: settings.label,
      configured: Boolean(settings.enabled),
      usable: isCloudSettingsViable(settings),
      note:
        settings.kind === 'session' && settings.session_kind !== 'function' && !settings.baseUrl
          ? 'session 模型尚未由 DSH Runtime 注入（config.sessionModel / DAOYI_LLM_SESSION_*），当前走离线模板'
          : null,
    },
    models,
    quota,
    usage_hints: {
      per_call_override: 'yijing_divine / yijing_report 的 model 参数可传厂商 id、自定义模型 name 或 session',
      custom_models_config: 'cloudModelCustomModels（JSON 数组字符串）或 env DAOYI_LLM_CUSTOM_MODELS',
      session_env: 'DAOYI_LLM_SESSION_BASE_URL / DAOYI_LLM_SESSION_MODEL / DAOYI_LLM_SESSION_API_KEY',
      quota_env: 'DAOYI_LLM_FREE_DAILY_LIMIT（每日 LLM 调用额度）/ DAOYI_LLM_QUOTA_FILE（配额文件路径）',
    },
  }
}

export async function registerYijingModelList(ctx, config = {}) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(
    defineTool({
      name: 'yijing_model_list',
      description:
        '列出可选云模型（6 厂商预设 + 自定义模型清单 + DSH 会话当前模型 session）、当前生效模型与今日 LLM 调用额度快照（只读，不消耗额度）。',
      parameters: TOOL_PARAMS,
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
      },
      async execute() {
        return JSON.stringify(runYijingModelList(config), null, 2)
      },
    }),
  )
}

export default { runYijingModelList, registerYijingModelList, TOOL_PARAMS }
