// report.mjs — 工具 yijing_report（详细推演报告，文件交接）
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { evaluate } from '../../lib/yijing/reviewer.mjs'
import { getBuiltinScript } from '../../lib/yijing/checkpoints.mjs'
import { loadCustomScript } from '../../lib/yijing/registry.mjs'

export const TOOL_PARAMS = {
  matter: { type: 'string', description: '决策事项（同 yijing_divine）' },
  script: {
    oneOf: [
      { type: 'string', description: '剧本 id：内置 motor-design / stock-trend / demo-384，或已加载自定义剧本 id' },
      { type: 'object', additionalProperties: true, description: '自定义剧本 JSON 对象' },
    ],
    description: '剧本 id 或 JSON；缺省走默认剧本 motor-design',
  },
  inputs: { type: 'object', additionalProperties: true, description: '检查点取值覆盖' },
  reportStyle: { type: 'string', enum: ['classic', 'plain'], description: '报告风格' },
}

function formatReport(result) {
  const lines = []
  lines.push('【太极结论】' + result.verdict + ' / 风险 ' + result.risk_level + ' / 综合分 ' + result.overall_score)
  lines.push('【六十四卦】' + Object.keys(result.subdomain_results).length + ' 子领域')
  lines.push('【八宫汇总】')
  for (const d of Object.values(result.domain_results)) {
    lines.push(
      '  ' + d.bagua + '(' + d.name + ') ' + (d.score * 100).toFixed(0) + '%' + (d.strong_veto ? ' [否决]' : ''),
    )
  }
  lines.push('【四象】太阳=' + result.sixiang.太阳.length + ' 少阳=' + result.sixiang.少阳.length +
    ' 少阴=' + result.sixiang.少阴.length + ' 太阴=' + result.sixiang.太阴.length)
  lines.push('【三才】天=' + (result.sancai.tian?.score ?? 0) + ' 地=' + (result.sancai.di?.score ?? 0) +
    ' 人=' + (result.sancai.ren?.score ?? 0))
  lines.push('【结论文案】\n' + result.conclusion_text)
  return lines.join('\n')
}

export async function runYijingReport(args = {}, config = {}, writeToDisk = false) {
  const scriptArg = args.script
  let script = scriptArg
  if (typeof script === 'string') {
    script = getBuiltinScript(script) || loadCustomScript(script) || config.defaultScript || 'motor-design'
  }
  const result = await evaluate(args.matter || '(未提供)', script || 'motor-design', {
    inputs: args.inputs || {},
    reportStyle: args.reportStyle || config.reportStyle || 'classic',
  })
  const text = formatReport(result)
  if (writeToDisk) {
    const dir = 'yijing_gray_logs'
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const path = dir + '/run-' + Date.now() + '.txt'
    writeFileSync(path, text, 'utf8')
    return { path, text, result }
  }
  return { text, result }
}

export async function registerYijingReport(ctx, config = {}) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(
    defineTool({
      name: 'yijing_report',
      description: '生成详细推演报告（文件交接，恒 < 2000 行），并回灌 yijing_gray_logs/ 做灰度留痕。',
      parameters: TOOL_PARAMS,
      output: {
        schema: { type: 'string' },
        render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
      },
      async execute(args) {
        try {
          const out = await runYijingReport(args, config, true)
          return JSON.stringify({ path: out.path, preview: out.text.slice(0, 600) + '…' }, null, 2)
        } catch (err) {
          return JSON.stringify({ error: true, message: String(err?.message ?? err) }, null, 2)
        }
      },
    }),
  )
}

export default { runYijingReport, registerYijingReport, TOOL_PARAMS }
