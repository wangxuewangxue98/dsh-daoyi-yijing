// checkpoints.mjs — 检查点库 + 剧本加载（DSH 插件 dsh-yijing-wanshijue）
// 纯 JS、零依赖；可在无 DSH Runtime 环境被 node 直接加载（供 scripts/verify.mjs 离线自检）。
//
// 六层骨架：L7=384 爻(检查点) → L6=64 卦(子领域) → L5=8 宫(域) → L4=四象 → L3=三才 → L2=两仪 → L1=太极

export const BAGUA = ['乾', '坤', '震', '巽', '坎', '离', '艮', '兑']

// 内置剧本登记处
const BUILTIN_SCRIPTS = {}

export function registerBuiltinScript(script) {
  BUILTIN_SCRIPTS[script.script_id] = script
  return script
}
export function listBuiltinScripts() {
  return Object.values(BUILTIN_SCRIPTS).map((s) => ({ script_id: s.script_id, name: s.name }))
}
export function getBuiltinScript(id) {
  return BUILTIN_SCRIPTS[id] || null
}

// === 真实剧本（M1 从 Python 原型 1:1 移植，见 scripts/_extract_motor_design.py）===
import motorDesignScript from './scripts/motor-design.mjs'
registerBuiltinScript(motorDesignScript)

// 规范 384 结构剧本生成器：8 宫(域) × 8 子领域 × 6 检查点 = 384 爻。
// 作为骨架演示 / verify 向量；真实 motor-design 专业剧本已注册为默认内置。
export function buildFullScript(opts = {}) {
  const { script_id = 'demo-384', name = '演示·规范 384 结构' } = opts
  const domains = BAGUA.map((bagua, di) => {
    const code = `D${String(di + 1).padStart(2, '0')}`
    const subdomains = []
    for (let si = 0; si < 8; si++) {
      const checks = []
      for (let ci = 0; ci < 6; ci++) {
        checks.push({
          id: `${code}S${si + 1}C${ci + 1}`,
          name: `${bagua}·子${si + 1}·项${ci + 1}`,
          is_strong: ci === 0, // 每个子领域首项是强关联（一票否决对象）
          threshold_type: 'min',
          threshold: [0.5, null],
          weight: 1.0,
        })
      }
      subdomains.push({ name: `子领域${si + 1}`, checks })
    }
    return { code, name: `${bagua}宫`, bagua, subdomains }
  })
  return {
    script_id,
    name,
    domains,
    sancai_mapping: {
      tian: ['D01', 'D02', 'D03', 'D04'],
      di: ['D05', 'D06', 'D07'],
      ren: ['D08'],
    },
    na: { domains: [], checkpoints: [] },
  }
}

// 把剧本展开为扁平检查点库（384 爻），附带层级索引 + NA 标记
export function buildCheckpointDatabase(script) {
  const naDomains = new Set((script.na && script.na.domains) || [])
  const naChecks = new Set((script.na && script.na.checkpoints) || [])
  const checkpoints = []
  const domainIndex = {}
  const subdomainIndex = {}
  for (const d of script.domains) {
    domainIndex[d.code] = { code: d.code, name: d.name, bagua: d.bagua, subdomains: [] }
    for (const sd of d.subdomains) {
      const sdKey = `${d.code}/${sd.name}`
      subdomainIndex[sdKey] = { code: d.code, bagua: d.bagua, name: sd.name, checks: [] }
      domainIndex[d.code].subdomains.push(sdKey)
      for (const c of sd.checks) {
        const isNa = naDomains.has(d.code) || naChecks.has(c.id)
        const cp = {
          ...c,
          domain: d.code,
          domain_name: d.name,
          bagua: d.bagua,
          subdomain: sd.name,
          subdomain_key: sdKey,
          na: isNa,
        }
        checkpoints.push(cp)
        subdomainIndex[sdKey].checks.push(cp.id)
      }
    }
  }
  return {
    script_id: script.script_id,
    checkpoints,
    domainIndex,
    subdomainIndex,
    sancai_mapping: script.sancai_mapping || {},
    vetoPolicy: script.veto || null,
  }
}

// 模块加载即注册规范 384 演示剧本，使默认剧本 id 'demo-384' 可被解析（verify 向量）
registerBuiltinScript(buildFullScript())

