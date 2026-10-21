// test_hexagram.mjs — 真·64 卦映射专项测试（v0.4.0 强化版）
//
// 覆盖：
//   1. 已知基准（全阳→乾为天、全阴→坤为地、上乾下坤→天地否、动爻变卦≠原卦、hexNameFromYaos 入口）
//   2. 全 64 组合遍历：每个 (上卦,下卦) 组合 → 标准卦名，并与《周易》正名逐一核对（抓错位/重名/未知）
//   3. 双射性：64 组合 → 64 个互异标准卦名（抓"未知"与重名）
//   4. 动爻/变卦：64 组合各自动爻翻转后均得合法且不同卦名；动爻选取=距 0.5 最远域
//   5. 边界与 NA：score==0.5 → 阳爻；NA(缺域) → 阴爻(0)，与批量脚本的 0.5 中性覆盖明确区分
import { getBuiltinScript } from '../lib/yijing/checkpoints.mjs'
import {
  buildOrderFromScript,
  resolveHexagramForScript,
  hexNameFromYaos,
} from '../lib/yijing/hexagram.mjs'

let fail = 0
const ok = (c, m) => {
  if (c) console.log('  \u2713', m)
  else {
    console.log('  \u2717', m)
    fail++
  }
}

const stock = getBuiltinScript('stock-trend')
const order = buildOrderFromScript(stock)
// 6 主域（下卦3 + 上卦3），顺序与引擎聚合严格一致
const sixCodes = [...order.lower, ...order.upper] // [JS, ZJ, GZ, JB, HY, HG]

// 本地《周易》正名参考表（键 = 上卦+下卦，如 乾为天=乾乾、泽天夬=兑乾）
// 用于逐一核对 HEXAGRAMS 是否有错位/重名/遗漏。
const TRIGRAM = {
  '111': '乾', '011': '兑', '101': '離', '110': '震',
  '001': '巽', '010': '坎', '100': '艮', '000': '坤',
}
const tri = (top, mid, bot) => TRIGRAM[`${top}${mid}${bot}`]
const CANONICAL = {
  '乾乾': '乾为天', '兑乾': '泽天夬', '離乾': '火天大有', '震乾': '雷天大壮',
  '巽乾': '风天小畜', '坎乾': '水天需', '艮乾': '山天大畜', '坤乾': '地天泰',
  '乾兑': '天泽履', '兑兑': '兑为泽', '離兑': '火泽睽', '震兑': '雷泽归妹',
  '巽兑': '风泽中孚', '坎兑': '水泽节', '艮兑': '山泽损', '坤兑': '地泽临',
  '乾離': '天火同人', '兑離': '泽火革', '離離': '離为火', '震離': '雷火丰',
  '巽離': '风火家人', '坎離': '水火既济', '艮離': '山火贲', '坤離': '地火明夷',
  '乾震': '天雷无妄', '兑震': '泽雷随', '離震': '火雷噬嗑', '震震': '震为雷',
  '巽震': '风雷益', '坎震': '水雷屯', '艮震': '山雷颐', '坤震': '地雷复',
  '乾巽': '天风姤', '兑巽': '泽风大过', '離巽': '火风鼎', '震巽': '雷风恒',
  '巽巽': '巽为风', '坎巽': '水风井', '艮巽': '山风蛊', '坤巽': '地风升',
  '乾坎': '天水讼', '兑坎': '泽水困', '離坎': '火水未济', '震坎': '雷水解',
  '巽坎': '风水涣', '坎坎': '坎为水', '艮坎': '山水蒙', '坤坎': '地水师',
  '乾艮': '天山遁', '兑艮': '泽山咸', '離艮': '火山旅', '震艮': '雷山小过',
  '巽艮': '风山渐', '坎艮': '水山蹇', '艮艮': '艮为山', '坤艮': '地山谦',
  '乾坤': '天地否', '兑坤': '泽地萃', '離坤': '火地晋', '震坤': '雷地豫',
  '巽坤': '风地观', '坎坤': '水地比', '艮坤': '山地剥', '坤坤': '坤为地',
}
const canonNames = new Set(Object.values(CANONICAL))

console.log('== 64 卦映射专项测试 (stock-trend) ==')

