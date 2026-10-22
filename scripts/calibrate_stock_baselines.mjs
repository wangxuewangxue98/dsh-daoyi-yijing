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
//   node scripts/calibrate_stock_baselines.mjs --n 400 --fine-map --script stock-trend-v2 \
//        --out lib/yijing/baselines-stock-v2-semantic.json --ci-grouping semantic
//   node scripts/calibrate_stock_baselines.mjs --n 60 --days 5 --fine-map --script stock-trend-v2 \
//        --out lib/yijing/baselines-stock-v2-d5.json          # F-6 多日滚动校准
// 网络失败时退出码非 0（不写半截基线）。
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'
import { buildStockTrendV2Script } from '../lib/yijing/scripts/stock-trend-v2.mjs'
import { evaluateDeterministic } from '../lib/yijing/reviewer.mjs'
import { resolveHexagramForScript, buildOrderFromScript } from '../lib/yijing/hexagram.mjs'
import { parseCp, resolveQuadHexagram } from '../lib/yijing/quad-hexagram.mjs'
import { familyOf, familyOfV2 } from '../lib/yijing/subfamily-map.mjs'
import { FINE_MAP, assertFineMapConsistency } from '../lib/yijing/subdomain-fine-map.mjs'
import { fetchQuotes, quoteToSignals, createCurlFetcher } from '../adapters/quote.mjs'
import { fetchDailyKlinesBatch, daysToSnapshots } from '../adapters/quote-history.mjs'
import { buildStockInputs, signalsToInputs, signalsToInputsV2 } from '../adapters/stock-inputs.mjs'
import { capBand, pctBand, stratumOfQuote } from '../lib/yijing/baselines.mjs'

// 与 checkpoints.mjs buildStockScript 的 ASPECTS 严格一致（ci→aspect 名，供 familyOf 使用）
const ASPECTS = ['强度', '持续性', '确定性', '边际变化', '安全边际', '催化']
const aspectNameOf = (id) => ASPECTS[Number(id.slice(4, 6)) - 1] || null
const stratumOf = stratumOfQuote // 分层带定义单一事实源（baselines.mjs，调用同源）

