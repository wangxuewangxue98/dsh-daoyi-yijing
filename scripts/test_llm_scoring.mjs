// test_llm_scoring.mjs — LLM 评分流水线专项（阶段 2 / S3，v0.8.0）
// 全离线：llmCall 用桩注入，不发任何真实请求；验证 prompt 构造/解析/合并/降级/节流注入。
import {
  buildEvidencePack,
  buildL2Prompt,
  buildL3Prompt,
  parseScoreReply,
  mergeLlmScores,
  expandL2ToCheckpoints,
  runLlmScoring,
} from '../lib/yijing/llm-scoring.mjs'
import { getBuiltinScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'

let pass = 0
let fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log(`  ✓ ${msg}`)
  } else {
    fail++
    console.log(`  ✗ FAIL: ${msg}`)
  }
}

const v2 = getBuiltinScript('stock-trend-v2')
const db = buildCheckpointDatabase(v2)

console.log('== 1. 证据包 ==')
{
  const pack = buildEvidencePack({ name: '贵州茅台', code: '600519', price: 1450, pct: -1.2, pe: 22, pb: 8, totalCap: 18200 }, { pct: -1.48 })
  ok(pack.includes('贵州茅台') && pack.includes('-1.2%') && pack.includes('18200'), '证据包含标的/涨跌/市值')
  ok(pack.includes('大盘上证涨跌：-1.48%'), '证据包含大盘基准')
  ok(buildEvidencePack(null).includes('无行情快照'), '无快照诚实标注')
}

console.log('== 2. L2 prompt（每域 6 分域问）==')
{
  const p = buildL2Prompt(v2, 'pack', 'JS')
  ok(Boolean(p), 'L2 prompt 可构造')
  ok(p.expectedKeys.length === 6 && p.expectedKeys.join(',') === 'JS01,JS02,JS03,JS04,JS05,JS06', `L2 keys = 6 分域码（实际 ${p.expectedKeys.join(',')}）`)
  ok(p.messages.length === 2 && p.messages[0].role === 'system' && p.messages[1].content.includes('JS01'), 'L2 messages 结构（system+user 含键清单）')
  ok(buildL2Prompt(v2, 'pack', 'NOPE') === null, '未知域返回 null')
}

console.log('== 3. L3 prompt（每分域 36 检查点问）==')
{
  const p = buildL3Prompt(v2, 'pack', 'JS', 1)
  ok(Boolean(p), 'L3 prompt 可构造')
  ok(p.expectedKeys.length === 36, `L3 keys = 36（实际 ${p.expectedKeys.length}）`)
  ok(p.expectedKeys.every((k) => /^JS01\d{4}$/.test(k)), 'L3 keys 均为该分域 8 位检查点 id')
  const dbIds = new Set(db.checkpoints.map((c) => c.id))
  ok(p.expectedKeys.every((k) => dbIds.has(k)), 'L3 keys 与剧本检查点 id 完全一致')
  const total = v2.domains.reduce((n, d) => n + 6, 0)
  ok(total === 36, `L3 prompt 总数 = 36 分域（实际 ${total}）`)
}

console.log('== 4. 回复解析（防幻觉/越界/缺键）==')
{
  const keys = ['JS010101', 'JS010102', 'JS010103']
  const good = parseScoreReply('```json\n{"JS010101":0.7,"JS010102":0.3,"JS010103":0.5}\n```', keys)
  ok(Object.keys(good.scores).length === 3 && good.scores['JS010101'] === 0.7, '围栏 JSON 正常解析')
  const partial = parseScoreReply('{"JS010101":0.7,"JS010102":"高"}', keys)
  ok(Object.keys(partial.scores).length === 1 && partial.invalid.length === 1 && partial.missing.length === 1, `部分缺失/非数值分流（invalid=${partial.invalid.length}, missing=${partial.missing.length}）`)
  const oor = parseScoreReply('{"JS010101":1.5,"JS010102":-0.2,"JS010103":0.5}', keys)
  ok(Object.keys(oor.scores).length === 1 && oor.invalid.length === 2, '越界值拒收（不计分）')
  const junk = parseScoreReply('我觉得这只股票不错', keys)
  ok(Object.keys(junk.scores).length === 0 && junk.missing.length === 3, '非 JSON 回复全缺（NA，不造假）')
  const empty = parseScoreReply('', keys)
  ok(empty.missing.length === 3, '空回复全缺')
}

