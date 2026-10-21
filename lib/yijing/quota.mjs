// quota.mjs — 免费额度闸门（**按 LLM 调用计数**口径，v0.3.4）
// ============================================================================
// 与 dsh-motor-ai-l0 lib/quota.mjs 的关系与差异（改前必读）：
//  - l0 的口径是「每次工具调用计 1 次」（10 次/天）；本插件 v0.3.4 起按用户要求
//    改为 **「每次真实 LLM 外发计 1 次」**——一次 yijing_divine = decompose + conclude
//    共 2 次调用，即 2 个额度。默认 20 次/天 ≈ 10 次完整推演/天，与 l0 的 10 次/天
//    工具口径在「钱」的维度上对齐（LLM 调用才产生费用，离线推演不花钱也不计数）。
//  - **本地为准的硬闸（fail-closed）**：计数只认本地 llm-quota.json，不依赖任何后端，
//    断网也拦。放行决策 100% 本地，无旁路遥测（本插件无后端，也不外发任何数据）。
//  - 计数时机 = **真实外发前**（dispatch 前 assert）：401/超时/断网同样计 1 次——
//    失败调用也产生了费用，计费口径必须诚实。
//  - 离线（未配置云模型）不计数：无外发即无费用。
//  - 同一调用链内不合并：decompose 与 conclude 是两次独立外发，各计 1 次（这正是
//    「按 LLM 调用计数」的语义；l0 的 chain token 合并不适用于本口径，故不采用）。
//
// 诚实边界：本地限制本质是「软限制」——懂技术用户可删/改 llm-quota.json 清零。
// 但正常用户无法无声跳过；且额度用尽时推演仍可用（自动降级确定性模板，verdict 不受影响），
// 闸门只拦住「花钱的 LLM 翻译」，不拦住「不花钱的推演本身」。
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

/** 每日免费 LLM 调用额度默认上限（config.freeLlmDailyLimit / env DAOYI_LLM_FREE_DAILY_LIMIT 可覆盖） */
export const DEFAULT_FREE_LLM_DAILY_LIMIT = 20

/**
 * 配额文件路径 —— 与 l0 的 storages/dsh-motor-ai/free-quota.json 同层级、不同命名空间
 * （本插件独立一本账：dsh-daoyi-yijing）。可用 DAOYI_LLM_QUOTA_FILE 覆盖（测试隔离用）。
 */
export function getLlmQuotaFilePath() {
  if (process.env.DAOYI_LLM_QUOTA_FILE) return process.env.DAOYI_LLM_QUOTA_FILE
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-daoyi-yijing', 'llm-quota.json')
}

/** 本地自然日键（按机器本地时区，非 UTC，符合「按天重置」直觉） */
function localDayKey() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 每日上限解析（优先级：config.freeLlmDailyLimit > config.freeDailyLimit[兼容别名]
 * > env DAOYI_LLM_FREE_DAILY_LIMIT > 默认 20）。
 * 兼容别名：v0.3.4 之前 cordis 暴露的是 freeDailyLimit（当时的「每日推演次数」口径），
 * 老配置不改动也能继续生效（按调用计数的新口径解释同一数字）。
 */
export function getLlmDailyLimit(config = {}) {
  const fromConfig = Number(config.freeLlmDailyLimit) > 0 ? Number(config.freeLlmDailyLimit) : 0
  const fromLegacy = Number(config.freeDailyLimit) > 0 ? Number(config.freeDailyLimit) : 0
  const n = fromConfig || fromLegacy || Number(process.env.DAOYI_LLM_FREE_DAILY_LIMIT)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_FREE_LLM_DAILY_LIMIT
}

/** 是否启用闸门（config.freeQuotaEnabled === false → 运维旁路：不拦、不计数） */
export function llmQuotaEnabled(config = {}) {
  return !(config && config.freeQuotaEnabled === false)
}

/**
 * 读本地配额态；文件缺失/损坏/跨天 → 视为新的一天，从 0 开始。
 * 兼容结构 {day, used, limit} 与 {day, free}（后者与 l0 同构，便于人工对账）。
 */
function readLlmQuota(config) {
  const limit = getLlmDailyLimit(config)
  const day = localDayKey()
  let used = 0
  try {
    const obj = JSON.parse(readFileSync(getLlmQuotaFilePath(), 'utf8'))
    if (obj && obj.day === day) used = Math.max(0, Number(obj.used ?? obj.free) || 0)
  } catch {
    /* 缺失/损坏 → 新一天，从 0 */
  }
  return { day, used, limit }
}

