#!/usr/bin/env node
/**
 * LLM 批量补分：安全并发范例（v0.9.0 / F-10）
 *
 * ── 三条必须先讲清楚的事实 ──────────────────────────────────────────────
 * 1. 速率门是**全局进程内**的：`runLlmScoring` 内部对每个 prompt 调用
 *    `acquireLlmRateLimit`，默认 10 次/分钟（60s 滑动窗口）。窗口满 → FIFO 排队等待，不拒绝。
 *    ⇒ **提高并发度不能提升 LLM 吞吐**，只会让更多请求排队等更久（墙钟总时长不变）。
 * 2. 真正能吃并发的是**不占额度**的部分：拉行情（网络 IO）、确定性推演、四连卦投影、分层查表。
 *    ⇒ 正确姿势是「两段式」：非 LLM 段有界并发，LLM 段串行 + 预算。
 * 3. 想提速，按此优先级，前一级做不到再退到下一级：
 *    ① 放宽速率门（`freeLlmPerMinute` / env `DAOYI_LLM_FREE_PER_MINUTE`，0=不限）——最直接，但会放大费用与上游限流风险；
 *    ② L3 降级 L2（36 问 → 6 问/只，粒度从子域降到分域，卦③ 分辨率会下降）；
 *    ③ 不开 LLM，用 P2 精映射（`fineMap:true`）补结构——零费用零等待；
 *    ④ 并发——**只能加速第 2 条说的非 LLM 段**，对 LLM 段无效。
 *
 * ── 用法（默认零网络、零费用，全部走 stub）─────────────────────────────
 *   node examples/llm-batch-concurrency.mjs                 # 估算表 + 两段式演示（stub）
 *   node examples/llm-batch-concurrency.mjs --stocks 56 --level L3
 *   node examples/llm-batch-concurrency.mjs --per-minute 60 --concurrency 8
 *   node examples/llm-batch-concurrency.mjs --estimate-only # 只打印估算表
 *
 * ── 接真实 LLM ─────────────────────────────────────────────────────────
 * 把 `makeStubLlmCall()` 换成真实实现即可（签名 `(messages, {purpose, expectedKeys}) => Promise<string|null>`）：
 *   - 走 DSH 会话模型：由 Runtime 注入 `config.sessionModel`，v0.9.0 起会自动激活（见 index.mjs / cloud-model.mjs）；
 *   - 走自有 Key：配置 `cloudModelProvider` + `cloudModelApiKey`，`cost_bearer` 变为 `user-key`；
 *   - 走管理端 `/api/llm/score`：未部署前不可用，别把它当已实现的能力。
 * 节流注入点：`runLlmScoring({ ..., throttle })`，默认 `acquireLlmRateLimit`；单测可注入计数桩。
 */

import { mapLimit, estimateLlmBatch, renderEstimateTable, promptsPerStock } from '../lib/yijing/concurrency.mjs'
import { runLlmScoring } from '../lib/yijing/llm-scoring.mjs'
import { evaluateDeterministic } from '../lib/yijing/reviewer.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  if (i < 0) return dflt
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const STOCKS = Number(argOf('stocks', 12)) || 12
const LEVEL = String(argOf('level', 'L2')).toUpperCase() === 'L3' ? 'L3' : 'L2'
const PER_MINUTE = Number(argOf('per-minute', 10))
const CONCURRENCY = Number(argOf('concurrency', 4)) || 4
const ESTIMATE_ONLY = argv.includes('--estimate-only')

// ── 1. 成本/耗时估算表 ────────────────────────────────────────────────
console.log('===== L2/L3 批量补分：耗时与 prompt 预算（默认速率门 10/min）=====\n')
const table = renderEstimateTable([
  estimateLlmBatch({ level: 'L2', stocks: 1, perMinute: PER_MINUTE }),
  estimateLlmBatch({ level: 'L3', stocks: 1, perMinute: PER_MINUTE }),
  estimateLlmBatch({ level: 'L2', stocks: 10, perMinute: PER_MINUTE }),
  estimateLlmBatch({ level: 'L3', stocks: 10, perMinute: PER_MINUTE }),
  estimateLlmBatch({ level: 'L3', stocks: 56, perMinute: PER_MINUTE }),
  estimateLlmBatch({ level: 'L3', stocks: 400, perMinute: PER_MINUTE }),
  estimateLlmBatch({ level: 'L3', stocks: 400, perMinute: 0 }),
])
console.log(table)
console.log(`\n速率门口径：${estimateLlmBatch({ level: LEVEL, stocks: 1, perMinute: PER_MINUTE }).note}`)
console.log(
  `数量口径：L2 = ${promptsPerStock('L2')} 问/只（分域级），L3 = ${promptsPerStock('L3')} 问/只（子域×aspect）。`,
)
console.log('      一次对话式 yijing_divine 另有 decompose + conclude = 2 次外发，不计入上表。')
console.log('      结论：400 只 L3 在默认门下 ≈ 24 小时，批量前务必先按档位/数量算预算。\n')

