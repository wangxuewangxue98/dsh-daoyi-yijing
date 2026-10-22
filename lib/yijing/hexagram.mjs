// hexagram.mjs — 真·64 卦动态映射（取代 reviewer 的三元查表）
// 设计要点：
//   1. 8 宫连续分 → 阴阳位（>=0.5 为阳），取 6 主域组成 6 爻（下卦 3 爻 + 上卦 3 爻）；
//   2. 用「上卦 + 下卦」组合查《周易》64 卦标准表（HEXAGRAMS），避免二进制排序歧义；
//   3. 动爻 = 与 0.5 距离最大的域，翻转得变卦；
//   4. 内核仍是确定性评分聚合，卦象仅作结构化表达外壳（决策辅助、非玄学预测）。
//
// 先天八卦（邵雍序，仅用于 trigram 字形识别，不用于排序）：
//   乾☰ 兑☱ 離☲ 震☳ 巽☴ 坎☵ 艮☶ 坤☷
// 每卦 3 爻按 (上, 中, 下) 记录，阳=1/阴=0。

// 《周易》八卦取象歌（朱熹）——本表唯一权威来源，六十四卦名正确性完全依赖它：
//   乾三连 ☰ 三阳      | key '111'
//   坤六断 ☷ 三阴      | key '000'
//   震仰盂 ☳ 盂口朝上＝下爻实(阳)、中上虚(阴) | key '001'
//   巽下断 ☴ 下爻断开(阴)、中上实(阳)        | key '110'
//   坎中满 ☵ 中爻阳、上下阴                  | key '010'
//   離中虚 ☲ 中爻阴、上下阳                  | key '101'
//   艮覆碗 ☶ 上爻阳、中下阴                  | key '100'
//   兑上缺 ☱ 上爻阴、中下阳                  | key '011'
// key 格式 = `${上}${中}${下}`，与 trigramOf(yaos[高], yaos[中], yaos[低]) 的实参顺序严格一致。
// ⚠ v0.5.1 修正：震/巽 曾被互换（把「震仰盂」的 001 标成巽、「巽下断」的 110 标成震）。
//   症状：上/下卦中凡含震或巽的卦，卦名互换（例：本该「风天小畜」显示为「雷天大壮」）。
//   影响面：仅卦名语义（判读方向相反），卦种总数与双射性不受影响；
//   修复后 scripts/test_hexagram.mjs 内同步更新过时的期望值，并新增「按取象歌逐卦校验」断言防回归。
const TRIGRAM_BY_LINES = {
  '111': '乾', // 乾三连
  '011': '兑', // 兑上缺：上阴、中阳、下阳
  '101': '離', // 離中虚：上阳、中阴、下阳
  '001': '震', // 震仰盂：下爻阳，中/上阴 ← 修正（原误标为巽）
  '110': '巽', // 巽下断：下爻阴，中/上阳 ← 修正（原误标为震）
  '010': '坎', // 坎中满：上阴、中阳、下阴
  '100': '艮', // 艮覆碗：上阳、中阴、下阴
  '000': '坤', // 坤六断
}

