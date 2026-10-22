// calibrate_stock_baselines.mjs — 全市场校准卦象编码基线（v0.6.0）
//
// 目的：生成 lib/yijing/baselines-stock.json —— 各宫分的总体分位（p25/p50/p75），
// 让**单只股票**调用也能用「相对市场中位」定爻（≈50/50 熵），触达 64 卦空间。
//
// 口径一致性（关键）：本脚本与 tools/yijing/divine.mjs 共用 adapters/stock-inputs.mjs 的
// 信号规则与铺开系数 —— 基线分位数对对话单只调用才有意义。
//
// 用法：
//   node scripts/calibrate_stock_baselines.mjs [--n 400] [--seed 20261022] [--out lib/yijing/baselines-stock.json]
// 网络失败时退出码非 0（不写半截基线）。
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { evaluateDeterministic } from '../lib/yijing/reviewer.mjs'
import { resolveHexagramForScript, buildOrderFromScript } from '../lib/yijing/hexagram.mjs'
import { parseCp } from '../lib/yijing/quad-hexagram.mjs'
import { familyOf } from '../lib/yijing/subfamily-map.mjs'
import { fetchQuotes, quoteToSignals, createCurlFetcher } from '../adapters/quote.mjs'
import { buildStockInputs, signalsToInputs } from '../adapters/stock-inputs.mjs'

// 与 checkpoints.mjs buildStockScript 的 ASPECTS 严格一致（ci→aspect 名，供 familyOf 使用）
const ASPECTS = ['强度', '持续性', '确定性', '边际变化', '安全边际', '催化']
const aspectNameOf = (id) => ASPECTS[Number(id.slice(4, 6)) - 1] || null

// ── 参数 ──
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const hasFlag = (name) => process.argv.includes(`--${name}`)
const N_TARGET = Number(argOf('n', 400))
const SEED = Number(argOf('seed', 20261022))
const OUT_FILE = argOf('out', fileURLToPath(new URL('../lib/yijing/baselines-stock.json', import.meta.url)))
// --curl：代理环境注入 curl fetcher（undici 不读代理环境变量；与 A/B 实测同款通道）
const CURL_PROXY = hasFlag('curl') ? (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || undefined) : undefined

// ── 候选代码池（主板/中小板/创业板/科创板均匀撒样；死代码由行情解析自然过滤）──
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function buildCandidatePool(seed) {
  const rnd = mulberry32(seed)
  const ranges = [
    [600000, 601999],
    [603000, 603999],
    [605000, 605999],
    [1, 999],
    [1001, 1999],
    [2001, 2999],
    [3000, 3999],
    [300001, 300999],
    [688001, 688999],
  ]
  const pool = []
  for (const [lo, hi] of ranges) {
    const span = hi - lo + 1
    const take = Math.max(20, Math.round((N_TARGET * 1.9 * span) / 9000))
    for (let k = 0; k < take; k++) {
      const n = lo + Math.floor(rnd() * span)
      pool.push(String(n).padStart(6, '0'))
    }
  }
  return [...new Set(pool)]
}

const clamp01 = (x) => Math.max(0, Math.min(1, x))
function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}
// ⚠ 分位数必须保留全精度：四舍五入会把阈值抬高（0.55555→0.5556），
//   恰好等于中位数的股票在 v >= th 判定中反被判阴 —— 实测令 ZJ 爻阳率从 50% 掉到 35.5%。
const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const disp = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(4) : 'null')

