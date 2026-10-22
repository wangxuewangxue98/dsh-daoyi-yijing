// subdomain-fine-map.mjs — 规则→子域名精映射（P2，v0.8.1）
//
// 背景（阶段 2 S5 实证复现设计文档论断）：行情信号经 MIGRATION_MAP 只到**分域粒度**（L2），
//   分域内 36 项同值 → 卦③（子域位）恒坍缩为 2 种（乾/坤）。LLM L3 是彻底解，但依赖端点与费用
//   （默认走用户 DSH 会话模型，见 tools/yijing/divine.mjs llmLevel）。
//   本模块提供**无 LLM 的部分解**：把行情规则（quote.mjs 的每条 add() 即一条规则，落在旧 384
//   子域上）按其语义精映射到 v2 的「分域 × 子域位」，使信号落在子域粒度 → 卦③获得区分度。
//
// 语义依据：旧 384 子域名（checkpoints.mjs buildStockScript）与 v2 分域/子域名
//   （scripts/stock-trend-v2.mjs DOMAINS_V2）逐条人工对应。**分域归属严格沿用 MIGRATION_MAP**
//   （A/B 实测裁决：HG→HY、GZ→JB/ZJ/XX，见 6 域 A/B 实测报告），本表只在其下选子域位，不改域归属。
//
// 64 条目 = 旧 64 子域全覆盖（有行情规则的子域才会真正产出信号；无规则子域进表只为审计完整）。
//
// 诚实边界（文档化局限，随版本交付）：
//   ① 只覆盖「有行情规则的子域」：21 条规则命中约 20 个旧子域 → 卦③是**部分激活**——
//      有信号的子域位组有区分度，无信号组恒阴（其中子域位 6 当前无任何规则命中）；
//   ② 覆盖率下降：未命中子域的检查点全部 NA（不造假），inputs 覆盖率低于 L2 铺开；
//   ③ aspect 仍同质（规则本身只到子域级，6 个 aspect 同 delta 铺开）→ 卦④不因本模块改变；
//   ④ 这是"手工制造数据粒度"（S1-S5 报告原文），语义正确性由人工对应保证，非统计学习产物。

