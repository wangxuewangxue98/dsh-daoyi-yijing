// baselines.mjs — 卦象编码参照系（基线表，v0.6.0）
//
// 背景（P0-2 / 64 卦扩充）：v0.5.1 的 quantileThresholds 是「批次内」分位数 —— 批量推演
// 有参照系，但对话里单只/单事项调用没有批次 → 回落绝对阈值 0.5 → 各宫分挤同一侧 → 恒乾系。
// 本模块提供**独立于本次调用的参照系**：阈值来自离线校准出的总体分位（默认 P50 中位数），
// 使每个活跃爻≈50/50，单样本即可触达 64 卦空间。
//
// 语义变化（重要，向用户披露）：爻义从「绝对分 ≥0.5」变为「相对参照系偏强/偏弱」——
// 例如 JS 爻阳 = 技术面强于市场中位。这比绝对阈值更有信息量，也更符合「比较」直觉。
//
// 来源三路（见 baselines-stock.json 的 meta）：
//   A 全市场一次性校准（scripts/calibrate_stock_baselines.mjs，随包发布）
//   B LLM 打分分布（通用事项冷启动；LLM 路径语义为绝对自评 → 不用本表，走 absolute）
//   C 灰度日志自学习（后续版本：批次中位数滚动回写）
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT_BASELINE_FILE = fileURLToPath(new URL('./baselines-stock.json', import.meta.url))

/**
 * 加载基线表。
 * @param {string} scriptId 剧本 id（stock-trend 等）；剧本不匹配返回 null
 * @param {{file?: string}} [opts] 自定义路径（config.stockBaselinesPath）
 * @returns {object|null} { script_id, generated_at, sample_size, domains: {JS:{p25,p50,p75},...} }
 */
export function loadBaselines(scriptId = 'stock-trend', opts = {}) {
  const file = opts.file || DEFAULT_BASELINE_FILE
  try {
    if (!existsSync(file)) return null
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (!data || data.script_id !== scriptId) return null
    if (!data.domains || typeof data.domains !== 'object') return null
    return data
  } catch {
    return null // 损坏文件按无基线处理（回落 absolute），不阻断推演
  }
}

/**
 * 基线 → 卦象编码阈值。q 取 'p25'（严）/'p50'（默认，满熵）/'p75'（宽）。
 * @returns {Record<string, number>} { JS: 0.52, ZJ: 0.48, ... }（缺域不出键 → 该爻回落 0.5）
 */
export function thresholdsFromBaselines(baselines, q = 'p50') {
  const out = {}
  for (const [code, v] of Object.entries((baselines && baselines.domains) || {})) {
    const t = v && v[q]
    if (typeof t === 'number' && Number.isFinite(t)) out[code] = t
  }
  return out
}

/** 基线摘要（供工具输出/日志展示，可审计） */
export function describeBaselines(baselines) {
  if (!baselines) return null
  return {
    script_id: baselines.script_id,
    generated_at: baselines.generated_at || null,
    sample_size: baselines.sample_size || null,
    domains: Object.fromEntries(
      Object.entries(baselines.domains).map(([k, v]) => [k, { p25: v.p25, p50: v.p50, p75: v.p75 }]),
    ),
  }
}

export default { loadBaselines, thresholdsFromBaselines, describeBaselines }
