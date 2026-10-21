// test_rate_limit.mjs — 免费 LLM 每分钟速率限制器专项测试（v0.4.2）
//
// 覆盖：
//  ① 默认：freeLlmPerMinute 默认 10，常速调用立即放行（queued=false）
//  ② 排队等待：窗口内达上限后超额调用进入 FIFO 队列，待最早时间戳滑出后补位（queued=true，waitMs≈窗口）
//  ③ FIFO 公平：limit=1 时多并发按入队顺序依次放行（后者等待更久，顺序不颠倒）
//  ④ 不限速：freeLlmPerMinute=0 → 立即放行、rateLimit=Infinity、无队列
//  ⑤ 运维旁路：freeQuotaEnabled=false → 不节流不计数（enabled=false）
//  ⑥ 集成：callCloudModel 经速率队列后真实外发（mock 适配器），超时/窗口内不丢调用
//
// 隔离：用 env DAOYI_LLM_RATE_WINDOW_MS 把窗口压到 150ms，使排队测试在亚秒级完成；
//      用 resetRateLimit() 在每个区块前清空窗口与队列，避免互相污染。
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import {
  acquireLlmRateLimit,
  resetRateLimit,
  getLlmPerMinuteLimit,
  getRateWindowMs,
  checkLlmQuota,
} from '../lib/yijing/quota.mjs'
import { setCloudModelAdapter, callCloudModel } from '../lib/yijing/cloud-model.mjs'

// 窗口压到 150ms（仅测试；不改生产默认 60s）
process.env.DAOYI_LLM_RATE_WINDOW_MS = '150'

