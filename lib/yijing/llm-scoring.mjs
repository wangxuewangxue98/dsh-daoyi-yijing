// llm-scoring.mjs — 1296 子域级 LLM 评分流水线（阶段 2 / S3，v0.8.0）
//
// 定位（阶段 2 设计文档 §六）：1296 的真正瓶颈在数据不在结构。本模块提供子域级评分通道：
//   L2 分域级：36 个分域分（6 prompt，每域 6 问）——激活卦②/卦③，卦④仍同质（分域内 36 项同值）；
//   L3 子域×aspect 级：1296 个检查点分（36 prompt，每分域 36 问）——四刀全激活。
// 单只全量 L3 = 36 次 prompt ≈ 3.6 分钟（10 次/分钟速率闸）；L2 = 6 次 ≈ 36 秒。
//
// 通道契约：llmCall(messages, opts) => Promise<string|null>（与 cloud-model.mjs 注入同款）；
//   离线/未配置/返回 null/解析失败 → 该键缺分（NA），不填充、不造假（引擎既有口径）。
// 合并口径：**行情信号优先**——inputs 已有键不被 LLM 覆盖，LLM 只补缺口。
// 节流：acquireLlmRateLimit（60s 滑动窗口 10 次/分钟 + FIFO 排队；绝不拒绝、绝不降级）。
import { acquireLlmRateLimit } from './quota.mjs'

const SYSTEM_PROMPT =
  '你是股票基本面/技术面/资金/消息/风险分析师。只输出 JSON 对象：键为给定编号，值为 0~1 的相对强度分' +
  '（0.5=市场中位；>0.5 偏强，<0.5 偏弱；无依据给 0.5）。不要输出任何解释文字。'

// 证据包：行情快照摘要（LLM 打分的唯一事实来源；缺字段不猜）
export function buildEvidencePack(quote, indexContext) {
  if (!quote) return '（无行情快照）'
  const lines = [
    `标的：${quote.name || ''} ${quote.code || ''}`,
    `现价/涨跌：${quote.price ?? 'NA'} / ${quote.pct != null ? `${quote.pct}%` : 'NA'}`,
  ]
  if (quote.turnover != null) lines.push(`换手率：${quote.turnover}%`)
  if (quote.pe != null) lines.push(`市盈率：${quote.pe}`)
  if (quote.pb != null) lines.push(`市净率：${quote.pb}`)
  if (quote.totalCap != null) lines.push(`总市值：${quote.totalCap} 亿`)
  if (quote.amount != null) lines.push(`成交额：${quote.amount} 万`)
  if (indexContext && Number.isFinite(indexContext.pct)) {
    lines.push(`大盘上证涨跌：${indexContext.pct}%（相对强弱以此为基准）`)
  }
  return lines.join('\n')
}

// L2：单域 6 个分域分（keys = 分域码，如 JS01..JS06）
export function buildL2Prompt(script, pack, domainCode) {
  const d = script.domains.find((x) => x.code === domainCode)
  if (!d) return null
  const expectedKeys = []
  for (let si = 1; si <= 6; si++) expectedKeys.push(`${domainCode}${String(si).padStart(2, '0')}`)
  const items = []
  for (let si = 0; si < 6; si++) {
    const sd = d.subdomains[si]
    items.push(`${expectedKeys[si]} = ${d.name}·${sd ? sd.name.split('·')[0] : `分域${si + 1}`}`)
  }
  const user =
    `根据以下行情快照，评估「${d.name}」域 6 个分域的相对强度（0~1，0.5=市场中位）：\n` +
    `${items.join('\n')}\n\n行情快照：\n${pack}\n\n只输出 JSON：{"${expectedKeys[0]}":0.5,...}`
  return { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }], expectedKeys }
}

// L3：单分域 36 个检查点分（keys = 8 位检查点 id，如 JS010101..JS010606）
export function buildL3Prompt(script, pack, domainCode, siPos) {
  const d = script.domains.find((x) => x.code === domainCode)
  if (!d) return null
  const sds = d.subdomains.filter((sd) => sd.name && sd.checks && sd.checks[0] && sd.checks[0].id.slice(2, 4) === String(siPos).padStart(2, '0'))
  if (!sds.length) return null
  const expectedKeys = []
  const items = []
  for (const sd of sds) {
    for (const c of sd.checks) {
      expectedKeys.push(c.id)
      items.push(`${c.id} = ${c.name}`)
    }
  }
  const subName = sds[0].name.split('·')[0]
  const user =
    `根据以下行情快照，评估「${d.name}·${subName}」分域 36 个检查点（6 子域 × 6 评估面）的相对强度（0~1，0.5=市场中位）：\n` +
    `${items.join('\n')}\n\n行情快照：\n${pack}\n\n只输出 JSON：{"${expectedKeys[0]}":0.5,...}（共 ${expectedKeys.length} 键）`
  return { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }], expectedKeys, subName }
}