async function main() {
  const pool = buildCandidatePool(SEED)
  console.log(`[1/4] 候选代码 ${pool.length} 个（seed=${SEED}），开始拉行情…`)

  // 直接批量拉（chunk 60 只/请求，与 fetchQuotes 内部一致）；这里手动分批以便展示进度
  const quotes = new Map()
  let fetched = 0
  for (let i = 0; i < pool.length; i += 60) {
    const r = await fetchQuotes(pool.slice(i, i + 60), {
      timeoutMs: 12000,
      ...(CURL_PROXY ? { fetcher: createCurlFetcher({ proxy: CURL_PROXY, timeoutMs: 12000 }) } : {}),
    })
    for (const [c, q] of r.quotes) if (q) quotes.set(c, q)
    fetched = r.fetched
    process.stdout.write(`\r  已请求 ${Math.min(i + 60, pool.length)}/${pool.length}，有效 ${quotes.size} 只`)
  }
  console.log()
  const codes = [...quotes.keys()]
  if (codes.length < 60) {
    console.error(`有效样本过少（${codes.length} 只 < 60），疑似网络不通，放弃写基线`)
    process.exit(1)
  }
  console.log(`[2/4] 有效行情 ${codes.length} 只，逐只构建 384 爻 inputs 并推演…`)

  // 指数上下文一次（与 divine 路径同口径）
  const ctx = await buildStockInputs(codes.slice(0, 1))
  const indexContext = ctx.meta.indexContext
  if (!indexContext) {
    console.error(`⚠ 指数上下文获取失败（indexError=${ctx.meta.indexError}）→ HY01/HY04 无 sectorPct 将全部 NA，基线缺 HY 宫`)
    console.error('  这会让「单只股票触达 64 卦」的上卦少一位爻；请检查网络/代理后重跑')
  } else {
    console.log(`  指数基准：${indexContext.name}(${indexContext.symbol}) 涨跌 ${indexContext.pct}%`)
  }

  const script0 = buildStockScript()
  const db = buildCheckpointDatabase(script0)
  // 分组基线累加器（si 子域位 / ci 业务族 / xi aspect）：跨股票收集「每只股票每组阳率」
  const groupsAcc = { si: {}, ci: {}, xi: {} }
  const rows = []
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]
    const q = quotes.get(code)
    const built = signalsToInputs(
      quoteToSignals(q, {
        sectorPct: indexContext && Number.isFinite(indexContext.pct) ? indexContext.pct : undefined,
        sectorAmountWan: undefined,
        indexCtx: indexContext,
      }),
      db,
    )
    const script = { ...script0, na: { domains: [], checkpoints: built.naIds } }
    // 确定性推演（不调 LLM：校准只求宫分分布，避免数百次撞免费 LLM 速率闸）；返回逐检查点阴阳用于分组基线
    const r = evaluateDeterministic(script, { inputs: built.inputs, returnEvaluations: true })
    const scores8 = {}
    for (const d of script0.domains) scores8[d.code] = r.domain_results[d.code]?.score ?? null
    // 本只股票各分组阳率 → 跨股票收集（使每只股票该组阳率≈中位 → 消恒阳爻）
    const perStock = { si: {}, ci: {}, xi: {} }
    const acc = (dim, key, y) => {
      perStock[dim][key] ||= { s: 0, c: 0 }
      perStock[dim][key].s += y
      perStock[dim][key].c += 1
    }
    for (const cp of db.checkpoints) {
      // ⚠ 只统计「实际参与推演」的检查点：r.evaluations 仅含非 NA 项；
      //   NA（无行情信号）不计入分组阳率，否则会把 NA 当阴、压低基线分位（实测 si-5 全 0 的根因）。
      const ev = r.evaluations && r.evaluations[cp.id]
      if (!ev) continue
      const y = ev.yinYang === 1 ? 1 : 0 // judgeYinYang 返回 +1/-1
      const { di, si, ci } = parseCp(cp.id)
      if (si >= 1 && si <= 6) acc('si', String(si), y)
      acc('ci', familyOf(di, aspectNameOf(cp.id)), y)
      if (ci >= 1 && ci <= 6) acc('xi', String(ci), y)
    }
    for (const dim of ['si', 'ci', 'xi']) {
      for (const [k, v] of Object.entries(perStock[dim])) {
        ;(groupsAcc[dim][k] ||= []).push(v.c ? v.s / v.c : null)
      }
    }
    rows.push({
      code,
      name: q.name,
      scores: scores8,
      coverage: r.inputs_coverage ? r.inputs_coverage.coverage : null,
      hex: null,
    })
    if ((i + 1) % 50 === 0) process.stdout.write(`  已推演 ${i + 1}/${codes.length}\n`)
  }

  console.log('[3/4] 计算各宫总体分位（p25/p50/p75）…')
  const domainCodes = script0.domains.map((d) => d.code)
  const domains = {}
  for (const code of domainCodes) {
    const vals = rows.map((r) => r.scores[code]).filter((v) => typeof v === 'number').sort((a, b) => a - b)
    domains[code] = {
      n: vals.length,
      coverage: Number((vals.length / rows.length).toFixed(4)),
      p25: fmt(percentile(vals, 0.25)),
      p50: fmt(percentile(vals, 0.5)),
      p75: fmt(percentile(vals, 0.75)),
      min: vals.length ? fmt(vals[0]) : null,
      max: vals.length ? fmt(vals[vals.length - 1]) : null,
    }
    if (!vals.length) {
      console.warn(`  ⚠ 宫 ${code} 在本批 0 个有效分（该宫未占爻位或无活跃子域），基线不含此宫`)
    }
  }

  console.log('[3b] 计算分组（si/ci/xi）阳率总体分位（p25/p50/p75）…')
  const groups = {}
  for (const dim of ['si', 'ci', 'xi']) {
    groups[dim] = {}
    for (const [key, arr] of Object.entries(groupsAcc[dim])) {
      const vals = arr.filter((v) => typeof v === 'number').sort((a, b) => a - b)
      const distinct = new Set(vals).size
      const frozen = distinct <= 1 // 冻结组：全市场无分化（如催化 aspect 恒 1.0）→ 对齐 quantileThresholds 恒阴约定
      groups[dim][key] = {
        n: vals.length,
        coverage: Number((vals.length / rows.length).toFixed(4)),
        frozen,
        p25: frozen ? null : fmt(percentile(vals, 0.25)),
        p50: frozen ? null : fmt(percentile(vals, 0.5)),
        p75: frozen ? null : fmt(percentile(vals, 0.75)),
        min: vals.length ? fmt(vals[0]) : null,
        max: vals.length ? fmt(vals[vals.length - 1]) : null,
      }
      if (frozen) {
        console.warn(`  ⚠ 分组 ${dim}.${key} 全市场冻结（阳率恒 ${vals[0]}）→ 阈值置 Infinity（恒阴，消偏阳）`)
      } else if (!vals.length) {
        console.warn(`  ⚠ 分组 ${dim}.${key} 在本批 0 个有效阳率，基线不含此组`)
      }
    }
  }

  console.log('[4/4] 用 p50 阈值回验卦象空间覆盖…')
  // 只对有有效分位的宫建阈值；无分位的宫交给 hexagram.mjs 回落绝对 0.5
  const thresholds = {}
  for (const c of domainCodes) {
    if (typeof domains[c].p50 === 'number') thresholds[c] = domains[c].p50
  }
  const hexCount = {}
  for (const row of rows) {
    const hx = resolveHexagramForScript(
      Object.fromEntries(Object.entries(row.scores).map(([k, v]) => [k, typeof v === 'number' ? v : 0])),
      script0,
      thresholds,
    )
    row.hex = hx.name
    hexCount[hx.name] = (hexCount[hx.name] || 0) + 1
  }
  const distinct = Object.keys(hexCount).length
  const top = Object.entries(hexCount).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // 每爻阳率（满熵证据：p50 阈值下 6 个进卦爻应各≈50%）
  const order = buildOrderFromScript(script0)
  const yaoStats = []
  for (const pos of [...order.lower, ...order.upper]) {
    let yang = 0
    let n = 0
    for (const row of rows) {
      const v = row.scores[pos]
      if (typeof v !== 'number') continue
      n++
      if (v >= (thresholds[pos] != null ? thresholds[pos] : 0.5)) yang++
    }
    yaoStats.push({ domain: pos, n, yang, yang_ratio: n ? Number((yang / n).toFixed(4)) : null })
  }
  console.log('  每爻阳率（满熵目标 ≈0.5）：')
  for (const y of yaoStats) {
    console.log(`    ${y.domain}: ${(y.yang_ratio * 100).toFixed(1)}% (n=${y.n})`)
  }

  const out = {
    script_id: script0.script_id,
    generated_at: new Date().toISOString(),
    sample_size: rows.length,
    seed: SEED,
    quantile: 'p50（卦象编码默认阈值）',
    domains,
    groups,
    meta: {
      rules_note:
        '宫分口径与 tools/yijing/divine.mjs 的行情自动路径完全一致（adapters/stock-inputs.mjs 共享）；' +
          '爻义=「相对参照系偏强/偏弱」而非绝对 0.5',
      sector_proxy: '无板块标签：HY01 用大盘涨跌代理、HY08 不出信号（避免与 HG07 同源）',
      index_symbol: indexContext ? indexContext.symbol : null,
      mean_inputs_coverage: Number(
        (rows.reduce((s, r) => s + (r.coverage || 0), 0) / rows.length).toFixed(4),
      ),
      hexagram_distinct_in_sample: distinct,
      hexagram_top8: top,
      yao_yang_ratio: yaoStats,
      entropy_note: '每爻阳率越接近 0.5，该爻信息量越大（满熵）；偏离越大越接近冻结',
      disclaimer: '易学框架下的结构化研判，不构成投资建议',
    },
  }
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8')
  console.log(`\n基线已写入 ${OUT_FILE}`)
  console.log(
    `样本 ${rows.length} 只；平均 inputs 覆盖率 ${(out.meta.mean_inputs_coverage * 100).toFixed(1)}%；` +
      `p50 阈值下样本内卦象 ${distinct} 种（理论上限 64）`,
  )
  console.log(`Top 卦：${top.map(([k, v]) => `${k}×${v}`).join('、')}`)
  for (const [c, d] of Object.entries(domains)) {
    console.log(`  ${c}: p25=${disp(d.p25)} p50=${disp(d.p50)} p75=${disp(d.p75)} (n=${d.n}, coverage=${(d.coverage * 100).toFixed(0)}%)`)
  }
}

main().catch((e) => {
  console.error('校准失败：', e && (e.stack || e.message || e))
  process.exit(1)
})
