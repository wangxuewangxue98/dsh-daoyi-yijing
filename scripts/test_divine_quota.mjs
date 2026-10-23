// test_divine_quota.mjs — 推演日限闸门（lib/yijing/divine-quota.mjs）专项测试（v0.9.4 Phase 2·P4）
process.env.DAOYI_DIVINE_QUOTA_FILE = `${process.cwd()}/.test-divine-quota.json`
process.env.DAOYI_LICENSE_FILE = `${process.cwd()}/.test-dq-license.json`

import { writeFileSync, unlinkSync } from 'node:fs'
import {
  checkDivineQuota,
  assertDivineQuota,
  resetDivineQuota,
  divineQuotaEnabled,
  DivineQuotaExceededError,
} from '../lib/yijing/divine-quota.mjs'
import { TIERS, saveActivationState } from '../lib/yijing/license.mjs'

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) { console.log('  \u2713', msg); pass++ }
  else { console.log('  \u2717', msg); fail++ }
}

console.log('== 推演日限闸门测试 ==')

// 旁路开关
process.env.DAOYI_DIVINE_QUOTA_OFF = '1'
assert(divineQuotaEnabled({}) === false, 'env off → 禁用')
delete process.env.DAOYI_DIVINE_QUOTA_OFF
assert(divineQuotaEnabled({}) === true, '无 env → 启用')
assert(divineQuotaEnabled({ divineQuotaEnabled: false }) === false, 'config=false → 禁用')

// 默认 free_anon=9
resetDivineQuota()
const freeAnon = { tier: TIERS.FREE, registered: false, plan: 'free_anon' }
let q = checkDivineQuota(freeAnon, {})
assert(q.enabled && q.limit === 9, `free_anon 上限=9 (实际 ${q.limit})`)
assert(q.allowed && q.remaining === 9, '初始 remaining=9')

// 计数递增
for (let i = 0; i < 5; i++) assertDivineQuota(freeAnon, {})
q = checkDivineQuota(freeAnon, {})
assert(q.used === 5 && q.remaining === 4, `计数 5 后 used=5/remaining=4 (实际 ${q.used}/${q.remaining})`)

// 用尽 → 抛错
for (let i = 0; i < 4; i++) assertDivineQuota(freeAnon, {})
let threw = false
try { assertDivineQuota(freeAnon, {}) } catch (e) { threw = e instanceof DivineQuotaExceededError }
assert(threw, '用尽(第10次) → 抛 DivineQuotaExceededError')

// 两轴：free_reg=99（需写激活态）
resetDivineQuota()
saveActivationState({ tier: TIERS.FREE, registered: true, plan: 'free_reg' })
const reg = { tier: TIERS.FREE, registered: true, plan: 'free_reg' }
const qr = checkDivineQuota(reg, {})
assert(qr.limit === 99, `free_reg 上限=99 (实际 ${qr.limit})`)

// config 覆盖
resetDivineQuota()
assert(checkDivineQuota(freeAnon, { freeDailyDivineLimit: 3 }).limit === 3, 'config.freeDailyDivineLimit 覆盖生效(=3)')

// full/plus=9999
resetDivineQuota()
assert(checkDivineQuota({ tier: TIERS.FULL }, {}).limit === 9999, 'full 上限=9999')
assert(checkDivineQuota({ tier: TIERS.PLUS }, {}).limit === 9999, 'plus 上限=9999')

console.log(`\n日限闸门测试：${pass} 通过 / ${fail} 失败`)
try { unlinkSync(process.env.DAOYI_DIVINE_QUOTA_FILE) } catch {}
try { unlinkSync(process.env.DAOYI_LICENSE_FILE) } catch {}
process.exit(fail ? 1 : 0)