// === 股票趋势研判剧本（8 股票分析域 × 64 子域 × 384 爻）===
// 三才分组：天(宏观/行业/风险·外部与主导) · 地(技术/资金/估值·标的质地) · 人(基本面/消息·公司层面，不占爻位)。
// 爻位语义见 YAO_SEMANTICS_STOCK（初爻 JS → 上爻 FX）。
// 风险域(FX)评分采用“风险可控度”语义（高分=更安全=阳），由调用方在 inputs 映射时做 1-原始风险 翻转。
// 六爻位语义表（v0.5.1）——爻不仅是 6 个 bit，还带位置语义（初爻=LSB … 上爻=MSB）。
// 这是「卦象判读」的依据，也是 tian/di 内顺序的唯一权威解释；改动顺序前先读本表。
// domain 必须与 buildStockScript().sancai_mapping 推导出的 [lower…, upper…] 严格一致
// （由 scripts/test_hexagram.mjs 的「爻位语义 vs 引擎 order」断言守护，防止再次错位）。
export const YAO_SEMANTICS_STOCK = [
  { pos: 1, yao: '初爻', bit: 'LSB', semantics: '起始/基础', domain: 'JS', name: '技术面', why: '量价是标的自身最原始的观测，一卦之始' },
  { pos: 2, yao: '二爻', bit: '', semantics: '内部/稳定', domain: 'ZJ', name: '资金面', why: '资金进出是标的内部力量，次于观测本身' },
  { pos: 3, yao: '三爻', bit: '', semantics: '过渡/风险', domain: 'GZ', name: '估值面', why: '贵贱决定安全边际，是由「自身」走向「外部」的过渡位' },
  { pos: 4, yao: '四爻', bit: '', semantics: '外部/行动', domain: 'HG', name: '宏观面', why: '外部环境层：股市指数、国际国内经济形势、货币/利率/地缘——对所有标的施加同一背景' },
  { pos: 5, yao: '五爻', bit: '', semantics: '主导/核心(君位)', domain: 'HY', name: '行业面', why: '赛道景气是近年个股走势的主导变量，「九五」君位当属之' },
  { pos: 6, yao: '上爻', bit: 'MSB', semantics: '终点/极端', domain: 'FX', name: '风险面', why: '黑天鹅属极端情形，配 FX 一票否决白名单，物极必反之意' },
]

// 「代理量」子域清单：这类子域的数据来自**推论而非事实**（rule 名带 -proxy），因此其强度项
// **不具「强关联一票否决」资格**——只参与加权打分，不单独决定 verdict。
//
// 为什么必须豁免（v0.5.1 实测教训）：
//   强关联失守的判定是「强度侧面值 < 0.5」，而 delta 只要略小于 0（如跳空 −0.1%）就会跌破；
//   否决白名单域(FX/XX)内每多激活一个子域，否决概率按 1−(1−p)^m 复合上升。
//   补子域前：FX/XX 仅 1~2 个子域激活 → 否决 5 只；补到 3~4 个子域后 → 否决飙到 34/56（60.7%），
//   其中 XX08（微小低开）独占 22 只、FX02（PB>3）19 只——"略高 PB"竟等价于黑天鹅，语义错误。
// 取舍：代理信息仍然计入 8 宫分（corrections 影响 continuousScore 与六爻），只是不能一票否决。
export const PROXY_SUBDOMAINS = new Set([
  'JB01', // ROE 代理 = PB/PE
  'JS06', // 日内均价偏离（均线系统代理）
  'ZJ03', // 量比（融资/杠杆活跃度代理）
  'ZJ07', // 自由流通占比（解禁压力代理）
  'GZ04', // 静态/动态 PE 之比（业绩动能代理）
  'HG01', // 总市值（宏观 beta 规模代理）
  'HG03', // 相对大盘强弱
  'HG07', // 成交额占全市场比重
  'HG08', // 相对换手（风险偏好弹性代理）
  'HY04', // 相对板块强弱（竞争格局代理）
  'HY08', // 板块内成交额占比（产业链位置代理）
  'FX02', // PB 估值泡沫/商誉（黑天鹅代理，非事实）
  'XX08', // 开盘跳空（突发事件代理）
])

