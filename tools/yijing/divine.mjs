// divine.mjs — 工具 yijing_divine（主入口）
import { evaluate } from '../../lib/yijing/reviewer.mjs'
import { getBuiltinScript, buildCheckpointDatabase } from '../../lib/yijing/checkpoints.mjs'
import { loadCustomScript } from '../../lib/yijing/registry.mjs'
import { extractCodes, buildStockInputs, signalsToInputsV2 } from '../../adapters/stock-inputs.mjs'
import { loadBaselines, thresholdsFromBaselines } from '../../lib/yijing/baselines.mjs'
import { stratumOfQuote, stratumThresholdsFromBaselines, baselinesForStratum } from '../../lib/yijing/baselines.mjs'
import { quadText } from '../../lib/yijing/quad-hexagram.mjs'
import { callCloudModel, resolveCloudSettings, isCloudSettingsViable, getCloudModelAdapter } from '../../lib/yijing/cloud-model.mjs'
import { FINE_MAP } from '../../lib/yijing/subdomain-fine-map.mjs'
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
      '费用承担方：默认走用户 DSH 会话当前模型（cloudModelAutoSession 默认开，费用计入用户会话）；可用 model 参数改走厂商/自有 Key。' +
      '行情信号优先，LLM 只补 NA 缺口；无云模型端点/超时/解析失败 → 该键缺分（NA），不造假',
  },
  fineMap: {
    type: 'boolean',
    description:
      '可选（仅 stock-trend-v2，默认 true）：规则→子域名精映射（P2）——把行情规则按语义落到「分域×子域位」，' +
      '无 LLM 时部分激活卦③（子域位卦）；设 false 回落 L2 分域粒度铺开（卦③坍缩为 2 种，用于 A/B 对照）',
  },
  ciGrouping: {
    type: 'string',
    enum: ['position', 'semantic'],
    description:
      '可选（默认 position）：卦③（子域卦）分组口径。position=按子域位序号 1-6（v0.8.x 现行为）；' +
      "semantic=按六业务族 L/T/S/M/R/C（36 分域语义分族；1296 下信息量通常更高，需配 ciGrouping 口径的基线做 A/B）",
  },
  strongOverride: {
    type: 'string',
    enum: ['default', 'include-proxies'],
    description:
      '可选（默认 default）：强关联一票否决覆盖。default=现行为（代理量子域豁免否决，见剧本 veto_notes）；' +
      "include-proxies=每个子域的强度项一律恢复强关联（复现 v0.5.0 与用户侧 fork 口径，用于量化豁免对 verdict 的影响）",
  },
  hexEncoding: {
    type: 'string',
    enum: ['auto', 'baseline', 'absolute'],
    description:
      '卦象编码阈值来源：auto（默认，行情路径用基线分位，其余绝对 0.5）/ baseline（强制基线，无则回落）/' +
        'absolute（强制 0.5）。基线模式下爻义=「相对市场中位偏强/偏弱」',
  },
  allowAbsoluteBasis: {
    type: 'boolean',
    description:
      '可选（默认 false）：显式确认使用 absolute 阈值口径。absolute（绝对 0.5）未经分位校准，' +
        '在低/高分位维度会退化成恒阳或恒阴（卦象坍缩）——只能用于与基线口径对照/调试。' +
        '未置 true 时照算，但输出 basis_guard.guarded=true 并在文案里打 ⚠，提醒不得作为决策判据',
  },
  swingBand: {
    type: 'number',
    description:
      '可选（默认 0.08）：贴线摇摆带宽。结论距决定线（可行 0.75 / 有条件 0.5）的余量 ≤ 该值即判定为' +
        '「摇摆」（verdict_swing.borderline=true）——跨种子/跨快照易翻面，不得当稳定判据；设 0 关闭',
  },
  deepReading: {
    type: 'boolean',
    description:
      '可选（默认 false）：卦象分歧时由云模型扩写深度解读。默认输出确定性解读（定性/焦点/敏感爻/怎么用）；' +
        '置 true 且云模型已激活时，额外调用 LLM 结合本次推演事实扩写成段解读（reading_source=llm）',
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

// v0.9.2 P0：反向委托摘要放在工具描述第一行——工具 schema 是插件与对话模型唯一共享面，
// 放第一句必被感知。链路：yijing_factor_prompt 取打分 prompt → 对话模型填分 → inputs 回传本工具，
// 全程绕开 sessionModel/llm 服务、无需 API Key、费用计入当前对话会话。
export const TOOL_DESCRIPTION =
  '可调 yijing_factor_prompt 取八宫打分 prompt → 对话大模型填分 → 以 inputs 回传本工具（无需 API Key、费用计入当前对话）；' +
  '易经推演-万事决 主入口：选剧本 → 分解决策事项为 384 关键因数 → 六层加权聚合 → 给出可定/否定结论' +
  '（可行/有条件可行/不可行）。判定与聚合为确定性规则，云模型仅负责自然语言拆解与卦象文案翻译；' +
  '可用 model 参数覆盖本次模型（厂商/自定义模型名/session）。'

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
  // v0.9.1 P1：分歧深度解读进紧凑输出（此前只有一句「建议人工复核」）
  const d = c && c.divergence
  const divergence = d
    ? {
        divergent: d.divergent,
        pattern: d.pattern,
        pattern_label: d.pattern_label,
        severity: d.severity,
        base: d.base,
        base_name: d.base_name,
        yang_spread: d.yang_spread,
        outlier_count: (d.outliers || []).length,
        fragile_top: (d.fragile_yaos || []).slice(0, 3).map((f) => ({
          dim: f.dim,
          label: f.label,
          value: f.value,
          threshold: f.threshold,
          gap: f.gap,
        })),
        focus: d.focus,
        reading: d.reading,
        reading_source: d.reading_source,
      }
    : null
  return {
    ...hexes,
    consistency: c.consensus
      ? '四卦同象'
      : `分歧 ${c.distinctNames} 种卦象${d ? `（${d.pattern_label}，严重度 ${d.severity}）` : '（建议人工复核）'}`,
    divergence,
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
        // P2 精映射（v0.8.1，默认开）：行情规则 → 「分域×子域位」，无 LLM 部分激活卦③；fineMap:false 回落 L2
        const useFineMap = isV2Script && args.fineMap !== false
        // v2（1296）：行情信号经迁移映射填 36 分域（L2 粒度）或精映射子域粒度（P2）；384：原口径
        const { byCode, meta } = isV2Script
          ? await buildStockInputs([codes[0]], {
              db: buildCheckpointDatabase(scriptArg),
              migrationMap: scriptArg.migrated_from ? scriptArg.migrated_from.mapping : {},
              fineMap: useFineMap ? FINE_MAP : null,
              inputsBuilder: (signals, ctx) => signalsToInputsV2(signals, ctx.db, ctx.migrationMap, ctx.fineMap),
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
            fine_map: isV2Script ? { on: useFineMap, granularity: hit.granularity, cells: hit.migratedSubdomains, rule_hits: hit.fineHits } : null,
          }
          // S3：LLM 子域级补分（llmLevel=L2/L3；行情信号优先，LLM 只补 NA 缺口；无端点/失败 → 诚实降级）
          if ((args.llmLevel === 'L2' || args.llmLevel === 'L3') && isV2Script) {
            // 费用承担方解析（v0.8.1）：默认用户 DSH 会话模型（cloudModelAutoSession 默认开）；
            //   kind=session → user-session（费用计入用户会话）；preset/custom → plugin-config（插件配置的自有 Key）；
            //   无可用端点 → none（跳过补分，行情信号不受影响）。
            const llmSettings = resolveCloudSettings(effectiveConfig)
            const llmViable = isCloudSettingsViable(llmSettings) || typeof getCloudModelAdapter() === 'function'
            const llmEndpoint = llmViable
              ? {
                  viable: true,
                  kind: llmSettings.kind,
                  provider: llmSettings.provider,
                  model: llmSettings.model || null,
                  via: isCloudSettingsViable(llmSettings) ? 'per-call-config' : 'module-adapter',
                  cost_bearer: llmSettings.kind === 'session' ? 'user-session' : 'plugin-config',
                }
              : { viable: false, kind: llmSettings.kind, provider: llmSettings.provider, note: '无可用端点/未启用 → LLM 补分跳过（行情信号不受影响）' }
            if (!llmViable) {
              // 不发 36 次必然 null 的请求（省速率闸排队等待）；诚实标注降级原因
              quoteMeta.llm_scoring = { level: args.llmLevel, degraded: true, reason: 'no-endpoint', endpoint: llmEndpoint }
            } else {
              try {
                const pack = buildEvidencePack(hit.quote, meta.indexContext)
                // 必须传 effectiveConfig：否则 callCloudModel 只用模块级适配器，model 参数覆盖/会话模型解析失效
                const llmCall = (messages, opts) => callCloudModel(messages, { ...opts, tool: opts && opts.purpose, config: effectiveConfig })
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
                  endpoint: llmEndpoint,
                }
              } catch (e) {
                quoteMeta.llm_scoring = { level: args.llmLevel, degraded: true, error: String((e && e.message) || e), endpoint: llmEndpoint }
              }
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
    // v0.9.0：四连卦编码口径 —— hexEncoding='absolute' 时四卦与单卦同源走绝对 0.5（F-5）；
    //   其余（auto/baseline）走基线分位 p50。卦③分组口径（F-9）、强关联覆盖（F-4②）一并透传。
    thresholdBasis: hexEncoding === 'absolute' ? 'absolute' : 'baseline',
    ciGrouping: args.ciGrouping,
    strongOverride: args.strongOverride === 'include-proxies' ? 'include-proxies' : undefined,
    // v0.9.1：N-1 口径护栏（absolute 需显式确认）/ N-3 摇摆带 / P1 分歧解读深度
    allowAbsoluteBasis: args.allowAbsoluteBasis === true,
    swingBand: typeof args.swingBand === 'number' ? args.swingBand : undefined,
    deepReading: args.deepReading === true,
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
        : '未提供 symbols / inputs') +
      '，384 爻走缺值兜底使卦象恒为乾为天、综合分恒为 1；引擎已按风险厌恶口径强制 verdict=「不可行（数据不足）」，此结论不得当作真实研判'
    notice = notice ? notice + '\n' + extra : extra
  }

  // v0.9.1 N-1/N-2：口径护栏与基线过期告警（detail=false 也必须可见，否则等于没有护栏）
  const st = result.quad_hexagram && result.quad_hexagram.structure
  if (st && st.basis_guard && st.basis_guard.guarded) {
    const extra = `⚠ 口径护栏：${st.basis_guard.note}`
    notice = notice ? notice + '\n' + extra : extra
  }
  if (st && st.baseline && st.baseline.stale) {
    const extra = `⚠ 基线过期：${st.baseline.note}`
    notice = notice ? notice + '\n' + extra : extra
  }
  // v0.9.1 N-3：贴线摇摆告警
  if (result.verdict_swing && result.verdict_swing.borderline) {
    const extra = `⚠ 结论贴线：${result.verdict_swing.note}`
    notice = notice ? notice + '\n' + extra : extra
  }

  // v0.9.2 P1：降级结构化 next_action —— 模型见降级即知下一步调什么（反向委托闭环）。
  // 凡 degraded（无有效输入 / 覆盖率<50% / LLM 补分降级）都给出「调 yijing_factor_prompt → 对话填分 →
  // inputs 回填」这一条 100% 可行路径，把"无质量输入时的静默误报"转成"明确的下一步动作"。
  const degradedReasons = []
  if (inputsSource === 'none') {
    degradedReasons.push(
      quoteMeta && quoteMeta.error
        ? `行情拉取失败（${quoteMeta.error}）`
        : '未提供 symbols / inputs',
    )
  }
  if (inputsSource !== 'none' && (result.inputs_coverage || {}).coverage < 0.5) {
    degradedReasons.push(
      `输入覆盖不足（coverage=${Number(((result.inputs_coverage || {}).coverage || 0)).toFixed(2)}），部分域缺值走兜底`,
    )
  }
  if (quoteMeta && quoteMeta.llm_scoring && quoteMeta.llm_scoring.degraded) {
    degradedReasons.push(
      `LLM 补分降级（${quoteMeta.llm_scoring.reason || quoteMeta.llm_scoring.error || 'failed'}）`,
    )
  }
  let nextAction = null
  if (degradedReasons.length) {
    const sid = (scriptObj && scriptObj.script_id) || (scriptArg && scriptArg.script_id) || 'motor-design'
    nextAction = {
      reason: degradedReasons.join('；') + '，结论由缺值兜底/降级产生，不得当作真实研判',
      remedy: {
        tool: 'yijing_factor_prompt',
        args: { matter, script: sid },
        then:
          '把本工具返回的 prompt 交给当前对话大模型填 JSON → 将 {"宫code":分值} 扁平化为 inputs 回传 yijing_divine（本工具）。' +
          '无需 API Key，费用计入当前对话会话。股票系剧本也可改传 symbols 触发自动行情替代手工打分。',
      },
    }
  }

  if (args.detail) {
    const detailOut = { ...result, quote: quoteMeta, inputs_source: inputsSource, hex_encoding: hexEncoding }
    if (nextAction) detailOut.next_action = nextAction
    return detailOut
  }
  // 紧凑输出（对齐 l0 聚合工具思路：只回结论 + 计数，绕开 DSH 2000 行截断）
  const out = {
    verdict: result.verdict,
    verdict_grade: result.verdict_grade || result.verdict,
    verdict_margin: result.verdict_margin,
    risk_level: result.risk_level,
    overall_score: result.overall_score,
    has_veto: result.has_veto,
    verdict_insufficient_data: result.verdict_insufficient_data === true,
    veto_score_conflict: result.veto_score_conflict === true, // 否决骑墙（veto 但综合分≥0.5）→ 人工复核优先
    // v0.9.1 N-3：贴线摇摆（结论距决定线太近 → 跨种子/跨快照易翻面，不得当稳定判据）
    verdict_swing: result.verdict_swing || null,
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
    // 编码口径全量显式化（v0.9.0 F-1/F-5/F-9）：阈值基准、卦③分组、爻序来源与降级状态可审计
    hex_encoding: {
      source: hexEncoding,
      baseline_used: hexEncoding.startsWith('baseline'),
      quad_threshold_basis: result.quad_hexagram ? result.quad_hexagram.structure.threshold_basis : null,
      ci_grouping: result.quad_hexagram ? result.quad_hexagram.structure.ci_grouping : null,
      hex_order: result.quad_hexagram ? result.quad_hexagram.structure.hex_order : null,
      quad_degraded: result.quad_hexagram ? result.quad_hexagram.structure.degraded : null,
      // v0.9.1 N-1：absolute 口径护栏（guarded=true → 只作对照，不得当决策判据）
      basis_guard: result.quad_hexagram ? result.quad_hexagram.structure.basis_guard : null,
      // v0.9.1 N-2：基线版本可见（跨机器卦象不一致时可归因）
      baseline: result.quad_hexagram ? result.quad_hexagram.structure.baseline : null,
    },
    quad_hexagram: compactQuad(result.quad_hexagram),
    llm: compactLlm(result.llm),
  }
  if (quoteMeta) out.quote = quoteMeta
  if (notice) out.notice = notice
  if (nextAction) out.next_action = nextAction
  return out
}

export async function registerYijingDivine(ctx, config = {}) {
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  ctx.tools.register(
    defineTool({
      name: 'yijing_divine',
      description: TOOL_DESCRIPTION,
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
