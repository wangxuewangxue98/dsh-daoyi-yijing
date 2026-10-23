// license.mjs — 道一-易经 商业授权地基（Phase 1，v0.9.4）
// ============================================================================
// 两轴授权模型（单版本插件 + 功能分级；详见 docs/商业化三档授权与管理端方案-暂定.md）：
//   tier（能力轴）: free(免注册/免费注册) / full(完整版) / plus(Plus 版)
//   registered（注册轴，仅 free 档有效）: anonymous(免注册) / registered(免费注册)
//
// 组合空间：
//   free + anonymous   → 三维(6³=216) + 9 次/日
//   free + registered  → 三维(6³=216) + 99 次/日   （DR-XXXX 免费注册口令激活）
//   full               → 四维(6⁴=1296) + 9999 次/日
//   plus               → 四维+内嵌下探(6⁸=1,679,616) + 9999 次/日
//
// 安全边界（诚实声明，见方案 R1/R2）：
//   本模块为**本地软授权**——激活态存于用户本机 license.json，技术用户可改可删。
//   这是 DSH 本地插件的固有形态，无法根除只能缓解：
//     · 离线码用 Ed25519 签名（作者私钥签名、插件公钥验签），篡改即失效；
//     · 在线口令(DM-XXXX)走后端可吊销，作为强绑定主推通道；
//     · 付费价值主张 = 层级深度 + 下探溯源能力（服务/数据口径），不依赖隐藏算法。
//
// 凭据约束（§6.6）：本模块**绝不内嵌任何密钥**。Ed25519 公钥经以下顺序解析：
//   config.licensePublicKey → env DAOYI_LICENSE_PUBKEY → 文件 config.licensePubKeyPath。
//   公钥未配置时离线码通道不可用（仅免费态 + 在线口令可用）。作者私钥由用户生成并保管
//   （见 scripts/gen_license_keys.mjs），不得落入仓库。
// ============================================================================
import { createPublicKey, verify as ed25519Verify } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

// ── 两轴常量 ────────────────────────────────────────────────────────────────
export const TIERS = Object.freeze({ FREE: 'free', FULL: 'full', PLUS: 'plus' })
export const TIER_ORDER = Object.freeze(['free', 'full', 'plus'])

/** 用户档位展示名（对外口径，见方案 §2.1：免费用户 / 收费用户 / plus用户；单版本插件，按档位功能分级） */
export const TIER_LABELS = Object.freeze({ free: '免费用户', full: '收费用户', plus: 'plus用户' })

/** 每日推演调用上限（两轴）：free 无码=9 / free 注册=99 / full=plus=9999 */
export const TIER_DAILY_DIVINE_LIMIT = Object.freeze({ free_anon: 9, free_reg: 99, full: 9999, plus: 9999 })

/** 四连卦暴露层数：free 仅前 3 卦（隐藏爻位卦 hex_xi，即"第四维"）；full/plus 全 4 卦 */
export const TIER_MAX_QUAD_HEXES = Object.freeze({ free: 3, full: 4, plus: 4 })

/** 能力矩阵：full 起可触达微域(1296)；plus 额外可下钻(6⁸ 原子钻取) */
export const TIER_CAPS = Object.freeze({ free: [], full: ['microdomain'], plus: ['microdomain', 'drilldown'] })

const CONTACT_EMAIL = '13546196530@163.com'
const NPM_PACKAGE = 'dsh-daoyi-yijing'
const MARKET = 'DSH 插件市场（dshhub-market 口令市场）'

// ── 激活态文件 ──────────────────────────────────────────────────────────────
export function getLicenseFilePath() {
  if (process.env.DAOYI_LICENSE_FILE) return process.env.DAOYI_LICENSE_FILE
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-daoyi-yijing', 'license.json')
}

/** 默认（无激活态） = 免费·免注册 */
export function defaultState() {
  return {
    tier: TIERS.FREE,
    registered: false,
    plan: 'free_anon',
    expiresAt: null,
    source: 'default',
    issuedAt: null,
  }
}

