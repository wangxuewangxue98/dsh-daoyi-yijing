// divine-quota.mjs — 推演调用日限闸门（Phase 2·P4，v0.9.4）
// ============================================================================
// 口径（用户确认 2026-10-22）：按「推演调用次数」——每次 yijing_divine 计 1 次，
// 与 quota.mjs 的「LLM 调用次数」闸门**分层并存**（前者商业门控，后者成本节流）。
//
// 两轴上限由 license.mjs 计算（free_anon=9 / free_reg=99 / full=plus=9999）。
//
// 本地为准的硬闸（fail-closed，断网也拦）；日限用尽 → 抛 DivineQuotaExceededError，
// 调用方捕获后返回友好引导（不崩宿主）。计数只认本地文件，正常用户无法无声跳过。
// 诚实边界：懂技术用户可删/改 divine-quota.json 清零——见方案 R1（软授权固有形态）。
//
// 测试隔离：文件可经 env DAOYI_DIVINE_QUOTA_FILE 指定；全局旁路 env DAOYI_DIVINE_QUOTA_OFF
// 或 config.divineQuotaEnabled===false 可完全关闭计数（开发/自检用，生产不置）。
// ============================================================================
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { getDailyDivineLimit } from './license.mjs'

export function getDivineQuotaFilePath() {
  if (process.env.DAOYI_DIVINE_QUOTA_FILE) return process.env.DAOYI_DIVINE_QUOTA_FILE
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-daoyi-yijing', 'divine-quota.json')
}

/** 本地自然日键（机器本地时区，与 quota.mjs 同口径） */
function localDayKey() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function divineQuotaEnabled(config = {}) {
  if (config && config.divineQuotaEnabled === false) return false
  if (process.env.DAOYI_DIVINE_QUOTA_OFF) return false
  return true
}

export class DivineQuotaExceededError extends Error {
  constructor(message, info = {}) {
    super(message)
    this.name = 'DivineQuotaExceededError'
    this.quota = info
  }
}

function readState() {
  const day = localDayKey()
  let used = 0
  try {
    const obj = JSON.parse(readFileSync(getDivineQuotaFilePath(), 'utf8'))
    if (obj && obj.day === day) used = Math.max(0, Number(obj.used) || 0)
  } catch {
    /* 缺失/损坏 → 新一天，从 0 */
  }
  return { day, used }
}

function writeState(state) {
  const file = getDivineQuotaFilePath()
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ day: state.day, used: state.used, limit: state.limit }, null, 2), 'utf8')
  } catch {
    /* 静默：强制逻辑不依赖写盘 */
  }
}

/**
 * 只读查询（不消耗）。
 * @param {object} state 激活态（由 license.getActivationState 提供）
 * @param {object} [config]
 */
export function checkDivineQuota(state = {}, config = {}) {
  if (!divineQuotaEnabled(config)) {
    return { enabled: false, allowed: true, used: 0, remaining: Infinity, limit: 0, day: localDayKey(), reason: 'disabled' }
  }
  const limit = getDailyDivineLimit(state, config)
  const { day, used } = readState()
  return {
    enabled: true,
    allowed: used < limit,
    used,
    remaining: Math.max(0, limit - used),
    limit,
    day,
    reason: used < limit ? 'within-quota' : 'quota-exhausted',
  }
}

/**
 * 消耗型硬闸——在每次推演入口调用。日限用尽 → 抛 DivineQuotaExceededError（fail-closed）。
 * 旁路开启（divineQuotaEnabled===false / env off）→ 直接放行不计数。
 * @param {object} state 激活态
 * @param {object} [config]
 */
export function assertDivineQuota(state = {}, config = {}) {
  if (!divineQuotaEnabled(config)) return
  const limit = getDailyDivineLimit(state, config)
  if (!limit || limit <= 0) return // 上限关闭（不应发生，两轴默认均有值）→ 不计数
  const s = readState()
  if (s.used >= limit) {
    throw new DivineQuotaExceededError(
      `今日推演额度已用尽（${s.used}/${limit} 次，按本地自然日重置）。`,
      { limit, used: s.used, remaining: 0, day: s.day, allowed: false, reason: 'quota-exhausted' },
    )
  }
  writeState({ day: s.day, used: s.used + 1, limit })
}

/** 仅供测试隔离：清空计数文件与状态 */
export function resetDivineQuota() {
  const file = getDivineQuotaFilePath()
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ day: localDayKey(), used: 0, limit: 0 }, null, 2), 'utf8')
  } catch {
    /* 静默 */
  }
}

export default {
  getDivineQuotaFilePath,
  divineQuotaEnabled,
  checkDivineQuota,
  assertDivineQuota,
  resetDivineQuota,
  DivineQuotaExceededError,
}