// 《周易》64 卦：键 = 上卦 + 下卦（如 乾为天 = '乾乾'、地水师 = '坤坎'）。
// 该映射与卦象的上下卦组成严格一致（已单测：全阳→乾为天、全阴→坤为地）。
const HEXAGRAMS = {
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

// 精简卦辞风格注记（决策语义外壳）；未列出的卦返回原名。
// v0.5.0 起主判词源为 hexagram-texts.mjs 的 64 卦判词库；本表仅作兼容回退。
const HEX_DESC = {
  '乾为天': '刚健中正，宜进取', '坤为地': '厚载包容，宜守成',
  '水山蹇': '行有艰险，宜审慎', '地水师': '险而顺，宜止退',
  '水雷屯': '初生艰难，宜固本', '山水蒙': '蒙昧待启，宜求师',
  '水天需': '需待时机，宜稳守', '天水讼': '争讼之象，宜避让',
  '坎为水': '重险叠至，宜慎行', '離为火': '明丽依附，宜守正',
  '震为雷': '震动奋发，宜果决', '艮为山': '止而有节，宜静守',
  '巽为风': '顺而入，宜渐进', '兑为泽': '悦而和，宜和合',
}

function trigramOf(top, mid, bottom) {
  return TRIGRAM_BY_LINES[`${top}${mid}${bottom}`] || '坤'
}

// 6 爻（初..上，自底向上）→ 卦名
// yaos: 长度 6 的 0/1 数组，索引 0=初爻(最下)，5=上爻(最上)
export function hexNameFromYaos(yaos) {
  // 下卦 = 初、二、三；上卦 = 四、五、上
  const lower = trigramOf(yaos[2], yaos[1], yaos[0]) // 下卦 上/中/下
  const upper = trigramOf(yaos[5], yaos[4], yaos[3]) // 上卦 上/中/下
  return HEXAGRAMS[`${upper}${lower}`] || '未知'
}

// 卦判词（v0.5.0 起取自 64 卦判词库 hexagram-texts.mjs；旧 HEX_DESC 仅 15 条，作兼容回退）
import { getHexagramText } from './hexagram-texts.mjs'
function descFor(name) {
  const t = getHexagramText(name)
  if (!t.fallback) return t.judgment
  return HEX_DESC[name] || ''
}

// 依据 8 宫分数与剧本域顺序，取 6 主域 → 6 爻；余下域作为动爻候选池。
// order: { lower:[3 codes], upper:[3 codes], moving:[codes] }
// S2（v0.8.0）：剧本声明 hex_order（1296 六域全进卦的显式爻序）时优先使用——
//   下卦 = 前三爻、上卦 = 后三爻、动爻池 = 声明之外的域（通常为空）。
//   未声明（384/commercial/motor-design 等旧剧本）→ 原 sancai 切分路径，行为逐位不变。
export function buildOrderFromScript(script) {
  if (script && Array.isArray(script.hex_order) && script.hex_order.length >= 6) {
    const order = script.hex_order.slice(0, 6)
    const all = (script.domains || []).map((d) => d.code)
    return {
      lower: order.slice(0, 3),
      upper: order.slice(3, 6),
      moving: [...order.slice(6), ...all.filter((c) => !order.includes(c))],
    }
  }
  const sm = (script && script.sancai_mapping) || {}
  const tian = sm.tian || []
  const di = sm.di || []
  const ren = sm.ren || []
  const all = (script && script.domains ? script.domains : []).map((d) => d.code)
  const upper = tian.slice(0, 3)
  const lower = di.slice(0, 3)
  const moving = [...tian.slice(3), ...ren]
  // 兜底补齐（保证 3+3 爻）
  const pick = (arr) => {
    const c = all.find((x) => !lower.includes(x) && !upper.includes(x) && !arr.includes(x))
    return c
  }
  while (lower.length < 3) {
    const c = pick(lower)
    if (!c) break
    lower.push(c)
  }
  while (upper.length < 3) {
    const c = pick(upper)
    if (!c) break
    upper.push(c)
  }
  return { lower, upper, moving }
}

// 由 8 宫分数 + order 解析 6 爻
export function buildYaos(scores, order, thresholds = null) {
  const bit = (code) => {
    const v = scores[code]
    if (v == null || !Number.isFinite(v)) return 0
    // 阈值可由批次分位数给出（默认 0.5）。阈值 Infinity = 该域冻结（批次内取值唯一）→ 恒阴
    const th = thresholds && thresholds[code] != null ? thresholds[code] : 0.5
    return v >= th ? 1 : 0
  }
  // 下卦 3 爻（初、二、三），上卦 3 爻（四、五、上）
  return [...order.lower.map(bit), ...order.upper.map(bit)]
}

/**
 * 批次分位数阈值：让每个"进卦域"在本批次内阴阳各半（满熵），避免绝对阈值导致某爻恒阳/恒阴而冻结。
 * @param {Array<Record<string, number|null>>} samples 每只标的的 {域码: 分数}
 * @param {number} q 分位（默认 0.5 = 中位数）
 * @returns {{ thresholds: Record<string, number>, frozen: string[], stats: Record<string, {n:number, distinct:number}> }}
 *   - 域内取值唯一（如 NA 被填成同一个值）→ 该域 frozen，阈值 Infinity（恒阴，不再偏阳）
 */
export function quantileThresholds(samples, q = 0.5) {
  const list = Array.isArray(samples) ? samples.filter(Boolean) : []
  const codes = new Set()
  for (const s of list) {
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'number' && Number.isFinite(v)) codes.add(k)
    }
  }
  const thresholds = {}
  const frozen = []
  const stats = {}
  for (const c of codes) {
    const vals = list
      .map((s) => s[c])
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => a - b)
    if (!vals.length) continue
    const distinct = new Set(vals).size
    stats[c] = { n: vals.length, distinct }
    if (distinct <= 1) {
      // 冻结：批次内无分化能力 → 恒阴（保守中性，消除 NA 恒阳偏置）
      thresholds[c] = Infinity
      frozen.push(c)
      continue
    }
    const idx = Math.min(vals.length - 1, Math.max(0, Math.floor(q * vals.length)))
    thresholds[c] = vals[idx]
  }
  return { thresholds, frozen, stats }
}

// 动爻：在 6 爻（下3 + 上3）中，与 0.5 距离最大（最显著）的域，翻转得变卦
export function movingYao(scores, order) {
  const codes = [...order.lower, ...order.upper]
  let best = null
  let bestDist = -1
  for (const code of codes) {
    const s = scores[code]
    if (s == null) continue
    const d = Math.abs(s - 0.5)
    if (d > bestDist) {
      bestDist = d
      best = code
    }
  }
  if (best == null) return { code: null, yaoIndex: -1 }
  const idx = order.lower.indexOf(best)
  if (idx >= 0) return { code: best, yaoIndex: idx } // 初/二/三 → 0/1/2
  return { code: best, yaoIndex: 3 + order.upper.indexOf(best) } // 四/五/上 → 3/4/5
}

// 主入口：返回 { name, desc, yaos, movingYao, changed }
export function resolveHexagram(scores, order, thresholds = null) {
  const yaos = buildYaos(scores, order, thresholds)
  const name = hexNameFromYaos(yaos)
  const desc = descFor(name)
  const mv = movingYao(scores, order)
  let changed = null
  if (mv.yaoIndex >= 0) {
    const flipped = yaos.slice()
    flipped[mv.yaoIndex] ^= 1
    changed = { name: hexNameFromYaos(flipped), yaoIndex: mv.yaoIndex, code: mv.code }
  }
  return { name, desc, yaos, movingYao: mv, changed }
}

// 便捷：直接传 script（自动推导 order）
export function resolveHexagramForScript(scores, script, thresholds = null) {
  return resolveHexagram(scores, buildOrderFromScript(script), thresholds)
}

// 测试/内省用导出（附加式，不影响运行时行为）
export { TRIGRAM_BY_LINES, HEXAGRAMS }