// ---- 1. 已知基准 ----
const allYang = Object.fromEntries(sixCodes.map((c) => [c, 1.0]))
const allYin = Object.fromEntries(sixCodes.map((c) => [c, 0.0]))
ok(resolveHexagramForScript(allYang, stock).name === '乾为天', '6 爻全阳 → 乾为天')
ok(resolveHexagramForScript(allYin, stock).name === '坤为地', '6 爻全阴 → 坤为地')
const mix = { ...allYin }
for (const c of order.upper) mix[c] = 1.0
ok(resolveHexagramForScript(mix, stock).name === '天地否', '上乾下坤 → 天地否')
const hx = resolveHexagramForScript(allYang, stock)
ok(hx.changed && hx.changed.name !== '乾为天', `乾为天 动爻变卦 ≠ 乾为天（得 ${hx.changed && hx.changed.name}）`)
ok(hexNameFromYaos([1, 1, 1, 1, 1, 1]) === '乾为天', 'hexNameFromYaos 全阳 → 乾为天')
ok(hexNameFromYaos([0, 0, 0, 0, 0, 0]) === '坤为地', 'hexNameFromYaos 全阴 → 坤为地')

// ---- 2/3. 全 64 组合遍历 + 与正名逐一核对 + 双射性 ----
let mismatch = 0
const seen = new Set()
const mismatches = []
for (let m = 0; m < 64; m++) {
  const scores = {}
  sixCodes.forEach((c, i) => {
    scores[c] = (m >> i) & 1 ? 1.0 : 0.0
  })
  for (const c of order.moving) scores[c] = 0.5 // 非卦象域给中性值，不影响 6 爻
  const got = resolveHexagramForScript(scores, stock)
  const name = got.name
  // 期望：由 6 爻位反推 (上,下) 组合 → 正名
  const b = sixCodes.map((c, i) => ((m >> i) & 1))
  const lowerTri = tri(b[2], b[1], b[0])
  const upperTri = tri(b[5], b[4], b[3])
  const expect = CANONICAL[`${upperTri}${lowerTri}`]
  if (name === '未知' || name !== expect) {
    mismatch++
    mismatches.push(`#${String(m).padStart(2, '0')} [${sixCodes.map((c, i) => c + '=' + (b[i] ? '阳' : '阴')).join(' ')}] → 得「${name}」，应为「${expect}」`)
  }
  seen.add(name)
}
if (mismatch) mismatches.forEach((x) => console.log('    \u2717', x))
ok(mismatch === 0, `全 64 组合与《周易》正名逐一核对（错位 ${mismatch} 处）`)
ok(seen.size === 64, `64 组合映射为 64 个互异卦名（双射性；实际 ${seen.size} 个，无"未知"/重名）`)
ok([...canonNames].every((n) => seen.has(n)), '64 标准卦名全部可达（无遗漏）')

// ---- 4. 动爻/变卦 ----
let changedBad = 0
for (let m = 0; m < 64; m++) {
  const scores = {}
  sixCodes.forEach((c, i) => {
    scores[c] = (m >> i) & 1 ? 1.0 : 0.0
  })
  for (const c of order.moving) scores[c] = 0.5
  const g = resolveHexagramForScript(scores, stock)
  if (!g.changed || g.changed.name === '未知' || g.changed.name === g.name) changedBad++
}
ok(changedBad === 0, `64 组合动爻变卦均合法且 ≠ 原卦（异常 ${changedBad}）`)
// 动爻选取：唯一最远域应被选中
const sc2 = Object.fromEntries(sixCodes.map((c) => [c, 0.5])) // 边界→全阳
sc2[sixCodes[0]] = 0.0 // 仅 JS 失守（距 0.5 最远）
const g2 = resolveHexagramForScript(sc2, stock)
ok(
  g2.movingYao.code === sixCodes[0] && g2.movingYao.yaoIndex === 0,
  `动爻选取：唯一最远域 ${sixCodes[0]} → 动初爻（得 ${g2.movingYao.code}/第${(g2.movingYao.yaoIndex + 1)}爻，变 ${g2.changed.name}）`,
)

// ---- 5. 边界与 NA ----
const allBound = Object.fromEntries(sixCodes.map((c) => [c, 0.5])) // 恰 0.5 → 阳
ok(resolveHexagramForScript(allBound, stock).name === '乾为天', 'score 恰 0.5 → 阳爻（边界含入）')
const scNA = { ...allYang }
delete scNA[sixCodes[3]] // 模拟 JB 域 NA（缺键）
const gNA = resolveHexagramForScript(scNA, stock)
// JB 在 upper 第 1 位（bit3）；缺失 → 阴(0) → upper=(HG=1,HY=1,JB=0)=震，lower=乾 → 雷天大壮
ok(gNA.name === '雷天大壮', `NA 域(${sixCodes[3]} 缺) → 阴爻(0)，与 0.5 中性覆盖不同（得 ${gNA.name}）`)

console.log(fail === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${fail})`)
process.exit(fail === 0 ? 0 : 1)
