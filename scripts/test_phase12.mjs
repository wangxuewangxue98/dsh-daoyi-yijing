// test_phase12.mjs — Phase 1/2 端到端集成测试（v0.9.4）：runYijingDivine 门控生效
process.env.DAOYI_DIVINE_QUOTA_OFF = '1' // 隔离商业日限，专测维度/授权暴露
process.env.DAOYI_LICENSE_FILE = `${process.cwd()}/.test-p12-license.json`

import { runYijingDivine } from '../tools/yijing/divine.mjs'
import { TIERS, saveActivationState, clearActivation } from '../lib/yijing/license.mjs'

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) { console.log('  \u2713', msg); pass++ }
  else { console.log('  \u2717', msg); fail++ }
}

console.log('== Phase 1/2 端到端集成测试 ==')

// 免费·免注册（默认态）：暴露 auth，motor-design 无四卦
clearActivation()
const freeMd = await runYijingDivine({ matter: '测试事项', script: 'motor-design', inputs: { JB: 0.8, JS: 0.7 } }, {})
assert(freeMd.auth && freeMd.auth.tier === TIERS.FREE, 'free(motor-design) auth.tier=free')
assert(freeMd.auth.tier_label === '免费用户', 'free auth.tier_label=免费用户')
assert(freeMd.auth.registered === false, 'free registered=false')
assert(freeMd.auth.microdomain_locked === true, 'free microdomain_locked=true')
assert(freeMd.auth.drilldown_locked === true, 'free drilldown_locked=true')
assert(freeMd.quad_hexagram === null, 'motor-design 无四卦(null，门控不适用)')
assert(freeMd.auth.caps.length === 0, 'free caps=[]')

// 免费·免注册 + stock-trend：四卦隐藏第4维 + 升级引导
const freeSt = await runYijingDivine({ matter: '测试事项', script: 'stock-trend', inputs: {} }, {})
assert(freeSt.quad_hexagram && Array.isArray(freeSt.quad_hexagram.locked_dims) && freeSt.quad_hexagram.locked_dims.length === 1,
  'free(stock-trend) 四卦隐藏第4维(locked_dims=1)')
assert(freeSt.quad_hexagram && typeof freeSt.quad_hexagram.upgrade_hint === 'string' && freeSt.quad_hexagram.upgrade_hint.includes('解锁'),
  'free(stock-trend) 含升级引导')

// 完整版（full）+ stock-trend：暴露 4 卦 + 微域解锁
clearActivation()
saveActivationState({ tier: TIERS.FULL, plan: 'monthly', expiresAt: Date.now() + 86400_000, source: 'test' })
const fullSt = await runYijingDivine({ matter: '测试事项', script: 'stock-trend', inputs: {} }, {})
assert(fullSt.auth.tier === TIERS.FULL, 'full auth.tier=full')
assert(fullSt.auth.tier_label === '收费用户', 'full auth.tier_label=收费用户')
assert(fullSt.auth.microdomain_locked === false, 'full microdomain_locked=false')
assert(fullSt.quad_hexagram && fullSt.quad_hexagram.locked_dims === undefined, 'full 四卦完整暴露(无 locked_dims)')
assert(fullSt.auth.caps.includes('microdomain'), 'full caps 含 microdomain')
assert(fullSt.auth.drilldown_locked === true, 'full drilldown_locked=true（仅 plus）')

// 越权注入（显式传 free 态）仍按传入态门控
const overSt = await runYijingDivine({ matter: 'x', script: 'stock-trend', inputs: {}, __authState: { tier: TIERS.FREE, registered: false, plan: 'free_anon' } }, {})
assert(overSt.auth.tier === TIERS.FREE && overSt.quad_hexagram.locked_dims, '显式传 free 态 → 仍隐藏第四维')

// 日限触发（开启闸门，free_anon 默认 9）
clearActivation()
delete process.env.DAOYI_DIVINE_QUOTA_OFF
process.env.DAOYI_DIVINE_QUOTA_FILE = `${process.cwd()}/.test-p12-quota.json`
const { resetDivineQuota } = await import('../lib/yijing/divine-quota.mjs')
resetDivineQuota()
let blocked = false
let blockedMsg = null
for (let i = 0; i < 10; i++) {
  const r = await runYijingDivine({ matter: 'x', script: 'motor-design', inputs: {} }, {})
  if (r.error === 'daily-limit-exceeded') { blocked = true; blockedMsg = r; break }
}
assert(blocked, 'free_anon 第10次触发日限拦截')
assert(blockedMsg && blockedMsg.guide && blockedMsg.guide.includes('升级'), '日限拦截返回升级引导')

console.log(`\nPhase 1/2 集成测试：${pass} 通过 / ${fail} 失败`)
try {
  const { unlinkSync } = await import('node:fs')
  unlinkSync(process.env.DAOYI_LICENSE_FILE)
  unlinkSync(process.env.DAOYI_DIVINE_QUOTA_FILE)
} catch {}
process.exit(fail ? 1 : 0)
