// reviewer.mjs — 推演师封装 + 报告生成（编排 decompose→map→judge→aggregate→conclude）
// 对应于 Python 原型 yijing_reviewer.py:47 IChingReviewer / :160 _generate_text_report
import {
  buildCheckpointDatabase,
  buildFullScript,
  getBuiltinScript,
  applyStrongOverride,
} from './checkpoints.mjs'
import {
  resolveValueWithOrigin,
  judgeYinYang,
  inputsCoverage,
} from './mapping.mjs'
import { aggregate } from './aggregator.mjs'
import { resolveHexagramForScript, buildOrderFromScript, buildYaos } from './hexagram.mjs'
import { getHexagramText } from './hexagram-texts.mjs'
import { resolveQuadHexagram, quadText } from './quad-hexagram.mjs'
import { enhanceDivergenceReading } from './quad-divergence.mjs'
import { loadBaselines } from './baselines.mjs'
import {
  decomposeWithCloudModel,
  concludeWithCloudModel,
  setCloudModelAdapter,
  resolveCloudSettings,
  getLlmQuotaSnapshot,
  consumeLlmQuotaBlock,
  consumeLlmRateInfo,
} from './cloud-model.mjs'

// 重新导出云模型接口，便于调用方统一从 reviewer 引入
export { decomposeWithCloudModel, concludeWithCloudModel, setCloudModelAdapter }

// 本次推演的 LLM 使用与额度画像（additive：离线时也有值，quota.enabled=false 或 used=0）
function buildLlmProfile(config, matter) {
  const settings = resolveCloudSettings(config)
  const quota = getLlmQuotaSnapshot(config)
  const block = consumeLlmQuotaBlock()
  const rate = consumeLlmRateInfo()
  let notice = block ? block.message : null
  if (rate && rate.queued) {
    const extra = `（免费 LLM 速率达上限，已排队等待约 ${Math.round(rate.waitMs)}ms 后放行，未降级）`
    notice = notice ? notice + '\n' + extra : extra
  }
  return {
    active: Boolean(settings.enabled),
    provider: settings.provider,
    model: settings.model || null,
    kind: settings.kind,
    matter_chars: String(matter || '').length,
    quota,
    quota_blocked: Boolean(block),
    rate, // 本次调用的速率队列许可信息（queued/waitMs/rateLimit）
    notice,
  }
}

