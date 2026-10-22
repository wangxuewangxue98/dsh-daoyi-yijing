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

// ── v2（1296 四层）分域 → 业务族映射（v0.9.0 F-9，卦③语义分组）────────────────────
// 与 384 的「域基础族 + aspect 修正」不同：1296 的 aspect 位已被卦④占用，卦③（子域位）若按位置
// 序号分组，组均值受 1/36 平均效应抹平 → 卦③坍缩（报告轮A 实测 2 种）。故按**分域语义**分族：
//   36 个分域（域6 × 分域位6）逐一归类到六族，族内同质、族间可分离。
// 归类依据（分域名语义，非投资判断）：
//   L 水平存量（绝对值/存量/规模/位置）｜T 趋势变化（方向/增速/动量/流向）
//   S 结构质量（构成/匹配/排列/持续性）｜M 边际拐点（拐点/背离/预期差/反转）
//   R 风险安全（风险/敞口/压力/纪律/尾部）｜C 催化事件（催化/信号/事件/公告/政策）
export const SUBDOMAIN_V2_FAMILY = {
  // JB 基本面
  JB01: 'L', // 盈利能力：ROE/毛利/净利水平
  JB02: 'T', // 成长能力：营收/利润增速
  JB03: 'R', // 财务安全：负债/流动/减值敞口
  JB04: 'S', // 营运与现金：周转/现金流结构
  JB05: 'L', // 股东回报：股息率/分红/回购水平
  JB06: 'M', // 业绩拐点：拐点信号/预期修正
  // HY 行业面
  HY01: 'L', // 行业景气：景气指数/开工率水平
  HY02: 'S', // 供需与周期：供需结构/产能周期
  HY03: 'S', // 竞争格局：份额/集中度/壁垒结构
  HY04: 'L', // 宏观环境：货币/利率/通胀水平
  HY05: 'C', // 政策与技术：政策导向/技术突破催化
  HY06: 'T', // 需求与产业链：下游需求趋势/弹性
  // JS 技术面
  JS01: 'T', // 趋势方向
  JS02: 'T', // 动量强度
  JS03: 'L', // 支撑阻力：位置/区间水平
  JS04: 'S', // 量能配合：量价结构
  JS05: 'S', // 形态结构
  JS06: 'M', // 指标与波动：超买超卖/波动收敛放大（拐点）
  // ZJ 资金面
  ZJ01: 'T', // 主力资金：净流入流向
  ZJ02: 'T', // 北向与杠杆：流向/余额变化
  ZJ03: 'S', // 机构与股东：持仓结构/股东户数
  ZJ04: 'R', // 大宗与解禁：解禁压力/折价
  ZJ05: 'L', // 估值水平：绝对/相对/历史分位
  ZJ06: 'L', // 宏观与市场流动性：流动性水平
  // XX 消息面
  XX01: 'C', // 公司公告
  XX02: 'C', // 行业与政策
  XX03: 'C', // 媒体与舆情
  XX04: 'M', // 研报与目标价：评级调整/预期修正
  XX05: 'C', // 高管增减持：增减持信号
  XX06: 'R', // 突发事件：诉讼/黑天鹅苗头
  // FX 风险面
  FX01: 'R', // 系统性风险
  FX02: 'R', // 个股黑天鹅
  FX03: 'R', // 流动性与政策风险
  FX04: 'M', // 业绩变脸：变脸概率/预警（拐点）
  FX05: 'R', // 减持与商誉：减持压力/商誉减值
  FX06: 'R', // 止损边界：止损距离/回撤容忍
}

/** v2 分域码（如 'JS01'）→ 业务族；未收录 → null（调用方跳过该检查点，不猜测归类） */
export function familyOfV2(code) {
  const f = code != null ? SUBDOMAIN_V2_FAMILY[String(code).slice(0, 4)] : null
  return f && FAMILY_ORDER.includes(f) ? f : null
}

/** 自检：36 个分域必须全部有族，且六族均非空（否则卦③会出现空爻组） */
export function assertV2FamilyCoverage(subCodes) {
  const counts = Object.fromEntries(FAMILY_ORDER.map((f) => [f, 0]))
  const missing = []
  for (const c of subCodes) {
    const f = familyOfV2(c)
    if (!f) missing.push(c)
    else counts[f]++
  }
  const empty = FAMILY_ORDER.filter((f) => counts[f] === 0)
  if (missing.length || empty.length) {
    throw new Error(
      `v2 业务族覆盖异常：未分类 ${missing.length} 个（${missing.slice(0, 8).join(',')}${missing.length > 8 ? '…' : ''}）；空族 ${empty.join('/') || '无'}（counts=${JSON.stringify(counts)}）`,
    )
  }
  return { total: subCodes.length, counts }
}

export default { FAMILY_LABELS, FAMILY_ORDER, familyOf, assertFamilyCoverage, SUBDOMAIN_V2_FAMILY, familyOfV2, assertV2FamilyCoverage }
