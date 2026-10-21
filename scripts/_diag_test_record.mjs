// _diag_test_record.mjs — 诊断 2026-10-21《8 只股票批量推演报告》中「8/8 全同卦、八宫全 100%」的根因
// 三组对照实验：
//   A) 空 inputs + 无 LLM  → 复现报告现场
//   B) 空 inputs + 有 LLM  → 验证「开了 LLM 是否能救」（判定层是否受 LLM 影响）
//   C) 有结构化 inputs     → 验证「真正的修复路径」是否产生区分度
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { getBuiltinScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'

const script = getBuiltinScript('stock-trend')

function fmt(r, tag) {
  const dom = Object.values(r.domain_results)
    .map((d) => `${d.bagua}${d.code}=${(d.score * 100).toFixed(0)}%`)
    .join(' ')
  const hx = r.conclusion_text.split('：')[0]
  return `${tag.padEnd(26)} 卦=${hx.padEnd(10)} 综合=${(r.overall_score * 100).toFixed(0)}% 结论=${r.verdict} 风险=${r.risk_level}\n${' '.repeat(28)}${dom}`
}

// ── A) 复现：空 inputs，无 LLM ──
console.log('===== A) 空 inputs + 无 LLM（复现报告现场）=====')
const stocks = [
  ['洛阳钼业 603993', '价14.35 当日-7.00% 钼铜矿'],
  ['工商银行 601398', '价8.58 当日-0.23% 大行'],
  ['招商银行 600036', '价42.52 当日-1.23% 大行'],
]
for (const [name, matter] of stocks) {
  const r = await evaluate(`${name} ${matter} 本周涨跌如何？`, script, { inputs: {}, config: {} })
  console.log(fmt(r, name))
}

// ── B) 空 inputs，但 LLM 已启用（mock 适配器返回真实风格文案）──
console.log('\n===== B) 空 inputs + LLM 已启用（验证开启 LLM 是否能救）=====')
const mockLlm = async (messages) => {
  const sys = messages[0].role === 'system' ? messages[0].content : ''
  if (sys.includes('分解官')) {
    return JSON.stringify({
      layers: [{ level: '八宫', note: '洛阳钼业当日-7%属超跌，技术面/资金面承压' }],
      key_factors: [{ domain: 'JS', factor: '量价背离', reason: '单日大跌伴随放量' }],
      missing_data: ['铜价', '刚果金矿山消息'],
    })
  }
  return '乾为天，刚健中正；然洛阳钼业单日重挫七分，宜守正待时。'
}
for (const [name, matter] of stocks) {
  const r = await evaluate(`${name} ${matter} 本周涨跌如何？`, script, {
    inputs: {},
    config: { cloudModel: mockLlm, cloudModelEnabled: true, cloudModelProvider: 'session' },
  })
  console.log(fmt(r, name))
  console.log(`${' '.repeat(28)}LLM文案=${String(r.conclusion_text).slice(0, 42).replace(/\n/g, ' / ')}…`)
}

// ── C) 有结构化 inputs（真正的修复路径）──
console.log('\n===== C) 有结构化 inputs（真实数据驱动）=====')
// 造两组差异明显的 8 宫分值（0~1），映射到各宫 48 个检查点
function mkInputs(domainScores) {
  const db = buildCheckpointDatabase(script)
  const inputs = {}
  for (const cp of db.checkpoints) {
    const s = domainScores[cp.domain] ?? 0.5
    // 用确定性的微扰让同域内检查点取值有分布（围绕域分中心，避免全同）
    const jitter = ((parseInt(cp.id.slice(-2), 10) - 3.5) / 3.5) * 0.15
    inputs[cp.id] = Math.max(0, Math.min(1, s + jitter))
  }
  return inputs
}
const CASES = {
  '洛阳钼业(超跌)': { JS: 0.18, ZJ: 0.22, GZ: 0.55, HG: 0.5, HY: 0.3, FX: 0.25, JB: 0.6, XX: 0.5 },
  '工商银行(抗跌)': { JS: 0.72, ZJ: 0.68, GZ: 0.8, HG: 0.55, HY: 0.6, FX: 0.75, JB: 0.75, XX: 0.6 },
  '招商银行(中性)': { JS: 0.45, ZJ: 0.48, GZ: 0.6, HG: 0.52, HY: 0.5, FX: 0.55, JB: 0.7, XX: 0.55 },
}
for (const [name, ds] of Object.entries(CASES)) {
  const r = await evaluate(`${name} 本周涨跌如何？`, script, { inputs: mkInputs(ds), config: {} })
  console.log(fmt(r, name))
}

// ── D) 缺值兜底语义验证 ──
console.log('\n===== D) 缺值兜底语义（thresholdMid）=====')
const db = buildCheckpointDatabase(script)
const cp0 = db.checkpoints[0]
console.log(`首个检查点 ${cp0.id} threshold_type=${cp0.threshold_type} threshold=${JSON.stringify(cp0.threshold)}`)
console.log(`→ 缺值时 value=null → thresholdMid=${cp0.threshold[0]} → min 判定 ${cp0.threshold[0]} >= ${cp0.threshold[0]} = true → 阳(+1)`)
const allYang = db.checkpoints.every((c) => (c.threshold_type === 'min' ? c.threshold[0] >= c.threshold[0] : false))
console.log(`→ 全部 ${db.checkpoints.length} 个检查点在缺值下判阳：${allYang}（故八宫恒 100%、卦象恒 乾为天）`)
