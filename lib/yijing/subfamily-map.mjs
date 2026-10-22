// subfamily-map.mjs — 引擎 384 检查点 → 6 业务族(L/T/S/M/R/C) 启发式映射（卦③ 语义分组）
//
// 背景（与附件 subfamily-map.mjs 同目标，但为引擎 8×8×6=384 结构的紧凑适配版）：
//   卦③ 若按「子域叶位序号」分组，组均值极差被 1/36 平均效应抹平 → 恒为乾/坤 2 种卦象（附件轮D 实测）。
//   改按**业务语义分族**（族内同质、族间可分离）→ 组均值差异由域分结构与族-域混合权重自然产生，
//   卦③ 种类 2→多种（附件轮E 实证）。本模块即此语义分族，但用「域基础族 + aspect 修正」紧凑启发式，
//   而非附件 216 手调表（附件基于 6×6×6×6=1296 结构，且未并入本仓库）。
//
// 六族定义（纯结构性，不含任何投资判断）：
//   L 水平存量：绝对值/存量/规模/估值水平类
//   T 趋势变化：方向/增速/动量/趋势/流向类
//   S 结构质量：构成/匹配/排列/质量/持续性类
//   M 边际拐点：拐点/反转/背离/预期差/修正类
//   R 风险安全：风险/敞口/压力/纪律/边界/弹性类
//   C 催化事件：催化/信号/事件/公告/突破/触发类

export const FAMILY_LABELS = {
  L: '水平存量',
  T: '趋势变化',
  S: '结构质量',
  M: '边际拐点',
  R: '风险安全',
  C: '催化事件',
}
export const FAMILY_ORDER = ['L', 'T', 'S', 'M', 'R', 'C']

// 域基础族：每个顶层域的主导业务性质（作为该域所有检查点的默认族）
const DOMAIN_BASE = {
  JB: 'L', // 基本面：以水平/质量存量为主（ROE水平、资产负债、盈利质量…）
  JS: 'S', // 技术面：以结构/形态/质量为主（均线排列、形态完成度…）
  ZJ: 'T', // 资金面：以流向/趋势为主（主力净流入、北向流向…）
  XX: 'C', // 消息面：以事件/催化为主（公告、舆情、突发事件…）
  HY: 'L', // 行业面：以景气/周期水平为主（行业景气、供需、价格周期…）
  HG: 'L', // 宏观面：以宏观环境水平为主（货币、利率、经济数据…）
  GZ: 'L', // 估值面：以估值水平为主（绝对/相对估值、历史分位…）
  FX: 'R', // 风险面：以风险/安全为主（系统性、黑天鹅、尾部…）
}

// aspect 修正：覆盖域基础族（命中即取此族，否则回落域基础族）
const ASPECT_MOD = {
  强度: '', // 保持域基础族
  持续性: 'S', // 持续性 → 结构质量
  确定性: '', // 保持域基础族
  边际变化: 'M', // 边际变化 → 边际拐点
  安全边际: 'R', // 安全边际 → 风险安全
  催化: 'C', // 催化 → 催化事件
}

// 检查点 → 业务族。cp：{ domain: 'JS', id: 'JS0101' } 或 (domain, aspectName)
//   aspectName 由调用方从检查点 id 的 ci 段（1-6）映射到 aspect 名后传入，避免在此硬编码 aspect 顺序。
export function familyOf(domain, aspectName) {
  const base = DOMAIN_BASE[domain] || 'S'
  const mod = aspectName != null ? ASPECT_MOD[aspectName] : ''
  return mod || base
}

// 自检：族映射必须覆盖引擎全部 384 检查点且六族均有样本
export function assertFamilyCoverage(checkpointIds, aspectNameOf) {
  const counts = Object.fromEntries(FAMILY_ORDER.map((f) => [f, 0]))
  let unclassified = 0
  for (const id of checkpointIds) {
    const domain = id.slice(0, 2)
    const aspectName = aspectNameOf ? aspectNameOf(id) : null
    const f = familyOf(domain, aspectName)
    if (!FAMILY_ORDER.includes(f)) unclassified++
    else counts[f]++
  }
  const emptyFamilies = FAMILY_ORDER.filter((f) => counts[f] === 0)
  if (unclassified || emptyFamilies.length) {
    throw new Error(
      `业务族覆盖异常：未分类 ${unclassified} 个；空族 ${emptyFamilies.join('/') || '无'}（counts=${JSON.stringify(counts)}）`,
    )
  }
  return { total: checkpointIds.length, counts }
}

export default { FAMILY_LABELS, FAMILY_ORDER, familyOf, assertFamilyCoverage }
