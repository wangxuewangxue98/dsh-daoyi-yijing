// script-list.mjs — 工具 yijing_script_list
import { listBuiltinScripts } from '../../lib/yijing/checkpoints.mjs'
import { listCustomScripts } from '../../lib/yijing/registry.mjs'

export const TOOL_PARAMS = {}

export function runYijingScriptList() {
  return { builtin: listBuiltinScripts(), custom: listCustomScripts() }
}

export async function registerYijingScriptList(ctx, config = {}) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(
    defineTool({
      name: 'yijing_script_list',
      description: '列出内置剧本与已加载的自定义剧本。',
      parameters: TOOL_PARAMS,
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
      },
      async execute() {
        return JSON.stringify(runYijingScriptList(), null, 2)
      },
    }),
  )
}

export default { runYijingScriptList, registerYijingScriptList, TOOL_PARAMS }
