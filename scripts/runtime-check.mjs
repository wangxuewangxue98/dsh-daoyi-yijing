// runtime-check.mjs — DSH Runtime 联调预演（离线，纯 run* 函数，免 @deepseek-ai/dsh-tools）
// 模拟 index.mjs apply 的关键路径：自校验 → 工具清单 → 模型清单/额度快照 → 真实推演 → 报告。
import { runSelfCheck } from '../lib/yijing/selfcheck.mjs'
import { runYijingDivine } from '../tools/yijing/divine.mjs'
import { runYijingScriptList } from '../tools/yijing/script-list.mjs'
import { runYijingReport } from '../tools/yijing/report.mjs'
import { runYijingModelList } from '../tools/yijing/model-list.mjs'

const config = {
  defaultScript: 'motor-design',
  strongVetoEnabled: true,
  reportStyle: 'classic',
  freeQuotaEnabled: true,
}

console.log('== DSH Runtime 联调预演（离线，纯 run* 函数）==')

// 1) 自校验（对应 index.mjs apply 的 runSelfCheck）
const check = runSelfCheck(config)
console.log('自校验:', check.ok ? 'PASS' : 'FAIL', JSON.stringify(check.issues))
if (!check.ok) {
  console.log('RUNTIME-CHECK: FAIL')
  process.exit(1)
}

// 2) 剧本清单（对应 yijing_script_list）
const list = runYijingScriptList()
console.log('内置剧本:', list.builtin.map((b) => b.script_id).join(', '))

// 3) 模型清单 + LLM 额度快照（对应 yijing_model_list；只读，不消耗额度）
const models = runYijingModelList(config)
console.log(
  '可选模型:',
  models.models.map((m) => `${m.id}(${m.kind})`).join(', '),
)
console.log(
  '当前模型:',
  `${models.current.provider} kind=${models.current.kind} usable=${models.current.usable}`,
  '｜LLM 额度:',
  models.quota.enabled ? `${models.quota.used}/${models.quota.limit} 次/天（余 ${models.quota.remaining}）` : '闸门关闭',
)

// 4) 真实推演（对应 yijing_divine 主入口；离线模式不计数）
const r = await runYijingDivine(
  {
    matter: '是否承接 200kW/22000rpm 液冷永磁电机外包项目？',
    script: 'motor-design',
    inputs: { EM01C01: 0.7, EM01C02: 1.55, EM01C03: 1.0, TH02C01: 1 },
  },
  config,
)
console.log('divine:', r.verdict, '| score', r.overall_score, '| risk', r.risk_level)
console.log('conclusion:', r.conclusion)
console.log('llm:', JSON.stringify(r.llm))

// 5) 详细报告（对应 yijing_report）
const rep = await runYijingReport(
  { matter: '是否承接 200kW 液冷永磁电机外包？', script: 'motor-design', inputs: { EM01C01: 0.7, EM01C02: 1.55, EM01C03: 1.0 } },
  config,
)
console.log('report 八宫数:', Object.keys(rep.result.domain_results).length, '| NA 域:', rep.result.na_domains.join(','))

console.log('RUNTIME-CHECK: PASS')
process.exit(0)
