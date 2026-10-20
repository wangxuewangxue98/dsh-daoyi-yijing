// divine_dsh_motor_ai_commercial.mjs — 道一-易经推演 · dsh-motor-ai 插件未来一个月商业成功率研判
//
// 说明：用「商用成功率研判·万事决」(commercial) 剧本，把 dsh-motor-ai 真实商业化数据映射为 8 业务域因子评分，
// 套入 384 爻→64 卦→8 宫→四象→三才→两仪→太极 六层确定性推演，输出结构化结论。
// 结果由公开/已知商业数据映射的因子评分驱动，属多因子研判示意，【不构成商业承诺或投资建议】。

import { buildCommercialScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { gradedView, gradeFour, gradeThree, gradeTwo } from '../lib/yijing/grading.mjs'

// ===== 0. dsh-motor-ai 真实商业化快照（截至 2026-10-20，来源：项目记忆/发布流水线）=====
const SNAPSHOT = {
  product: 'dsh-motor-ai（电机电磁设计 AI 助手）',
  version: 'v1.0.0-rc.8（发布铁律：工作树干净→verify门禁→bump→pack核验→publish）',
  client: 'MotorAI 客户端 v4.02.44（四 Agent dialectic 制衡 + Motor-CAD COM 集成 + 蒙特卡洛 1000 次）',
  l0_plugin: 'dsh-motor-ai-l0 v0.2.3（已发布 DSH 插件，v0.3.0 待发）',
  model: 'Open Core：core/l0 MIT 免费；full PolyForm-Noncommercial-1.0 + activation code 门控',
  monetization: {
    channels: 'dshhub-market 口令市场 + 金数据(Jinshuju) 私域收款(§3.1) + license.mjs 激活(§4)',
    tiers: '99元/月 · 199元/季 · 399元/半年度 · 699元/年（四档一次性口令）',
    activation: '10 条 DM- 激活口令体系 + 免费档每日 5 次限制',
  },
  distribution: 'npmjs registry、@wangxue98 scoped；DSH 插件市场分发',
  content: '公众号系列《应用 DSH 进行电机电磁设计初探》+ 专家体系',
  repos: 'GitHub wangxuewangxue98 双仓库（dsh-motor-design / dsh-motor-ai，SSH 22 端口推送）',
  constraints: {
    network: '沙箱 HTTPS(443)→github.com 不通，SSH(22) 可达，npmjs.org 443 正常',
    stage: 'rc 未 GA；单人开发；云模型 LLM 凭证尚未接通（仅留 adapter 契约）',
  },
}

// ===== 1. 八宫因子评分（0..1，越高越利于“一个月商业化成功”；RK 为风险可控度，越高越安全）=====
const DOMAIN_SCORES = {
  CP: 0.72, // 产品力·乾：v1.0.0-rc.8 功能丰富（四Agent/蒙特卡洛/Motor-CAD），但 rc 未 GA
  TR: 0.58, // 赛道·坎：AI 电机设计 niche 强壁垒，但面临通用 AI/海外 CAE 替代威胁
  MA: 0.55, // 宏观·离：AI 工具付费意愿上行，但宏观审慎、工程软件付费中等
  DL: 0.65, // 交付能力·坤：dsh-motor-ai-l0 已发布可用、npm+DSH市场分发；新特性真机联调未全验证、网络封禁影响开发但非终端安装
  CM: 0.62, // 商业化机制·震：金数据收款+口令市场四档+激活码体系设计完善，但收入未验证、早期
  VP: 0.66, // 价值定位·艮：Open Core 免费漏斗+合理定价+专业壁垒，性价比与差异化强
  BR: 0.54, // 品牌口碑·巽：公众号+专家体系，权威但触达早期、规模有限
  RK: 0.52, // 风险可控度·兑：单人/rc未GA/网络/竞争/合规有风险，但有发布铁律+SSH/npm绕行+OpenCore缓解，可控度刚过中性线
}

// ===== 2. 把八宫评分铺到 384 爻（同宫同分，引擎按宫聚合等价宫均分）=====
const script = buildCommercialScript()
const db = buildCheckpointDatabase(script)
const inputs = {}
for (const cp of db.checkpoints) {
  inputs[cp.id] = DOMAIN_SCORES[cp.domain]
}

// ===== 3. 六层推演（确定性引擎；云模型未注入→离线模板卦象文案）=====
const result = await evaluate('dsh-motor-ai 插件未来一个月商业成功率研判', script, { inputs })

// ===== 4. 双口径成功率结论 =====
// (a) 连续成功率（诚实主结论）：八域连续评分等权平均，保留 52%–72% 梯度。
// (b) 引擎 verdict（结构性上界）：阳/阴硬二分（≥0.5=阳），本例全阳 → 可行/100%，为乐观上界。
const continuousRate =
  Object.values(DOMAIN_SCORES).reduce((a, b) => a + b, 0) / Object.keys(DOMAIN_SCORES).length
function mapContinuous(r) {
  if (r >= 0.75) return '高成功率（≥75% 概率区间）'
  if (r >= 0.50) return '中等成功率（约 50–65%，需关键条件兑现）'
  return '低成功率（偏空）'
}
const successContinuous = mapContinuous(continuousRate)

function mapVerdict(r) {
  if (r.has_veto) return '低成功率（偏空 · 一票否决）'
  if (r.verdict === '可行') return '高成功率（引擎硬二分乐观上界）'
  if (r.verdict === '有条件可行') return '中等成功率（需关键条件兑现）'
  return '低成功率（偏空）'
}
const successVerdict = mapVerdict(result)

// ===== 4b. 评估渐细轴：L2/L3/L4 分级视图（正/反 · 正/中/反 · 正/偏正/偏反/反）=====
const graded = gradedView(DOMAIN_SCORES)
const DN = { CP: '产品力', TR: '赛道', MA: '宏观', DL: '交付能力', CM: '商业化机制', VP: '价值定位', BR: '品牌口碑', RK: '风险可控度' }
function distLine(dist) {
  return Object.entries(dist.counts)
    .map(([k, n]) => `${k}:${n}`)
    .join('  ')
}
function membersLine(dist) {
  return Object.entries(dist.members)
    .filter(([, arr]) => arr.length)
    .map(([k, arr]) => `${k}=[${arr.map((c) => DN[c] || c).join('、')}]`)
    .join('  ')
}

// ===== 5. 输出报告 =====
const line = '────────────────────────────────────────'
console.log('\n' + line)
console.log('  道一-易经推演 · 商用成功率研判')
console.log('  标的：dsh-motor-ai（v1.0.0-rc.8）　快照：2026-10-20')
console.log(line)
console.log(`  【主结论·连续成功率】≈ ${(continuousRate * 100).toFixed(1)}%　→　${successContinuous}`)
console.log(`  【结构判定·引擎 verdict】${result.verdict}（乾为天）　综合分 ${(result.overall_score * 100).toFixed(0)}%　风险 ${result.risk_level}`)
console.log(`       ※ 引擎阳/阴硬二分(≥0.5=阳)，8 域 52%–72% 全判阳→综合 100%，为乐观上界；真实梯度见连续成功率。`)
console.log(`  【三才】天(产品力/赛道/宏观) ${(result.sancai.tian.score * 100).toFixed(0)}%` +
  `　地(交付/机制/价值) ${(result.sancai.di.score * 100).toFixed(0)}%` +
  `　人(品牌/风险) ${(result.sancai.ren.score * 100).toFixed(0)}%`)
console.log('  【评估渐细轴 · L2/L3/L4（正/中/反 分级，根治阴阳硬二分失真）】')
console.log(`    L2 两仪·正/反：总体=${graded.L2.overall}（八宫均分 ${(graded.L2.overall_score * 100).toFixed(1)}%）　分布 ${distLine(graded.L2.dist)}`)
console.log(`      成员：${membersLine(graded.L2.dist)}`)
console.log(`    L3 三才·正/中/反：总体=${graded.L3.overall}　分布 ${distLine(graded.L3.dist)}`)
console.log(`      成员：${membersLine(graded.L3.dist)}`)
console.log(`    L4 四象·正/偏正/偏反/反：总体=${graded.L4.overall}　分布 ${distLine(graded.L4.dist)}`)
console.log(`      成员：${membersLine(graded.L4.dist)}`)
console.log('  【八宫·卦象(阳/阴占比)】')
for (const d of Object.values(result.domain_results)) {
  const veto = d.strong_veto ? '  ← 强关联失守·否决' : ''
  console.log(`    ${d.bagua} ${d.name}：${(d.score * 100).toFixed(0)}%${veto}`)
}
console.log('  【八宫·连续评分(输入依据，≥50%=阳)】')
for (const [code, sc] of Object.entries(DOMAIN_SCORES)) {
  const yinyang = sc >= 0.5 ? '阳' : '阴'
  console.log(`    ${DN[code]}：${(sc * 100).toFixed(0)}% [${yinyang}]`)
}
console.log('  【推演文案】')
console.log('    ' + result.conclusion_text.split('\n').join('\n    '))
console.log(line)
console.log('  卦象引擎结论（确定性）：' + result.conclusion_text.split('\n')[0])
console.log(line)
console.log('  ⚠️ 免责声明：本推演由已知商业化数据映射的因子评分驱动，属结构化多因子研判示意，')
console.log('     不构成任何商业承诺或投资建议。')
console.log(line + '\n')

// 落盘详细推演日志（纯本地，不回传）
try {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const outDir = join(dirname(fileURLToPath(new URL('../', import.meta.url))), 'logs')
  mkdirSync(outDir, { recursive: true })
  const out = {
    snapshot: SNAPSHOT,
    domain_scores: DOMAIN_SCORES,
    continuous_rate: Number(continuousRate.toFixed(4)),
    success_continuous: successContinuous,
    verdict: result.verdict,
    success_verdict: successVerdict,
    graded_view: graded,
    result,
  }
  writeFileSync(join(outDir, `commercial-dsh-motor-ai-${Date.now()}.json`), JSON.stringify(out, null, 2), 'utf8')
} catch { /* 落盘失败不致命 */ }

export { SNAPSHOT, DOMAIN_SCORES, continuousRate, successContinuous, successVerdict }
