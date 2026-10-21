// test_hexagram_texts.mjs — 64 卦判词专项测试（v0.5.0）
// 验证：64 卦判词全覆盖、与 HEXAGRAMS 双射一致、判词互异、离线结论文案逐卦唯一。
import {
  HEXAGRAMS,
  TRIGRAM_BY_LINES,
  buildOrderFromScript,
} from '../lib/yijing/hexagram.mjs'
import {
  HEXAGRAM_TEXTS,
  getHexagramText,
  buildHexagramHead,
} from '../lib/yijing/hexagram-texts.mjs'
import { buildStockScript } from '../lib/yijing/checkpoints.mjs'
import { generateConclusionText } from '../lib/yijing/reviewer.mjs'

let pass = 0
let fail = 0
function ok(cond, msg) {
  if (cond) {
    pass++
    console.log(`PASS  ${msg}`)
  } else {
    fail++
    console.log(`FAIL  ${msg}`)
  }
}

// ── 1. 判词表与 HEXAGRAMS 双射一致（64 条全覆盖、无多余、无兜底触发）──
const hexNames = Object.values(HEXAGRAMS)
ok(hexNames.length === 64, `HEXAGRAMS 共 64 卦（实际 ${hexNames.length}）`)
ok(new Set(hexNames).size === 64, '64 卦名互异（双射）')
ok(Object.keys(HEXAGRAM_TEXTS).length === 64, `判词表 64 条（实际 ${Object.keys(HEXAGRAM_TEXTS).length}）`)

const missing = hexNames.filter((n) => !HEXAGRAM_TEXTS[n])
ok(missing.length === 0, `判词表覆盖全部 64 卦（缺失：${missing.join(',') || '无'}）`)
const extra = Object.keys(HEXAGRAM_TEXTS).filter((n) => !hexNames.includes(n))
ok(extra.length === 0, `判词表无多余条目（多余：${extra.join(',') || '无'}）`)
const fallbackHit = hexNames.filter((n) => getHexagramText(n).fallback)
ok(fallbackHit.length === 0, `64 卦全部命中判词库，无兜底触发（触发：${fallbackHit.join(',') || '无'}）`)

// ── 2. 判词内容质量：非空、互异、长度受控 ──
const empty = hexNames.filter((n) => {
  const t = HEXAGRAM_TEXTS[n]
  return !t || !t.judgment || !t.advice || !t.tone
})
ok(empty.length === 0, `判词/建议/tone 均非空（异常：${empty.join(',') || '无'}）`)
const judgments = new Set(hexNames.map((n) => HEXAGRAM_TEXTS[n].judgment))
const advices = new Set(hexNames.map((n) => HEXAGRAM_TEXTS[n].advice))
ok(judgments.size === 64, `64 条判词互异（实际 ${judgments.size}）`)
ok(advices.size === 64, `64 条建议互异（实际 ${advices.size}）`)
const badTone = hexNames.filter((n) => !['auspicious', 'neutral', 'ominous'].includes(HEXAGRAM_TEXTS[n].tone))
ok(badTone.length === 0, `tone 取值合法（异常：${badTone.join(',') || '无'}）`)
const tooLong = hexNames.filter((n) => HEXAGRAM_TEXTS[n].judgment.length > 20)
ok(tooLong.length === 0, `判词长度 ≤20 字（超长：${tooLong.join(',') || '无'}）`)

// ── 3. 离线结论文案：64 卦逐卦唯一（修复"判词只有两种"）──
// 合成 agg：对每卦按上下卦位反推 6 爻 → 域分（0.9 阳 / 0.1 阴）
const script = buildStockScript()
const order = buildOrderFromScript(script)
ok(order.lower.length === 3 && order.upper.length === 3, `剧本 6 主域 = 下${order.lower}+上${order.upper}`)

const TRIGRAM_BITS = Object.fromEntries(
  Object.entries(TRIGRAM_BY_LINES).map(([bits, name]) => [name, bits]),
)
function aggForHexName(name) {
  const key = Object.keys(HEXAGRAMS).find((k) => HEXAGRAMS[k] === name)
  const upperName = key.slice(0, 1)
  const lowerName = key.slice(1, 2)
  // TRIGRAM_BITS 串是 (上,中,下) 序；yaos 数组自底向上（初..上），故需反转
  const uBits = TRIGRAM_BITS[upperName].split('').map(Number).reverse() // [下,中,上] → 四/五/上
  const lBits = TRIGRAM_BITS[lowerName].split('').map(Number).reverse() // [下,中,上] → 初/二/三
  const yaos = [...lBits, ...uBits]
  const codes = [...order.lower, ...order.upper]
  const domain_results = {}
  codes.forEach((c, i) => {
    domain_results[c] = { bagua: c, name: c, score: yaos[i] ? 0.9 : 0.1, strong_veto: false }
  })
  return {
    verdict: '有条件可行',
    risk_level: '中',
    overall_score: 0.5,
    domain_results,
    sancai: { tian: { score: 0.5 }, di: { score: 0.5 }, ren: { score: 0.5 } },
  }
}

const heads = new Set()
let headOk = true
let headMiss = []
for (const name of hexNames) {
  const agg = aggForHexName(name)
  const text = generateConclusionText(agg, script, 'classic')
  const t = HEXAGRAM_TEXTS[name]
  const good = text.startsWith(`${name}：${t.judgment}`) && text.includes(t.advice)
  if (!good) {
    headOk = false
    headMiss.push(name)
  }
  // 头部（第一行，含卦名+判词）作为唯一性样本
  heads.add(text.split('\n')[0])
}
ok(headOk, `离线文案头部 = 「卦名：判词（建议）」全覆盖（异常：${headMiss.join(',') || '无'}）`)
ok(heads.size === 64, `64 卦头部判词互异（实际 ${heads.size} 种）——「只有两种判词」已修复`)

// ── 4. 动爻变卦判词出现在【变卦】行 ──
{
  const agg = aggForHexName('乾为天')
  const text = generateConclusionText(agg, script, 'classic')
  const changedMatch = text.match(/【变卦】动(\d)爻变 (\S+)（(.+)）/)
  ok(Boolean(changedMatch), `【变卦】行含变卦名+判词（实际：${changedMatch ? changedMatch[2] : '无'}）`)
  if (changedMatch) {
    const changedName = changedMatch[2]
    ok(
      changedMatch[3] === HEXAGRAM_TEXTS[changedName].judgment,
      `变卦「${changedName}」判词与判词库一致`,
    )
  }
  // plain 风格不受影响（工程报表风）
  const plain = generateConclusionText(agg, script, 'plain')
  ok(plain.startsWith('结论='), 'plain 风格输出不受判词库影响')
}

// ── 5. buildHexagramHead 组合 ──
{
  const h1 = buildHexagramHead({ name: '坤为地' }, '可行')
  ok(h1.includes('坤为地') && h1.includes('厚德载物') && h1.includes('可行'), `buildHexagramHead 组合卦名+判词+verdict（${h1}）`)
  const h2 = buildHexagramHead({ name: '不存在的卦' }, null)
  ok(h2.includes('不存在的卦'), '未知卦名不抛错（兜底文案）')
}

console.log(`\n判词专项：${pass} PASS / ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
