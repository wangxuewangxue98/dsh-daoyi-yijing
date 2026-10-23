// test_license.mjs — 授权地基（lib/yijing/license.mjs）专项测试（v0.9.4 Phase 1）
process.env.DAOYI_DIVINE_QUOTA_OFF = '1'
process.env.DAOYI_LICENSE_FILE = `${process.cwd()}/.test-license.json`
process.env.DAOYI_LICENSE_PUBKEY = '' // 由本测试动态注入

import { generateKeyPairSync, createPublicKey, createPrivateKey, sign as ed25519Sign } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import {
  TIERS,
  TIER_CAPS,
  TIER_LABELS,
  getActivationState,
  getEffectiveTier,
  isRegistered,
  getDailyDivineLimit,
  maxQuadHexes,
  hasCapability,
  buildActivationGuide,
  saveActivationState,
  verifyOfflineCode,
  clearActivation,
} from '../lib/yijing/license.mjs'

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) { console.log('  \u2713', msg); pass++ }
  else { console.log('  \u2717', msg); fail++ }
}

function b64url(buf) { return Buffer.from(buf).toString('base64url') }

// 动态生成测试密钥对（不入库）
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const pubPem = publicKey.export({ type: 'spki', format: 'pem' })
const privKey = createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }))

function makeCode(payload) {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = ed25519Sign(null, Buffer.from(payloadB64, 'utf8'), privKey)
  return `${payloadB64}.${b64url(sig)}`
}

console.log('== 道一-易经 授权地基测试 ==')

// 1) 默认态 = 免费·免注册
const def = getActivationState()
assert(getEffectiveTier(def) === TIERS.FREE, '默认 tier=free')
assert(isRegistered(def) === false, '默认 registered=false')
assert(getDailyDivineLimit(def) === 9, `默认日限=9 (实际 ${getDailyDivineLimit(def)})`)

// 2) 两轴日限
const freeReg = { tier: TIERS.FREE, registered: true, plan: 'free_reg' }
assert(getDailyDivineLimit(freeReg) === 99, `免费注册日限=99 (实际 ${getDailyDivineLimit(freeReg)})`)
const full = { tier: TIERS.FULL }
const plus = { tier: TIERS.PLUS }
assert(getDailyDivineLimit(full) === 9999, '完整版日限=9999')
assert(getDailyDivineLimit(plus) === 9999, 'Plus 日限=9999')

// 3) 维度暴露层数
assert(maxQuadHexes(TIERS.FREE) === 3, 'free maxQuadHexes=3（隐藏第四维）')
assert(maxQuadHexes(TIERS.FULL) === 4, 'full maxQuadHexes=4')
assert(maxQuadHexes(TIERS.PLUS) === 4, 'plus maxQuadHexes=4')

// 4) 能力矩阵
assert(hasCapability(TIERS.FREE, 'microdomain') === false, 'free 无 microdomain')
assert(hasCapability(TIERS.FULL, 'microdomain') === true, 'full 有 microdomain')
assert(hasCapability(TIERS.PLUS, 'drilldown') === true, 'plus 有 drilldown')
assert(hasCapability(TIERS.FULL, 'drilldown') === false, 'full 无 drilldown')
assert(JSON.stringify(TIER_CAPS[TIERS.FREE]) === '[]', 'free caps=[]')

// 5) 升级引导文案（三档均返回非空字符串，且对外口径统一为 免费用户/收费用户/plus用户）
assert(typeof buildActivationGuide(def) === 'string' && buildActivationGuide(def).length > 10, '免费引导文案非空')
assert(buildActivationGuide(full).includes('收费用户'), '收费用户引导含「收费用户」')
assert(buildActivationGuide(plus).includes('下探'), 'plus 引导含「下探」')
assert(buildActivationGuide(def).includes('功能分级'), '免费引导含「功能分级」说明')

// 5b) 档位展示名映射（对外口径）
assert(TIER_LABELS[TIERS.FREE] === '免费用户', 'free 展示名=免费用户')
assert(TIER_LABELS[TIERS.FULL] === '收费用户', 'full 展示名=收费用户')
assert(TIER_LABELS[TIERS.PLUS] === 'plus用户', 'plus 展示名=plus用户')

// 6) 激活态读写往返
clearActivation()
const saved = saveActivationState({ tier: TIERS.FULL, plan: 'monthly', expiresAt: Date.now() + 86400_000, source: 'test' })
assert(saved.ok === true, 'saveActivationState ok')
assert(getEffectiveTier(getActivationState()) === TIERS.FULL, '读回 tier=full')
assert(isRegistered(getActivationState()) === true, '非 free 档 registered=true')
clearActivation()

// 7) 过期激活态回落免费·免注册
saveActivationState({ tier: TIERS.FULL, plan: 'monthly', expiresAt: Date.now() - 1000, source: 'test' })
assert(getEffectiveTier(getActivationState()) === TIERS.FREE, '过期 → 回落 free')

// 8) 离线码验签（公钥未配置 → no-pubkey）
const codeFull = makeCode({ tier: TIERS.FULL, plan: 'monthly', exp: Date.now() + 86400_000 })
assert(verifyOfflineCode(codeFull).reason === 'no-pubkey', '未配置公钥 → no-pubkey')
// 配置公钥后验签通过
process.env.DAOYI_LICENSE_PUBKEY = pubPem
const v1 = verifyOfflineCode(codeFull)
assert(v1.ok === true && v1.state.tier === TIERS.FULL, '配置公钥 → 验签通过(full)')
// 篡改 payload → 验签失败
const [pB64, sB64] = codeFull.split('.')
const tampered = `${b64url(Buffer.from(JSON.stringify({ tier: TIERS.PLUS, plan: 'yearly', exp: Date.now() + 86400_000 })))}.${sB64}`
assert(verifyOfflineCode(tampered).ok === false, '篡改 payload → 验签失败')
// 过期码 → expired
const codeExp = makeCode({ tier: TIERS.FULL, plan: 'monthly', exp: Date.now() - 1000 })
assert(verifyOfflineCode(codeExp).ok === false && verifyOfflineCode(codeExp).reason === 'expired', '过期码 → expired')
// 免费注册码（DR 形态）
const codeReg = makeCode({ tier: TIERS.FREE, reg: true, plan: 'free_reg', exp: Date.now() + 86400_000 * 36500 })
const vReg = verifyOfflineCode(codeReg)
assert(vReg.ok === true && vReg.state.registered === true, '免费注册码(reg) → registered=true')

console.log(`\n授权地基测试：${pass} 通过 / ${fail} 失败`)
try { unlinkSync(process.env.DAOYI_LICENSE_FILE) } catch {}
process.exit(fail ? 1 : 0)