// ── 参数 ──
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const hasFlag = (name) => process.argv.includes(`--${name}`)
const N_TARGET = Number(argOf('n', 400))
const SEED = Number(argOf('seed', 20261022))
// S2/S4：--script stock-trend-v2 校准 1296 剧本（分组维度 = 分域位/子域位/aspect 位，8 位 id）
const SCRIPT_ID = argOf('script', 'stock-trend')
const IS_V2 = SCRIPT_ID === 'stock-trend-v2'
// P2（v0.8.1）：--fine-map 用规则→子域名精映射构建 inputs（与 divine.mjs 默认同口径）；
//   不加则回落 L2 分域粒度铺开。两种粒度的基线不可混用——运行期用什么粒度校准就用什么粒度。
const USE_FINE_MAP = hasFlag('fine-map')
if (USE_FINE_MAP && !IS_V2) {
  console.error('--fine-map 仅对 --script stock-trend-v2 有意义（384 剧本本就是子域粒度）')
  process.exit(1)
}
// F-6（v0.9.0）：--days N 多日滚动校准（同一批标的取最近 N 个交易日快照，层样本量提升一个量级）。
//   N=1（默认）= 单日横截面，行为与 v0.8.x 完全一致。历史源失败 → 该只只落实时快照并计入 kline 统计。
const DAYS = Math.max(1, Number(argOf('days', 1)) || 1)
// F-9（v0.9.0）：--ci-grouping semantic 按业务族语义分族校准卦③（需配同口径基线文件，见 OUT_FILE 说明）
const CI_GROUPING = argOf('ci-grouping', 'position') === 'semantic' ? 'semantic' : 'position'
if (CI_GROUPING === 'semantic' && !IS_V2) {
  console.error('--ci-grouping semantic 仅对 --script stock-trend-v2 有意义（384 的卦③本就是业务族口径）')
  process.exit(1)
}
const OUT_FILE = IS_V2
  ? argOf(
      'out',
      fileURLToPath(
        new URL(
          // 语义分族口径的 ci 阈值与位置分组不同源 → 默认落独立文件，杜绝两种口径混用后阈值错配
          CI_GROUPING === 'semantic'
            ? '../lib/yijing/baselines-stock-v2-semantic.json'
            : '../lib/yijing/baselines-stock-v2.json',
          import.meta.url,
        ),
      ),
    )
  : argOf('out', fileURLToPath(new URL('../lib/yijing/baselines-stock.json', import.meta.url)))
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
  console.log(`[2/4] 有效行情 ${codes.length} 只，分层配额抽样（市值带×涨跌带）后逐只推演…`)

  // v0.7.1 分层抽样：非空层按配额比例分配 N_TARGET（每层至少 1 只），避免随机撒样的层间过采样
  const rndPick = mulberry32(SEED ^ 0x9e3779b9)
  const strataMap = new Map()
  for (const c of codes) {
    const s = stratumOf(quotes.get(c))
    if (!strataMap.has(s)) strataMap.set(s, [])
    strataMap.get(s).push(c)
  }
  const nTarget = Math.min(N_TARGET, codes.length)
  const selected = []
  const quotaInfo = []
  for (const [s, arr] of strataMap) {
    // 随机打乱层内顺序（确定性种子）
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rndPick() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    const quota = Math.max(1, Math.round((arr.length / codes.length) * nTarget))
    quotaInfo.push({ stratum: s, available: arr.length, quota })
    selected.push(...arr.slice(0, quota))
  }
  // 超预算则确定性裁剪（保每层 ≥1）；欠预算则从余量回补
  if (selected.length > nTarget) {
    // 先从超出配额可用量最多的层尾裁
    selected.length = nTarget
  } else if (selected.length < nTarget) {
    const chosen = new Set(selected)
    for (const c of codes) {
      if (selected.length >= nTarget) break
      if (!chosen.has(c)) {
        selected.push(c)
        chosen.add(c)
      }
    }
  }
  console.log(
    `  分层 ${strataMap.size} 层，配额抽样 ${selected.length} 只（` +
      quotaInfo
        .slice()
        .sort((a, b) => b.available - a.available)
        .slice(0, 5)
        .map((x) => `${x.stratum}:${x.quota}/${x.available}`)
        .join('，') +
      (strataMap.size > 5 ? '…' : '') +
      `）`,
  )
  codes.length = 0
  codes.push(...selected)

  // ── F-6（v0.9.0）：多日滚动样本（--days N）──
  // 层样本量不足（单日 400 → 15 层里 8 层 n<20）的根治办法是沿时间轴滚动：同一批标的取最近
  // N 个交易日快照重放。历史源取不到 → 该只只保留其实时快照（不虚构历史），并计入 kline 统计。
  const samples = [] // [{code, quote, date|null}]
  let klineStat = { days: DAYS, requested: 0, ok: 0, failed: 0, snapshots: 0, errors: [] }
  if (DAYS > 1) {
    process.stdout.write(`  多日滚动：拉 ${selected.length} 只日 K（最近 ${DAYS + 1} 根）…`)
    const hist = await fetchDailyKlinesBatch(selected, {
      count: DAYS + 1,
      ...(CURL_PROXY ? { fetcher: createCurlFetcher({ proxy: CURL_PROXY, timeoutMs: 12000 }) } : {}),
    })
    klineStat = {
      days: DAYS,
      requested: selected.length,
      ok: hist.fetched,
      failed: hist.failed,
      snapshots: 0,
      errors: hist.errors,
    }
    for (const code of selected) {
      const base = quotes.get(code)
      // 历史日取「除最后一根以外的」最近 DAYS-1 天：最后一根通常就是当日收盘，已由实时快照覆盖，
      // 避免同一天被计两次；实时快照字段全（PE/PB/换手/成交额），历史日只有收盘与涨跌。
      const snaps = daysToSnapshots(base, (hist.byCode.get(code) || []).slice(0, -1), DAYS - 1)
      if (snaps.length) {
        for (const s of snaps) samples.push({ code, quote: s, date: s.date })
        klineStat.snapshots += snaps.length
      }
      samples.push({ code, quote: base, date: null }) // 当日实时快照（字段最全）
    }
    console.log(
      `\r  日 K 成功 ${hist.fetched}/${selected.length} 只 → 滚动样本 ${samples.length} 条` +
        `（单日基线为 ${selected.length} 只；失败示例 ${hist.errors.slice(0, 3).join(',') || '无'}）`,
    )
  } else {
    for (const code of selected) samples.push({ code, quote: quotes.get(code), date: null })
  }

  // 指数上下文一次（与 divine 路径同口径）
  const ctx = await buildStockInputs(codes.slice(0, 1))
  const indexContext = ctx.meta.indexContext
  if (!indexContext) {
    console.error(`⚠ 指数上下文获取失败（indexError=${ctx.meta.indexError}）→ HY01/HY04 无 sectorPct 将全部 NA，基线缺 HY 宫`)
    console.error('  这会让「单只股票触达 64 卦」的上卦少一位爻；请检查网络/代理后重跑')
  } else {
    console.log(`  指数基准：${indexContext.name}(${indexContext.symbol}) 涨跌 ${indexContext.pct}%`)
  }

  const script0 = IS_V2 ? buildStockTrendV2Script() : buildStockScript()
  // P2 自检：精映射与 MIGRATION_MAP 分域归属必须一致（不一致则基线无效）
  if (USE_FINE_MAP) {
    const chk = assertFineMapConsistency(script0.migrated_from.mapping, script0.domains)
    if (chk.mismatches.length || chk.outOfRange.length) {
      console.error(`FINE_MAP 自检失败：${JSON.stringify(chk)}`)
      process.exit(1)
    }
    console.log(`  P2 精映射自检通过（${chk.total} 条）`)
  }
  const db = buildCheckpointDatabase(script0)
  const migrationMap = script0.migrated_from ? script0.migrated_from.mapping : {}
  const buildInputsFor = (q) => {
    const sigs = quoteToSignals(q, {
      sectorPct: indexContext && Number.isFinite(indexContext.pct) ? indexContext.pct : undefined,
      sectorAmountWan: undefined,
      indexCtx: indexContext,
    })
    // v2：384 形态信号经迁移映射填 36 分域（L2 粒度）；--fine-map 时精映射到分域×子域位（P2）。384：原子域口径
    return IS_V2
      ? signalsToInputsV2(sigs, db, migrationMap, USE_FINE_MAP ? FINE_MAP : null)
      : signalsToInputs(sigs, db)
  }
  // 分组基线累加器（si 子域位 / ci 业务族 / xi aspect）：跨股票收集「每只股票每组阳率」
  // groupsAccStratum：同口径按 stratum 分层收集（v0.7.2 按层阈值）
  const groupsAcc = { si: {}, ci: {}, xi: {} }
  const groupsAccStratum = {}
  const rows = []
  for (let i = 0; i < samples.length; i++) {
    const { code, quote: q, date } = samples[i]
    const built = buildInputsFor(q)
    const script = { ...script0, na: { domains: [], checkpoints: built.naIds } }
    // 确定性推演（不调 LLM：校准只求宫分分布，避免数百次撞免费 LLM 速率闸）；返回逐检查点阴阳用于分组基线
    const r = evaluateDeterministic(script, {
      inputs: built.inputs,
      returnEvaluations: true,
      ciGrouping: CI_GROUPING, // F-9：卦③分组口径必须与基线文件口径一致
    })
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
      if (IS_V2) {
        // 1296：si=分域位 / ci=子域位 / xi=aspect 位（id 位次原生 1-6）
        const { si, ci, xi } = parseCp(cp.id)
        if (si >= 1 && si <= 6) acc('si', String(si), y)
        // F-9：semantic 口径按业务族（36 分域 → 六族）分组，与 quad-hexagram 的 ciGrouping 同源
        if (CI_GROUPING === 'semantic') {
          const f = familyOfV2(cp.id.slice(0, 4))
          if (f) acc('ci', f, y)
        } else if (ci >= 1 && ci <= 6) acc('ci', String(ci), y)
        if (xi >= 1 && xi <= 6) acc('xi', String(xi), y)
      } else {
        const { di, si, ci } = parseCp(cp.id)
        if (si >= 1 && si <= 6) acc('si', String(si), y)
        acc('ci', familyOf(di, aspectNameOf(cp.id)), y)
        if (ci >= 1 && ci <= 6) acc('xi', String(ci), y)
      }
    }
    for (const dim of ['si', 'ci', 'xi']) {
      for (const [k, v] of Object.entries(perStock[dim])) {
        const rate = v.c ? v.s / v.c : null
        ;(groupsAcc[dim][k] ||= []).push(rate)
        const byS = (groupsAccStratum[stratumOf(q)] ||= { si: {}, ci: {}, xi: {} })
        ;(byS[dim][k] ||= []).push(rate)
      }
    }
    rows.push({
      code,
      date: date || null, // F-6：多日滚动样本的交易日（实时快照为 null）
      name: q.name,
      stratum: stratumOf(q),
      scores: scores8,
      coverage: r.inputs_coverage ? r.inputs_coverage.coverage : null,
      // data_density：填充数 / 全量检查点（1296 或 384）——inputs_coverage 的分母已剔除 na，
      // 报价路径下 na=未填充 → coverage 恒 100% 具误导性；density 才是真实数据丰度（P2 关键指标）。
      data_density: (db.checkpoints.length - built.naIds.length) / db.checkpoints.length,
      hex: null,
    })
    if ((i + 1) % 50 === 0) process.stdout.write(`  已推演 ${i + 1}/${samples.length}\n`)
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

  // v0.7.2 分层阈值 cells（按层参照系）：每层域阈值 + 分组阈值；n<20 的层不产出（调用方回落总体）
  const strataCells = {}
  for (const s of [...new Set(rows.map((r) => r.stratum))]) {
    const sub = rows.filter((r) => r.stratum === s)
    const acc = groupsAccStratum[s] || { si: {}, ci: {}, xi: {} }
    const domain_thresholds = {}
    for (const c of domainCodes) {
      const vals = sub.map((r) => r.scores[c]).filter((v) => typeof v === 'number').sort((a, b) => a - b)
      if (vals.length >= 5) domain_thresholds[c] = fmt(percentile(vals, 0.5))
    }
    const group_thresholds = {}
    for (const dim of ['si', 'ci', 'xi']) {
      group_thresholds[dim] = {}
      for (const [key, arr] of Object.entries(acc[dim])) {
        const vals = arr.filter((v) => typeof v === 'number').sort((a, b) => a - b)
        const distinct = new Set(vals).size
        const frozen = distinct <= 1
        group_thresholds[dim][key] = frozen
          ? { frozen: true, n: vals.length }
          : {
              n: vals.length,
              p25: fmt(percentile(vals, 0.25)),
              p50: fmt(percentile(vals, 0.5)),
              p75: fmt(percentile(vals, 0.75)),
            }
      }
    }
    // F-6：层内样本量置信度（n>=20 才产出可用阈值；否则调用方 baselinesForStratum 回落总体）
    strataCells[s] = { n: sub.length, sufficient: sub.length >= 20, domain_thresholds, group_thresholds }
  }
  // 分层审计：各层宫分 p50 与总体的偏离（跨层极差；越小说明总体阈值对各层代表越均衡）
  const strataP50 = {}
  for (const [s, cell] of Object.entries(strataCells)) {
    strataP50[s] = { n: cell.n, domain_p50: { ...cell.domain_thresholds } }
  }
  const spread = {}
  for (const c of domainCodes) {
    const ps = Object.values(strataP50)
      .map((x) => x.domain_p50[c])
      .filter((v) => typeof v === 'number')
    if (ps.length >= 2) spread[c] = Number((Math.max(...ps) - Math.min(...ps)).toFixed(4))
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

  // v0.7.1 四连卦分组基线回验：基线定稿后二遍确定性推演（无网络开销），统计四卦卦种数
  console.log('[4b] 四连卦分组基线回验（二遍推演，统计 di/si/ci/xi 卦种）…')
  const baselinesForQuad = { script_id: script0.script_id, domains, groups }
  const quadCount = { hex_di: {}, hex_si: {}, hex_ci: {}, hex_xi: {} }
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    // F-6：多日样本要按该行自己的快照回放（rows 与 samples 同序），不能一律用实时快照
    const q = samples[ri] ? samples[ri].quote : quotes.get(row.code)
    const built = buildInputsFor(q)
    const script = { ...script0, na: { domains: [], checkpoints: built.naIds } }
    const r2 = evaluateDeterministic(script, {
      inputs: built.inputs,
      returnEvaluations: true,
      ciGrouping: CI_GROUPING,
    })
    // ⚠ 必须用「带 NA 标记」的 db：quad-hexagram 按 cp.na 跳过 NA 检查点，
    //   无标记 db 会把 NA 当阴计入分组阳率（实测令 si/ci/xi 卦种坍缩到 2 种）。
    //   evaluateDeterministic 内部自建 db（带 na），这里取其逐检查点 evaluations 回放。
    const dbNa = buildCheckpointDatabase(script)
    const evalsMap = new Map(Object.entries(r2.evaluations || {}))
    const quad = resolveQuadHexagram(
      dbNa,
      evalsMap,
      script,
      baselinesForQuad,
      { domain_results: r2.domain_results },
      // F-9：回验口径必须与校准口径一致（semantic/position），否则卦③统计失真
      { ciGrouping: CI_GROUPING, thresholdBasis: 'baseline' },
    )
    if (!quad) continue
    for (const k of Object.keys(quadCount)) {
      const nm = quad.hexes[k].name
      quadCount[k][nm] = (quadCount[k][nm] || 0) + 1
    }
  }
  const quadDistinct = Object.fromEntries(
    Object.entries(quadCount).map(([k, m]) => [k, Object.keys(m).length]),
  )
  console.log(
    `  四卦卦种：${Object.entries(quadDistinct)
      .map(([k, v]) => `${k} ${v}`)
      .join(' / ')}（理论上限 64）`,
  )

  const out = {
    script_id: script0.script_id,
    generated_at: new Date().toISOString(),
    sample_size: rows.length,
    seed: SEED,
    quantile: 'p50（卦象编码默认阈值）',
    domains,
    groups,
    strata: {
      definition:
        '市值带(<50/50-200/200-1000/>1000亿)×涨跌带(≤-2/-2~0/0~2/≥2%)；层内 n<20 不产出阈值（调用方 baselinesForStratum 回落总体）',
      cells: strataCells,
    },
    meta: {
      rules_note:
        '宫分口径与 tools/yijing/divine.mjs 的行情自动路径完全一致（adapters/stock-inputs.mjs 共享）；' +
          '爻义=「相对参照系偏强/偏弱」而非绝对 0.5',
      inputs_granularity: IS_V2 ? (USE_FINE_MAP ? 'subdomain（P2 规则→子域名精映射）' : 'L2（分域粒度铺开）') : 'subdomain（384 原子域）',
      // F-6 / F-9（v0.9.0）：样本结构与分组口径显式化
      calibration: {
        days: DAYS,
        rows: rows.length,
        unique_codes: new Set(rows.map((r) => r.code)).size,
        kline: klineStat,
        ci_grouping: CI_GROUPING,
        index_context: DAYS > 1 ? 'realtime-for-all-days（历史每日的指数基准未回溯，HY01 代理沿用实时大盘）' : 'realtime',
        note:
          DAYS > 1
            ? '多日滚动：同一批标的最近 N 个交易日快照重放；层样本量 ≈ 单日 × N（受停牌/上市时长限制）'
            : '单日横截面（v0.8.x 口径）',
      },
      sector_proxy: '无板块标签：HY01 用大盘涨跌代理、HY08 不出信号（避免与 HG07 同源）',
      index_symbol: indexContext ? indexContext.symbol : null,
      mean_inputs_coverage: Number(
        (rows.reduce((s, r) => s + (r.coverage || 0), 0) / rows.length).toFixed(4),
      ),
      mean_data_density: Number(
        (rows.reduce((s, r) => s + (r.data_density || 0), 0) / rows.length).toFixed(4),
      ),
      data_density_note:
        '填充检查点数 / 全量检查点数（P2 下行情规则只覆盖部分「分域×子域」，其余诚实 NA；' +
        'inputs_coverage 因分母剔除 na 恒 100%，以 density 为准）',
      hexagram_distinct_in_sample: distinct,
      hexagram_top8: top,
      quad_distinct_in_sample: quadDistinct,
      strata: {
        definition: '市值带(<50/50-200/200-1000/>1000亿)×涨跌带(≤-2/-2~0/0~2/≥2%)，非空层配额抽样；按层阈值见顶层 strata.cells（n<20 不产出）',
        cells: strataCells.size,
        per_stratum: strataP50,
        domain_p50_spread_across_strata: spread,
        spread_note: '各层宫分 p50 的极差；越大越需要按层阈值（v0.7.2 已落地顶层 strata.cells）',
      },
      yao_yang_ratio: yaoStats,
      entropy_note: '每爻阳率越接近 0.5，该爻信息量越大（满熵）；偏离越大越接近冻结',
      disclaimer: '易学框架下的结构化研判，不构成投资建议',
    },
  }
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8')
  console.log(`\n基线已写入 ${OUT_FILE}`)
  // F-6 诚实告警：历史日快照只有「收盘价 + 涨跌幅」（PE/PB/换手/成交额等实时字段不可回溯），
  //   多日模式是**用单样本字段变少换层样本量变多**，四卦分化可能不升反降。
  //   生产建议：按日持久化实时快照（cron 落库），滚动校准应基于「全字段历史」而非 kline 回放。
  if (DAYS > 1 && out.meta.mean_data_density < 0.06) {
    console.warn(
      `  ⚠ 多日模式数据丰度仅 ${(out.meta.mean_data_density * 100).toFixed(1)}%（历史日只有收盘/涨跌）——` +
        `层样本量提升但单样本信息量下降；四卦分组基线建议仍以全字段快照校准`,
    )
  }
  console.log(
    `样本 ${rows.length} 只；平均 inputs 覆盖率 ${(out.meta.mean_inputs_coverage * 100).toFixed(1)}%；` +
      `平均数据丰度 density ${(out.meta.mean_data_density * 100).toFixed(1)}%；` +
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