/**
 * 读取本地激活态；文件缺失/损坏/越权字段 → 回退默认 free·anonymous。
 * 仅信任白名单字段，防止本地篡改注入非法 tier。
 * @returns {{tier:string, registered:boolean, plan:string, expiresAt:number|null, source:string, issuedAt:number|null}}
 */
export function getActivationState() {
  const def = defaultState()
  let raw
  try {
    raw = JSON.parse(readFileSync(getLicenseFilePath(), 'utf8'))
  } catch {
    return def
  }
  if (!raw || typeof raw !== 'object') return def
  const tier = TIER_ORDER.includes(raw.tier) ? raw.tier : TIERS.FREE
  const registered = tier === TIERS.FREE ? Boolean(raw.registered) : true
  let expiresAt = null
  if (Number.isFinite(Number(raw.expiresAt))) {
    const n = Number(raw.expiresAt)
    if (n > 0) expiresAt = n
  }
  // 过期激活态 → 回落免费·免注册（不删除文件，仅逻辑失效，便于续费回写）
  if (expiresAt && expiresAt < Date.now()) {
    return { ...def, source: 'expired', issuedAt: raw.issuedAt || null }
  }
  return {
    tier,
    registered,
    plan: String(raw.plan || (tier === TIERS.FREE ? (registered ? 'free_reg' : 'free_anon') : tier)),
    expiresAt,
    source: String(raw.source || 'file'),
    issuedAt: Number.isFinite(Number(raw.issuedAt)) ? Number(raw.issuedAt) : null,
  }
}

export function getEffectiveTier(state = defaultState()) {
  return TIER_ORDER.includes(state.tier) ? state.tier : TIERS.FREE
}
export function isRegistered(state = defaultState()) {
  return getEffectiveTier(state) === TIERS.FREE ? Boolean(state.registered) : true
}

/** 两轴 → 日限键 */
export function dailyLimitKey(tier, registered) {
  const t = getEffectiveTier({ tier })
  if (t === TIERS.FREE) return registered ? 'free_reg' : 'free_anon'
  return t
}

/**
 * 推演日限（两轴）。config 可整体覆盖（自建部署场景）：
 *   config.freeDailyDivineLimit / freeRegisteredDailyDivineLimit / fullDailyDivineLimit / plusDailyDivineLimit
 * @param {object} state
 * @param {object} [config]
 */
export function getDailyDivineLimit(state = defaultState(), config = {}) {
  const key = dailyLimitKey(getEffectiveTier(state), isRegistered(state))
  const cfgMap = {
    free_anon: config.freeDailyDivineLimit,
    free_reg: config.freeRegisteredDailyDivineLimit,
    full: config.fullDailyDivineLimit,
    plus: config.plusDailyDivineLimit,
  }
  const fromCfg = Number(cfgMap[key])
  if (Number.isFinite(fromCfg) && fromCfg > 0) return Math.floor(fromCfg)
  return TIER_DAILY_DIVINE_LIMIT[key] ?? 0
}

export function maxQuadHexes(tier = TIERS.FREE) {
  return TIER_MAX_QUAD_HEXES[getEffectiveTier({ tier })] ?? 3
}
export function hasCapability(tier = TIERS.FREE, cap) {
  const caps = TIER_CAPS[getEffectiveTier({ tier })] || []
  return caps.includes(cap)
}

/** 写激活态（仅白名单字段落盘） */
export function saveActivationState(state) {
  const s = getActivationState() // 先读，保留未知字段不破坏
  const next = {
    ...s,
    tier: getEffectiveTier(state),
    registered: getEffectiveTier(state) === TIERS.FREE ? Boolean(state.registered) : true,
    plan: String(state.plan || (getEffectiveTier(state) === TIERS.FREE ? (state.registered ? 'free_reg' : 'free_anon') : getEffectiveTier(state))),
    expiresAt: Number.isFinite(Number(state.expiresAt)) && Number(state.expiresAt) > 0 ? Math.floor(Number(state.expiresAt)) : null,
    source: String(state.source || 'manual'),
    issuedAt: Number.isFinite(Number(state.issuedAt)) ? Number(state.issuedAt) : Date.now(),
  }
  const file = getLicenseFilePath()
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
    return { ok: true, state: next }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
}