/** 写本地配额态；只读/损坏目录静默失败，仍按内存态强制，不崩 */
function writeLlmQuota(state) {
  const file = getLlmQuotaFilePath()
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      JSON.stringify({ day: state.day, used: state.used, limit: state.limit }, null, 2),
      'utf8',
    )
  } catch {
    /* 静默：强制逻辑不依赖写盘成功 */
  }
}

/** 配额用尽错误：callCloudModel 捕获后降级为 null（走确定性模板），不向用户抛栈 */
export class LlmQuotaExceededError extends Error {
  /** @param {string} message @param {object} [info] */
  constructor(message, info = {}) {
    super(message)
    this.name = 'LlmQuotaExceededError'
    this.quota = info
  }
}

/**
 * 只读查询（不消耗）—— 供工具入口/日志展示友好额度信息。
 * @param {object} [config]
 * @returns {{enabled: boolean, allowed: boolean, used: number, remaining: number, limit: number, day: string, reason: string}}
 */
export function checkLlmQuota(config = {}) {
  if (!llmQuotaEnabled(config)) {
    return { enabled: false, allowed: true, used: 0, remaining: Infinity, limit: 0, day: localDayKey(), reason: 'disabled' }
  }
  const state = readLlmQuota(config)
  if (state.used >= state.limit) {
    return {
      enabled: true,
      allowed: false,
      used: state.used,
      remaining: 0,
      limit: state.limit,
      day: state.day,
      reason: 'quota-exhausted',
    }
  }
  return {
    enabled: true,
    allowed: true,
    used: state.used,
    remaining: state.limit - state.used,
    limit: state.limit,
    day: state.day,
    reason: 'within-quota',
  }
}

/**
 * 硬闸（消耗型）—— 在每次真实 LLM 外发前调用。
 *  - 免费计数达到 limit（默认 20 次/天）→ 抛 LlmQuotaExceededError（fail-closed，断网也拦）。
 *  - config.freeQuotaEnabled === false → 直接放行（运维开关；不计数）。
 *  - 写盘失败不拦路（按内存态计数，见 writeLlmQuota 静默语义）。
 * @param {string} [tool] 调用来源标记（仅用于审计/日志）
 * @param {object} [config] 配置对象
 */
export function assertLlmQuota(tool = 'llm', config = {}) {
  if (!llmQuotaEnabled(config)) return
  const state = readLlmQuota(config)
  if (state.used >= state.limit) {
    throw new LlmQuotaExceededError(buildLlmQuotaExceededMessage({ limit: state.limit, used: state.used }), {
      limit: state.limit,
      used: state.used,
      remaining: 0,
      day: state.day,
      tool,
      allowed: false,
      reason: 'quota-exhausted',
    })
  }
  writeLlmQuota({ day: state.day, used: state.used + 1, limit: state.limit })
}

/** 完整版/授权引导（与 dsh-motor-ai-l0 FULL_VERSION_HINTS 同口径的联系邮箱） */
const FULL_VERSION_HINTS = {
  contact: '13546196530@163.com',
  npmPackage: 'dsh-daoyi-yijing',
  market: 'DSH 插件市场（dshhub-market 口令市场）',
}

/** 额度用尽时的引导文案（推演本身仍可用：自动降级确定性模板） */
export function buildLlmQuotaExceededMessage(info = {}) {
  const limit = info.limit ?? getLlmDailyLimit()
  const used = info.used ?? limit
  const { contact, npmPackage, market } = FULL_VERSION_HINTS
  return (
    `今日免费 LLM 调用额度已用尽（${used}/${limit} 次/天，按本地自然日重置）。\n` +
    `本次推演自动降级为离线确定性模板（结论依然成立，仅分解/卦象文案改为模板生成）。\n` +
    `\n` +
    `可选：\n` +
    `1) 明天再用（免费额度按本地自然日自动重置）；\n` +
    `2) 在配置中调大 freeLlmDailyLimit（自建部署场景）；\n` +
    `3) 使用反馈 / 问题排查 / 定制开发请联系 ${contact}；\n` +
    `4) 获取途径：${market} 或 npm install ${npmPackage}。`
  )
}

export default {
  checkLlmQuota,
  assertLlmQuota,
  buildLlmQuotaExceededMessage,
  LlmQuotaExceededError,
  getLlmQuotaFilePath,
  getLlmDailyLimit,
  llmQuotaEnabled,
  DEFAULT_FREE_LLM_DAILY_LIMIT,
}
