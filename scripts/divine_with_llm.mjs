// divine_with_llm.mjs — 真实云模型 LLM 推演示例（v0.3.4）
//
// 用法（密钥走环境变量，不落盘）：
//   DAOYI_LLM_API_KEY=sk-xxx \
//   DAOYI_LLM_PROVIDER=deepseek \        # 可选 deepseek/qwen/glm/moonshot/minimax/openai/custom
//   DAOYI_LLM_MODEL=deepseek-chat \      # 可选，留空取厂商默认
//   node scripts/divine_with_llm.mjs "dsh-motor-ai 未来一个月商业成功率" commercial
//
// 也可全部用 config 传入（见 index.mjs 的 Config Schema）。
// 未配置密钥时自动降级为离线确定性模板，推演结论依然成立（verdict 不受影响）。
import { configureCloudModel, setCloudModelAdapter } from '../lib/yijing/cloud-model.mjs'
import { getBuiltinScript } from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'

const matter = process.argv[2] || 'dsh-motor-ai 插件未来一个月商业成功率'
const scriptId = process.argv[3] || 'commercial'

// 1) 配置云模型（config + env 双源；此处 env 已在进程内）
const cloud = configureCloudModel({})
console.log(`云模型：${cloud.active ? `已启用 ${cloud.provider}/${cloud.model}（超时 ${cloud.timeoutMs}ms）` : '未启用（离线模板）'}`)

// 2) 解析剧本
const script = getBuiltinScript(scriptId)
if (!script) {
  console.error(`未知剧本 id：${scriptId}（可用：motor-design / stock-trend / commercial / demo-384）`)
  process.exit(1)
}

// 3) 输入：示例剧本给一组演示域评分；真实场景请传业务实测数据（inputs 为检查点取值）
const DEMO = {
  commercial: { CP: 0.72, TR: 0.58, MA: 0.55, DL: 0.65, CM: 0.62, VP: 0.66, BR: 0.54, RK: 0.52 },
  'stock-trend': { JB: 0.8, HY: 0.55, HG: 0.5, JS: 0.35, ZJ: 0.42, GZ: 0.68, XX: 0.62, FX: 0.45 },
}
const domainScores = DEMO[scriptId]
const inputs = {}
if (domainScores) {
  const { buildCheckpointDatabase } = await import('../lib/yijing/checkpoints.mjs')
  for (const cp of buildCheckpointDatabase(script).checkpoints) inputs[cp.id] = domainScores[cp.domain]
}

// 4) 推演
const result = await evaluate(matter, script, { inputs, config: {} })

// 5) 输出
console.log('\n════════ L1→L7 分解（云模型）════════')
if (result.decomposition.decomposition_json) {
  const j = result.decomposition.decomposition_json
  console.log('层级落点：')
  for (const l of j.layers || []) console.log(`  ${l.level}：${l.note}`)
  console.log('关键因数：')
  for (const f of j.key_factors || []) console.log(`  [${f.domain}] ${f.factor} —— ${f.reason}`)
  console.log('待补数据：', (j.missing_data || []).join('；') || '（无）')
} else if (result.decomposition.decomposition_text) {
  console.log(result.decomposition.decomposition_text)
} else {
  console.log('（离线模式：返回剧本因数清单，共', result.decomposition.factor_count, '个活跃因数）')
}

console.log('\n════════ L7→L1 聚合（确定性引擎）════════')
console.log(`verdict=${result.verdict}｜综合=${(result.overall_score * 100).toFixed(1)}%｜风险=${result.risk_level}｜否决=${result.has_veto}`)

console.log('\n════════ L1 卦象总评（云模型 or 模板）════════')
console.log(result.conclusion_text)

setCloudModelAdapter(null)
