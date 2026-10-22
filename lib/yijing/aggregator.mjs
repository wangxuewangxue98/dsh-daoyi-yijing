// aggregator.mjs — 六层加权聚合引擎（确定性，零云模型依赖）
// 对应于 Python 原型 yijing_aggregator.py:562 full_evaluation
//   aggregate_subdomain(:238 强关联一票否决) / aggregate_sancai(:395) / aggregate_liangyi(:443) / aggregate_taiji(:490)
//
// 关键不变（引擎灵魂）：强关联一票否决 + 加权弱关联；本文件是 verdict 的唯一裁判，云模型不介入。
// 移植补充：NA 检查点/子域/域（外部数据域）排除出聚合（对齐 yijing_mapping.py:204/206 的 NA 口径），计入覆盖率。

const PASS_THRESHOLD = 0.75
const COND_THRESHOLD = 0.5

// evaluations: Map(checkpointId -> { value, yinYang, pass })
export function aggregate(database, evaluations) {
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
      active++
      const ev = evaluations.get(cid)
      const w = cp.weight ?? 1
      wSum += w
      const yang = ev && ev.yinYang === 1
      sSum += w * (yang ? 1 : 0)
      if (!yang) failed++
      if (cp.is_strong && !yang) strongFail = true
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
    const w = cp.weight ?? 1
    gw += w
    gs += w * (ev && ev.yinYang === 1 ? 1 : 0)
  }
  const yangRatio = gw > 0 ? gs / gw : 0

  // 连续综合分：8 宫连续均分（P0-B 复活「有条件可行」中间态）
  const domainScoreVals = Object.values(domainResults).map((d) => d.score)
  const continuousScore = domainScoreVals.length
    ? domainScoreVals.reduce((a, b) => a + b, 0) / domainScoreVals.length
    : 0

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

  // 风险等级
  let risk
  if (hasVeto) risk = '高'
  else if (continuousScore >= PASS_THRESHOLD) risk = '低'
  else if (continuousScore >= COND_THRESHOLD) risk = '中'
  else risk = '高'

  // 覆盖率（NA 审计）
  const naCount = checkpoints.filter((c) => c.na).length
  const activeCount = checkpoints.length - naCount

  return {
    overall_score: Number(continuousScore.toFixed(4)),
    yang_ratio: Number(yangRatio.toFixed(4)),
    verdict,
    verdict_grade: verdictGrade,
    verdict_margin: verdictMargin,
    has_veto: hasVeto,
    veto_score_conflict: vetoScoreConflict,
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