export function clearActivation() {
  return saveActivationState({ ...defaultState(), source: 'cleared' })
}

// ── 升级引导文案（P5）────────────────────────────────────────────────────────
export function buildActivationGuide(state = defaultState(), config = {}) {
  const tier = getEffectiveTier(state)
  const label = TIER_LABELS[tier] || '免费用户'
  const limit = getDailyDivineLimit(state, config)
  if (tier !== TIERS.FREE) {
    const cap =
      tier === TIERS.PLUS
        ? '已解锁全部能力：四维研判（6⁴=1296）+ 内嵌下探溯源（6⁸=1,679,616）'
        : '已解锁四维研判（6⁴=1296，聚合到微域层）'
    return `当前为【${label}】，日限 ${limit} 次/日。${cap}。`
  }
  const reg = isRegistered(state)
  const head = reg
    ? `当前为【免费用户·已注册】：三维研判（6³=216），日限 ${limit} 次/日。`
    : `当前为【免费用户·体验】：三维研判（6³=216），日限 ${limit} 次/日（输入免费注册口令后升至 99 次/日）。`
  return (
    head +
    '\n' +
    `功能分级（单版本插件，按档位解锁能力）：\n` +
    `· 免费用户：三维研判（6³=216），日限 9 次/日（注册后 99 次/日）；\n` +
    `· 收费用户：四维研判（6⁴=1296，微域层），日限 9999 次/日；\n` +
    `· plus用户：四维 + 内嵌下探溯源（6⁸=1,679,616），日限 9999 次/日。\n` +
    `激活/升级：管理端 → DSH 插件管理 → daoyi，或 ${MARKET}；` +
    `免费用户可输入免费注册口令（DR-XXXX，¥0 永久）把日限从 9 升到 99；问题联系 ${CONTACT_EMAIL}。`
  )
}

// ── Ed25519 离线码（作者私钥签名 / 插件公钥验签）──────────────────────────────
export function loadPublicKey(config = {}) {
  if (config.licensePublicKey && String(config.licensePublicKey).trim()) return String(config.licensePublicKey)
  const env = process.env.DAOYI_LICENSE_PUBKEY
  if (env && env.trim()) return env.trim()
  if (config.licensePubKeyPath) {
    try {
      return readFileSync(config.licensePubKeyPath, 'utf8')
    } catch {
      /* 文件缺失 → 走下方 null 分支 */
    }
  }
  return null
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url')
}
function b64urlDecode(str) {
  return Buffer.from(str, 'base64url')
}

/**
 * 校验离线激活码。
 * 码格式：`base64url(payloadJson).base64url(ed25519Signature)`，
 * 签名对象 = payload 原文（UTF-8 字符串），算法 ed25519（null / SHA-512 由 alg 字段决定）。
 * payload = { tier, reg?, plan?, exp?, nonce?, alg? }
 * @returns {{ok:boolean, reason?:string, state?:object}}
 */