// 解析 LLM 回复 → {scores, invalid, missing}；容忍 ```json 围栏；越界/非数/缺键 → 不计（NA）
export function parseScoreReply(text, expectedKeys) {
  const out = { scores: {}, invalid: [], missing: [] }
  if (typeof text !== 'string' || !text.trim()) {
    out.missing = [...expectedKeys]
    return out
  }
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) {
    out.missing = [...expectedKeys]
    return out
  }
  let obj = null
  try {
    obj = JSON.parse(raw.slice(start, end + 1))
  } catch {
    out.missing = [...expectedKeys]
    return out
  }
  if (!obj || typeof obj !== 'object') {
    out.missing = [...expectedKeys]
    return out
  }
  for (const k of expectedKeys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v < 0 || v > 1) {
        out.invalid.push(`${k}=${v}（越界 0~1）`)
        continue
      }
      out.scores[k] = v
    } else if (v === undefined || v === null) {
      out.missing.push(k)
    } else {
      out.invalid.push(`${k}=${JSON.stringify(v)}（非数值）`)
    }
  }
  return out
}

// 合并：行情信号优先——inputs 已有键不覆盖，LLM 只补缺口
export function mergeLlmScores(inputs, scores) {
  const out = { ...(inputs || {}) }
  let added = 0
  for (const [k, v] of Object.entries(scores || {})) {
    if (out[k] === undefined) {
      out[k] = v
      added++
    }
  }
  return { inputs: out, added }
}

// L2 分域分 → 检查点展开（分域内 36 项同值；文档化局限：卦④不激活，仅 L3 能激活）
export function expandL2ToCheckpoints(l2Scores, db) {
  const out = {}
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    const subKey = cp.id.slice(0, 4) // 分域码
    const v = l2Scores[subKey]
    if (typeof v === 'number') out[cp.id] = v
  }
  return out
}

/**
 * 跑 LLM 评分流水线。
 * @param {object} opts
 * @param {object} opts.script 剧本（stock-trend-v2）
 * @param {object} opts.db buildCheckpointDatabase(script)
 * @param {string} opts.pack buildEvidencePack 产物
 * @param {Function|null} opts.llmCall (messages, {purpose}) => Promise<string|null>
 * @param {'L2'|'L3'} [opts.level] 默认 L3（全激活）；L2 为轻量档
 * @param {object} [opts.config] quota 配置
 * @param {Function} [opts.throttle] 注入节流（默认 acquireLlmRateLimit；测试可注入计数桩）
 * @returns {Promise<{scores:object, coverage:object, degraded:boolean, level:string}>}
 */
export async function runLlmScoring({ script, db, pack, llmCall, level = 'L3', config = {}, throttle }) {
  const gate = throttle || ((c, t) => acquireLlmRateLimit(c, t))
  const prompts = []
  if (level === 'L2') {
    for (const d of script.domains) {
      const p = buildL2Prompt(script, pack, d.code)
      if (p) prompts.push({ ...p, purpose: 'yijing-l2', domain: d.code })
    }
  } else {
    for (const d of script.domains) {
      for (let si = 1; si <= 6; si++) {
        const p = buildL3Prompt(script, pack, d.code, si)
        if (p) prompts.push({ ...p, purpose: 'yijing-l3', domain: d.code, si })
      }
    }
  }
  const coverage = { level, prompts: prompts.length, filled: 0, failed: 0, invalid: 0 }
  const scores = {}
  if (typeof llmCall !== 'function') {
    return { scores, coverage: { ...coverage, degraded: true }, degraded: true, level }
  }
  for (const p of prompts) {
    let reply = null
    try {
      await gate(config, p.purpose)
      reply = await llmCall(p.messages, { purpose: p.purpose, expectedKeys: p.expectedKeys })
    } catch {
      reply = null
    }
    if (typeof reply !== 'string' || !reply.trim()) {
      coverage.failed++
      continue
    }
    const parsed = parseScoreReply(reply, p.expectedKeys)
    coverage.filled += Object.keys(parsed.scores).length
    coverage.invalid += parsed.invalid.length
    Object.assign(scores, parsed.scores)
  }
  return { scores, coverage, degraded: false, level }
}

export default {
  buildEvidencePack,
  buildL2Prompt,
  buildL3Prompt,
  parseScoreReply,
  mergeLlmScores,
  expandL2ToCheckpoints,
  runLlmScoring,
}
