// divine_batch_stocks.mjs — 道一-易经推演 · 批量股票趋势推演（示例：56 只自选股 · 本周涨跌研判）
//
// 数据来源：用户提供的同花顺自选股截图（收盘快照，共 56 只完整行；另有 1 行被截断未纳入）。
//
// 【输入映射规则（透明、可审计；无数据不臆造 → 对应子域/检查点标 NA，不参与聚合）】
// 活跃信号（子域级，域内 6 个评估侧面按敏感度系数 [1.0,0.5,0.7,0.8,0.3,0.0] 铺开）：
//   JS 趋势方向   = 0.5 + clamp((涨跌% − 上证0.12) × 0.12, -0.42, +0.42)   （相对大盘强弱）
//   JS 动量强度   = 0.5 + clamp(涨跌% × 0.10, -0.42, +0.42)
//   ZJ 主力资金   = 0.5 + clamp(涨跌% × 0.10, -0.42, +0.42)  （当日涨跌作短线资金流代理——局限已声明）
//   HY 行业景气   = 0.5 + clamp(板块日均涨跌% × 0.06, -0.20, +0.20)（板块按名称归类，均值来自截图当日数据）
//   XX 公司公告   = ST → 0.25（风险警示=负面）；XD → 0.55（除息中性）；其余 NA（无公告数据不评分）
//   FX 系统性风险 = 0.55（仅当 FX 域存在其他信号时激活；指数微涨无系统性冲击）
//   FX 个股黑天鹅 = ST → 0.20；否则 NA
//   FX 止损边界   = 涨跌% ≤ −4.5 → 0.40（深跌风险暴露）；≥ +4.5 → 0.70（强动量、无警示）；否则 NA
//   JB 基本面 / GZ 估值面 / HG 宏观面：截图无任何数据 → 全域 NA（覆盖率如实暴露，不造假）
// 推演区间：本周内（截图为周三收盘快照 → 剩余周四/周五共 2 个交易日）。
// 结论映射：可行→看涨 / 有条件可行→震荡(观望) / 不可行→看跌；FX/XX 白名单否决→看跌(否决)。
// 在线模式（--live，v0.5.0）：经 adapters/quote.mjs 拉腾讯实时行情，激活 GZ01/JS01/JS04/JS08
//   （PE 估值、收盘位置、量能配合、波动特征）并覆盖 JS02/ZJ01 基线口径；取数失败整体回退基线。
// ⚠️ 免责声明：结构化多因子研判示意，不构成任何投资建议。

import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { resolveHexagramForScript, quantileThresholds } from '../lib/yijing/hexagram.mjs'
import { fetchSignalsForStocks, RULES_TEXT } from '../adapters/quote.mjs'
import { signalsToInputs, signalsToInputsV2 } from '../adapters/stock-inputs.mjs'
import { FINE_MAP } from '../lib/yijing/subdomain-fine-map.mjs'
import { loadBaselines, stratumMetaOf } from '../lib/yijing/baselines.mjs'
import { SWING_BAND_DEFAULT } from '../lib/yijing/aggregator.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export { STOCKS, buildInputs, mapTrend }

// 引擎版本（v0.9.0 F-2/E-8）：动态读 package.json，杜绝 meta 里写死「v0.5.0」的陈旧版本串
const ENGINE_VERSION = (() => {
  try {
    return (
      JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'))
        .version || ''
    )
  } catch {
    return ''
  }
})()

const MARKET_PCT = 0.12 // 上证当日 +0.12%
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
const ASPECT_COEFS = [1.0, 0.5, 0.7, 0.8, 0.3, 0.0] // 强度/持续性/确定性/边际变化/安全边际/催化
const ASPECT_BIAS = [0, -0.08, 0.08, -0.04, 0.04, 0] // 侧面基准偏置（宽严差异，确定性常量；使涨跌幅量级产生梯度而非仅符号）

