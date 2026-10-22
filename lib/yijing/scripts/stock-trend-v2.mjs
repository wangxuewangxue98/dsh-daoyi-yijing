// stock-trend-v2.mjs — 股票趋势研判·1296 四层结构剧本（阶段 2 / S1，v0.8.0）
//
// 结构：6 域 × 6 分域 × 6 子域 × 6 aspect = 1296 检查点（全 6 进制，8 位 id）。
//   id = 域(2) + 分域位(2) + 子域位(2) + aspect 位(2)，例 'JS010203' = JS·趋势方向·价格趋势·确定性。
// 与旧 384（stock-trend，6 位 id）**并行注册、互不触改**：旧剧本行为逐位不变（回归见
// scripts/test_stock_trend_v2.mjs 的「384 零触」断言组）。
//
// 设计依据（附件审计结论，仅参考不并码）：
//   - 域层：JB/HY 留旧，JS/ZJ 留旧并吸收下沉（HY 吸收旧 HG 宏观、ZJ 吸收旧 GZ 估值）；
//     XX/FX 留旧。六域全部进入组卦爻位（旧 384 人宫只当动爻候选的矛盾在结构层消解）。
//   - 爻序 hex_order：JS 初爻 → ZJ 二爻 → XX 三爻 → FX 四爻 → JB 五爻 → HY 上爻
//     （由近及远、由交易到价值；以风险为行动位、行业为终极位）。
//   - is_strong：每子域强度项（子域位 1）为强关联一票否决对象；FX02/XX06 为代理量子域
//     （数据来自推论非事实），按 v0.5.1 PROXY_SUBDOMAINS 教训豁免强关联资格。
//   - 迁移映射：旧 64 子域 100% 映射到新 36 分域（migrated_from.mapping，机器可读，
//     用于 S5 三代对照的回归锚点；正式评分按新定义采集，映射仅迁移期演示）。
//
// 注册在 checkpoints.mjs 侧完成（本模块不反向 import 父模块，避免 ESM 循环 + TDZ）。

export const ASPECTS = ['强度', '持续性', '确定性', '边际变化', '安全边际', '催化']

