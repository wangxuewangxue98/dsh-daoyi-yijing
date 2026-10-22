// migrate_hex_order.mjs — 卦①爻序 canonical 化迁移工具（v0.9.0 F-8）
//
// 为什么需要（使用报告 E-2）：卦①爻序曾出现三套并存——
//   ① v2 剧本声明序 hex_order=[JS,ZJ,XX,FX,JB,HY]（六域全进卦）
//   ② 384 的三才切分 di[:3]+tian[:3]（ren 宫不进卦①，引擎缺省）
//   ③ 用户侧脚本层的字典序 [FX,HY,JB,JS,XX,ZJ]
// 同输入下 ① 与 ③ 的卦名仅 15/55 一致 → 历史卦象日志与 0.8.x 输出不可直接比对。
//
// canonical 定义（v0.9.0 起唯一权威）：
//   **canonical = 剧本显式声明的 hex_order（扁平数组、长≥6）；未声明时 = 引擎三才切分
//   di[:3]+tian[:3]（384 口径，ren 宫不进卦①）** —— 即 quad-hexagram.mjs 的 hexOrderOf()
//   的 declared / sancai 两个分支。畸形形状（对象/短数组）→ fallback:domains 并在输出标注。
//
// 本工具做什么：
//   读历史批量推演 JSON（含每只的 domain_scores 与当时的编码阈值），
//   ① 用「旧序」重算卦名并与日志记录值比对 → 校验旧序假设是否正确（old_order_verified）；
//   ② 用 canonical 序重算 → 输出新卦名与变更清单，供历史数据追溯比对。
// 不做：不改动任何基线/引擎行为；不猜测未记录的阈值（缺阈值回落绝对 0.5 并在输出标注）。
//
// 用法：
//   node scripts/migrate_hex_order.mjs --in logs/stock-batch-results.json [--from dictionary|sancai|declared]
//        [--script stock-trend] [--out logs/hex-order-migration.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { hexNameFromYaos } from '../lib/yijing/hexagram.mjs'
import { hexOrderOf } from '../lib/yijing/quad-hexagram.mjs'
import { buildStockScript } from '../lib/yijing/checkpoints.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'

export function scriptById(id) {
  return id === 'stock-trend-v2' ? buildStockTrendV2Script() : buildStockScript()
}

/** 旧序解析：按「旧日志实际使用的口径」还原 6 爻顺序 */
export function oldOrderOf(mode, domainCodesRecorded, scriptObj) {
  if (mode === 'declared') return hexOrderOf(scriptObj).order
  if (mode === 'dictionary') return [...(domainCodesRecorded || [])].sort().slice(0, 6)
  // sancai：引擎三才切分（下卦 di[:3] + 上卦 tian[:3]）
  const sm = scriptObj.sancai_mapping || {}
  return [...(sm.di || []).slice(0, 3), ...(sm.tian || []).slice(0, 3)]
}

/** 按给定爻序与阈值把域分编成 6 爻（0/1；冻结域恒阴，缺值恒阴） */
export function yaosOf(scores, order, thresholds) {
  return order.map((code) => {
    const v = scores[code]
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0
    const th = thresholds[code]
    if (th === 'frozen' || th === Infinity) return 0 // 冻结域恒阴（与 quantileThresholds 约定一致）
    const t = typeof th === 'number' && Number.isFinite(t) ? t : 0.5
    return v >= t ? 1 : 0
  })
}

/**
 * 执行迁移（可被单测直接调用；CLI 只是薄壳）。
 * @param {{inFile?:string, from?:string, scriptId?:string, records?:Array, meta?:object}} opts
 */