export function buildStockScript(opts = {}) {
  const { script_id = 'stock-trend', name = '股票趋势研判·万事决' } = opts
  const DOMAINS = [
    { code: 'JB', name: '基本面', bagua: '乾', subs: ['盈利能力', '成长能力', '偿债安全', '营运效率', '现金质量', '资产质量', '分红回报', '业绩拐点'] },
    { code: 'JS', name: '技术面', bagua: '坤', subs: ['趋势方向', '动量强度', '支撑阻力', '量能配合', '形态结构', '均线系统', '指标背离', '波动特征'] },
    { code: 'ZJ', name: '资金面', bagua: '震', subs: ['主力资金', '北向资金', '融资融券', '机构持仓', '股东变化', '大宗交易', '解禁压力', '市场流动性'] },
    { code: 'XX', name: '消息面', bagua: '巽', subs: ['公司公告', '行业政策', '媒体报道', '研报评级', '舆情热度', '高管增减持', '诉讼风险', '突发事件'] },
    { code: 'HY', name: '行业面', bagua: '坎', subs: ['行业景气', '供需格局', '价格周期', '竞争格局', '政策导向', '技术变革', '下游需求', '产业链位置'] },
    { code: 'HG', name: '宏观面', bagua: '离', subs: ['货币政策', '利率汇率', '经济数据', '地缘局势', '商品周期', '通胀水平', '流动性环境', '风险偏好'] },
    { code: 'GZ', name: '估值面', bagua: '艮', subs: ['绝对估值', '相对估值', '历史分位', '业绩匹配', '股息回报', '市值空间', '机构目标价', '预期差'] },
    { code: 'FX', name: '风险面', bagua: '兑', subs: ['系统性风险', '个股黑天鹅', '流动性风险', '政策风险', '业绩变脸', '减持压力', '财务商誉', '止损边界'] },
  ]
  const ASPECTS = ['强度', '持续性', '确定性', '边际变化', '安全边际', '催化']
  const domains = DOMAINS.map((d) => {
    const subdomains = d.subs.map((sdName, si) => {
      const checks = ASPECTS.map((asp, ci) => ({
        id: `${d.code}${String(si + 1).padStart(2, '0')}${String(ci + 1).padStart(2, '0')}`,
        name: `${d.name}·${sdName}·${asp}`,
        // 每子域首项默认强关联（一票否决对象）；但代理量子域例外，见 PROXY_SUBDOMAINS。
        // ⚠ key 必须与检查点 id 的子域段同形（补零两位），否则豁免会静默失效。
        is_strong: ci === 0 && !PROXY_SUBDOMAINS.has(`${d.code}${String(si + 1).padStart(2, '0')}`),
        threshold_type: 'min',
        threshold: [0.5, null],
        weight: 1.0,
      }))
      return { name: sdName, checks }
    })
    return { code: d.code, name: d.name, bagua: d.bagua, subdomains }
  })
  return {
    script_id,
    name,
    domains,
    yao_semantics: YAO_SEMANTICS_STOCK,

    // 三才分组（两次修正）：
    //   ① 解冻爻位：原 {tian:[JB,HY,HG]} 把 NA 域 JB 放在上卦首位 → 该爻恒阴，上卦仅剩 4 种（空间腰斩）；
    //      且 XX/FX 原在人宫不进卦，其信号对卦象无贡献。现把「活跃域」全部编入 6 爻位、NA 域移出。
    //   ② v0.5.1 五爻语义修正：tian 内顺序由 [HY,HG,FX] 改为 [HG,HY,FX]——
    //      四爻＝外部/行动 → 宏观面（指数、经济形势）；五爻＝主导/核心(君位) → 行业面（赛道景气）。
    //      （纯位序调整：位移属置换，卦种总数不变，仅改变判读语义。）
    //   地=标的自身质地(技术/资金/估值) · 天=外部环境/主导(宏观/行业/风险) · 人=公司层面(基本面/消息)。
    sancai_mapping: { tian: ['HG', 'HY', 'FX'], di: ['JS', 'ZJ', 'GZ'], ren: ['JB', 'XX'] },
    yao_semantics: YAO_SEMANTICS_STOCK,
    // P0-C：否决收窄——仅风险(FX)/消息合规(XX)域的强关联可触发全盘否决（单域即否）
    veto: { mode: 'whiteList', domains: ['FX', 'XX'], minCount: 1 },
    na: { domains: [], checkpoints: [] },
  }
}
registerBuiltinScript(buildStockScript())