// ===== 截图数据（名称, 代码, 现价, 当日涨跌%, 板块, 标记）=====
const STOCKS = [
  ['兰州银行', '001227', 2.1, -1.41, '银行', ''],
  ['中国能建', '601868', 2.33, -1.27, '基建', ''],
  ['通裕重工', '300185', 2.71, -1.09, '装备制造', ''],
  ['ST兴化', '002109', 2.73, 1.87, '化工', 'ST'],
  ['中国一重', '601106', 2.91, -0.68, '装备制造', ''],
  ['光大银行', '601818', 3.07, -1.29, '银行', ''],
  ['民生银行', '600016', 3.49, -1.69, '银行', ''],
  ['铁建重工', '688425', 3.98, -0.25, '装备制造', ''],
  ['贝因美', '002570', 4.28, 1.18, '消费', ''],
  ['瑞丰银行', '601528', 5.16, -0.39, '银行', ''],
  ['邮储银行', '601658', 5.65, -0.53, '银行', ''],
  ['ST南新', '688189', 6.15, 0.49, '医药', 'ST'],
  ['西藏天路', '600326', 6.29, -0.47, '基建', ''],
  ['交通银行', '601328', 8.23, 0.0, '银行', ''],
  ['三六零', '601360', 8.43, 1.81, '科技电子', ''],
  ['工商银行', '601398', 8.58, -0.23, '银行', ''],
  ['盛屯矿业', '600711', 9.26, -2.22, '有色金属', ''],
  ['中国核建', '601611', 9.69, 0.83, '核工', ''],
  ['ST联光', '600363', 9.89, -3.79, '科技电子', 'ST'],
  ['弘讯科技', '603015', 10.47, 2.85, '科技电子', ''],
  ['中银证券', '601696', 10.79, -0.46, '证券', ''],
  ['隆基绿能', '601012', 10.95, -1.26, '光伏', ''],
  ['平安银行', '000001', 11.44, -1.8, '银行', ''],
  ['建设银行', '601939', 11.5, -0.61, '银行', ''],
  ['西藏旅游', '600749', 11.97, 1.1, '消费', ''],
  ['金牛化工', '600722', 13.29, 0.08, '化工', ''],
  ['阳光乳业', '001318', 13.38, -2.62, '消费', ''],
  ['雪人集团', '002639', 13.8, -4.89, '装备制造', ''],
  ['洛阳钼业', '603993', 14.35, -7.0, '有色金属', ''],
  ['安泰科技', '000969', 15.0, 0.94, '新材料', ''],
  ['金风科技', '002202', 15.14, -0.39, '装备制造', ''],
  ['中核科技', '000777', 15.9, -0.31, '核工', ''],
  ['兴业银行', '601166', 18.51, 0.05, '银行', ''],
  ['广发证券', '000776', 18.88, -2.53, '证券', ''],
  ['华辰装备', '300809', 21.86, 2.82, '装备制造', ''],
  ['东方电气', '600875', 22.1, -0.9, '电力', ''],
  ['紫金矿业', '601899', 29.06, -2.45, '有色金属', ''],
  ['永鼎股份', '600105', 29.38, 1.07, '通信线缆', ''],
  ['长江电力', '600900', 29.69, 0.51, '电力', ''],
  ['西部矿业', '601168', 31.32, -3.24, '有色金属', ''],
  ['大金重工', '002487', 34.66, -0.35, '装备制造', ''],
  ['科大讯飞', '002230', 37.04, 2.55, '科技电子', ''],
  ['江西铜业', '600362', 38.07, -2.61, '有色金属', ''],
  ['纽威股份', '603699', 38.57, 1.02, '装备制造', 'XD'],
  ['飞龙股份', '002536', 39.85, 2.15, '汽车', ''],
  ['赤峰黄金', '600988', 40.97, -0.99, '有色金属', ''],
  ['招商银行', '600036', 42.52, -1.23, '银行', ''],
  ['国光电气', '688776', 42.96, 0.89, '科技电子', ''],
  ['赛力斯', '601127', 43.79, -2.41, '汽车', ''],
  ['日盈电子', '603286', 45.5, 6.46, '科技电子', ''],
  ['立讯精密', '002475', 47.6, 3.03, '科技电子', ''],
  ['长盛轴承', '300718', 48.76, 1.88, '装备制造', ''],
  ['工业富联', '601138', 48.77, 2.22, '科技电子', ''],
  ['英杰电气', '300820', 53.53, 2.33, '装备制造', ''],
  ['西部超导', '688122', 55.4, 0.4, '新材料', ''],
  ['夏厦精密', '001306', 57.15, 8.82, '装备制造', ''],
]

