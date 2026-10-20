// grading.mjs — 道一·分级评估轴（纯函数，additive，不改动核心 aggregator）
// 把连续评分(0~1)映射为用户指定的「评估渐细轴」：
//   L2 两仪 = 正 / 反           （2 档）
//   L3 三才 = 正 / 中 / 反       （3 档）
//   L4 四象 = 正 / 偏正 / 偏反 / 反（4 档）
// 用于报告与分解/聚合展示，使综合判定表达真实梯度，根治「阴阳硬二分」失真。
//
// 设计边界：分级仅作“翻译层”展示，不干预 verdict。verdict 仍由 aggregator 的
// 二进制(>=0.5=阳) + 强关联一票否决 + 加权阈值决定（引擎灵魂，可审计、可离线复算）。

// —— 阈值带（对称、可审计）——
// 四象(4 档)
export const FOUR_BANDS = [
  { key: '正', min: 0.65, desc: '强正面' },
  { key: '偏正', min: 0.50, desc: '略正面' },
  { key: '偏反', min: 0.35, desc: '略负面' },
  { key: '反', min: -Infinity, desc: '强负面' },
]
// 三才(3 档)
export const THREE_BANDS = [
  { key: '正', min: 0.55, desc: '正面' },
  { key: '中', min: 0.45, desc: '中性' },
  { key: '反', min: -Infinity, desc: '负面' },
]
// 两仪(2 档)
export const TWO_BANDS = [
  { key: '正', min: 0.50, desc: '正面' },
  { key: '反', min: -Infinity, desc: '负面' },
]

function bandOf(score, bands) {
  for (const b of bands) {
    if (score >= b.min) return b.key
  }
  return bands[bands.length - 1].key
}

// 单值分级
export function gradeTwo(score) {
  return bandOf(score, TWO_BANDS)
}
export function gradeThree(score) {
  return bandOf(score, THREE_BANDS)
}
export function gradeFour(score) {
  return bandOf(score, FOUR_BANDS)
}

// 对一组连续评分(数组或 {domain:score})做分布统计
// 返回 { 正: n, 偏正: n, ... } 与 各档归属明细
export function distribution(scores, mode = 'four') {
  const bands = mode === 'two' ? TWO_BANDS : mode === 'three' ? THREE_BANDS : FOUR_BANDS
  const grade = mode === 'two' ? gradeTwo : mode === 'three' ? gradeThree : gradeFour
  const counts = Object.fromEntries(bands.map((b) => [b.key, 0]))
  const members = Object.fromEntries(bands.map((b) => [b.key, []]))
  for (const [k, v] of Object.entries(scores)) {
    const g = grade(v)
    counts[g] += 1
    members[g].push(k)
  }
  return { counts, members, bands: bands.map((b) => ({ key: b.key, desc: b.desc, min: b.min })) }
}

// L2/L3/L4 聚合视图（基于 8 宫连续评分）
// 输入：{ CP:0.72, TR:0.58, ... }
// 输出：{ L2, L3, L4 } 各自的总体判定(取 8 宫均分) + 八宫分布 + 各档成员
export function gradedView(domainScores = {}) {
  const vals = Object.values(domainScores)
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  return {
    L2: {
      axis: '两仪·正/反',
      overall: gradeTwo(avg),
      overall_score: avg,
      dist: distribution(domainScores, 'two'),
    },
    L3: {
      axis: '三才·正/中/反',
      overall: gradeThree(avg),
      overall_score: avg,
      dist: distribution(domainScores, 'three'),
    },
    L4: {
      axis: '四象·正/偏正/偏反/反',
      overall: gradeFour(avg),
      overall_score: avg,
      dist: distribution(domainScores, 'four'),
    },
  }
}
