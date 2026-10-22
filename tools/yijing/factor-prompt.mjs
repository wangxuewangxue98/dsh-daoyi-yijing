// factor-prompt.mjs — 工具 yijing_factor_prompt（v0.6.0 新增）
//
// 目的：把「L1→L7 自然语言拆解」真正交给大模型，且让拆解结果**参与卦象判定**。
// 现状缺口（2026-10-22 分析）：decomposition_json 从不进入 evaluations，LLM 只产出叙事文案；
// 且当前 DSH 内核不提供 sessionModel 服务（注入恒 pending），插件内自动调会话模型不可行。
// 本工具换一条 100% 可行的路径：
//   ① 调 yijing_factor_prompt 拿到「八宫打分表 prompt」
//   ② 对话中的大模型（正在调工具的模型）按 prompt 填 JSON
//   ③ 把 {"JB":0.6,...} 作为 inputs 传给 yijing_divine → LLM 打分真正驱动 384 爻
// 语义：宫级打分为「绝对自评」（0=极弱 1=极强 0.5=中性），卦象走绝对 0.5 阈值（不走市场基线）。
import { getBuiltinScript } from '../../lib/yijing/checkpoints.mjs'
import { loadCustomScript } from '../../lib/yijing/registry.mjs'

export const TOOL_PARAMS = {
  matter: {
    type: 'string',
    required: true,
    description: '决策事项（自然语言，同 yijing_divine）',
  },
  script: {
    type: 'string',
    description: '剧本 id：motor-design / stock-trend / commercial / demo-384 或已加载自定义 id；缺省 motor-design',
  },
}

const VETO_NOTE = {
  FX: '风险面按「风险可控度」语义打分：分越高=越安全=越阳；出现实质利空/黑天鹅线索时给低分',
  XX: '消息面按「消息合规与正面度」语义打分：利空/诉讼/监管 → 低分',
  RK: '风险可控度按「越高越安全」语义打分',
}

/** 纯函数主入口（零 DSH 依赖，可单测） */
export function runYijingFactorPrompt(args = {}, config = {}) {
  const matter = args.matter || '(未提供决策事项)'
  const sid = args.script || config.defaultScript || 'motor-design'
  const script = getBuiltinScript(sid) || loadCustomScript(sid) || getBuiltinScript('motor-design')
  const vetoCodes = new Set(
    ((script.veto && script.veto.domains) || []).map((c) => String(c).toUpperCase()),
  )

  const domainLines = script.domains
    .map((d) => {
      const veto = vetoCodes.has(String(d.code).toUpperCase()) ? '（一票否决域：强关联项不达标即全盘否决）' : ''
      const note = VETO_NOTE[String(d.code).toUpperCase()] || ''
      return `- ${d.code}（${d.name}·${d.bagua}）${veto}${note ? '；' + note : ''}\n  子域：${d.subdomains
        .map((s) => s.name)
        .join('、')}`
    })
    .join('\n')

  const prompt =
    `你是《道一-易经推演》的 L1→L7 分解官。请针对下面的决策事项，从太极→两仪→三才→四象→八宫逐层审视，\n` +
    `然后对剧本的八个宫逐一给出 0~1 的强弱评分（384 爻判定将直接使用你的评分，请负责任地打分）。\n\n` +
    `【决策事项】${matter}\n\n【剧本】${script.name}（${script.script_id}）\n${domainLines}\n\n` +
    `【打分规则】\n` +
    `1. 每宫一个 0~1 分：0=极弱/极不利，0.5=中性/无证据，1=极强/极有利。\n` +
    `2. 除非确实中性，避免恰好 0.5（0.5 会被判为阳爻边界，建议向两侧偏移 ≥0.05）。\n` +
    `3. 无数据/无证据的宫：给 0.45~0.55 并在 reason 里写明"数据缺失"。\n` +
    `4. reason 一句话给依据（引用事项里的关键事实）；这是可审计性的要求。\n` +
    `5. 严格只输出如下 JSON，不要 markdown 代码块、不要多余文字：\n` +
    `   {"domains":{"${script.domains[0].code}":{"score":0.6,"reason":"…"},…},"notes":"一句话总评"}\n\n` +
    `【评分回填】拿到 JSON 后，把其中的分值扁平化为 {"${script.domains
      .map((d) => `${d.code}":0.5,"`)
      .join('')}…} 形态，作为 inputs 参数传给 yijing_divine（script 传 "${script.script_id}"），即可得到由你的打分驱动的卦象结论。`

  return {
    script_id: script.script_id,
    script_name: script.name,
    domains: script.domains.map((d) => ({ code: d.code, name: d.name, bagua: d.bagua })),
    prompt,
    usage: {
      step1: '把本工具返回的 prompt 交给当前对话的大模型填写',
      step2: '把模型输出的分值扁平化为 {宫code: 分数} 后，作为 inputs 传给 yijing_divine',
      example: `yijing_divine { matter: "${matter.slice(0, 24)}…", script: "${script.script_id}", inputs: { ${script.domains
        .map((d) => `${d.code}: 0.5`)
        .join(', ')} } }`,
    },
  }
}

export async function registerYijingFactorPrompt(ctx, config = {}) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(
    defineTool({
      name: 'yijing_factor_prompt',
      description:
        '生成八宫打分表 prompt（L1→L7 拆解用）：把决策事项按剧本八宫逐宫打 0~1 分。' +
          '流程：本工具拿 prompt → 当前对话大模型填 JSON → 把分值扁平化为 inputs 传给 yijing_divine。' +
          '适合非股票类决策（电机设计/商业化等无行情数据的剧本）。',
      parameters: TOOL_PARAMS,
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
      },
      async execute(args2) {
        try {
          return JSON.stringify(runYijingFactorPrompt(args2, config), null, 2)
        } catch (err) {
          return JSON.stringify({ error: true, message: String(err?.message ?? err) }, null, 2)
        }
      },
    }),
  )
}

export default { runYijingFactorPrompt, registerYijingFactorPrompt, TOOL_PARAMS }
