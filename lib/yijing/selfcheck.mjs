// selfcheck.mjs — 插件加载自校验（纯 lib，零 DSH Runtime 依赖，可被 node 直接跑）
// 在 index.mjs apply 内调用；离线 runtime-check.mjs 也复用它做“DSH Runtime 联调”预演。
import {
  getBuiltinScript,
  buildCheckpointDatabase,
  listBuiltinScripts,
} from './checkpoints.mjs'
import { YIJING_TOOL_NAMES } from '../../tools/yijing/index.mjs'

export function runSelfCheck(config = {}) {
  const issues = []
  const scripts = listBuiltinScripts()

  for (const meta of scripts) {
    const s = getBuiltinScript(meta.script_id)
    if (!s) {
      issues.push(`内置剧本 ${meta.script_id} 注册丢失`)
      continue
    }
    const db = buildCheckpointDatabase(s)
    if (db.checkpoints.length === 0) issues.push(`剧本 ${meta.script_id} 无检查点`)
    // 校验三才映射引用的域均存在
    for (const [group, codes] of Object.entries(s.sancai_mapping || {})) {
      for (const c of codes) {
        if (!db.domainIndex[c]) issues.push(`剧本 ${meta.script_id} 三才组 ${group} 引用未知域 ${c}`)
      }
    }
  }

  // 默认剧本可解析
  const def = config.defaultScript || 'motor-design'
  if (!getBuiltinScript(def)) issues.push(`默认剧本 ${def} 无法解析`)

  return {
    ok: issues.length === 0,
    issues,
    scripts,
    tool_names: YIJING_TOOL_NAMES,
    default_script: def,
  }
}
