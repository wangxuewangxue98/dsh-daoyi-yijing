// divine.mjs — 工具 yijing_divine（主入口）
import { evaluate } from '../../lib/yijing/reviewer.mjs'
import { getBuiltinScript } from '../../lib/yijing/checkpoints.mjs'
import { loadCustomScript } from '../../lib/yijing/registry.mjs'

export const TOOL_PARAMS = {
  matter: {
    type: 'string',
    required: true,
    description: '决策事项（自然语言），如“我要不要接这个 200kW 电机外包项目？预算 30 万，工期 4 个月”',
  },
  script: {
    oneOf: [
      { type: 'string', description: '剧本 id：内置 motor-design / stock-trend / demo-384 / commercial，或已加载自定义剧本 id' },
      { type: 'object', additionalProperties: true, description: '自定义剧本 JSON 对象（含 script_id / name / domains[]）' },
    ],
    description: '剧本 id（内置/已加载自定义）或自定义剧本 JSON 对象；缺省走默认剧本 motor-design',
  },
  inputs: {
    type: 'object',
    additionalProperties: true,
    description: '可选：检查点取值覆盖（id→数值），缺值走阈值保守兜底（可审计，不造假）',
  },
  detail: {
    type: 'boolean',
    description: '是否输出详报（含 64 卦/八宫明细 + LLM 额度画像），默认 false 出紧凑结论（避免长日志灌爆上下文）',
  },
  reportStyle: {
    type: 'string',
    enum: ['classic', 'plain'],
    description: '报告风格，默认 classic 易经卦象风',
  },
  model: {
    type: 'string',
    description:
      '可选：本次调用覆盖模型——厂商 id（deepseek/qwen/glm/moonshot/minimax/openai/custom）、' +
      '自定义模型清单里的 name、或 session（DSH 会话当前模型）；缺省走插件配置默认',
  },
}

// 每次调用的模型覆盖：厂商 id / 自定义模型名 / 'session' → 合并出本次生效 config
export function buildEffectiveConfig(config = {}, model) {
  const m = String(model || '').trim()
  if (!m) return config
  if (m === 'session') return { ...config, cloudModelProvider: 'session', cloudModelUseSessionModel: true }
  return { ...config, cloudModelProvider: m }
}

// LLM 额度画像压缩（紧凑输出用；detail 模式给全量）
function compactLlm(llm) {
  if (!llm) return null
  const q = llm.quota || {}
  const rate = llm.rate || null
  const rateStr =
    q.enabled === false
      ? '闸门已关闭（不计速）'
      : rate && rate.rateLimit === Infinity
        ? '速率不限'
        : `速率 ${rate ? rate.rateLimit : '?'} 次/分钟(排队等待)`
  const dailyStr = q.limit > 0 ? `；今日 ${q.used}/${q.limit}` : ''
  return {
    active: llm.active,
    provider: llm.provider,
    model: llm.model,
    quota: rateStr + dailyStr,
    rate: rate
      ? { rateLimit: rate.rateLimit, queued: rate.queued, waitMs: rate.waitMs }
      : null,
    quota_blocked: Boolean(llm.quota_blocked),
  }
}

// 纯函数主入口（零 DSH 依赖，可单测）
export async function runYijingDivine(args = {}, config = {}) {
  const matter = args.matter || '(未提供决策事项)'
  let scriptArg = args.script
  if (typeof scriptArg === 'string') {
    const obj = getBuiltinScript(scriptArg) || loadCustomScript(scriptArg)
    scriptArg = obj || config.defaultScript || 'motor-design'
  }
  const effectiveConfig = buildEffectiveConfig(config, args.model)
  const result = await evaluate(matter, scriptArg || 'motor-design', {
    inputs: args.inputs || {},
    reportStyle: args.reportStyle || config.reportStyle || 'classic',
    config: effectiveConfig,
  })
  if (args.detail) return result
  // 紧凑输出（对齐 l0 聚合工具思路：只回结论 + 计数，绕开 DSH 2000 行截断）
  const out = {
    verdict: result.verdict,
    risk_level: result.risk_level,
    overall_score: result.overall_score,
    has_veto: result.has_veto,
    conclusion: result.conclusion_text,
    sixiang: result.sixiang,
    sancai: Object.fromEntries(
      Object.entries(result.sancai).map(([k, v]) => [k, { score: v.score }]),
    ),
    llm: compactLlm(result.llm),
  }
  if (result.llm && result.llm.notice) out.notice = result.llm.notice
  return out
}

export async function registerYijingDivine(ctx, config = {}) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(
    defineTool({
      name: 'yijing_divine',
      description:
        '易经推演-万事决 主入口：选剧本 → 分解决策事项为 384 关键因数 → 六层加权聚合 → 给出可定/否定结论' +
        '（可行/有条件可行/不可行）。判定与聚合为确定性规则，云模型仅负责自然语言拆解与卦象文案翻译；' +
        '可用 model 参数覆盖本次模型（厂商/自定义模型名/session）。',
      parameters: TOOL_PARAMS,
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
      },
      async execute(args) {
        // 必须 await：runYijingDivine 为 async，漏 await 会 JSON.stringify(Promise) → "{}"（0.3.3 report.mjs 同类事故）
        const r = await runYijingDivine(args, config)
        return typeof r === 'string' ? r : JSON.stringify(r, null, 2)
      },
    }),
  )
}

export default { runYijingDivine, registerYijingDivine, TOOL_PARAMS, buildEffectiveConfig }
