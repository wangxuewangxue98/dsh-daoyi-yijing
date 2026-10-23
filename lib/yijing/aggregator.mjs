// aggregator.mjs — 六层加权聚合引擎（确定性，零云模型依赖）
// 对应于 Python 原型 yijing_aggregator.py:562 full_evaluation
//   aggregate_subdomain(:238 强关联一票否决) / aggregate_sancai(:395) / aggregate_liangyi(:443) / aggregate_taiji(:490)
//
// 关键不变（引擎灵魂）：强关联一票否决 + 加权弱关联；本文件是 verdict 的唯一裁判，云模型不介入。
// 移植补充：NA 检查点/子域/域（外部数据域）排除出聚合（对齐 yijing_mapping.py:204/206 的 NA 口径），计入覆盖率。

const PASS_THRESHOLD = 0.75
const COND_THRESHOLD = 0.5

/**
 * v0.9.1 N-3：贴线摇摆带（默认 0.08）。
 * 由来：使用报告 N-3 —— 民生银行 verdict_margin=0.0602（距「可行」线仅 6 个百分点），
 *   换一个随机种子就可能翻到另一侧，但引擎里**没有任何字段**表达「这个结论不稳」：
 *   veto_score_conflict 只在「否决 vs 综合分」冲突时为真，覆盖不到这种「分数贴线」。
 * 0.08 的经验依据：单样本域分抖动量级约 ±0.05（8 宫均分后约 ±0.03~0.06），
 *   取 1.5 倍留安全余量；可用 opts.swingBand 覆盖，设 0 关闭。
 */
export const SWING_BAND_DEFAULT = 0.08

