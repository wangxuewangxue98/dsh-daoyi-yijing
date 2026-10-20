// registry.mjs — 自定义剧本注册表（M1：fs 持久化 + 启动时回灌）
//
// 与 dsh-motor-ai-l0 的 data/ 约定一致：自定义剧本落盘到 <插件>/data/scripts/<script_id>.json，
// 插件 apply 时 configureRegistry(dataDir) 一次性回灌到内存；持久化失败不致命（内存态仍有效）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CUSTOM = new Map()
let DATA_DIR = null

// 解析插件自身 data/scripts 目录（DSH Runtime 内为插件沙箱路径）
export function resolveDefaultDataDir() {
  try {
    const here = fileURLToPath(new URL('./', import.meta.url))
    // lib/yijing -> 插件根 -> data/scripts
    return join(here, '..', '..', '..', 'data', 'scripts')
  } catch {
    return null
  }
}

export function configureRegistry(dataDir) {
  DATA_DIR = dataDir || DATA_DIR || resolveDefaultDataDir()
  let loaded = 0
  if (!DATA_DIR) return loaded
  try {
    if (existsSync(DATA_DIR)) {
      for (const f of readdirSync(DATA_DIR)) {
        if (!f.endsWith('.json')) continue
        try {
          const s = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'))
          if (s && s.script_id) {
            CUSTOM.set(s.script_id, s)
            loaded++
          }
        } catch {
          // 损坏的 JSON 跳过
        }
      }
    }
  } catch {
    // 无文件系统权限时静默降级为纯内存态
  }
  return loaded
}

export function getDataDir() {
  return DATA_DIR
}

export function saveCustomScript(script) {
  if (!script || !script.script_id) throw new Error('[yijing] 自定义剧本缺少 script_id')
  CUSTOM.set(script.script_id, script)
  let persisted = false
  let error = null
  if (DATA_DIR) {
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(join(DATA_DIR, `${script.script_id}.json`), JSON.stringify(script, null, 2), 'utf8')
      persisted = true
    } catch (e) {
      error = String(e?.message || e)
    }
  }
  return { script_id: script.script_id, persisted, error }
}

export function loadCustomScript(id) {
  return CUSTOM.get(id) || null
}
export function listCustomScripts() {
  return Array.from(CUSTOM.values()).map((s) => ({ script_id: s.script_id, name: s.name }))
}