// 旧子域码 → { sd: v2 分域码, sub: 子域位 1-6 }
// 命名审计（旧名 → 新分域·新子域名）见 describeFineMap()/docs 附录；
// 每条必须与 MIGRATION_MAP[旧子域] 的 sd 一致（assertFineMapConsistency 自检）。
export const FINE_MAP = {
  // JB（基本面）：盈利能力/成长能力/拐点直对应；现金质量→经营现金流；资产质量→资产结构；分红回报→股息率
  JB01: { sd: 'JB01', sub: 1 }, // 盈利能力 → 盈利能力·ROE水平
  JB02: { sd: 'JB02', sub: 1 }, // 成长能力 → 成长能力·营收增速
  JB03: { sd: 'JB03', sub: 1 }, // 偿债安全 → 财务安全·资产负债率
  JB04: { sd: 'JB04', sub: 1 }, // 营运效率 → 营运与现金·应收周转
  JB05: { sd: 'JB04', sub: 3 }, // 现金质量 → 营运与现金·经营现金流
  JB06: { sd: 'JB03', sub: 4 }, // 资产质量 → 财务安全·资产结构
  JB07: { sd: 'JB05', sub: 1 }, // 分红回报 → 股东回报·股息率
  JB08: { sd: 'JB06', sub: 1 }, // 业绩拐点 → 业绩拐点·拐点信号
  // HY（行业面）
  HY01: { sd: 'HY01', sub: 1 }, // 行业景气 → 行业景气·景气指数
  HY02: { sd: 'HY02', sub: 1 }, // 供需格局 → 供需与周期·供需平衡
  HY03: { sd: 'HY02', sub: 3 }, // 价格周期 → 供需与周期·价格趋势
  HY04: { sd: 'HY03', sub: 1 }, // 竞争格局 → 竞争格局·市场份额
  HY05: { sd: 'HY05', sub: 1 }, // 政策导向 → 政策与技术·政策导向
  HY06: { sd: 'HY05', sub: 3 }, // 技术变革 → 政策与技术·技术路线
  HY07: { sd: 'HY06', sub: 1 }, // 下游需求 → 需求与产业链·下游需求
  HY08: { sd: 'HY06', sub: 3 }, // 产业链位置 → 需求与产业链·产业链位置
  // JS（技术面）：均线系统归趋势方向分域·子域2；指标背离/波动特征归指标与波动分域
  JS01: { sd: 'JS01', sub: 1 }, // 趋势方向 → 趋势方向·价格趋势
  JS02: { sd: 'JS02', sub: 1 }, // 动量强度 → 动量强度·短期动量
  JS03: { sd: 'JS03', sub: 1 }, // 支撑阻力 → 支撑阻力·支撑有效性
  JS04: { sd: 'JS04', sub: 1 }, // 量能配合 → 量能配合·量能水平
  JS05: { sd: 'JS05', sub: 1 }, // 形态结构 → 形态结构·形态类型
  JS06: { sd: 'JS01', sub: 2 }, // 均线系统 → 趋势方向·均线排列
  JS07: { sd: 'JS06', sub: 1 }, // 指标背离 → 指标与波动·MACD信号
  JS08: { sd: 'JS06', sub: 3 }, // 波动特征 → 指标与波动·波动率水平
  // ZJ（资金面）
  ZJ01: { sd: 'ZJ01', sub: 1 }, // 主力资金 → 主力资金·主力净流入
  ZJ02: { sd: 'ZJ02', sub: 1 }, // 北向资金 → 北向与杠杆·北向净流入
  ZJ03: { sd: 'ZJ02', sub: 3 }, // 融资融券 → 北向与杠杆·融资余额变化
  ZJ04: { sd: 'ZJ03', sub: 1 }, // 机构持仓 → 机构与股东·机构持仓变化
  ZJ05: { sd: 'ZJ03', sub: 4 }, // 股东变化 → 机构与股东·大股东增减持
  ZJ06: { sd: 'ZJ04', sub: 1 }, // 大宗交易 → 大宗与解禁·大宗折价率
  ZJ07: { sd: 'ZJ04', sub: 3 }, // 解禁压力 → 大宗与解禁·解禁规模
  ZJ08: { sd: 'ZJ06', sub: 2 }, // 市场流动性 → 宏观与市场流动性·市场流动性
  // XX（消息面）
  XX01: { sd: 'XX01', sub: 1 }, // 公司公告 → 公司公告·公告利好
  XX02: { sd: 'XX02', sub: 1 }, // 行业政策 → 行业与政策·政策利好
  XX03: { sd: 'XX03', sub: 1 }, // 媒体报道 → 媒体与舆情·报道基调
  XX04: { sd: 'XX04', sub: 1 }, // 研报评级 → 研报与目标价·研报评级
  XX05: { sd: 'XX03', sub: 2 }, // 舆情热度 → 媒体与舆情·舆情热度
  XX06: { sd: 'XX05', sub: 1 }, // 高管增减持 → 高管增减持·增持信号
  XX07: { sd: 'XX06', sub: 2 }, // 诉讼风险 → 突发事件·诉讼仲裁
  XX08: { sd: 'XX06', sub: 1 }, // 突发事件 → 突发事件·突发事件影响
  // HG（旧宏观面 → 下沉 HY/ZJ/FX；分域归属沿用 MIGRATION_MAP）
  HG01: { sd: 'HY04', sub: 1 }, // 货币政策 → 宏观环境·货币政策
  HG02: { sd: 'HY04', sub: 2 }, // 利率汇率 → 宏观环境·利率汇率
  HG03: { sd: 'HY04', sub: 3 }, // 经济数据 → 宏观环境·经济数据
  HG04: { sd: 'FX01', sub: 2 }, // 地缘局势 → 系统性风险·地缘局势
  HG05: { sd: 'HY02', sub: 5 }, // 商品周期 → 供需与周期·周期位置
  HG06: { sd: 'HY04', sub: 4 }, // 通胀水平 → 宏观环境·通胀水平
  HG07: { sd: 'ZJ06', sub: 3 }, // 流动性环境 → 宏观与市场流动性·成交额水平（规则=个股成交额/市场成交额）
  HG08: { sd: 'HY04', sub: 5 }, // 风险偏好 → 宏观环境·风险偏好
  // GZ（旧估值面 → 下沉 ZJ/JB/XX；分域归属沿用 MIGRATION_MAP）
  GZ01: { sd: 'ZJ05', sub: 1 }, // 绝对估值 → 估值水平·绝对估值
  GZ02: { sd: 'ZJ05', sub: 2 }, // 相对估值 → 估值水平·相对估值
  GZ03: { sd: 'ZJ05', sub: 3 }, // 历史分位 → 估值水平·历史分位
  GZ04: { sd: 'ZJ05', sub: 4 }, // 业绩匹配 → 估值水平·业绩匹配
  GZ05: { sd: 'JB05', sub: 1 }, // 股息回报 → 股东回报·股息率
  GZ06: { sd: 'JB05', sub: 4 }, // 市值空间 → 股东回报·市值空间
  GZ07: { sd: 'XX04', sub: 2 }, // 机构目标价 → 研报与目标价·目标价空间
  GZ08: { sd: 'ZJ05', sub: 5 }, // 预期差 → 估值水平·预期差
  // FX（风险面）
  FX01: { sd: 'FX01', sub: 1 }, // 系统性风险 → 系统性风险·系统性风险水平
  FX02: { sd: 'FX02', sub: 1 }, // 个股黑天鹅 → 个股黑天鹅·黑天鹅概率
  FX03: { sd: 'FX03', sub: 1 }, // 流动性风险 → 流动性与政策风险·流动性风险
  FX04: { sd: 'FX03', sub: 3 }, // 政策风险 → 流动性与政策风险·政策合规
  FX05: { sd: 'FX04', sub: 1 }, // 业绩变脸 → 业绩变脸·变脸概率
  FX06: { sd: 'FX05', sub: 1 }, // 减持压力 → 减持与商誉·减持压力
  FX07: { sd: 'FX05', sub: 2 }, // 财务商誉 → 减持与商誉·商誉减值
  FX08: { sd: 'FX06', sub: 1 }, // 止损边界 → 止损边界·止损距离
}