console.log('== 5. 合并口径（行情优先）==')
{
  const { inputs, added } = mergeLlmScores({ JS010101: 0.62 }, { JS010101: 0.9, JS010102: 0.4 })
  ok(inputs.JS010101 === 0.62, '行情信号键不被 LLM 覆盖')
  ok(added === 1 && inputs.JS010102 === 0.4, 'LLM 只补缺口键')
}

console.log('== 6. L2 展开（分域内同值）==')
{
  const expanded = expandL2ToCheckpoints({ JS01: 0.66 }, db)
  const js01 = db.checkpoints.filter((c) => c.id.slice(0, 4) === 'JS01')
  ok(Object.keys(expanded).length === js01.length, `JS01 分域 36 项全展开（实际 ${Object.keys(expanded).length}/${js01.length}）`)
  ok(Object.values(expanded).every((v) => v === 0.66), '分域内 36 项同值（L2 粒度文档化局限）')
}

console.log('== 7. 流水线运行（桩 llmCall）==')
{
  // 桩：只回答第一个 prompt（用 opts.expectedKeys 回填 0.55），其余返回 null
  let calls = 0
  const stub = async (messages, opts) => {
    calls++
    if (calls === 1) return JSON.stringify(Object.fromEntries((opts.expectedKeys || []).map((k) => [k, 0.55])))
    return null
  }
  let throttleCalls = 0
  const r = await runLlmScoring({
    script: v2,
    db,
    pack: 'pack',
    llmCall: stub,
    level: 'L3',
    throttle: async () => {
      throttleCalls++
    },
  })
  ok(r.coverage.prompts === 36, `L3 共 36 prompt（实际 ${r.coverage.prompts}）`)
  ok(Object.keys(r.scores).length === 36, `首个 prompt 36 分全收（实际 ${Object.keys(r.scores).length}）`)
  ok(r.coverage.failed === 35, `其余 35 个 null 回复计 failed（实际 ${r.coverage.failed}）`)
  ok(throttleCalls === 36, `节流闸每 prompt 一次（实际 ${throttleCalls}）`)
  ok(r.degraded === false, '有 llmCall 时 degraded=false')

  // 离线：无 llmCall → 全 NA、不抛错
  const off = await runLlmScoring({ script: v2, db, pack: 'pack', llmCall: null, level: 'L3' })
  ok(off.degraded === true && Object.keys(off.scores).length === 0, '无 llmCall → 诚实降级（零分、零异常）')

  // L2 档：6 prompt
  let l2calls = 0
  const stubL2 = async () => {
    l2calls++
    return null
  }
  const r2 = await runLlmScoring({ script: v2, db, pack: 'pack', llmCall: stubL2, level: 'L2', throttle: async () => {} })
  ok(r2.coverage.prompts === 6, `L2 共 6 prompt（实际 ${r2.coverage.prompts}）`)

  // llmCall 抛错 → 该 prompt 计 failed，流水线不中断
  const stubThrow = async () => {
    throw new Error('network down')
  }
  const r3 = await runLlmScoring({ script: v2, db, pack: 'pack', llmCall: stubThrow, level: 'L2', throttle: async () => {} })
  ok(r3.coverage.failed === 6 && Object.keys(r3.scores).length === 0, 'llmCall 抛错不中断（6 failed）')
}

console.log(fail === 0 ? `\nRESULT: PASS (${pass})` : `\nRESULT: FAIL (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