// 主推演：matter(决策事项) + script(剧本) → 六层结论
export async function evaluate(matter, scriptOrId, opts = {}) {
  const resolved =
    typeof scriptOrId === 'string'
      ? getBuiltinScript(scriptOrId) || buildFullScript()
      : scriptOrId || buildFullScript()
  // v0.9.0 F-4②：强关联覆盖开关（默认现行为 = 代理量子域豁免否决；'include-proxies' 复现旧口径）
  const script =
    opts.strongOverride === 'include-proxies' ? applyStrongOverride(resolved) : resolved
  const inputs = opts.inputs || {}
  const config = opts.config || {}

  // L1→L7 分解（云模型驱动，离线降级为因数清单）
  const decomposition = await decomposeWithCloudModel(matter, script, { config, ...opts })

  // L7 阴阳判定（确定性；NA 检查点跳过，不造假、不计入）
  const db = buildCheckpointDatabase(script)
  const evaluations = new Map()
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    const { value, origin } = resolveValueWithOrigin(cp, inputs)
    const yinYang = judgeYinYang(cp, value, origin)
    evaluations.set(cp.id, { value, yinYang, pass: yinYang === 1, origin })
  }

  // L6→L2 聚合（确定性，verdict 唯一裁判）
  // v0.9.1 N-3：swingBand 可调（贴线摇摆带宽；默认 0.08）
  const agg = aggregate(db, evaluations, { swingBand: opts.swingBand })

  // 输入覆盖画像（v0.6.0）：兜底率可审计，杜绝「缺值退化」不可察觉
  const coverage = inputsCoverage(db, inputs)

  // L1 结论文案（云模型 or 模板）；卦象编码阈值可注入（基线分位 / 批次分位，缺省 absolute 0.5）
  const cloudText = await concludeWithCloudModel(agg, script, matter, { config, ...opts })
  const style = opts.reportStyle || config.reportStyle || 'classic'
  const conclusion = cloudText || generateConclusionText(agg, script, style, opts.hexThresholds || null)

  // 卦象显式字段（v0.6.0）：此前只嵌在 conclusion_text 里，调用方（工具/报告/测试）无法直接取，
  // 导致「单只股票是否触达 64 卦」不可观测。此处提到返回值，编码口径一并标注。
  const hexagram = buildHexagramField(agg, script, opts.hexThresholds || null)

  // 四连卦（v0.7.0 阶段1，加法）：与单卦同批 evaluations/agg 投影出四正交卦 + 一致性矩阵
  // v0.9.0：编码口径可配（F-5 thresholdBasis / F-9 ciGrouping），默认与 v0.8.x 逐位一致
  const baselines = opts.baselines || loadBaselines(script.script_id)
  const quad = resolveQuadHexagram(db, evaluations, script, baselines, agg, {
    thresholdBasis: opts.thresholdBasis,
    ciGrouping: opts.ciGrouping,
    // v0.9.1：N-1 口径护栏 / P1 敏感爻条数
    allowAbsoluteBasis: opts.allowAbsoluteBasis === true,
    fragileN: opts.fragileN,
  })

  // v0.9.1 P1：分歧深度解读的 LLM 扩写（仅显式开启 + 云模型已激活 + 确实分歧时才调用）
  if (opts.deepReading === true && quad && quad.consistency && quad.consistency.divergence) {
    try {
      quad.consistency.divergence = await enhanceDivergenceReading(quad.consistency.divergence, quad, {
        config,
        matter,
        verdict: agg.verdict,
        score: agg.overall_score,
      })
    } catch {
      /* 扩写失败 → 保留确定性解读，不影响主流程 */
    }
  }

  return {
    script_id: script.script_id,
    matter,
    decomposition,
    ...agg,
    inputs_coverage: coverage,
    hex_thresholds_used: Boolean(opts.hexThresholds && Object.keys(opts.hexThresholds).length),
    hexagram,
    quad_hexagram: quad,
    conclusion_text: conclusion,
    llm: buildLlmProfile(config, matter),
  }
}

/**
 * 卦象显式字段（v0.6.0）：name / 动爻 / 变卦 / 六爻阴阳 / 编码阈值来源。
 * 动爻口径：与生成文案的 resolveHexagramForScript 完全一致（同阈值、同 order）。
 */
export function buildHexagramField(agg, script, thresholds = null) {
  const scores = Object.fromEntries(
    Object.entries(agg.domain_results).map(([k, v]) => [k, v.score]),
  )
  const hx = resolveHexagramForScript(scores, script, thresholds || null)
  const order = buildOrderFromScript(script)
  const yaos = buildYaos(scores, order, thresholds || null)
  const thresholdUsed = {}
  for (const [code, v] of Object.entries(thresholds || {})) {
    if (typeof v === 'number') thresholdUsed[code] = v
  }
  return {
    name: hx.name,
    gua_ci: hx.name,
    moving_yao: hx.movingYao ? hx.movingYao.yaoIndex + 1 : null,
    changed: hx.changed ? hx.changed.name : null,
    yaos: yaos.map((y) => (y === 1 ? '阳' : '阴')),
    threshold_source: Object.keys(thresholdUsed).length ? 'baseline' : 'absolute(0.5)',
    thresholds: Object.keys(thresholdUsed).length ? thresholdUsed : null,
  }
}

