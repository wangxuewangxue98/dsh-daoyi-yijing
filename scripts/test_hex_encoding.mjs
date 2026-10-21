// 卦象编码专项测试（v0.5.1）：批次分位数编码（满熵）+ 冻结域恒阴
// 证明：① 取值唯一的域被判定 frozen 且恒阴（消除 NA 恒阳偏置）
//       ② 分位数编码让每个活跃爻阴阳各半（满熵），取代绝对阈值 0.5 导致的偏斜
//       ③ 端到端：分位数编码的卦种数 ≥ 绝对阈值编码
import {
  HEXAGRAMS,
  buildYaos,
  resolveHexagram,
  resolveHexagramForScript,
  quantileThresholds,
} from '../lib/yijing/hexagram.mjs'
import { buildStockScript } from '../lib/yijing/checkpoints.mjs'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) {
    pass++
    console.log('PASS ' + msg)
  } else {
    fail++
    console.log('FAIL ' + msg)
  }
}
const section = (t) => console.log('\n── ' + t + ' ──')

// ── 1. quantileThresholds：frozen 检测 ──
section('1. 冻结域判定')
{
  // JB/GZ/HG 在批次内取值唯一（如 NA 被填成同一个值）→ frozen
  const samples = [
    { JS: 0.6, ZJ: 0.4, GZ: 0.5, JB: 0.5, HY: 0.55, HG: 0.5 },
    { JS: 0.3, ZJ: 0.7, GZ: 0.5, JB: 0.5, HY: 0.45, HG: 0.5 },
    { JS: 0.8, ZJ: 0.2, GZ: 0.5, JB: 0.5, HY: 0.62, HG: 0.5 },
    { JS: 0.45, ZJ: 0.55, GZ: 0.5, JB: 0.5, HY: 0.38, HG: 0.5 },
  ]
  const qt = quantileThresholds(samples)
  ok(qt.frozen.includes('GZ') && qt.frozen.includes('JB') && qt.frozen.includes('HG'),
    `取值唯一的三域判定为 frozen（实际 ${JSON.stringify(qt.frozen)}）`)
  ok(!qt.frozen.includes('JS') && !qt.frozen.includes('ZJ') && !qt.frozen.includes('HY'),
    '有分化的域不冻结')
  ok(qt.thresholds.GZ === Infinity && qt.thresholds.JB === Infinity,
    'frozen 域阈值 = Infinity')
  ok(qt.stats.GZ.distinct === 1 && qt.stats.JS.distinct === 4,
    `stats 记录取值多样性（GZ=${qt.stats.GZ.distinct}, JS=${qt.stats.JS.distinct}）`)
}

// ── 2. buildYaos：frozen → 恒阴（不再恒阳）──
section('2. 冻结爻恒阴（消除 NA 恒阳偏置）')
{
  const order = { lower: ['JS', 'ZJ', 'GZ'], upper: ['JB', 'HY', 'HG'] }
  const scores = { JS: 0.9, ZJ: 0.9, GZ: 0.5, JB: 0.5, HY: 0.9, HG: 0.5 }
  // 绝对阈值 0.5：GZ/JB/HG = 0.5 ≥ 0.5 → 阳（偏向乾系）
  const yAbs = buildYaos(scores, order)
  ok(yAbs.join('') === '111111', `绝对阈值下 NA 域(0.5)被判为阳 → ${yAbs.join('')}（乾为天，偏阳）`)
  // 分位数阈值：frozen → Infinity → 恒阴
  const yQt = buildYaos(scores, order, { GZ: Infinity, JB: Infinity, HG: Infinity })
  ok(yQt.join('') === '110010', `分位数阈值下 frozen 域→阴 → ${yQt.join('')}（不再是全阳）`)
  const cnt = (a) => a.reduce((x, y) => x + y, 0)
  ok(cnt(yQt) < cnt(yAbs), '冻结域由阳转阴，消除恒阳偏置')
}

