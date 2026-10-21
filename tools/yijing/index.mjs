// tools/yijing/index.mjs — 推演工具集统一注册入口
// 加载安全性：本模块及工具文件均不在顶层 import DSH Runtime，可被 node 直接加载做单测。
import { registerYijingDivine, runYijingDivine } from './divine.mjs'
import { registerYijingScriptList, runYijingScriptList } from './script-list.mjs'
import { registerYijingScriptLoad, runYijingScriptLoad } from './script-load.mjs'
import { registerYijingReport, runYijingReport } from './report.mjs'
import { registerYijingModelList, runYijingModelList } from './model-list.mjs'

export const YIJING_TOOL_NAMES = [
  'yijing_divine',
  'yijing_script_list',
  'yijing_script_load',
  'yijing_report',
  'yijing_model_list',
]

export async function registerYijingTools(ctx, config = {}) {
  await registerYijingDivine(ctx, config)
  await registerYijingScriptList(ctx, config)
  await registerYijingScriptLoad(ctx, config)
  await registerYijingReport(ctx, config)
  await registerYijingModelList(ctx, config)
  return YIJING_TOOL_NAMES
}

export {
  runYijingDivine,
  runYijingScriptList,
  runYijingScriptLoad,
  runYijingReport,
  runYijingModelList,
}
export default { registerYijingTools, YIJING_TOOL_NAMES }