// ===== 板块日均涨跌（由输入股票自身统计，非外部臆造）=====
function sectorAvgOf(stocks) {
  const stats = {}
  for (const [, , , pct, sector] of stocks) (stats[sector] ||= []).push(pct)
  return Object.fromEntries(
    Object.entries(stats).map(([s, arr]) => [s, arr.reduce((a, b) => a + b, 0) / arr.length]),
  )
}
const sectorAvg = sectorAvgOf(STOCKS)

// ===== 子域级信号 → 检查点输入 + NA 标记 =====
const SUB_IDX = { JS趋势: 0, JS动量: 1, ZJ主力: 0, HY景气: 0, XX公告: 0, FX系统: 0, FX黑天鹅: 1, FX止损: 7 }

/**
 * 合并基线信号与在线适配信号：同 (code, subIdx) 以适配信号为准（口径覆盖），其余追加。
 * 返回合并后的 signals 数组（供 buildInputs 使用）。
 */
export function mergeSignals(baseline, adapter) {
  const out = baseline.map((s) => ({ ...s }))
  for (const a of adapter || []) {
    const i = out.findIndex((s) => s.code === a.code && s.subIdx === a.subIdx)
    if (i >= 0) out[i] = { ...a }
    else out.push({ ...a })
  }
  return out
}

function buildInputs(stock, extraSignals = [], secAvg = sectorAvg, ctx = {}) {
  const scriptObj = ctx.script || script
  const dbObj = ctx.db || db
  const [, , , pct, sector, flag] = stock
  const rel = pct - MARKET_PCT
  // 每个活跃子域：base = 0.5 + delta；6 侧面按系数铺开
  const base = []
  const add = (code, subIdx, delta) => base.push({ code, subIdx, delta })
  add('JS', SUB_IDX.JS趋势, clamp(rel * 0.12, -0.42, 0.42))
  add('JS', SUB_IDX.JS动量, clamp(pct * 0.1, -0.42, 0.42))
  add('ZJ', SUB_IDX.ZJ主力, clamp(pct * 0.1, -0.42, 0.42))
  add('HY', SUB_IDX.HY景气, clamp((secAvg[sector] ?? 0) * 0.06, -0.2, 0.2))
  if (flag === 'ST') {
    add('XX', SUB_IDX.XX公告, -0.25)
    add('FX', SUB_IDX.FX系统, 0.05)
    add('FX', SUB_IDX.FX黑天鹅, -0.3)
  } else if (flag === 'XD') {
    add('XX', SUB_IDX.XX公告, 0.05)
  }
  if (pct <= -4.5) {
    if (!base.some((s) => s.code === 'FX' && s.subIdx === SUB_IDX.FX系统)) add('FX', SUB_IDX.FX系统, 0.05)
    add('FX', SUB_IDX.FX止损, -0.1)
  } else if (pct >= 4.5) {
    if (!base.some((s) => s.code === 'FX' && s.subIdx === SUB_IDX.FX系统)) add('FX', SUB_IDX.FX系统, 0.05)
    add('FX', SUB_IDX.FX止损, 0.2)
  }
  const signals = mergeSignals(base, extraSignals)

  // v0.6.1：铺开口径统一走 adapters/stock-inputs.mjs（此前本文件内重复实现同一套
  // ASPECT_COEFS/BIAS 循环，两处漂移会导致基线分位数与对话单只调用不可比）。
  // 离线 base 信号仍在本文件生成（CSV 行的 pct/sector/flag → 合成信号）。
  // v0.9.0 F-7：1296 剧本下 384 形态信号经迁移映射填 36 分域（默认 P2 精映射；fineMap=false 回落 L2）。
  if (ctx.isV2) {
    const migrationMap = scriptObj.migrated_from ? scriptObj.migrated_from.mapping : {}
    return {
      signals,
      ...signalsToInputsV2(signals, dbObj, migrationMap, ctx.fineMap === false ? null : FINE_MAP),
    }
  }
  return { signals, ...signalsToInputs(signals, dbObj) }
}