/** 旧子域码 → 精映射目标；无命中返回 null（调用方按 L2 或无目标丢弃处理） */
export function fineTargetOf(oldSub) {
  return FINE_MAP[oldSub] || null
}

/**
 * 自检：FINE_MAP 与 MIGRATION_MAP 分域归属一致、子域位 1-6 合法、64 条全覆盖。
 * @param {object} migrationMap MIGRATION_MAP（旧子域 → 分域码）
 * @param {Array} domainsV2 DOMAINS_V2（校验分域存在且子域位越界）
 * @returns {{total:number, mismatches:string[], outOfRange:string[]}}
 */
export function assertFineMapConsistency(migrationMap = {}, domainsV2 = []) {
  const mismatches = []
  const outOfRange = []
  const sdSet = new Set()
  for (const d of domainsV2) for (let i = 0; i < (d.subs || []).length; i++) sdSet.add(`${d.code}${String(i + 1).padStart(2, '0')}`)
  for (const [oldSub, t] of Object.entries(FINE_MAP)) {
    const mig = migrationMap[oldSub]
    if (mig && mig !== t.sd) mismatches.push(`${oldSub}: fine=${t.sd} migration=${mig}`)
    if (!(t.sub >= 1 && t.sub <= 6)) outOfRange.push(`${oldSub}: sub=${t.sub}`)
    if (sdSet.size && !sdSet.has(t.sd)) outOfRange.push(`${oldSub}: sd=${t.sd} 不存在于 v2 分域表`)
  }
  return { total: Object.keys(FINE_MAP).length, mismatches, outOfRange }
}

/**
 * 人读审计表：旧子域名 → 新分域名·新子域名（供文档/测试引用，避免手抄漂移）。
 * @param {object} oldScript buildStockScript() 产物（旧 384 剧本，取子域名）
 * @param {Array} domainsV2 DOMAINS_V2
 * @returns {Array<{old:string, oldName:string, sd:string, sub:number, sdName:string, subName:string}>}
 */
export function describeFineMap(oldScript, domainsV2 = []) {
  const out = []
  const oldNames = {}
  for (const d of (oldScript && oldScript.domains) || []) {
    ;(d.subdomains || []).forEach((sd, i) => {
      oldNames[`${d.code}${String(i + 1).padStart(2, '0')}`] = sd.name
    })
  }
  for (const [oldSub, t] of Object.entries(FINE_MAP)) {
    const dom = domainsV2.find((d) => d.code === t.sd.slice(0, 2))
    const sub = dom && dom.subs ? dom.subs[Number(t.sd.slice(2, 4)) - 1] : null
    const child = sub && sub.children ? sub.children[t.sub - 1] : null
    out.push({
      old: oldSub,
      oldName: oldNames[oldSub] || '?',
      sd: t.sd,
      sub: t.sub,
      sdName: sub ? sub.name : '?',
      subName: child || '?',
    })
  }
  return out.sort((a, b) => a.old.localeCompare(b.old))
}

export default { FINE_MAP, fineTargetOf, assertFineMapConsistency, describeFineMap }