const QUOTA_FILE = join(tmpdir(), `daoyi-rate-selftest-${process.pid}.json`)
process.env.DAOYI_LLM_QUOTA_FILE = QUOTA_FILE
rmSync(QUOTA_FILE, { force: true })

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) {
    pass++
    console.log('  PASS', msg)
  } else {
    fail++
    console.error('  FAIL', msg)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // ── 窗口/默认值解析 ──
  assert(getRateWindowMs() === 150, `窗口解析：env DAOYI_LLM_RATE_WINDOW_MS=150 → ${getRateWindowMs()}`)
  assert(getLlmPerMinuteLimit({}) === 10, `默认每分钟速率 = 10（实际 ${getLlmPerMinuteLimit({})}）`)
  assert(getLlmPerMinuteLimit({ freeLlmPerMinute: 3 }) === 3, 'freeLlmPerMinute 优先')
  assert(getLlmPerMinuteLimit({ freeLlmPerMinute: 0 }) === Infinity, 'freeLlmPerMinute=0 → 不限速(Infinity)')
  resetRateLimit()

  // ── ① 默认常速：立即放行 ──
  {
    const cfgs = [{ freeLlmPerMinute: 10 }, { freeLlmPerMinute: 10 }]
    for (let i = 0; i < 5; i++) {
      const r = await acquireLlmRateLimit(cfgs[i % 2], 't')
      assert(r.enabled === true && r.queued === false && r.rateLimit === 10, `① 常速第 ${i + 1} 次立即放行（queued=${r.queued}）`)
    }
    resetRateLimit()
  }

  // ── ② 排队等待：limit=2，第 3 次入队，约一个窗口后补位 ──
  {
    const cfg = { freeLlmPerMinute: 2 }
    const t0 = Date.now()
    const p1 = acquireLlmRateLimit(cfg, 't') // 立即
    const p2 = acquireLlmRateLimit(cfg, 't') // 立即
    const p3 = acquireLlmRateLimit(cfg, 't') // 排队
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    const total = Date.now() - t0
    assert(r1.queued === false && r2.queued === false, '② 前 2 次立即放行')
    assert(r3.queued === true, '② 第 3 次被排队（queued=true）')
    assert(r3.waitMs >= 100 && r3.waitMs <= 400, `② 第 3 次等待约一个窗口（waitMs=${r3.waitMs}ms）`)
    assert(total >= 100 && total <= 600, `② 总耗时受队列驱动（total=${total}ms）`)
    resetRateLimit()
  }

  // ── ③ FIFO 公平：limit=1，3 并发按序放行 ──
  {
    const cfg = { freeLlmPerMinute: 1 }
    const p1 = acquireLlmRateLimit(cfg, 't')
    const p2 = acquireLlmRateLimit(cfg, 't')
    const p3 = acquireLlmRateLimit(cfg, 't')
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    assert(r1.queued === false, '③ 第 1 个立即放行')
    assert(r2.queued === true && r3.queued === true, '③ 第 2/3 个均排队')
    assert(r3.waitMs > r2.waitMs, `③ FIFO 顺序：第 3 个等更久（${r2.waitMs}ms < ${r3.waitMs}ms）`)
    resetRateLimit()
  }

  // ── ④ 不限速：freeLlmPerMinute=0 ──
  {
    const cfg = { freeLlmPerMinute: 0 }
    const results = await Promise.all(
      Array.from({ length: 6 }, () => acquireLlmRateLimit(cfg, 't')),
    )
    assert(results.every((r) => r.enabled === true && r.queued === false && r.rateLimit === Infinity), '④ 不限速：6 并发全部立即放行、rateLimit=Infinity')
    const q = checkLlmQuota(cfg)
    assert(q.rate.mode === 'unlimited' && q.rate.rateLimit === Infinity, '④ checkLlmQuota.rate.mode=unlimited')
    resetRateLimit()
  }

  // ── ⑤ 运维旁路：freeQuotaEnabled=false ──
  {
    const cfg = { freeQuotaEnabled: false, freeLlmPerMinute: 1 }
    const r = await acquireLlmRateLimit(cfg, 't')
    assert(r.enabled === false && r.queued === false, '⑤ 旁路：enabled=false、不排队')
    resetRateLimit()
  }

  // ── ⑥ 集成：callCloudModel 经速率队列后真实外发 ──
  {
    resetRateLimit()
    const cfg = { freeLlmPerMinute: 2, freeQuotaEnabled: true }
    setCloudModelAdapter(async () => 'MOCK-OK')
    const msg = [{ role: 'user', content: '测试' }]
    const out = await Promise.all([
      callCloudModel(msg, { config: cfg, tool: 't' }),
      callCloudModel(msg, { config: cfg, tool: 't' }),
      callCloudModel(msg, { config: cfg, tool: 't' }), // 第 3 个排队，但必返回（不降级为 null）
    ])
    assert(out[0] === 'MOCK-OK' && out[1] === 'MOCK-OK' && out[2] === 'MOCK-OK', '⑥ 速率队列不丢调用：3 次外发全部成功返回（无降级）')
    setCloudModelAdapter(null)
    resetRateLimit()
  }

  // ── ⑦ 速率达上限后不降级离线（与旧每日硬拒语义对照）──
  {
    resetRateLimit()
    const cfg = { freeLlmPerMinute: 1 }
    setCloudModelAdapter(async () => 'MOCK-OK')
    const msg = [{ role: 'user', content: 'x' }]
    const r1 = await callCloudModel(msg, { config: cfg, tool: 't' })
    const r2 = await callCloudModel(msg, { config: cfg, tool: 't' }) // 排队，~150ms 后放行
    assert(r1 === 'MOCK-OK' && r2 === 'MOCK-OK', '⑦ 超出速率仍外发成功（未降级 null），印证“排队不拒”')
    setCloudModelAdapter(null)
    resetRateLimit()
  }

  rmSync(QUOTA_FILE, { force: true })
  console.log(`\n===== RATE LIMIT SELFTEST: ${pass} PASS / ${fail} FAIL =====`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('UNCAUGHT', e)
  process.exit(1)
})