// ===== 批量推演 =====
// v0.9.0 F-7：按 id 取剧本（支持 1296 的 stock-trend-v2；缺省 384，行为逐位不变）
export function buildScriptById(scriptId = 'stock-trend') {
  return String(scriptId) === 'stock-trend-v2' ? buildStockTrendV2Script() : buildStockScript()
}
const script = buildStockScript()
const db = buildCheckpointDatabase(script)

function mapTrend(r) {
  if (r.has_veto) return '看跌(否决)'
  if (r.verdict === '可行') return '看涨'
  if (r.verdict === '有条件可行') return '震荡(观望)'
  return '看跌'
}

function assess(stock, r, activeDomains, coverage, ctx = {}) {
  const [, , , , , flag] = stock
  const scriptObj = ctx.script || script
  const allDomains = scriptObj.domains.map((d) => d.code)
  const totalDomains = allDomains.length
  const naDomains = allDomains.filter((c) => !activeDomains.includes(c))
  const activeDomainCount = activeDomains.length
  const checksLabel = ctx.isV2 ? '1296 爻' : '384 爻'
  const margin = Math.min(Math.abs(r.overall_score - 0.75), Math.abs(r.overall_score - 0.5))
  const conf =
    margin <= 0.03
      ? '临界（综合分距档位阈值 ≤3 个百分点，输入微变即可翻档）'
      : margin <= 0.08
        ? '中低（距档位边界较近）'
        : '中（距档位边界较远，档位相对稳定）'
  const notes = [
    `输入完备度：${activeDomainCount}/${totalDomains} 个域有数据支撑的信号（JS/ZJ 来自当日行情，HY 为板块当日均值代理，XX/FX 仅 ST·XD·大涨大跌情形激活，GZ 仅在线模式激活）；` +
      `${naDomains.length ? `无数据域 ${naDomains.join('/')} → 全域 NA` : '全部域均有数据支撑'}（覆盖率 ${(coverage * 100).toFixed(1)}%），${checksLabel}框架下如实暴露信息缺口而非造假填充。`,
    `结论置信：${conf}` +
      (r.has_veto
        ? `；触发 FX/XX 白名单否决（${flag === 'ST' ? 'ST 风险警示' : '当日深跌风险暴露'}），档位由风控规则主导，对输入鲁棒。`
        : `；无否决，档位由 ${activeDomainCount} 个活跃域的通过率均值决定。`),
    `可复核性：全部输入由行情涨跌幅按公开规则线性映射（在线模式另含腾讯 PE/振幅/换手规则，见 RULES_TEXT），无隐藏参数；确定性引擎（零 LLM 消耗），同一输入必得同一结论，可用下周末行情回看校验。`,
  ]
  return { margin: Number(margin.toFixed(4)), notes }
}

// 四连卦紧凑化（v0.9.0 F-2）：引擎 evaluate 已原生产出四连卦，batch 此前完全丢弃（报告 E-5：0/56）。
// 只保留可审计的最小集（爻序/阈值基准/四卦名+阳数+tone/一致性），不落 6×4 组明细（避免 JSON 膨胀）。
function compactQuadForBatch(quad) {
  if (!quad || !quad.hexes) return null
  const hexes = {}
  for (const [k, h] of Object.entries(quad.hexes)) {
    hexes[k] = { label: h.label, name: h.name, yang: h.yang, tone: h.tone, degraded: Boolean(h.degraded) }
  }
  // v0.9.1 P1：分歧解读进批量输出，但剔除成段 reading（每只数百字 × 数百只 = 体积爆炸；
  //   保留可统计/可排序的结构字段，需要文案时走单只调用）
  const cons = quad.consistency || null
  let divergence = null
  if (cons && cons.divergence) {
    const d = cons.divergence
    divergence = {
      divergent: d.divergent,
      pattern: d.pattern,
      pattern_label: d.pattern_label,
      severity: d.severity,
      base: d.base,
      base_name: d.base_name,
      yang_spread: d.yang_spread,
      outliers: d.outliers || [],
      divergent_keys: d.divergent_keys || [],
      fragile_yaos: (d.fragile_yaos || []).slice(0, 3),
      focus: d.focus || [],
      reading_source: d.reading_source || 'deterministic',
    }
  }
  return {
    structure: quad.structure || null,
    hexes,
    consistency: cons ? { ...cons, divergence } : null,
  }
}