// === 1296 四层结构剧本（阶段 2 / S1，v0.8.0）===
// 6 域 × 6 分域 × 6 子域 × 6 aspect = 1296（8 位 id），与旧 stock-trend（384，6 位 id）
// 并行注册、互不触改；四连卦/基线/工具层按剧本 id 分派（quad-hexagram.mjs 结构守卫分流）。
import stockTrendV2Script from './scripts/stock-trend-v2.mjs'
registerBuiltinScript(stockTrendV2Script)

// === 商用成功率研判剧本（8 业务分析域 × 64 子域 × 384 爻）===
// 三才分组：天(产品力/赛道/宏观) · 地(交付能力/商业化机制/价值定位) · 人(品牌口碑/风险可控度)。
// 用于插件/产品商业化成功率推演；风险域(RK)评分采用“风险可控度”语义（高分=更安全=阳）。
export function buildCommercialScript(opts = {}) {
  const { script_id = 'commercial', name = '商用成功率研判·万事决' } = opts
  const DOMAINS = [
    { code: 'CP', name: '产品力', bagua: '乾', subs: ['功能完整度', '技术成熟度', '稳定性', 'AI推演质量', '仿真集成', '场景覆盖', '文档完备', '迭代速度'] },
    { code: 'TR', name: '赛道', bagua: '坎', subs: ['市场需求', '赛道增速', '竞争壁垒', '替代品威胁', '差异化', '客户付费力', '出海空间', '政策友好'] },
    { code: 'MA', name: '宏观', bagua: '离', subs: ['AI付费意愿', '经济景气', '工程软件景气', '利率汇率', '政策导向', '地缘影响', '资本热度', '风险偏好'] },
    { code: 'DL', name: '交付能力', bagua: '坤', subs: ['插件可安装性', 'DSH集成度', '真机稳定性', '云端依赖', '更新机制', '兼容性', '故障恢复', '支持响应'] },
    { code: 'CM', name: '商业化机制', bagua: '震', subs: ['定价策略', '收款通道', '分销渠道', '激活体系', '免费转化漏斗', '续费机制', '大客户路径', '自动化交付'] },
    { code: 'VP', name: '价值定位', bagua: '艮', subs: ['性价比', '相对竞品', 'OpenCore漏斗', '专业壁垒', '客户ROI', '上手成本', '锁定效应', '口碑裂变'] },
    { code: 'BR', name: '品牌口碑', bagua: '巽', subs: ['内容矩阵', '专家背书', '社区活跃', '案例沉淀', '用户评价', '媒体曝光', '私域沉淀', '复购推荐'] },
    { code: 'RK', name: '风险可控度', bagua: '兑', subs: ['单人风险', '版本稳定性', '合规风险', '网络依赖', '竞争风险', '现金流', '技术债', '应对预案'] },
  ]
  const ASPECTS = ['强度', '持续性', '确定性', '边际变化', '安全边际', '催化']
  const domains = DOMAINS.map((d) => {
    const subdomains = d.subs.map((sdName, si) => {
      const checks = ASPECTS.map((asp, ci) => ({
        id: `${d.code}${String(si + 1).padStart(2, '0')}${String(ci + 1).padStart(2,0)}`,
        name: `${d.name}·${sdName}·${asp}`,
        is_strong: ci === 0,
        threshold_type: 'min',
        threshold: [0.5, null],
        weight: 1.0,
      }))
      return { name: sdName, checks }
    })
    return { code: d.code, name: d.name, bagua: d.bagua, subdomains }
  })
  return {
    script_id,
    name,
    domains,
    sancai_mapping: { tian: ['CP', 'TR', 'MA'], di: ['DL', 'CM', 'VP'], ren: ['BR', 'RK'] },
    // P0-C：否决收窄——仅风险可控度(RK)域强关联可触发全盘否决
    veto: { mode: 'whiteList', domains: ['RK'], minCount: 1 },
    na: { domains: [], checkpoints: [] },
  }
}
registerBuiltinScript(buildCommercialScript())

// 默认内置剧本：真实 motor-design（index.mjs 的 Config.defaultScript 亦指向它）
export const DEFAULT_SCRIPT_ID = 'motor-design'
