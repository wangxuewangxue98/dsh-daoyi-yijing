// hexagram-texts.mjs — 64 卦判词库（v0.5.0 补全）
// 旧版（≤v0.4.x）离线判词只有 VERDICT_DESC 三选一 + 15 条 HEX_DESC，
// 导致 64 卦共用同一组描述（用户侧表现为"判词只有两种"）。
// 本模块为全部 64 卦逐卦提供：
//   judgment —— 卦辞要义判词（一句话定调，源自《周易》卦义，非随机生成）
//   advice   —— 行事建议（一句）
//   tone     —— 卦性倾向：'auspicious' | 'neutral' | 'ominous'（供与 verdict 组合时选措辞）
// key 与 lib/yijing/hexagram.mjs 的 HEXAGRAMS 卦名严格一一对应（64 条，互异）。
// 判词为卦义要点的决策化表述（决策辅助、非玄学预测），不对应具体吉凶承诺。

export const HEXAGRAM_TEXTS = {
  '乾为天': { judgment: '元亨利贞，刚健不息', advice: '主动进取，忌用过刚', tone: 'auspicious' },
  '坤为地': { judgment: '厚德载物，柔顺守成', advice: '顺势而为，勿争先出头', tone: 'auspicious' },
  '水雷屯': { judgment: '草创艰难，宜固根本', advice: '稳扎稳打，待机而动', tone: 'neutral' },
  '山水蒙': { judgment: '蒙昧待启，宜求明师', advice: '求知问学，戒自作聪明', tone: 'neutral' },
  '水天需': { judgment: '云上于天，需待时机', advice: '耐心等待，蓄势再发', tone: 'neutral' },
  '天水讼': { judgment: '争讼之象，宜避争竞', advice: '退让和解，勿执小赢', tone: 'ominous' },
  '地水师': { judgment: '师众之象，纪律为先', advice: '整肃队伍，听统一号令', tone: 'neutral' },
  '水地比': { judgment: '亲比相辅，众心和合', advice: '择善而从，广结善缘', tone: 'auspicious' },
  '风天小畜': { judgment: '小有蓄积，未可大动', advice: '积小成大，勿躁进', tone: 'neutral' },
  '天泽履': { judgment: '履虎尾而不咥，谨慎前行', advice: '守礼慎行，可化险为夷', tone: 'neutral' },
  '地天泰': { judgment: '天地交泰，上下通和', advice: '把握顺境，居安思危', tone: 'auspicious' },
  '天地否': { judgment: '天地不交，闭塞不通', advice: '收敛守拙，静待转机', tone: 'ominous' },
  '天火同人': { judgment: '同人于野，志同道合', advice: '开诚合作，去私为公', tone: 'auspicious' },
  '火天大有': { judgment: '火在天上，丰盛大有', advice: '持盈保泰，惠及四方', tone: 'auspicious' },
  '地山谦': { judgment: '谦谦君子，卑以自牧', advice: '谦退自持，功不独居', tone: 'auspicious' },
  '雷地豫': { judgment: '悦豫而顺，预则立', advice: '借势而行，防乐极生悲', tone: 'auspicious' },
  '泽雷随': { judgment: '随时而动，顺时应势', advice: '择善而从，不逆大势', tone: 'auspicious' },
  '山风蛊': { judgment: '积弊待治，革故鼎新', advice: '正视积弊，下决心整顿', tone: 'neutral' },
  '地泽临': { judgment: '临下以观，渐居上位', advice: '亲力亲为，谨守分寸', tone: 'auspicious' },
  '风地观': { judgment: '观民设教，静以观省', advice: '多看少动，以理服人', tone: 'neutral' },
  '火雷噬嗑': { judgment: '咬合断决，明罚敕法', advice: '遇阻则断，勿姑息养奸', tone: 'neutral' },
  '山火贲': { judgment: '文饰之美，质重于文', advice: '重内涵而轻虚饰', tone: 'neutral' },
  '山地剥': { judgment: '剥落侵蚀，宜守不宜进', advice: '止损保本，避其锋芒', tone: 'ominous' },
  '地雷复': { judgment: '一阳来复，去而复返', advice: '改过归正，重新出发', tone: 'auspicious' },
  '天雷无妄': { judgment: '无妄之福，守正为本', advice: '不妄动、不贪求', tone: 'neutral' },
  '山天大畜': { judgment: '大畜刚健，厚积待发', advice: '蓄力储能，致远可成', tone: 'auspicious' },
  '山雷颐': { judgment: '颐养之道，慎言节食', advice: '养精蓄锐，自食其力', tone: 'neutral' },
  '泽风大过': { judgment: '栋桡之象，过犹不及', advice: '纠偏止损，勿逞强冒进', tone: 'ominous' },
  '坎为水': { judgment: '重险叠至，习坎心亨', advice: '履险如夷，以常守信', tone: 'ominous' },
  '離为火': { judgment: '明两作离，附丽守正', advice: '借势借智，光明正大', tone: 'auspicious' },
  '泽山咸': { judgment: '感应相与，情投意合', advice: '以诚感人，忌勉强', tone: 'auspicious' },
  '雷风恒': { judgment: '恒久之道，立不易方', advice: '持之以恒，忌朝三暮四', tone: 'auspicious' },
  '天山遁': { judgment: '遁世远害，急流勇退', advice: '见好就收，避其锋芒', tone: 'neutral' },
  '雷天大壮': { judgment: '壮盛之时，礼而勿暴', advice: '守正用壮，忌以强凌人', tone: 'auspicious' },
  '火地晋': { judgment: '晋升之象，明出地上', advice: '进取有功，步步高升', tone: 'auspicious' },
  '地火明夷': { judgment: '明入地中，晦藏其明', advice: '外晦内明，守拙待时', tone: 'ominous' },
  '风火家人': { judgment: '家道正而万事定', advice: '先正己，后正人', tone: 'auspicious' },
  '火泽睽': { judgment: '乖离异见，小事可吉', advice: '求同存异，勿激化矛盾', tone: 'neutral' },
  '水山蹇': { judgment: '行有艰险，见险而止', advice: '知难而退，另寻蹊径', tone: 'ominous' },
  '雷水解': { judgment: '险难消散，赦过宥罪', advice: '把握解困之机，从速行动', tone: 'auspicious' },
  '山泽损': { judgment: '损下益上，损己利人', advice: '有所舍，方有所得', tone: 'neutral' },
  '风雷益': { judgment: '益下而民自益，利有攸往', advice: '让利于人，广结善缘', tone: 'auspicious' },
  '泽天夬': { judgment: '决而能和，当断则断', advice: '果断除弊，留有余地', tone: 'auspicious' },
  '天风姤': { judgment: '不期而遇，阴柔渐侵', advice: '防微杜渐，慎于所遇', tone: 'neutral' },
  '泽地萃': { judgment: '聚合成势，众力可依', advice: '聚焦核心，防内耗', tone: 'auspicious' },
  '地风升': { judgment: '积小以高，升进而顺', advice: '顺势攀升，勿急勿躁', tone: 'auspicious' },
  '泽水困': { judgment: '困而不失其亨，守志', advice: '安贫乐道，待机解困', tone: 'ominous' },
  '水风井': { judgment: '井养不穷，取用有源', advice: '修己惠人，固本培元', tone: 'neutral' },
  '泽火革': { judgment: '革故鼎新，顺天应人', advice: '谋定后动，大刀阔斧', tone: 'auspicious' },
  '火风鼎': { judgment: '鼎新之象，稳重图成', advice: '倾覆旧局，另起新灶', tone: 'auspicious' },
  '震为雷': { judgment: '震动恐惧，修省而后安', advice: '处变不惊，自查自省', tone: 'neutral' },
  '艮为山': { judgment: '止其所当止，时行则行', advice: '沉静少动，勿妄求', tone: 'neutral' },
  '风山渐': { judgment: '渐进有序，如雁成行', advice: '循序渐进，勿躐等求速', tone: 'auspicious' },
  '雷泽归妹': { judgment: '归妹之名，分位未正', advice: '守分守正，勿苟合将就', tone: 'neutral' },
  '雷火丰': { judgment: '丰盛至极，防盛极衰', advice: '借势大成，忌满忌骄', tone: 'auspicious' },
  '火山旅': { judgment: '旅居在外，宜谦以顺', advice: '轻装简从，勿恋栈', tone: 'neutral' },
  '巽为风': { judgment: '随风入物，申命行事', advice: '谦顺渗透，柔能克刚', tone: 'neutral' },
  '兑为泽': { judgment: '和悦相说，利在于贞', advice: '以和聚人，防口舌之争', tone: 'auspicious' },
  '风水涣': { judgment: '风行水上，涣散重聚', advice: '收拢人心，聚散有度', tone: 'neutral' },
  '水泽节': { judgment: '节以制度，议德有位', advice: '节制有度，勿过勿不及', tone: 'neutral' },
  '风泽中孚': { judgment: '诚信及物，豚鱼可格', advice: '以诚为本，言必信行必果', tone: 'auspicious' },
  '雷山小过': { judgment: '小有过越，可小不可大', advice: '谨小慎微，勿大动', tone: 'neutral' },
  '水火既济': { judgment: '事已成，思患而预防', advice: '守成防变，善始善终', tone: 'auspicious' },
  '火水未济': { judgment: '事未成，慎终如始', advice: '审慎进取，功亏一篑为戒', tone: 'neutral' },
}