// ── 3. 满熵：分位数编码让活跃爻阴阳各半 ──
section('3. 满熵：阴阳各半')
{
  // 构造：JS 全部 > 0.5（绝对阈值下会全阳 → 该爻冻结，熵 0）
  const n = 20
  const samples = Array.from({ length: n }, (_, i) => ({
    JS: 0.55 + i * 0.01, // 0.55..0.74，全部 > 0.5
    ZJ: i < n / 2 ? 0.2 : 0.8,
  }))
  const qt = quantileThresholds(samples)
  const order = { lower: ['JS', 'ZJ', 'GZ'], upper: ['JB', 'HY', 'HG'] }
  let yangJs = 0
  for (const s of samples) {
    const y = buildYaos(s, order, qt.thresholds)
    yangJs += y[0] // 第 1 爻 = JS
  }
  ok(yangJs === n / 2, `JS 全部>0.5 但分位数编码后仍阴阳各半（阳 ${yangJs}/${n}）`)

  // 绝对阈值对照：全部为阳（该爻熵 0）
  let yangAbs = 0
  for (const s of samples) yangAbs += buildYaos(s, order)[0]
  ok(yangAbs === n, `对照：绝对阈值 0.5 使 JS 全阳（阳 ${yangAbs}/${n}）→ 该爻信息量为 0`)
  ok(yangJs < yangAbs, '分位数编码把冻结爻恢复为满熵爻')
}

// ── 4. 端到端：卦种数不降低（合成批次）──
section('4. 端到端：卦种数')
{
  const script = buildStockScript()
  // 合成 40 只：JS/ZJ 独立随机，GZ 独立，JB/HG 冻结
  let seed = 42
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const stocks = Array.from({ length: 40 }, () => ({
    JS: 0.2 + rnd() * 0.6,
    ZJ: 0.2 + rnd() * 0.6,
    GZ: 0.3 + rnd() * 0.4,
    JB: 0.5, HY: 0.3 + rnd() * 0.4, HG: 0.5, XX: 0.5, FX: 0.5,
  }))
  const qt = quantileThresholds(stocks)
  const namesAbs = new Set()
  const namesQt = new Set()
  for (const s of stocks) {
    namesAbs.add(resolveHexagramForScript(s, script).name)
    namesQt.add(resolveHexagramForScript(s, script, qt.thresholds).name)
  }
  ok(namesQt.size >= namesAbs.size,
    `分位数编码卦种数 ≥ 绝对阈值（${namesQt.size} vs ${namesAbs.size}）`)
  ok(namesQt.size > 1, `合成批次产生多种卦（${namesQt.size} 种）`)
  console.log(`    绝对阈值: ${namesAbs.size} 种 | 分位数: ${namesQt.size} 种 | frozen: ${JSON.stringify(qt.frozen)}`)
}

// ── 5. 向后兼容：不传 thresholds 时行为不变 ──
section('5. 向后兼容')
{
  const order = { lower: ['JS', 'ZJ', 'GZ'], upper: ['JB', 'HY', 'HG'] }
  const scores = { JS: 0.7, ZJ: 0.3, GZ: 0.5, JB: 0.5, HY: 0.8, HG: 0.5 }
  const a = buildYaos(scores, order)
  const b = buildYaos(scores, order, null)
  const c = buildYaos(scores, order, {})
  ok(a.join('') === b.join('') && b.join('') === c.join(''),
    `不传/传 null/传空对象 → 与旧行为一致（${a.join('')}）`)
  ok(resolveHexagram(scores, order).name === resolveHexagram(scores, order, null).name,
    'resolveHexagram 不传阈值 → 行为不变')
  // 64 卦表容量不变（回归 v0.4.1 勘误）
  ok(Object.keys(HEXAGRAMS).length === 64 && new Set(Object.values(HEXAGRAMS)).size === 64,
    'HEXAGRAMS 仍为 64 组合 / 64 互异卦名')
}

console.log(`\n===== 卦象编码专项: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail === 0 ? 0 : 1)
