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
// 三才分组：天(基本面/行业/宏观) · 地(技术/资金/估值) · 人(消息/风险)。
// 风险域(FX)评分采用“风险可控度”语义（高分=更安全=阳），由调用方在 inputs 映射时做 1-原始风险 翻转。
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
        is_strong: ci === 0, // 每子域首项为强关联（一票否决对象）
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
    sancai_mapping: { tian: ['JB', 'HY', 'HG'], di: ['JS', 'ZJ', 'GZ'], ren: ['XX', 'FX'] },
    // P0-C：否决收窄——仅风险(FX)/消息合规(XX)域的强关联可触发全盘否决（单域即否）
    veto: { mode: 'whiteList', domains: ['FX', 'XX'], minCount: 1 },
    na: { domains: [], checkpoints: [] },
  }
}
registerBuiltinScript(buildStockScript())

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