/** 通用兜底判词（正常不应触发：64 卦已全覆盖；防止未来加卦时文案缺失） */
export const FALLBACK_HEXAGRAM_TEXT = {
  judgment: '卦象已成，宜观其变',
  advice: '审时度势，谋定后动',
  tone: 'neutral',
}

/**
 * 取某卦判词；未知卦名返回兜底（同时通过 .fallback 标记，便于测试断言无兜底触发）。
 */
export function getHexagramText(name) {
  const t = HEXAGRAM_TEXTS[name]
  if (t) return { ...t, fallback: false }
  return { ...FALLBACK_HEXAGRAM_TEXT, fallback: true }
}

/** tone → 与 verdict 组合时的措辞倾向 */
const TONE_HINT = {
  auspicious: '卦性偏顺',
  neutral: '卦性平和',
  ominous: '卦性偏逆',
}

/**
 * 组合「卦象判词 + 当前 verdict」为离线结论文案头部（v0.5.0）。
 * 形如：乾为天：元亨利贞，刚健不息（卦性偏顺）——本卦判：可行，宜进取。
 * verdict 三态仅描述"当前八宫之势"，不再充当卦的固定判词。
 */
export function buildHexagramHead(hexagram, verdict) {
  const name = hexagram && hexagram.name ? hexagram.name : '未知'
  const t = getHexagramText(name)
  const verdictPart = verdict ? `本卦判：${verdict}，${t.advice}` : t.advice
  return `${name}：${t.judgment}（${TONE_HINT[t.tone] || TONE_HINT.neutral}）——${verdictPart}`
}

export default {
  HEXAGRAM_TEXTS,
  FALLBACK_HEXAGRAM_TEXT,
  getHexagramText,
  buildHexagramHead,
}