// evaluations: Map(checkpointId -> { value, yinYang, pass })
export function aggregate(database, evaluations, opts = {}) {
  const { checkpoints, domainIndex, subdomainIndex, sancai_mapping } = database

  // L6：子领域聚合（64 卦）—— 含强关联一票否决；NA 检查点跳过，全 NA 子域标记 is_na
  const subdomainResults = {}
  for (const [sdKey, sd] of Object.entries(subdomainIndex)) {
    let wSum = 0
    let sSum = 0
    let strongFail = false
    let active = 0
    let failed = 0
    for (const cid of sd.checks) {
      const cp = checkpoints.find((c) => c.id === cid)
      if (!cp || cp.na) continue // 跳过 NA（外部数据域）
      const ev = evaluations.get(cid)
      // v0.9.4 P0-2：scoringPolicy.missingValue='abstain' 的缺值剔除出聚合（等同 NA，不进分母）
      if (ev && ev.abstain) continue
      active++
      const w = cp.weight ?? 1
      wSum += w
      // v0.9.4 P0-2：scoringPolicy.missingValue='half' 的缺值检查点按 0.5 中性贡献
      //   （passFactor），不判阳、不计失败、不触发强关联否决；其余检查点行为不变。
      const factor = ev ? (ev.passFactor ?? (ev.yinYang === 1 ? 1 : 0)) : 0
      const yang = ev && ev.yinYang === 1
      sSum += w * factor
      if (!yang && !(ev && ev.missing)) failed++
      if (cp.is_strong && !yang && !(ev && ev.missing)) strongFail = true
    }
    if (active === 0) {
      subdomainResults[sdKey] = {
        key: sdKey, code: sd.code, bagua: sd.bagua, name: sd.name,
        score: 0, strong_veto: false, checks_total: 0, checks_failed: 0, is_na: true,
      }
      continue
    }
    const score = wSum > 0 ? sSum / wSum : 0
    subdomainResults[sdKey] = {
      key: sdKey, code: sd.code, bagua: sd.bagua, name: sd.name,
      score, strong_veto: strongFail, checks_total: active, checks_failed: failed, is_na: false,
    }
  }

  // L5：8 宫（域）聚合；全 NA 域（如 COST/MANU）剔除出聚合
  const domainResults = {}
  const naDomains = []
  for (const [code, d] of Object.entries(domainIndex)) {
    let wSum = 0
    let sSum = 0
    let strongVeto = false
    let activeSubs = 0
    for (const sdKey of d.subdomains) {
      const sr = subdomainResults[sdKey]
      if (!sr || sr.is_na) continue
      activeSubs++
      const n = sr.checks_total || 1
      wSum += n
      sSum += n * sr.score
      if (sr.strong_veto) strongVeto = true
    }
    if (activeSubs === 0) {
      naDomains.push(code)
      continue
    }
    const score = wSum > 0 ? sSum / wSum : 0
    domainResults[code] = {
      code,
      name: d.name,
      bagua: d.bagua,
      score,
      strong_veto: strongVeto,
      subdomains: d.subdomains.map((k) => subdomainResults[k]).filter(Boolean),
    }
  }

  // L4：四象（按域得分聚类）
  const sixiang = { 太阳: [], 少阳: [], 少阴: [], 太阴: [] }
  for (const [code, dr] of Object.entries(domainResults)) {
    const s = dr.score
    const bucket =
      s >= PASS_THRESHOLD ? '太阳' : s >= COND_THRESHOLD ? '少阳' : s >= 0.25 ? '少阴' : '太阴'
    sixiang[bucket].push(code)
  }

  // L3：三才（天/地/人）—— 仅对 present 域求平均（对齐 Python：NA 域不计入）
  const sancai = {}
  for (const [group, codes] of Object.entries(sancai_mapping)) {
    const present = codes.filter((c) => domainResults[c])
    const scores = present.map((c) => domainResults[c].score)
    sancai[group] = {
      codes: present,
      score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    }
  }

  // 全局加权得分（L7→L2 综合）—— 仅活跃检查点（阳爻占比，留作审计）
  let gw = 0
  let gs = 0
  for (const cp of checkpoints) {
    if (cp.na) continue
    const ev = evaluations.get(cp.id)
    if (ev && ev.abstain) continue // v0.9.4 P0-2：abstain 缺值不进全局分母
    const w = cp.weight ?? 1
    gw += w
    // v0.9.4 P0-2：half 缺值按 0.5 中性贡献（与子域聚合同口径）
    gs += w * (ev ? (ev.passFactor ?? (ev.yinYang === 1 ? 1 : 0)) : 0)
  }
  const yangRatio = gw > 0 ? gs / gw : 0

  // 连续综合分：8 宫连续均分（P0-B 复活「有条件可行」中间态）
  // v0.9.4 P0-2：scoringPolicy.domainCoverageWeighting → 按域覆盖率折扣
  //   factor = 0.5 + 0.5 × (在场域 / 总域)；全场齐备时 factor=1（逐位不变）。
  //   动机（v2 评价 P1-2）：3 个稀疏域的均分不再与 8 域齐全同权——稀疏输入的
  //   「有条件可行/可行」须为信息缺口让位（银行盲区/看涨执念的聚合层根因）。
  const policy = opts.scoringPolicy || {}
  const domainScoreVals = Object.values(domainResults).map((d) => d.score)
  let domainCoverageFactor = 1
  let continuousScore = domainScoreVals.length
    ? domainScoreVals.reduce((a, b) => a + b, 0) / domainScoreVals.length
    : 0
  if (policy.domainCoverageWeighting) {
    const totalDomains = Object.keys(domainIndex).length
    const presentDomains = domainScoreVals.length
    if (totalDomains > 0 && presentDomains < totalDomains) {
      domainCoverageFactor = 0.5 + 0.5 * (presentDomains / totalDomains)
      continuousScore *= domainCoverageFactor
    }
  }

  // L2：两仪判定（否决策略 + 连续分驱动，取代旧阳爻占比二分）
  //   vetoPolicy.mode: 'any'（默认，安全性剧本）| 'whiteList'（domains 白名单 + minCount 票数阈值）
  const vetoPolicy = database.vetoPolicy || { mode: 'any' }
  let hasVeto
  if (vetoPolicy.mode === 'whiteList') {
    const vetoCodes = vetoPolicy.domains || []
    const minCount = vetoPolicy.minCount != null ? vetoPolicy.minCount : 1
    const n = Object.values(domainResults).filter(
      (d) => d.strong_veto && vetoCodes.includes(d.code),
    ).length
    hasVeto = n >= minCount
  } else {
    hasVeto = Object.values(domainResults).some((d) => d.strong_veto)
  }
  let verdict
  if (hasVeto) verdict = '不可行'
  else if (continuousScore >= PASS_THRESHOLD) verdict = '可行'
  else if (continuousScore >= COND_THRESHOLD) verdict = '有条件可行'
  else verdict = '不可行'

  // 板块趋势强度门控（v0.9.6 P1；弱反弹周假看涨治理）
  //   剧本声明 verdictRegimeGate 时：verdict=可行 且 JS 域阳（个股 5 日趋势强）且 HY 域非阳
  //   （板块 5 日趋势疲弱）→ 降级「有条件可行」（弃权）。仅动看涨侧，不动不可行/否决；
  //   HY/JA 域 NA（无数据）不触发——信息缺口由覆盖率折扣负责，不虚构板块趋势。
  //   比较用 <=：HY 域分恰为阈值（如稀疏口径下 HY01 阴+HY04 阳 → 0.5）正是「个股跑赢但板块
  //   趋势弱」的典型形态，严格 < 会系统性漏掉（v0.9.6 首轮回测实测 0/540 触发的根因）。
  //   数据依据：趋势门多周滚动回测终评——反弹周池化看涨精度 50.0% < 全看涨基准 64.7%，
  //   误发看涨集中于「个股强 + 板块弱」组合；宁弃权不误报（与 v0.9.3 fail-closed 同族）。
  const regimeGateCfg = database.verdictRegimeGate
  let verdictRegimeGate = null
  if (regimeGateCfg && regimeGateCfg.enabled && verdict === '可行' && !hasVeto) {
    const jsMin = Number.isFinite(regimeGateCfg.jsMin) ? regimeGateCfg.jsMin : 0.5
    const hyMax = Number.isFinite(regimeGateCfg.hyMax) ? regimeGateCfg.hyMax : 0.5
    const js = domainResults.JS
    const hy = domainResults.HY
    const jsStrong = js && !js.is_na && js.score >= jsMin
    const hyWeak = hy && !hy.is_na && hy.score <= hyMax
    if (jsStrong && hyWeak) {
      verdict = '有条件可行'
      verdictRegimeGate = {
        rule: 'sector-weak-rebound',
        js_score: Number(js.score.toFixed(4)),
        hy_score: Number(hy.score.toFixed(4)),
        js_min: jsMin,
        hy_max: hyMax,
        note:
          `JS 域阳（个股趋势强 ≥${jsMin}）而 HY 域阴（板块趋势疲弱 <${hyMax}）：弱反弹周假看涨治理，` +
          '「可行」降级为「有条件可行」——孤立个股反弹缺乏板块趋势支撑，宁弃权不误报',
      }
    }
  }

  // 「有条件可行」分级（v0.8.1）：中间态带宽 0.25（0.5~0.75）过宽，实操无法排序。
  //   按带上下限中位（0.625）切两档；verdict 原值不变（零回归），分级仅作沟通/排序辅助。
  // verdict_margin：距上一条通过线的带符号余量（可行→超出量；有条件可行→距可行线；
  //   不可行(分)→低于有条件线的量；否决→null 无意义）。
  const COND_MID = (PASS_THRESHOLD + COND_THRESHOLD) / 2
  let verdictGrade = verdict
  if (verdict === '有条件可行') {
    verdictGrade = continuousScore >= COND_MID ? '有条件可行·偏强' : '有条件可行·偏弱'
  }
  const verdictMargin = hasVeto
    ? null
    : verdict === '可行'
      ? Number((continuousScore - PASS_THRESHOLD).toFixed(4))
      : verdict === '有条件可行'
        ? Number((PASS_THRESHOLD - continuousScore).toFixed(4))
        : Number((continuousScore - COND_THRESHOLD).toFixed(4))

  // 否决骑墙（v0.9.0 F-4③）：风控白名单否决 与 加权综合分 结论冲突。
  //   判据：veto 触发，但综合分已达「有条件可行」线（≥0.5）——即评分本身并不支持「不可行」，
  //   结论由单条强关联规则主导。使用报告 §三 Q-2 的 11 只「高危看跌」全属此类（否决骑墙）。
  //   引擎此前只出 has_veto，调用方无法枚举人工复核优先清单；此处升级为引擎级字段，batch 汇总骑墙率。
  const vetoScoreConflict = hasVeto && continuousScore >= COND_THRESHOLD

  // 贴线摇摆（v0.9.1 N-3）：结论距离「决定它的那条线」太近 → 换种子/换快照就可能翻面。
  //   判据与 veto_score_conflict 正交：后者只看「否决 vs 综合分」冲突，本项只看**分数贴线**。
  //   否决时 margin 无意义（verdict 由规则主导），改用「综合分距有条件线」的量。
  const band =
    typeof opts.swingBand === 'number' && Number.isFinite(opts.swingBand) && opts.swingBand >= 0
      ? opts.swingBand
      : SWING_BAND_DEFAULT
  const swingRef = hasVeto ? Number((continuousScore - COND_THRESHOLD).toFixed(4)) : verdictMargin
  const swingBorderline = swingRef != null && Math.abs(swingRef) <= band
  const decisiveLine = verdict === '不可行' || hasVeto ? COND_THRESHOLD : PASS_THRESHOLD
  const verdictSwing = {
    borderline: Boolean(swingBorderline),
    band,
    margin: swingRef,
    // side 以「综合分 vs 决定线」为准（verdict_margin 的符号是「距上一条通过线的余量」，方向相反，勿混）
    side: continuousScore >= decisiveLine ? 'above' : 'below',
    decisive_line: decisiveLine,
    note: swingBorderline
      ? `结论贴决定线仅 ${Math.abs(swingRef).toFixed(4)}（≤${band}）：跨种子/跨快照易翻面，结论不可当作稳定判据`
      : null,
  }

  // 风险等级
  let risk
  if (hasVeto) risk = '高'
  else if (continuousScore >= PASS_THRESHOLD) risk = '低'
  else if (continuousScore >= COND_THRESHOLD) risk = '中'
  else risk = '高'
  // 门控降级后 verdict 已非「可行」：风险等级随之下调（不得分数高就低风险而结论却降级）
  if (verdictRegimeGate && risk === '低') risk = '中'

  // 覆盖率（NA 审计）
  const naCount = checkpoints.filter((c) => c.na).length
  const activeCount = checkpoints.length - naCount

  return {
    overall_score: Number(continuousScore.toFixed(4)),
    domain_coverage_factor: Number(domainCoverageFactor.toFixed(4)),
    yang_ratio: Number(yangRatio.toFixed(4)),
    verdict,
    verdict_grade: verdictGrade,
    verdict_margin: verdictMargin,
    // v0.9.6 P1：板块趋势强度门控触发记录（未触发为 null；引擎级单一真相源，工具/批量/verify 一致呈现）
    verdict_regime_gate: verdictRegimeGate,
    has_veto: hasVeto,
    veto_score_conflict: vetoScoreConflict,
    verdict_swing: verdictSwing,
    risk_level: risk,
    domain_results: domainResults,
    na_domains: naDomains,
    subdomain_results: subdomainResults,
    sixiang,
    sancai,
    coverage: {
      total: checkpoints.length,
      na: naCount,
      active: activeCount,
      coverage: checkpoints.length ? activeCount / checkpoints.length : 0,
    },
  }
}