if (ESTIMATE_ONLY) process.exit(0)

// ── 2. 两段式批量：非 LLM 段有界并发 + LLM 段串行 ────────────────────
console.log(`===== 演示：${STOCKS} 只 · ${LEVEL} · 非LLM并发 ${CONCURRENCY} · 速率门 ${PER_MINUTE}/min =====\n`)

const script = buildStockTrendV2Script()
const db = buildCheckpointDatabase(script)

/** 合成 inputs（离线、无网络）：只为了让确定性推演有值可算，不表达任何真实行情含义 */
function syntheticInputs(seed) {
  const inputs = {}
  let i = 0
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    const r = ((seed * 37 + i * 11) % 100) / 100
    inputs[cp.id] = 0.3 + r * 0.4
    i++
  }
  return inputs
}

// ── 阶段 A：确定性推演（不占 LLM 额度）→ 有界并发 ─────────────────────
const codes = Array.from({ length: STOCKS }, (_, i) => `demo${String(i + 1).padStart(4, '0')}`)
const t0 = Date.now()
const phaseA = await mapLimit(codes, CONCURRENCY, async (code, i) => {
  const ev = evaluateDeterministic(script, {
    inputs: syntheticInputs(i + 1),
    ciGrouping: 'semantic',
    thresholdBasis: 'baseline',
  })
  return { code, verdict: ev.verdict, score: ev.overall_score, quad: ev.quad_hexagram?.structure ? true : false }
})
const phaseAMs = Date.now() - t0
const okA = phaseA.filter((r) => r.ok).length
console.log(`阶段A 确定性推演：${okA}/${phaseA.length} 成功，并发 ${CONCURRENCY}，耗时 ${phaseAMs}ms`)
console.log(`  → 这一段才吃并发；把 --concurrency 调到 1 可见耗时差异\n`)

// ── 阶段 B：LLM 补分（占额度）→ 必须串行，且走全局速率门 ──────────────
/** stub：不联网、不计费，按 expectedKeys 返回 0.5，用于验证管线与节流计数 */
function makeStubLlmCall(counter) {
  return async (messages, { expectedKeys }) => {
    counter.calls++
    const obj = {}
    for (const k of expectedKeys || []) obj[k] = 0.5
    return JSON.stringify(obj)
  }
}

const counter = { calls: 0 }
const throttled = { gate: 0 }
const stubThrottle = async () => {
  throttled.gate++
  // 真实场景这里是 acquireLlmRateLimit（会真的排队）；范例里只计数，避免把演示挂住几分钟
}
const t1 = Date.now()
const llm = await runLlmScoring({
  script,
  db,
  pack: '（范例：证据包已省略）',
  llmCall: makeStubLlmCall(counter),
  level: LEVEL,
  throttle: stubThrottle,
})
const phaseBMs = Date.now() - t1

const expectPrompts = promptsPerStock(LEVEL) // 单只的 prompt 数（本范例只跑 1 只的补分）
console.log(
  `阶段B LLM 补分（${LEVEL}）：过门 ${throttled.gate} 次，实发 ${counter.calls} 次，` +
    `单只期望 ${expectPrompts} 问，覆盖 ${llm.coverage.filled} 键，耗时 ${phaseBMs}ms`,
)
console.log('  → 换真实 llmCall 时请把 throttle 去掉（用默认 acquireLlmRateLimit），否则没有速率保护')

// ── 3. 合规提示 ───────────────────────────────────────────────────────
console.log('\n===== 提醒 =====')
console.log('· 本范例默认全 stub：零网络、零费用、不改动任何配额文件。')
console.log('· 速率门计数落在 $DSH_HOME/storages/dsh-daoyi-yijing/llm-quota.json，断网也拦。')
console.log('· 多进程并行会各自持有一个窗口，可绕过本进程门；那是上游限流风险，本范例不提供也不鼓励。')
console.log('· 股票推演结果由公开数据映射的因子评分驱动，属结构化多因子研判示意，不构成任何投资建议。')
