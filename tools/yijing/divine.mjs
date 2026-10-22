// divine.mjs — 工具 yijing_divine（主入口）
import { evaluate } from '../../lib/yijing/reviewer.mjs'
import { getBuiltinScript, buildCheckpointDatabase } from '../../lib/yijing/checkpoints.mjs'
import { loadCustomScript } from '../../lib/yijing/registry.mjs'
import { extractCodes, buildStockInputs, signalsToInputsV2 } from '../../adapters/stock-inputs.mjs'
import { loadBaselines, thresholdsFromBaselines } from '../../lib/yijing/baselines.mjs'
import { stratumOfQuote, stratumThresholdsFromBaselines, baselinesForStratum } from '../../lib/yijing/baselines.mjs'
import { quadText } from '../../lib/yijing/quad-hexagram.mjs'
import { callCloudModel } from '../../lib/yijing/cloud-model.mjs'
import { runLlmScoring, buildEvidencePack, mergeLlmScores } from '../../lib/yijing/llm-scoring.mjs'

export const TOOL_PARAMS = {
  matter: {
    type: 'string',
    required: true,
    description: '决策事项（自然语言），如“我要不要接这个 200kW 电机外包项目？预算 30 万，工期 4 个月”',
  },
  script: {
    oneOf: [
      { type: 'string', description: '剧本 id：内置 motor-design / stock-trend(384) / stock-trend-v2(1296 四层) / demo-384 / commercial，或已加载自定义剧本 id' },
      { type: 'object', additionalProperties: true, description: '自定义剧本 JSON 对象（含 script_id / name / domains[]）' },
    ],
    description: '剧本 id（内置/已加载自定义）或自定义剧本 JSON 对象；缺省走默认剧本 motor-design',
  },
  inputs: {
    type: 'object',
    additionalProperties: true,
    description:
      '可选：检查点取值覆盖。支持两级——检查点精确 id（如 JB0101=0.7）或八宫 code 简写（如 JB=0.6，' +
        '该域全部活跃检查点同值；LLM 打分回填即用此形态）。缺值走阈值保守兜底（可审计，不造假）',
  },
  symbols: {
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description:
      '可选：股票代码（6 位，多个取第一个；也可省略——自动从 matter 里提取代码）。' +
        'stock-trend 剧本下提供/提取到代码时自动拉腾讯实时行情构建 384 爻 inputs（免手工打分）',
  },
  useQuote: {
    type: 'boolean',
    description: '是否允许自动拉行情（默认 true，仅 stock-trend 剧本且解析到代码时生效；config.stockQuoteEnabled=false 可全局关）',
  },
  llmLevel: {
    type: 'string',
    enum: ['none', 'L2', 'L3'],
    description:
      '可选（仅 stock-trend-v2）：LLM 子域级补分档位。L2=分域级 6 次 prompt（约 36 秒）；L3=子域×aspect 36 次 prompt（约 3.6 分钟，四刀全激活）。' +
      '行情信号优先，LLM 只补 NA 缺口；无云模型端点/超时/解析失败 → 该键缺分（NA），不造假',
  },
  hexEncoding: {
    type: 'string',
    enum: ['auto', 'baseline', 'absolute'],
    description:
      '卦象编码阈值来源：auto（默认，行情路径用基线分位，其余绝对 0.5）/ baseline（强制基线，无则回落）/' +
        'absolute（强制 0.5）。基线模式下爻义=「相对市场中位偏强/偏弱」',
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

// 四连卦紧凑摘要（v0.7.1）：四卦名+阳数+tone + 一致性 + 文本总述；非 stock-trend 型剧本为 null
function compactQuad(quad) {
  if (!quad || !quad.hexes) return null
  const hexes = Object.fromEntries(
    Object.entries(quad.hexes).map(([k, h]) => [
      k,
      { label: h.label, name: h.name, yang: h.yang, tone: h.tone },
    ]),
  )
  const c = quad.consistency
  return {
    ...hexes,
    consistency: c.consensus ? '四卦同象' : `分歧 ${c.distinctNames} 种卦象（建议人工复核）`,
    text: quadText(quad),
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

  // ── inputs 三级来源解析（v0.6.0）：检查点精确 id > 八宫 code 简写 > 行情自动拉取 > 兜底 ──
  const inputsIn = args.inputs && typeof args.inputs === 'object' ? args.inputs : {}
  const domainCodes = new Set(((scriptArg && scriptArg.domains) || []).map((d) => d.code))
  const hasCheckpointInputs = Object.keys(inputsIn).some((k) => !domainCodes.has(k))
  const hasDomainInputs = Object.keys(inputsIn).some((k) => domainCodes.has(k))
  let inputs = inputsIn
  let scriptObj = scriptArg
  let inputsSource = hasCheckpointInputs ? 'checkpoint' : hasDomainInputs ? 'domain' : 'none'
  let quoteMeta = null
  let hexThresholds = null
  let hexEncoding = 'absolute'
  let stratumBaselines = null // v0.7.2 按层基线（四连卦用）；无行情/无分层时 null → 回落总体

  // 行情自动路径：股票系剧本（stock-trend 384 / stock-trend-v2 1296）+ 无检查点级 inputs + 解析到代码
  const isStockScript = scriptArg && (scriptArg.script_id === 'stock-trend' || scriptArg.script_id === 'stock-trend-v2')
  const isV2Script = scriptArg && scriptArg.script_id === 'stock-trend-v2'
  if (isStockScript && !hasCheckpointInputs && config.stockQuoteEnabled !== false && args.useQuote !== false) {
    const raw = args.symbols ?? args.symbol ?? null
    let codes = raw
      ? (Array.isArray(raw) ? raw : String(raw).split(/[,\s，、]+/))
      : extractCodes(matter)
    codes = [...new Set(codes.map((c) => String(c).replace(/\D/g, '')).filter(Boolean))]
    if (codes.length) {
      try {
        // v2（1296）：行情信号经迁移映射填 36 分域（L2 粒度）；384：原口径
        const { byCode, meta } = isV2Script
          ? await buildStockInputs([codes[0]], {
              db: buildCheckpointDatabase(scriptArg),
              migrationMap: scriptArg.migrated_from ? scriptArg.migrated_from.mapping : {},
              inputsBuilder: (signals, ctx) => signalsToInputsV2(signals, ctx.db, ctx.migrationMap),
            })
          : await buildStockInputs([codes[0]])
        const hit = byCode.get(codes[0])
        if (hit) {
          inputs = hit.inputs
          scriptObj = { ...scriptArg, na: { domains: [], checkpoints: hit.naIds } }
          inputsSource = 'quote'
          quoteMeta = {
            code: codes[0],
            name: hit.quote.name,
            price: hit.quote.price,
            pct: hit.quote.pct,
            active_domains: hit.activeDomains,
            rules: hit.signals.map((s) => s.rule),
            fetched: meta.fetched,
            sector_proxy: meta.sector_proxy,
            index_error: meta.indexError,
          }
          // S3：LLM 子域级补分（llmLevel=L2/L3；行情信号优先，LLM 只补 NA 缺口；无端点/失败 → 诚实降级）
          if ((args.llmLevel === 'L2' || args.llmLevel === 'L3') && isV2Script) {
            try {
              const pack = buildEvidencePack(hit.quote, meta.indexContext)
              const llmCall = (messages, opts) => callCloudModel(messages, { ...opts, tool: opts && opts.purpose })
              const run = await runLlmScoring({
                script: scriptArg,
                db: buildCheckpointDatabase(scriptArg),
                pack,
                llmCall,
                level: args.llmLevel,
                config: effectiveConfig,
              })
              const merged = mergeLlmScores(inputs, run.scores)
              inputs = merged.inputs
              // 补分的键从 NA 名单移除（已不是缺值）
              scriptObj = {
                ...scriptObj,
                na: {
                  domains: [],
                  checkpoints: hit.naIds.filter((id) => run.scores[id] === undefined),
                },
              }
              quoteMeta.llm_scoring = {
                level: run.level,
                degraded: run.degraded,
                prompts: run.coverage.prompts,
                filled: run.coverage.filled,
                failed: run.coverage.failed,
                added: merged.added,
              }
            } catch (e) {
              quoteMeta.llm_scoring = { level: args.llmLevel, degraded: true, error: String((e && e.message) || e) }
            }
          }
          if (args.hexEncoding !== 'absolute') {
            const bl = loadBaselines(scriptArg.script_id, { file: config.stockBaselinesPath || undefined })
            if (bl) {
              // v0.7.2 按层阈值：行情快照即可知 stratum（市值带×涨跌带）→ 层内阈值优先；缺层/小样本回落总体
              const stratum = stratumOfQuote(hit.quote)
              const cell = stratumThresholdsFromBaselines(bl, stratum)
              if (cell) {
                hexThresholds = cell.domains
                stratumBaselines = baselinesForStratum(bl, stratum)
                hexEncoding = 'baseline:stratum'
              } else {
                hexThresholds = thresholdsFromBaselines(bl, 'p50')
                hexEncoding = 'baseline'
              }
              quoteMeta.stratum = stratum
              quoteMeta.stratum_used = Boolean(cell)
            }
          }
        } else {
          quoteMeta = { code: codes[0], error: meta.error || 'quote-missing', fetched: meta.fetched }
        }
      } catch (e) {
        quoteMeta = { code: codes[0], error: String((e && e.message) || e) }
      }
    }
  } else if (hasDomainInputs && args.hexEncoding === 'baseline') {
    // LLM/手工宫级打分语义为「绝对自评」→ 默认不走市场基线；显式要求时才用
    const bl = loadBaselines(scriptArg?.script_id || '', { file: config.stockBaselinesPath || undefined })
    if (bl) {
      hexThresholds = thresholdsFromBaselines(bl, 'p50')
      hexEncoding = 'baseline'
    }
  }

  const result = await evaluate(matter, scriptObj || 'motor-design', {
    inputs,
    hexThresholds,
    baselines: stratumBaselines || undefined,
    reportStyle: args.reportStyle || config.reportStyle || 'classic',
    config: effectiveConfig,
  })

  // 兜底退化显式告警（v0.6.0）：杜绝「8/8 同卦」无感发生
  let notice = (result.llm && result.llm.notice) || null
  const cov = result.inputs_coverage || {}
  if (Array.isArray(cov.unmatched) && cov.unmatched.length) {
    const extra =
      `inputs 有 ${cov.unmatched.length} 个键未匹配本剧本任何检查点/宫（${cov.unmatched.slice(0, 6).join(',')}${cov.unmatched.length > 6 ? '…' : ''}），已忽略；` +
      `本剧本宫码为 ${[...domainCodes].join('/')}，可用 yijing_factor_prompt 取正确打分表`
    notice = notice ? notice + '\n' + extra : extra
  }
  if (inputsSource === 'none') {
    const extra =
      (quoteMeta && quoteMeta.error
        ? `行情拉取失败（${quoteMeta.error}）`
        : '未提供 symbols / inputs') + '，384 爻走缺值兜底，结果不具备个股区分度'
    notice = notice ? notice + '\n' + extra : extra
  }

  if (args.detail) {
    return { ...result, quote: quoteMeta, inputs_source: inputsSource, hex_encoding: hexEncoding }
  }
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
    inputs: {
      source: inputsSource,
      coverage: result.inputs_coverage ? Number(result.inputs_coverage.coverage.toFixed(4)) : 0,
      granularity: result.inputs_coverage ? result.inputs_coverage.granularity : 'none',
      unmatched: result.inputs_coverage ? result.inputs_coverage.unmatched : [],
    },
    // 无任何有效输入 → 结论由缺值兜底产生，明确标注低置信（不得当作真实研判）
    degraded: inputsSource === 'none' || (result.inputs_coverage || {}).coverage < 0.5,
    hex_encoding: { source: hexEncoding, baseline_used: hexEncoding.startsWith('baseline') },
    quad_hexagram: compactQuad(result.quad_hexagram),
    llm: compactLlm(result.llm),
  }
  if (quoteMeta) out.quote = quoteMeta
  if (notice) out.notice = notice
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