// ===== 批量推演（可测试化：默认离线；live=true 走在线适配层，失败整体回退基线）=====
export async function runBatch(opts = {}) {
  const live = Boolean(opts.live)
  const stocks = opts.stocks || STOCKS
  const outFile = opts.outFile || join(LOG_DIR, live ? 'stock-batch-results-live.json' : 'stock-batch-results.json')

  // v0.9.0 F-7：剧本可选（默认 384；stock-trend-v2 = 1296 四层）
  const scriptId = String(opts.script || 'stock-trend')
  const isV2 = scriptId === 'stock-trend-v2'
  const scriptObj = buildScriptById(scriptId)
  const dbObj = buildCheckpointDatabase(scriptObj)
  const ctx = { script: scriptObj, db: dbObj, isV2, fineMap: opts.fineMap !== false }
  // v0.9.0 F-2：分层审计（引擎已算四连卦，成本为零；分层需真实行情的总市值/涨跌）
  const baselines = loadBaselines(scriptId)

  // 在线模式：批量拉行情 → 每只信号；失败/缺只 → 回退基线（NA），不影响其余股票
  let signalsByCode = new Map()
  let quotesByCode = new Map()
  let liveMeta = { mode: 'offline', fetched: 0, error: null, rules: [] }
  if (live) {
    const res = await fetchSignalsForStocks(stocks, {
      fetcher: opts.fetcher,
      sectorIndexMap: opts.sectorIndexMap,
    })
    signalsByCode = res.signalsByCode
    quotesByCode = res.quotes || new Map()
    liveMeta = {
      mode: 'online',
      fetched: res.fetched,
      error: res.error,
      rules: RULES_TEXT,
      degraded_to_baseline: res.fetched < stocks.length,
    }
    console.log(
      `[live] 腾讯行情拉取 ${res.fetched}/${stocks.length} 只` +
        (res.error ? `（异常：${res.error}，缺失只回退基线）` : '') +
        (res.fetched < stocks.length ? `（${stocks.length - res.fetched} 只回退基线）` : ''),
    )
  }

  // ---- 阶段 1：逐只 evaluate，收集 8 宫分（卦象延后，因需全批次分位数）----
  const pending = []
  const secAvg = stocks === STOCKS ? sectorAvg : sectorAvgOf(stocks)
  for (const stock of stocks) {
    const [name, code, price, pct, sector, flag] = stock
    const extra = signalsByCode.get(String(code).replace(/\D/g, '')) || []
    const { inputs, naIds, signals } = buildInputs(stock, extra, secAvg, ctx)
    const s = isV2 ? buildStockTrendV2Script() : buildStockScript()
    s.na = { domains: [], checkpoints: naIds }
    const matter = `${name}(${code}) 本周内涨跌研判`
    // v0.9.0：四连卦由引擎原生产出（阈值基准/卦③分组/强关联覆盖可配），batch 只做透出
    const r = await evaluate(matter, s, {
      inputs,
      thresholdBasis: opts.thresholdBasis === 'absolute' ? 'absolute' : 'baseline',
      ciGrouping: opts.ciGrouping,
      strongOverride: opts.strongOverride === 'include-proxies' ? 'include-proxies' : undefined,
      // v0.9.1：N-1 口径护栏（批量默认不承认 absolute 为生产口径）/ N-3 摇摆带
      allowAbsoluteBasis: opts.allowAbsoluteBasis === true,
      swingBand: typeof opts.swingBand === 'number' ? opts.swingBand : undefined,
    })
    // 分层审计：live 有真实行情（总市值/涨跌）才分层；离线快照无市值 → 诚实标注不可用
    const q = quotesByCode.get(String(code).replace(/\D/g, ''))
    const stratumMeta = q
      ? stratumMetaOf(baselines, q)
      : { stratum: null, n: 0, used: false, reason: 'unavailable:snapshot-no-cap' }

    // 8 宫分 = 实际聚合分（NA 宫取 0.5 中性），保持 64 卦层可用
    const scores8 = {}
    for (const d of s.domains) {
      scores8[d.code] = r.domain_results[d.code]?.score ?? 0.5
    }
    pending.push({ stock, name, code, price, pct, sector, flag, r, s, signals, scores8, stratumMeta, activeDomains: [...new Set(signals.map((x) => x.code))] })
  }

  // ---- 阶段 2：批次分位数阈值（满熵编码）——每个"进卦域"在本批次内阴阳各半；
  //      批次内取值唯一的域（如 NA 被填成同一值）判定为 frozen → 恒阴，消除 NA 恒阳偏置 ----
  const qt = quantileThresholds(pending.map((p) => p.scores8))

  // ---- 阶段 3：逐只定卦象 ----
  const results = []
  for (const p of pending) {
    const { stock, r, s, signals, scores8, activeDomains, name, code, price, pct, sector, flag, stratumMeta } = p
    const hx = resolveHexagramForScript(scores8, s, qt.thresholds)
    const a = assess(stock, r, activeDomains, r.coverage.coverage, ctx)
    results.push({
      name: p.name, code: p.code, price: p.price, pct: p.pct, sector: p.sector, flag: p.flag,
      sector_avg: Number((secAvg[sector] ?? 0).toFixed(2)),
      signals: signals.map((x) => ({ domain: x.code, sub: x.subIdx + 1, delta: Number(x.delta.toFixed(4)), rule: x.rule || null })),
      active_domains: activeDomains,
      domain_scores: Object.fromEntries(Object.entries(scores8).map(([k, v]) => [k, Number(v.toFixed(4))])),
      verdict: r.verdict,
      verdict_grade: r.verdict_grade || r.verdict,
      verdict_margin: r.verdict_margin,
      trend: mapTrend(r),
      has_veto: r.has_veto,
      veto_score_conflict: r.veto_score_conflict === true, // 否决骑墙（veto 但综合分≥0.5）→ 人工复核优先
      // v0.9.1 N-3：贴线摇摆（跨种子易翻面）——与骑墙正交，只看分数距决定线的余量
      verdict_swing: r.verdict_swing || null,
      swing_borderline: Boolean(r.verdict_swing && r.verdict_swing.borderline),
      veto_reason: r.has_veto ? (flag === 'ST' ? 'ST 风险警示 → FX/XX 白名单强关联失守' : '当日深跌风险暴露 → FX 白名单强关联失守') : null,
      risk_level: r.risk_level,
      overall_score: r.overall_score,
      yang_ratio: r.yang_ratio,
      coverage: r.coverage,
      sancai: r.sancai,
      // v0.9.0 F-2：四连卦（引擎已算，成本为零）+ 分层审计字段
      quad_hexagram: compactQuadForBatch(r.quad_hexagram),
      stratum: stratumMeta ? stratumMeta.stratum : null,
      stratum_used: stratumMeta ? stratumMeta.used : false,
      stratum_n: stratumMeta ? stratumMeta.n : 0,
      stratum_reason: stratumMeta ? stratumMeta.reason : null,
      hexagram: {
        name: hx.name,
        desc: hx.desc,
        yaos: hx.yaos.join(''),
        moving_yao: hx.movingYao.yaoIndex >= 0 ? hx.movingYao.yaoIndex + 1 : null,
        changed: hx.changed ? hx.changed.name : null,
      },
      taiji_line: (r.conclusion_text || '').split('\n').find((l) => l.startsWith('【太极】')) || null,
      assess: a,
    })
  }

  // ===== 汇总输出 =====
  const dist = {}
  for (const r of results) dist[r.trend] = (dist[r.trend] || 0) + 1
  const hxDist = {}
  for (const r of results) hxDist[r.hexagram.name] = (hxDist[r.hexagram.name] || 0) + 1
  // v0.9.0 F-2：四卦种类分布（①②③④ 各卦名的去重计数）+ 否决骑墙率
  const quadDist = { hex_di: {}, hex_si: {}, hex_ci: {}, hex_xi: {} }
  let quadCount = 0
  for (const r of results) {
    if (!r.quad_hexagram) continue
    quadCount++
    for (const k of Object.keys(quadDist)) {
      const n = r.quad_hexagram.hexes[k].name
      quadDist[k][n] = (quadDist[k][n] || 0) + 1
    }
  }
  const quadKinds = Object.fromEntries(
    Object.entries(quadDist).map(([k, v]) => [k, { distinct: Object.keys(v).length, dist: v }]),
  )
  const borderline = results.filter((r) => r.veto_score_conflict).length
  const stratumUsed = results.filter((r) => r.stratum_used).length
  // v0.9.1 N-3：贴线摇摆统计
  const swingCount = results.filter((r) => r.swing_borderline).length
  // v0.9.1 P1：四卦分歧形态分布（按 pattern / severity 归类）
  const divPatterns = {}
  const divSeverity = { high: 0, medium: 0, low: 0 }
  let divCount = 0
  for (const r of results) {
    const d = r.quad_hexagram && r.quad_hexagram.consistency && r.quad_hexagram.consistency.divergence
    if (!d || !d.divergent) continue
    divCount++
    divPatterns[d.pattern] = (divPatterns[d.pattern] || 0) + 1
    if (divSeverity[d.severity] != null) divSeverity[d.severity]++
  }

  // v0.9.0 F-1：进卦域优先取剧本声明的 hex_order（1296 六域全进卦），无声明再回落三才切分
  const inHexDomains = Array.isArray(scriptObj.hex_order) && scriptObj.hex_order.length >= 6
    ? scriptObj.hex_order.slice(0, 6)
    : [...(scriptObj.sancai_mapping.tian || []).slice(0, 3), ...(scriptObj.sancai_mapping.di || []).slice(0, 3)]
  const activeYaoCount = inHexDomains.filter((c) => !qt.frozen.includes(c)).length
  const out = {
    meta: {
      generated_at: new Date().toISOString(),
      snapshot: '同花顺自选股截图（收盘快照，周三 21:50）',
      market: { 上证: '+0.12%', 深成: '-0.14%', 创业板: '-0.26%' },
      horizon: '本周内（剩余周四/周五共 2 个交易日）',
      script: scriptObj.script_id,
      engine: `dsh-daoyi-yijing v${ENGINE_VERSION}（确定性引擎${live ? '，在线模式：腾讯行情适配层' : '，离线模式'}，零 LLM 额度消耗）`,
      mode: liveMeta.mode,
      live: live ? liveMeta : null,
      hex_encoding: {
        mode: 'batch-quantile', // 批次内中位数分位（满熵），取代绝对阈值 0.5
        thresholds: Object.fromEntries(
          Object.entries(qt.thresholds).map(([k, v]) => [k, Number.isFinite(v) ? Number(v.toFixed(4)) : 'frozen']),
        ),
        frozen_domains: qt.frozen, // 批次内取值唯一 → 恒阴（无分化能力，待补数据）
        // 有效爻数 k = 真正进卦的 6 个域（天3 + 地3）中未被冻结的数量；卦种上限 = 2^k
        //   （旧式 8 − frozen(非XX/FX) 基于「XX/FX 不进卦」的旧三才假设，三才重排后已失效）
        in_hex_domains: inHexDomains,
        active_yao_count: activeYaoCount,
        domain_distinct: qt.stats,
        note: '有效独立爻数决定卦种上限（2^k）；frozen 域不贡献种类，需补真实数据才能激活',
      },
      rules: '见脚本头注释' + (live ? '与 adapters/quote.mjs RULES_TEXT' : '') + '；无数据域一律 NA，不造假填充',
      count: results.length,
      disclaimer: '结构化多因子研判示意，不构成任何投资建议',
    },
    sector_avg: Object.fromEntries(Object.entries(sectorAvg).map(([k, v]) => [k, Number(v.toFixed(2))])),
    trend_dist: dist,
    hexagram_dist: hxDist,
    // v0.9.0 F-2：四连卦种类分布（原 0/56 无字段）+ 否决骑墙清单 + 分层生效统计
    quad_kinds: quadKinds,
    quad_coverage: { records_with_quad: quadCount, total: results.length },
    veto_borderline: {
      count: borderline,
      rate: results.length ? Number((borderline / results.length).toFixed(4)) : 0,
      note: '否决骑墙 = 触发一票否决但综合分 ≥0.5（评分不支持「不可行」）→ 人工复核优先清单',
    },
    // v0.9.1 N-3：贴线摇摆统计 + P1：卦象分歧形态分布
    swing: {
      count: swingCount,
      rate: results.length ? Number((swingCount / results.length).toFixed(4)) : 0,
      band: typeof opts.swingBand === 'number' ? opts.swingBand : SWING_BAND_DEFAULT,
      sample: results.filter((r) => r.swing_borderline).slice(0, 8).map((r) => ({
        name: r.name, code: r.code, verdict: r.verdict,
        margin: r.verdict_swing ? r.verdict_swing.margin : null,
      })),
      note: '贴线摇摆 = 结论距决定线余量 ≤ band（默认 0.08）：跨种子/跨快照易翻面，不得当稳定判据；与否决骑墙正交',
    },
    quad_divergence: {
      count: divCount,
      rate: quadCount ? Number((divCount / quadCount).toFixed(4)) : 0,
      patterns: divPatterns,
      by_severity: divSeverity,
      note: '四卦分歧样本（最有信息量）：pattern 为分歧形态归类，severity=high 者不得直接采信任一单卦',
    },
    // v0.9.1 N-1：absolute 口径护栏（批量生产路径默认不承认）
    basis_guard: {
      basis: opts.thresholdBasis === 'absolute' ? 'absolute' : 'baseline',
      guarded: opts.thresholdBasis === 'absolute' && opts.allowAbsoluteBasis !== true,
      note:
        opts.thresholdBasis === 'absolute' && opts.allowAbsoluteBasis !== true
          ? '本次使用 absolute 口径但未加 --allow-absolute-basis：结果仅作对照，不得作为决策判据'
          : 'baseline 分位口径（生产）',
    },
    stratum_audit: {
      used: stratumUsed,
      total: results.length,
      note: '分层阈值生效数；离线快照无总市值 → 标 unavailable:snapshot-no-cap（不伪造层）',
    },
    results,
  }

  mkdirSync(LOG_DIR, { recursive: true })
  writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8')
  console.log(`共推演 ${results.length} 只 · 趋势分布:`, dist)
  console.log(`卦象种类: ${Object.keys(hxDist).length} 种 →`, hxDist)
  console.log('结果已写入', outFile)
  return out
}

const LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs')

// 直接运行（node scripts/divine_batch_stocks.mjs [--live]）才执行；被 import 时不跑
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('divine_batch_stocks.mjs')) {
  const argv = process.argv.slice(2)
  const live = argv.includes('--live')
  // v0.9.0 F-7：--script stock-trend-v2（1296）/ --ci-grouping semantic / --strong-override include-proxies
  const flagVal = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : null
  }
  const scriptArg = flagVal('--script') || 'stock-trend'
  const ciGrouping = flagVal('--ci-grouping') || undefined
  const strongOverride = flagVal('--strong-override') || undefined
  const fineMap = argv.includes('--no-fine-map') ? false : undefined
  // v0.9.1：N-1 口径护栏 —— 批量是生产路径，absolute 必须显式确认，否则直接拒绝启动
  const thresholdBasis = flagVal('--threshold-basis') || undefined
  const allowAbsoluteBasis = argv.includes('--allow-absolute-basis')
  if (thresholdBasis === 'absolute' && !allowAbsoluteBasis) {
    console.error(
      '拒绝启动：--threshold-basis absolute 未经分位校准（爻会恒阳/恒阴、卦象坍缩），仅作对照/调试。\n' +
        '若确认要做该对照，请显式加 --allow-absolute-basis（结果会在 meta.basis_guard 中标记为非生产口径）。',
    )
    process.exit(2)
  }
  const swingBandRaw = flagVal('--swing-band')
  const swingBand = swingBandRaw != null && Number.isFinite(Number(swingBandRaw)) ? Number(swingBandRaw) : undefined
  runBatch({
    live,
    script: scriptArg,
    ciGrouping,
    strongOverride,
    fineMap,
    thresholdBasis,
    allowAbsoluteBasis,
    swingBand,
  }).catch((e) => {
    console.error('批推演失败:', e)
    process.exit(1)
  })
}
