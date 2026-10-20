// script-load.mjs — 工具 yijing_script_load（自定义剧本加载/校验）
import { saveCustomScript } from '../../lib/yijing/registry.mjs'
import { buildCheckpointDatabase } from '../../lib/yijing/checkpoints.mjs'

export const TOOL_PARAMS = {
  script_json: {
    type: 'object',
    additionalProperties: true,
    description: '自定义剧本 JSON（含 script_id / name / domains[] / sancai_mapping）',
  },
  script_desc: {
    type: 'string',
    description: '自然语言剧本描述（骨架：真实部署由云模型转为骨架，此处仅接受 JSON）',
  },
}

export function runYijingScriptLoad(args = {}, config = {}) {
  void config
  let script = args.script_json
  if (!script && args.script_desc) {
    throw new Error('[yijing] 骨架版本暂只接受 script_json；自然语言→骨架将在 M1 由云模型实现')
  }
  if (!script || !script.script_id || !Array.isArray(script.domains)) {
    throw new Error('[yijing] 剧本缺少 script_id 或 domains 数组')
  }
  const cpCount = buildCheckpointDatabase(script).checkpoints.length
  const saved = saveCustomScript(script)
  const id = saved && saved.script_id ? saved.script_id : saved
  return {
    ok: true,
    script_id: id,
    checkpoint_count: cpCount,
    persisted: saved && saved.persisted,
    note: saved && saved.persisted
      ? '自定义剧本已加载并持久化到 data/scripts/'
      : '自定义剧本已加载（内存态；fs 不可用时重启丢失）',
  }
}

export async function registerYijingScriptLoad(ctx, config = {}) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(
    defineTool({
      name: 'yijing_script_load',
      description:
        '加载/校验自定义决策剧本（JSON）。任何决策事项都能编一套评审维度——这是“万事决”命名的核心支撑。',
      parameters: TOOL_PARAMS,
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
      },
      async execute(args) {
        try {
          return JSON.stringify(runYijingScriptLoad(args, config), null, 2)
        } catch (err) {
          return JSON.stringify({ error: true, message: String(err?.message ?? err) }, null, 2)
        }
      },
    }),
  )
}

export default { runYijingScriptLoad, registerYijingScriptLoad, TOOL_PARAMS }