// 36 分域命名表（唯一数据源；命名沿用附件 §四，为与 55 只实测可比，非抄码）
export const DOMAINS_V2 = [
  {
    code: 'JB', name: '基本面', bagua: '乾', sancai: 'tian',
    subs: [
      { name: '盈利能力', children: ['ROE水平', 'ROE趋势', '毛利率', '净利率', '扣非利润', '盈利质量'] },
      { name: '成长能力', children: ['营收增速', '利润增速', '订单储备', '产能扩张', '研发投入', '成长持续性'] },
      { name: '财务安全', children: ['资产负债率', '有息负债', '流动比率', '资产结构', '财务弹性', '减值敞口'] },
      { name: '营运与现金', children: ['应收周转', '存货周转', '经营现金流', '现金流负债比', '营运周期', '现金转化'] },
      { name: '股东回报', children: ['股息率', '分红连续性', '回购力度', '市值空间', '股东结构', '回报持续性'] },
      { name: '业绩拐点', children: ['拐点信号', '拐点确认', '预期修正', '业绩弹性', '周期位置', '拐点催化'] },
    ],
  },
  {
    code: 'HY', name: '行业面', bagua: '坎', sancai: 'tian',
    subs: [
      { name: '行业景气', children: ['景气指数', '开工率', '库存周期', '价格景气', '盈利景气', '景气趋势'] },
      { name: '供需与周期', children: ['供需平衡', '产能周期', '价格趋势', '成本传导', '周期位置', '周期反转'] },
      { name: '竞争格局', children: ['市场份额', '竞争强度', '壁垒高度', '集中度', '议价能力', '格局演变'] },
      { name: '宏观环境', children: ['货币政策', '利率汇率', '经济数据', '通胀水平', '风险偏好', '流动性环境'] },
      { name: '政策与技术', children: ['政策导向', '政策力度', '技术路线', '技术迭代', '研发突破', '产业升级'] },
      { name: '需求与产业链', children: ['下游需求', '需求弹性', '产业链位置', '上下游议价', '供应链安全', '需求催化'] },
    ],
  },
  {
    code: 'JS', name: '技术面', bagua: '坤', sancai: 'di',
    subs: [
      { name: '趋势方向', children: ['价格趋势', '均线排列', '趋势强度', '趋势持续性', '趋势加速', '趋势衰竭'] },
      { name: '动量强度', children: ['短期动量', '中期动量', '相对强弱', '动量背离', '动量衰减', '动量催化'] },
      { name: '支撑阻力', children: ['支撑有效性', '阻力强度', '突破概率', '回撤幅度', '区间位置', '边界测试'] },
      { name: '量能配合', children: ['量能水平', '量价配合', '放量突破', '缩量整理', '量能背离', '量能催化'] },
      { name: '形态结构', children: ['形态类型', '形态完成度', '形态目标位', '形态有效性', '形态破坏', '形态催化'] },
      { name: '指标与波动', children: ['MACD信号', '超买超卖', '波动率水平', '波动收敛', '波动放大', '波动结构'] },
    ],
  },
  {
    code: 'ZJ', name: '资金面', bagua: '震', sancai: 'di',
    subs: [
      { name: '主力资金', children: ['主力净流入', '主力控盘度', '主力持续性', '龙虎榜信号', '大宗承接', '撤退信号'] },
      { name: '北向与杠杆', children: ['北向净流入', '北向持续性', '融资余额变化', '融资买入占比', '融券压力', '杠杆情绪'] },
      { name: '机构与股东', children: ['机构持仓变化', '机构调研热度', '股东户数', '大股东增减持', '股权集中度', '机构预期'] },
      { name: '大宗与解禁', children: ['大宗折价率', '大宗频次', '解禁规模', '解禁时点', '解禁成本', '解禁压力'] },
      { name: '估值水平', children: ['绝对估值', '相对估值', '历史分位', '业绩匹配', '预期差', '估值弹性'] },
      { name: '宏观与市场流动性', children: ['货币政策取向', '市场流动性', '成交额水平', '新发基金', '场内杠杆', '流动性拐点'] },
    ],
  },
  {
    code: 'XX', name: '消息面', bagua: '巽', sancai: 'ren',
    subs: [
      { name: '公司公告', children: ['公告利好', '公告利空', '公告密度', '公告质量', '预告修正', '公告催化'] },
      { name: '行业与政策', children: ['政策利好', '政策力度', '落地节奏', '监管态度', '政策利空', '政策催化'] },
      { name: '媒体与舆情', children: ['报道基调', '舆情热度', '舆情方向', '舆情持续性', '舆情反转', '舆情催化'] },
      { name: '研报与目标价', children: ['研报评级', '目标价空间', '评级调整', '覆盖广度', '一致预期', '预期修正'] },
      { name: '高管增减持', children: ['增持信号', '增持规模', '减持信号', '减持规模', '增减持持续性', '信号可信度'] },
      { name: '突发事件', children: ['突发事件影响', '诉讼仲裁', '黑天鹅苗头', '事件持续性', '事件应对', '事件催化'] },
    ],
  },
  {
    code: 'FX', name: '风险面', bagua: '兑', sancai: 'ren',
    subs: [
      { name: '系统性风险', children: ['系统性风险水平', '地缘局势', '系统性趋势', '风险传导', '市场脆弱性', '系统性催化'] },
      { name: '个股黑天鹅', children: ['黑天鹅概率', '黑天鹅敞口', '个体脆弱性', '风险隔离', '尾部风险', '尾部催化'] },
      { name: '流动性与政策风险', children: ['流动性风险', '监管处罚', '政策合规', '融资环境', '风险趋势', '合规催化'] },
      { name: '业绩变脸', children: ['变脸概率', '变脸敞口', '预警信号', '变脸传导', '缓释因素', '变脸催化'] },
      { name: '减持与商誉', children: ['减持压力', '商誉减值', '股权质押', '关联交易', '治理风险', '治理催化'] },
      { name: '止损边界', children: ['止损距离', '回撤容忍', '仓位边界', '风险预算', '止损纪律', '边界保护'] },
    ],
  },
]

// 代理量子域（数据来自推论非事实）→ 强度项不强关联一票否决（v0.5.1 教训：弱 proxy 失守
// 会把「略高 PB/微小跳空」放大成黑天鹅级否决；1296 的 FX02/XX06 是同类代理）
export const PROXY_SUBDOMAINS_V2 = new Set(['FX02', 'XX06'])

// 六爻位语义（与 hex_order 严格一致；改序前先读本表）
export const YAO_SEMANTICS_V2 = [
  { pos: 1, yao: '初爻', bit: 'LSB', semantics: '起始/基础', domain: 'JS', name: '技术面', why: '量价是标的自身最原始的市场证据，一卦之始' },
  { pos: 2, yao: '二爻', bit: '', semantics: '内部/稳定', domain: 'ZJ', name: '资金面', why: '资金进出是标的内部力量，次于观测本身' },
  { pos: 3, yao: '三爻', bit: '', semantics: '过渡/事件', domain: 'XX', name: '消息面', why: '消息事件是由「交易」走向「价值」的过渡扰动' },
  { pos: 4, yao: '四爻', bit: '', semantics: '外部/防御', domain: 'FX', name: '风险面', why: '风险是外部冲击的总和，行动之前先度量尾部' },
  { pos: 5, yao: '五爻', bit: '', semantics: '主导/核心(君位)', domain: 'JB', name: '基本面', why: '公司质地是中期走势的核心主导，「九五」君位当属之' },
  { pos: 6, yao: '上爻', bit: 'MSB', semantics: '终点/终极', domain: 'HY', name: '行业面', why: '赛道景气是个股走势的终极变量，物极必反之意' },
]