/**
 * 确定性推演核心（v0.6.0 新增）：跳过 L1 云模型拆解/文案，只跑 L7 判定 → L6→L2 聚合。
 * 用途：基线校准（数百只不求文案，避免撞 LLM 速率闸）、批量预筛、单测基线。
 * 与 evaluate 的判定部分**完全同源**（同一 resolveValue/judgeYinYang/aggregate 链路），
 * 因此校准出的分位数与对话单只调用可比。
 * @returns {{script_id, domain_results, sancai, sixiang, verdict, risk_level, overall_score, has_veto, inputs_coverage}}
 */
export function evaluateDeterministic(scriptOrId, opts = {}) {
  const resolved =
    typeof scriptOrId === 'string'
      ? getBuiltinScript(scriptOrId) || buildFullScript()
      : scriptOrId || buildFullScript()
  const script =
    opts.strongOverride === 'include-proxies' ? applyStrongOverride(resolved) : resolved
  const inputs = opts.inputs || {}
  const db = buildCheckpointDatabase(script)
  const evaluations = new Map()
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    const { value, origin } = resolveValueWithOrigin(cp, inputs)
    const yinYang = judgeYinYang(cp, value, origin)
    evaluations.set(cp.id, { value, yinYang, pass: yinYang === 1, origin })
  }
  const agg = aggregate(db, evaluations, { swingBand: opts.swingBand })
  const coverage = inputsCoverage(db, inputs)
  const baselines = opts.baselines || loadBaselines(script.script_id)
  const quad = resolveQuadHexagram(db, evaluations, script, baselines, agg, {
    thresholdBasis: opts.thresholdBasis,
    ciGrouping: opts.ciGrouping,
    // v0.9.1：N-1 口径护栏 / P1 敏感爻条数
    allowAbsoluteBasis: opts.allowAbsoluteBasis === true,
    fragileN: opts.fragileN,
  })
  const out = {
    script_id: script.script_id,
    ...agg,
    inputs_coverage: coverage,
    quad_hexagram: quad,
  }
  if (opts.returnEvaluations) {
    out.evaluations = Object.fromEntries(evaluations)
  }
  return out
}

// 易经风格 / 工程报表风 结论文案（L1 太极文案层，可离线）
// thresholds（v0.6.0）：卦象编码阈值注入——基线分位（单事项）/ 批次分位（批量）；缺省 absolute 0.5
export function generateConclusionText(agg, script, style = 'classic', thresholds = null) {
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
  // 真·64 卦动态映射：卦象由 8 宫阴阳分布决定，取代旧三元查表（最多 64 种）
  const scores = Object.fromEntries(
    Object.entries(agg.domain_results).map(([k, v]) => [k, v.score]),
  )
  const hx = resolveHexagramForScript(scores, script, thresholds || null)
  // v0.5.0：判词取自 64 卦判词库（每卦独立判词+建议），不再由 verdict 三选一充当卦判
  const hxText = getHexagramText(hx.name)
  const VERDICT_DESC = {
    可行: '刚健中正，宜进取',
    有条件可行: '行有艰险，宜审慎',
    不可行: '险而顺，宜止退',
  }
  const verdictDesc = VERDICT_DESC[agg.verdict] || ''
  const changedPart = hx.changed
    ? `动${hx.movingYao.yaoIndex + 1}爻变 ${hx.changed.name}（${getHexagramText(hx.changed.name).judgment}）`
    : ''
  const head = `${hx.name}：${hxText.judgment}（${hxText.advice}）` +
    (verdictDesc ? `。就当前八宫之势，${agg.verdict}——${verdictDesc}` : '')
  return (
    `${head}${changedPart ? `\n【变卦】${changedPart}` : ''}\n` +
    `【太极】${agg.verdict}（风险${agg.risk_level}，综合 ${(agg.overall_score * 100).toFixed(0)}%）\n` +
    `【三才】天 ${(tian * 100).toFixed(0)}%／地 ${(di * 100).toFixed(0)}%／人 ${(ren * 100).toFixed(0)}%\n` +
    `【八宫】${baguaLines}`
  )
}
