// reviewer.mjs — 推演师封装 + 报告生成（编排 decompose→map→judge→aggregate→conclude）
// 对应于 Python 原型 yijing_reviewer.py:47 IChingReviewer / :160 _generate_text_report
import {
  buildCheckpointDatabase,
  buildFullScript,
  getBuiltinScript,
} from './checkpoints.mjs'
import { resolveValue, judgeYinYang } from './mapping.mjs'
import { aggregate } from './aggregator.mjs'
import {
  decomposeWithCloudModel,
  concludeWithCloudModel,
  setCloudModelAdapter,
  resolveCloudSettings,
  getLlmQuotaSnapshot,
  consumeLlmQuotaBlock,
} from './cloud-model.mjs'

// 重新导出云模型接口，便于调用方统一从 reviewer 引入
export { decomposeWithCloudModel, concludeWithCloudModel, setCloudModelAdapter }

// 本次推演的 LLM 使用与额度画像（additive：离线时也有值，quota.enabled=false 或 used=0）
function buildLlmProfile(config, matter) {
  const settings = resolveCloudSettings(config)
  const quota = getLlmQuotaSnapshot(config)
  const block = consumeLlmQuotaBlock()
  return {
    active: Boolean(settings.enabled),
    provider: settings.provider,
    model: settings.model || null,
    kind: settings.kind,
    matter_chars: String(matter || '').length,
    quota,
    quota_blocked: Boolean(block),
    notice: block ? block.message : null,
  }
}

// 主推演：matter(决策事项) + script(剧本) → 六层结论
export async function evaluate(matter, scriptOrId, opts = {}) {
  const script =
    typeof scriptOrId === 'string'
      ? getBuiltinScript(scriptOrId) || buildFullScript()
      : scriptOrId || buildFullScript()
  const inputs = opts.inputs || {}
  const config = opts.config || {}

  // L1→L7 分解（云模型驱动，离线降级为因数清单）
  const decomposition = await decomposeWithCloudModel(matter, script, { config, ...opts })

  // L7 阴阳判定（确定性；NA 检查点跳过，不造假、不计入）
  const db = buildCheckpointDatabase(script)
  const evaluations = new Map()
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    const value = resolveValue(cp, inputs)
    const yinYang = judgeYinYang(cp, value)
    evaluations.set(cp.id, { value, yinYang, pass: yinYang === 1 })
  }

  // L6→L2 聚合（确定性，verdict 唯一裁判）
  const agg = aggregate(db, evaluations)

  // L1 结论文案（云模型 or 模板）
  const cloudText = await concludeWithCloudModel(agg, script, matter, { config, ...opts })
  const conclusion = cloudText || generateConclusionText(agg, script, opts.reportStyle || config.reportStyle || 'classic')

  return {
    script_id: script.script_id,
    matter,
    decomposition,
    ...agg,
    conclusion_text: conclusion,
    llm: buildLlmProfile(config, matter),
  }
}

// 易经风格 / 工程报表风 结论文案（L1 太极文案层，可离线）
export function generateConclusionText(agg, script, style = 'classic') {
  const baguaLines = Object.values(agg.domain_results)
    .map(
      (d) =>
        `${d.bagua}(${d.name}) ${(d.score * 100).toFixed(0)}%${d.strong_veto ? ' [否决]' : ''}`,
    )
    .join('；')
  if (style === 'plain') {
    return `结论=${agg.verdict}｜风险=${agg.risk_level}｜综合分=${agg.overall_score}｜${baguaLines}`
  }
  const tian = agg.sancai.tian?.score ?? 0
  const di = agg.sancai.di?.score ?? 0
  const ren = agg.sancai.ren?.score ?? 0
  const head =
    agg.verdict === '可行'
      ? '乾为天，刚健中正，宜进取'
      : agg.verdict === '有条件可行'
        ? '水山蹇，行有艰险，宜审慎'
        : '地水师，险而顺，宜止退'
  return (
    `${head}。\n【太极】${agg.verdict}（风险${agg.risk_level}，综合 ${(agg.overall_score * 100).toFixed(0)}%）\n` +
    `【三才】天 ${(tian * 100).toFixed(0)}%／地 ${(di * 100).toFixed(0)}%／人 ${(ren * 100).toFixed(0)}%\n` +
    `【八宫】${baguaLines}`
  )
}