// 旧 384 剧本 64 子域 → 新 36 分域映射（附件 §六，100% 覆盖；key = 旧子域码）
export const MIGRATION_MAP = {
  // JB（旧 8 子域）
  JB01: 'JB01', JB02: 'JB02', JB03: 'JB03', JB04: 'JB04', JB05: 'JB04', JB06: 'JB03', JB07: 'JB05', JB08: 'JB06',
  // HY（旧 8 子域）
  HY01: 'HY01', HY02: 'HY02', HY03: 'HY02', HY04: 'HY03', HY05: 'HY05', HY06: 'HY05', HY07: 'HY06', HY08: 'HY06',
  // JS（旧 8 子域）
  JS01: 'JS01', JS02: 'JS02', JS03: 'JS03', JS04: 'JS04', JS05: 'JS05', JS06: 'JS01', JS07: 'JS06', JS08: 'JS06',
  // ZJ（旧 8 子域）
  ZJ01: 'ZJ01', ZJ02: 'ZJ02', ZJ03: 'ZJ02', ZJ04: 'ZJ03', ZJ05: 'ZJ03', ZJ06: 'ZJ04', ZJ07: 'ZJ04', ZJ08: 'ZJ06',
  // XX（旧 8 子域）
  XX01: 'XX01', XX02: 'XX02', XX03: 'XX03', XX04: 'XX04', XX05: 'XX03', XX06: 'XX05', XX07: 'XX06', XX08: 'XX06',
  // HG（旧 8 子域 → 下沉）
  HG01: 'HY04', HG02: 'HY04', HG03: 'HY04', HG04: 'FX01', HG05: 'HY02', HG06: 'HY04', HG07: 'ZJ06', HG08: 'HY04',
  // GZ（旧 8 子域 → 下沉）
  GZ01: 'ZJ05', GZ02: 'ZJ05', GZ03: 'ZJ05', GZ04: 'ZJ05', GZ05: 'JB05', GZ06: 'JB05', GZ07: 'XX04', GZ08: 'ZJ05',
  // FX（旧 8 子域）
  FX01: 'FX01', FX02: 'FX02', FX03: 'FX03', FX04: 'FX03', FX05: 'FX04', FX06: 'FX05', FX07: 'FX05', FX08: 'FX06',
}

export function buildStockTrendV2Script(opts = {}) {
  const { script_id = 'stock-trend-v2', name = '股票趋势研判·1296 四层' } = opts
  const domains = DOMAINS_V2.map((d) => {
    // 引擎 schema 三层（域>子域>检查点）：1296 的「子域」层 = 分域×子域 组合（共 216），
    // 子域名 = `分域名·子域名`；其下 6 个 aspect 检查点（id 末两位 = aspect 位 01-06）。
    const subdomains = d.subs.map((sd, siIdx) => {
      const checks = sd.children.map((child, ciIdx) => {
        const subCode = `${d.code}${String(siIdx + 1).padStart(2, '0')}`
        const cell = []
        for (let a = 0; a < 6; a++) {
          cell.push({
            id: `${d.code}${String(siIdx + 1).padStart(2, '0')}${String(ciIdx + 1).padStart(2, '0')}${String(a + 1).padStart(2, '0')}`,
            name: `${d.name}·${sd.name}·${child}·${ASPECTS[a]}`,
            // 强度项（aspect 位 1）为强关联一票否决对象；代理分子域豁免（v0.5.1 教训）
            is_strong: a === 0 && !PROXY_SUBDOMAINS_V2.has(subCode),
            threshold_type: 'min',
            threshold: [0.5, null],
            weight: 1.0,
          })
        }
        return { name: `${sd.name}·${child}`, checks: cell }
      })
      return checks
    })
    return { code: d.code, name: d.name, bagua: d.bagua, subdomains: subdomains.flat() }
  })
  return {
    script_id,
    name,
    domains,
    yao_semantics: YAO_SEMANTICS_V2,
    // 组卦爻序（六域全进卦；buildOrderFromScript 优先读 hex_order，缺省回落 sancai 切分）
    hex_order: ['JS', 'ZJ', 'XX', 'FX', 'JB', 'HY'],
    // 三才分组（aggregator L3 计分语义；与 hex_order 解耦——前者管聚合，后者管爻序）
    sancai_mapping: { tian: ['JB', 'HY'], di: ['JS', 'ZJ'], ren: ['XX', 'FX'] },
    // P0-C：否决收窄——仅风险(FX)/消息合规(XX)域的强关联可触发全盘否决
    veto: { mode: 'whiteList', domains: ['FX', 'XX'], minCount: 1 },
    na: { domains: [], checkpoints: [] },
    // 迁移锚点（S5 三代对照用；正式评分按新定义采集）
    migrated_from: { source_script: 'stock-trend', mapping: MIGRATION_MAP },
  }
}

const scriptV2 = buildStockTrendV2Script()
export default scriptV2