export function verifyOfflineCode(code, config = {}) {
  const pub = loadPublicKey(config)
  if (!pub) return { ok: false, reason: 'no-pubkey' }
  if (typeof code !== 'string' || !code.includes('.')) return { ok: false, reason: 'bad-format' }
  const [payloadB64, sigB64] = code.split('.')
  let payload
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
  } catch {
    return { ok: false, reason: 'bad-payload' }
  }
  let pubKey
  try {
    pubKey = createPublicKey(pub.trim())
  } catch {
    return { ok: false, reason: 'bad-pubkey' }
  }
  let sig
  try {
    sig = b64urlDecode(sigB64)
  } catch {
    return { ok: false, reason: 'bad-signature' }
  }
  // 验签对象 = payload 的 base64url 字符串原文（与签名端 gen_license_keys.mjs 一致）
  const msg = Buffer.from(payloadB64, 'utf8')
  const ok = ed25519Verify(null, msg, pubKey, sig)
  if (!ok) return { ok: false, reason: 'bad-signature' }
  const tier = TIER_ORDER.includes(payload.tier) ? payload.tier : TIERS.FREE
  const exp = Number(payload.exp)
  if (Number.isFinite(exp) && exp > 0 && exp < Date.now()) return { ok: false, reason: 'expired' }
  const registered = tier === TIERS.FREE ? Boolean(payload.reg) : true
  return {
    ok: true,
    state: {
      tier,
      registered,
      plan: String(payload.plan || (tier === TIERS.FREE ? (registered ? 'free_reg' : 'free_anon') : tier)),
      expiresAt: Number.isFinite(exp) && exp > 0 ? Math.floor(exp) : null,
      source: 'offline-code',
      issuedAt: Date.now(),
    },
  }
}

/** 便捷激活：先试离线码，非离线码形态则试在线口令 */
export async function activate(code, config = {}) {
  if (typeof code === 'string' && code.includes('.')) {
    const r = verifyOfflineCode(code, config)
    if (r.ok) return { ...r, via: 'offline' }
    if (r.reason !== 'bad-format') return { ...r, via: 'offline' }
  }
  const online = await verifyOnlinePasscode(code, config)
  if (online.ok) return { ...online, via: 'online' }
  return { ok: false, reason: online.reason || 'activation-failed' }
}

/**
 * 在线口令（DM-XXXX-XXXX / DR-XXXX-XXXX）验证——走后端，可吊销。
 * 后端基址：config.licenseApiBase → env DAOYI_LICENSE_API；未配置 → 不可用。
 * @returns {Promise<{ok:boolean, reason?:string, state?:object}>}
 */
export async function verifyOnlinePasscode(passcode, config = {}) {
  const base = (config.licenseApiBase || process.env.DAOYI_LICENSE_API || '').replace(/\/$/, '')
  if (!base) return { ok: false, reason: 'no-api' }
  const code = String(passcode || '').trim()
  if (!code) return { ok: false, reason: 'empty' }
  try {
    const url = `${base}/api/license/verify`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plugin: NPM_PACKAGE, code }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) return { ok: false, reason: `http-${resp.status}` }
    const data = await resp.json().catch(() => null)
    if (!data || data.ok !== true) return { ok: false, reason: data && data.reason ? String(data.reason) : 'rejected' }
    const tier = TIER_ORDER.includes(data.tier) ? data.tier : TIERS.FREE
    const registered = tier === TIERS.FREE ? Boolean(data.registered) : true
    return {
      ok: true,
      state: {
        tier,
        registered,
        plan: String(data.plan || (tier === TIERS.FREE ? (registered ? 'free_reg' : 'free_anon') : tier)),
        expiresAt: Number.isFinite(Number(data.expiresAt)) && Number(data.expiresAt) > 0 ? Math.floor(Number(data.expiresAt)) : null,
        source: 'online-passcode',
        issuedAt: Date.now(),
      },
    }
  } catch (e) {
    return { ok: false, reason: `network:${(e && e.message) || e}` }
  }
}

export default {
  TIERS,
  TIER_ORDER,
  TIER_LABELS,
  TIER_DAILY_DIVINE_LIMIT,
  TIER_MAX_QUAD_HEXES,
  TIER_CAPS,
  getLicenseFilePath,
  getActivationState,
  getEffectiveTier,
  isRegistered,
  dailyLimitKey,
  getDailyDivineLimit,
  maxQuadHexes,
  hasCapability,
  saveActivationState,
  clearActivation,
  buildActivationGuide,
  loadPublicKey,
  verifyOfflineCode,
  verifyOnlinePasscode,
  activate,
}