export function runMigration(opts = {}) {
  const IN_FILE = opts.inFile || ''
  const FROM = opts.from || 'dictionary'
  const script = scriptById(opts.scriptId || 'stock-trend')
  const canonical = hexOrderOf(script)
  let records = opts.records
  let raw = opts.meta ? { meta: opts.meta } : null
  if (!records) {
    if (!IN_FILE) throw new Error('migrate_hex_order: 缺少 --in <批量推演JSON>')
    raw = JSON.parse(readFileSync(IN_FILE, 'utf8'))
    records = Array.isArray(raw) ? raw : Array.isArray(raw.results) ? raw.results : []
  }
  if (!records || !records.length) {
    throw new Error(`migrate_hex_order: 输入无可迁移记录：${IN_FILE || '(records)'}`)
  }
  // 阈值：优先取日志里的批次分位阈值（meta.hex_encoding.thresholds），缺则绝对 0.5（并标注）
  const encThresholds = (raw && raw.meta && raw.meta.hex_encoding && raw.meta.hex_encoding.thresholds) || null
  const thresholdSource = encThresholds ? 'log:batch-quantile' : 'fallback:absolute-0.5'

  const rows = []
  let matched = 0
  let changed = 0
  let comparable = 0
  for (const r of records) {
    const scores = r.domain_scores || r.scores || null
    if (!scores) continue
    const codes = Object.keys(scores)
    const oldOrder = oldOrderOf(FROM, codes, script)
    const thresholds = encThresholds || {}
    const oldName = hexNameFromYaos(yaosOf(scores, oldOrder, thresholds))
    const newName = hexNameFromYaos(yaosOf(scores, canonical.order, thresholds))
    const recorded = r.hexagram && r.hexagram.name ? r.hexagram.name : null
    const match = recorded ? recorded === oldName : null
    comparable++
    if (match) matched++
    if (oldName !== newName) changed++
    rows.push({
      code: r.code || null,
      recorded_hex: recorded,
      old_order: oldOrder.join(','),
      recomputed_old_hex: oldName,
      old_order_verified: match,
      canonical_order: canonical.order.join(','),
      canonical_hex: newName,
      changed: oldName !== newName,
    })
  }

  return {
    generated_at: new Date().toISOString(),
    input: IN_FILE || '(records)',
    script_id: script.script_id,
    from_mode: FROM,
    canonical: {
      definition:
        '剧本显式声明的 hex_order；未声明则引擎三才切分 di[:3]+tian[:3]（384 口径，ren 宫不进卦①）',
      status: canonical.status,
      order: canonical.order,
      note: canonical.note,
    },
    thresholds: { source: thresholdSource },
    summary: {
      records: rows.length,
      old_order_verified: `${matched}/${comparable}`,
      verify_note:
        '「旧序假设」校验：用旧序重算的卦名与日志记录值一致的比例；偏低说明 --from 选错了口径，应换一个再跑',
      changed_to_canonical: `${changed}/${rows.length}`,
    },
    rows,
  }
}

// 直接运行（node scripts/migrate_hex_order.mjs --in ...）才执行；被 import 时不跑
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('migrate_hex_order.mjs')) {
  const argOf = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
  }
  const IN_FILE = argOf('in', '')
  const OUT_FILE = argOf('out', '')
  if (!IN_FILE) {
    console.error(
      '用法：node scripts/migrate_hex_order.mjs --in <批量推演JSON> [--from dictionary|sancai|declared] [--script stock-trend] [--out <输出JSON>]',
    )
    process.exit(1)
  }
  const out = runMigration({
    inFile: IN_FILE,
    from: argOf('from', 'dictionary'),
    scriptId: argOf('script', 'stock-trend'),
  })
  const json = JSON.stringify(out, null, 2)
  if (OUT_FILE) {
    writeFileSync(OUT_FILE, json, 'utf8')
    console.log(`迁移结果已写入 ${OUT_FILE}`)
  } else {
    console.log(json)
  }
  console.log(
    `记录 ${out.summary.records} 条｜旧序校验 ${out.summary.old_order_verified}｜` +
      `canonical 变更 ${out.summary.changed_to_canonical}｜canonical=${out.canonical.order.join(',')}（${out.canonical.status}）`,
  )
}
