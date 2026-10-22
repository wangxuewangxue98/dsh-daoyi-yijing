// test_v091_features.mjs — v0.9.1 专项：P0 启动崩溃修复 / S-5 / S-6 / N-1 / N-2 / N-3 / P1 卦象分歧深度解读
import { aggregate, SWING_BAND_DEFAULT } from '../lib/yijing/aggregator.mjs'
import { evaluateDeterministic } from '../lib/yijing/reviewer.mjs'
import {
  resolveQuadHexagram,
  quadText,
} from '../lib/yijing/quad-hexagram.mjs'
import { baselineMetaOf, loadBaselines } from '../lib/yijing/baselines.mjs'
import {
  resolveDivergence,
  classifyDivergence,
  fragileYaos,
  divergenceText,
  enhanceDivergenceReading,
} from '../lib/yijing/quad-divergence.mjs'
import {
  resolveCloudSettings,
  buildSessionCloudConfig,
  safeContextService,
  providerAllowsSessionTakeover,
  resolveSessionInjection,
} from '../lib/yijing/cloud-model.mjs'

let pass = 0
let fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log(`PASS ${msg}`)
  } else {
    fail++
    console.log(`FAIL ${msg}`)
  }
}
const section = (t) => console.log(`\n── ${t} ──`)

// ──────── 合成数据库（控制域分，用于 N-3 贴线判定）────────
function mkDb(yangPer100) {
  const DOMS = ['JS', 'ZJ', 'XX', 'FX', 'JB', 'HY', 'GZ', 'HG']
  const checkpoints = []
  const domainIndex = {}
  const subdomainIndex = {}
  for (const d of DOMS) {
    const sdKey = `${d}-1`
    const checks = []
    for (let i = 1; i <= 100; i++) {
      const id = `${d}01${String(i).padStart(2, '0')}`
      checkpoints.push({ id, domain: d, weight: 1, na: false, is_strong: false, subdomain: sdKey })
      checks.push(id)
    }
    subdomainIndex[sdKey] = { key: sdKey, code: d, bagua: '乾', name: `${d}子域`, checks }
    domainIndex[d] = { code: d, name: `${d}宫`, bagua: '乾', subdomains: [sdKey] }
  }
  return {
    checkpoints,
    domainIndex,
    subdomainIndex,
    sancai_mapping: { tian: ['JS', 'ZJ', 'XX'], di: ['FX', 'JB', 'HY'], ren: ['GZ', 'HG'] },
    vetoPolicy: { mode: 'any' },
  }
}
function mkEvals(db, yangPer100) {
  const m = new Map()
  let n = 0
  for (const cp of db.checkpoints) {
    const idx = n % 100
    n++
    m.set(cp.id, { value: 0.5, yinYang: idx < yangPer100 ? 1 : -1, pass: idx < yangPer100 })
  }
  return m
}

// ══════════ N-3：贴线摇摆（此前完全无引擎级信号）══════════
section('N-3 贴线摇摆：margin=0.0602 这类贴线必须被标出')
{
  const db = mkDb(69) // 每域 0.69 → 综合 0.69 → margin = 0.75-0.69 = 0.06
  const agg = aggregate(db, mkEvals(db, 69))
  ok(Math.abs(agg.overall_score - 0.69) < 0.001, `综合分=0.69（实际 ${agg.overall_score}）`)
  ok(Math.abs(agg.verdict_margin - 0.06) < 0.001, `margin=0.06（实际 ${agg.verdict_margin}）← 复现民生银行 0.0602 量级`)
  ok(agg.verdict_swing && agg.verdict_swing.borderline === true, `贴线被标出（borderline=${agg.verdict_swing && agg.verdict_swing.borderline}）`)
  ok(agg.verdict_swing.band === SWING_BAND_DEFAULT, `默认带宽 ${SWING_BAND_DEFAULT}（实际 ${agg.verdict_swing.band}）`)
  ok(agg.verdict_swing.side === 'below', `方向 below（距可行线还差，实际 ${agg.verdict_swing.side}）`)
  ok(String(agg.verdict_swing.note).includes('贴决定线'), `带可读说明：${String(agg.verdict_swing.note).slice(0, 30)}…`)
  ok(agg.veto_score_conflict === false, '未否决 → 骑墙为 false（两信号正交，不混淆）')

  // 对照：0.60 → margin 0.15 > 0.08 → 不摇摆
  const db2 = mkDb(60)
  const agg2 = aggregate(db2, mkEvals(db2, 60))
  ok(agg2.verdict_swing.borderline === false, `margin=0.15 不判摇摆（实际 ${agg2.verdict_margin}）`)

  // 自定义带宽 / 关闭
  const db3 = mkDb(69)
  ok(aggregate(db3, mkEvals(db3, 69), { swingBand: 0.03 }).verdict_swing.borderline === false, 'swingBand=0.03 → 0.06 不算贴线')
  ok(aggregate(db3, mkEvals(db3, 69), { swingBand: 0 }).verdict_swing.borderline === false, 'swingBand=0 → 关闭摇摆判定')
}

// ══════════ N-1：absolute 口径生产护栏 ══════════
section('N-1 absolute 口径护栏')
{
  const script = { script_id: 'stock-trend' }
  const r = evaluateDeterministic('stock-trend', { inputs: {}, thresholdBasis: 'absolute' })
  const st = r.quad_hexagram && r.quad_hexagram.structure
  ok(st && st.basis_guard, '输出带 basis_guard 字段')
  ok(st.basis_guard.basis === 'absolute', `basis=absolute（实际 ${st.basis_guard && st.basis_guard.basis}）`)
  ok(st.basis_guard.guarded === true, `未显式确认 → guarded=true（实际 ${st.basis_guard && st.basis_guard.guarded}）`)
  ok(String(st.basis_guard.note).includes('不得作为决策判据'), `告警文案含禁用作决策：${String(st.basis_guard.note).slice(0, 24)}…`)
  const txt = quadText(r.quad_hexagram)
  ok(txt.includes('口径护栏'), 'quadText 打印 ⚠ 口径护栏行（不可被忽略）')

  const r2 = evaluateDeterministic('stock-trend', { inputs: {}, thresholdBasis: 'absolute', allowAbsoluteBasis: true })
  const st2 = r2.quad_hexagram.structure
  ok(st2.basis_guard.guarded === false, '显式确认（allowAbsoluteBasis）→ guarded=false')
  ok(String(st2.basis_guard.note).includes('显式确认'), `note=${String(st2.basis_guard.note).slice(0, 20)}…`)

  const r3 = evaluateDeterministic('stock-trend', { inputs: {}, thresholdBasis: 'baseline' })
  ok(r3.quad_hexagram.structure.basis_guard.guarded === false, 'baseline 口径不告警')
}

// ══════════ N-2：基线版本提示 ══════════
section('N-2 基线版本提示（跨机器结果可归因）')
{
  const b = loadBaselines('stock-trend')
  const meta = baselineMetaOf(b, {})
  ok(meta.present === true, `基线存在（present=${meta.present}）`)
  ok(Boolean(meta.script_id), `带 script_id=${meta.script_id}`)
  ok(Boolean(meta.generated_at), `带 generated_at=${meta.generated_at}`)
  ok(meta.age_days != null, `带 age_days=${meta.age_days}`)
  ok(meta.sample_size != null, `带 sample_size=${meta.sample_size}`)
  ok(meta.engine_version === '' || /^\d+\.\d+\.\d+/.test(String(meta.engine_version)), `带引擎版本 v${meta.engine_version}`)
  ok(typeof meta.stale === 'boolean', `带 stale 判定（${meta.stale}，阈值 ${meta.stale_days} 天）`)

  const none = baselineMetaOf(null, {})
  ok(none.present === false && String(none.note).includes('回落绝对 0.5'), '无基线 → 明确说明回落 absolute 0.5')

  // 过期判定：now 推后 400 天
  const stale = baselineMetaOf(b, { now: Date.now() + 400 * 86400000 })
  ok(stale.stale === true, `400 天后判定过期（stale=${stale.stale}）`)

  const r = evaluateDeterministic('stock-trend', { inputs: {} })
  ok(Boolean(r.quad_hexagram.structure.baseline), '四连卦 structure 带 baseline 画像')
  const txt = quadText(r.quad_hexagram)
  ok(txt.includes('基线版本'), 'quadText 打印基线版本行')
}

// ══════════ P1：卦象分歧深度解读 ══════════
section('P1 卦象分歧深度解读')
{
  const r = evaluateDeterministic('stock-trend', { inputs: {} })
  const quad = r.quad_hexagram
  const div = quad.consistency && quad.consistency.divergence
  ok(Boolean(div), '四连卦输出带 divergence 解读对象')
  ok(typeof div.pattern === 'string' && div.pattern.length > 0, `形态归类=${div.pattern}`)
  ok(Boolean(div.pattern_label) && Boolean(div.pattern_desc), `形态名/释义：${div.pattern_label}`)
  ok(['high', 'medium', 'low'].includes(div.severity), `严重度=${div.severity}`)
  ok(div.base === 'hex_di', `基准卦=卦①域卦（实际 ${div.base}）`)
  ok(Boolean(div.base_name), `基准卦名=${div.base_name}`)
  ok(div.yang_map && Object.keys(div.yang_map).length === 4, `四卦阳数齐全：${JSON.stringify(div.yang_map)}`)
  ok(typeof div.yang_spread === 'number', `阳爻极差=${div.yang_spread}`)
  ok(Array.isArray(div.fragile_yaos) && div.fragile_yaos.length > 0, `敏感爻 ${div.fragile_yaos.length} 个（最易翻面）`)
  const fr = div.fragile_yaos[0]
  ok(fr && typeof fr.gap === 'number' && fr.abs_gap != null, `最敏感爻 ${fr && fr.label}：值 ${fr && fr.value} vs 阈 ${fr && fr.threshold}`)
  ok(typeof div.reading === 'string' && div.reading.length > 50, `成段解读 ${String(div.reading).length} 字`)
  ok(div.reading_source === 'deterministic', `默认确定性解读（source=${div.reading_source}）`)
  ok(Array.isArray(div.focus) && div.focus.length > 0, `人工复核焦点 ${div.focus.length} 条`)

  // 敏感爻排序必须是「距阈值最近」在前
  const gaps = div.fragile_yaos.map((f) => f.abs_gap)
  ok(gaps.every((g, i) => i === 0 || g >= gaps[i - 1]), `敏感爻按 |gap| 升序（${gaps.join(' ≤ ')}）`)

  // 文本渲染
  const lines = divergenceText(div)
  ok(Array.isArray(lines) && lines.length >= 3, `divergenceText 输出 ${lines.length} 行`)
  ok(lines.some((l) => l.includes('分歧解读') || l.includes('卦象一致')), '文本含解读标题')
  const qt = quadText(quad)
  ok(qt.includes('【分歧解读】') || qt.includes('卦象一致'), 'quadText 已并入深度解读')

  // 分歧/一致两种形态都能产出解读
  ok(String(div.reading).length > 0, '无论分歧与否都有解读（不返回空）')
}

section('P1 形态归类规则（确定性，覆盖五种形态）')
{
  const mkHex = (name, yang, tone, groups = []) => ({
    name, yang, tone, yaos: [], judgment: '判', advice: '议', groups,
    label: '域卦', desc: '', coverage: { perHex: 384, covered: 384, na: 0 }, degraded: false,
  })
  const G = (key, value, threshold) => ({ key, label: String(key), covered: 10, value, threshold, yang: value >= threshold ? 1 : 0 })

  // 同象
  const same = { hex_di: mkHex('乾为天', 6, 'auspicious'), hex_si: mkHex('乾为天', 6, 'auspicious'), hex_ci: mkHex('乾为天', 6, 'auspicious'), hex_xi: mkHex('乾为天', 6, 'auspicious') }
  ok(classifyDivergence(same, { consensus: true }).pattern === 'uniform', '四卦同名 → uniform')

  // 吉凶对峙
  const pol = { hex_di: mkHex('乾为天', 6, 'auspicious'), hex_si: mkHex('坎为水', 0, 'ominous'), hex_ci: mkHex('乾为天', 6, 'auspicious'), hex_xi: mkHex('地雷复', 4, 'auspicious') }
  const c1 = classifyDivergence(pol, { consensus: false })
  ok(c1.pattern === 'polarized', `有吉有凶 → polarized（实际 ${c1.pattern}）`)
  ok(c1.severity === 'high', `对峙严重度 high（实际 ${c1.severity}）`)

  // 上强下弱
  const top = { hex_di: mkHex('乾为天', 6, 'auspicious'), hex_si: mkHex('山水蒙', 1, 'neutral'), hex_ci: mkHex('水雷屯', 1, 'neutral'), hex_xi: mkHex('地水师', 2, 'neutral') }
  const c2 = classifyDivergence(top, { consensus: false })
  ok(c2.pattern === 'top-heavy', `域强执行弱 → top-heavy（实际 ${c2.pattern}）`)

  // 下强上弱
  const bot = { hex_di: mkHex('坎为水', 1, 'neutral'), hex_si: mkHex('乾为天', 6, 'auspicious'), hex_ci: mkHex('乾为天', 5, 'auspicious'), hex_xi: mkHex('地天泰', 5, 'auspicious') }
  const c3 = classifyDivergence(bot, { consensus: false })
  ok(c3.pattern === 'bottom-heavy', `域弱执行强 → bottom-heavy（实际 ${c3.pattern}）`)

  // 敏感爻提取
  const hexes = {
    hex_di: mkHex('乾为天', 6, 'auspicious', [G('JS', 0.9, 0.5), G('ZJ', 0.51, 0.5)]),
    hex_si: mkHex('坤为地', 0, 'ominous', [G(1, 0.5002, 0.5)]),
    hex_ci: mkHex('水雷屯', 2, 'neutral', [G('L', 0.2, 0.5)]),
    hex_xi: mkHex('地水师', 3, 'neutral', [G(1, 0.8, 0.5)]),
  }
  const fr = fragileYaos(hexes, 2)
  ok(fr.length === 2 && fr[0].abs_gap === 0.0002, `最贴阈值的爻排第一（gap=${fr[0].gap}）`)
  ok(fr[0].dim === 'hex_si' && fr[0].label === '1', `定位到具体卦与爻（${fr[0].dim}·${fr[0].label}）`)
}

section('P1 LLM 扩写（可选，防幻觉：失败则保留确定性解读）')
{
  const r = evaluateDeterministic('stock-trend', { inputs: {} })
  const div = r.quad_hexagram.consistency.divergence
  // 离线（无云模型）→ 原样返回，不报错
  const offline = await enhanceDivergenceReading(div, r.quad_hexagram, { config: {} })
  ok(offline === div || offline.reading_source === 'deterministic', '无云模型 → 保留确定性解读，不抛错')

  // 有会话模型 → 扩写
  const cfg = {
    cloudModelEnabled: true,
    cloudModelAutoSession: true,
    cloudModelProvider: 'deepseek',
    sessionModel: () =>
      '【LLM 扩写】四卦分歧源于域层与执行层的口径差异：域卦取八宫加权分，而子域卦取原始阳率，' +
      '两者对同一批证据的敏感度不同。应以域卦定方向，子域卦仅用于校验执行环节是否失真。',
  }
  const enhanced = await enhanceDivergenceReading(div, r.quad_hexagram, { config: cfg, matter: '测试', verdict: r.verdict, score: r.overall_score })
  if (div.divergent) {
    ok(enhanced.reading_source === 'llm', `LLM 扩写生效（source=${enhanced.reading_source}）`)
    ok(String(enhanced.reading).includes('LLM 扩写'), 'reading 被替换为云模型文案')
    ok(Boolean(enhanced.reading_template), '保留确定性原文（reading_template）备查')
  } else {
    ok(enhanced.reading_source === 'deterministic', '未分歧 → 不调用 LLM（无谓开销）')
  }

  // 模型返回垃圾 → 保留确定性
  const junk = { ...cfg, sessionModel: () => '   ' }
  const kept = await enhanceDivergenceReading(div, r.quad_hexagram, { config: junk })
  ok(kept.reading === div.reading, '模型返回空/过短 → 原样保留（防幻觉兜底）')
}

// ══════════ P0 / S-5 / S-6 回归（详细用例在 test_session_activation.mjs）══════════
section('P0/S-5/S-6 收敛校验')
{
  // 守卫 ctx：无 sessionModel 服务、有 llm 服务
  const llm = { chat: () => 'ok' }
  const guarded = new Proxy(
    { get: (n) => (n === 'llm' ? llm : undefined) },
    {
      get(t, p) {
        if (p === 'get') return t.get
        if (typeof p === 'string' && p !== 'then') throw new Error(`cannot get property "${p}" without inject`)
        return undefined
      },
    },
  )
  let threw = false
  try {
    resolveSessionInjection({}, guarded)
  } catch {
    threw = true
  }
  ok(threw === false, '守卫 ctx 下探测会话模型不抛（v0.9.0 此处必抛 → 启动失败）')
  ok(resolveSessionInjection({}, guarded).source === 'llm', '经 ctx.get("llm") 取到会话模型')
  ok(safeContextService(guarded, 'sessionModel') === null, '不存在的服务 → null（绝不外抛）')

  ok(providerAllowsSessionTakeover('qwen', true) === false, 'qwen → 不允许接管')
  ok(providerAllowsSessionTakeover('deepseek', false) === true, '缺省 deepseek → 允许接管')
  const built = buildSessionCloudConfig(
    { cloudModelProvider: 'qwen', cloudModelApiKey: 'sk-x', cloudModelAutoSession: true, cloudModelEnabled: true },
    { sessionModel: () => 'x' },
  )
  ok(resolveCloudSettings(built.config).provider === 'qwen', 'S-5：显式 qwen 不被替换成 session')
  const off = buildSessionCloudConfig(
    { cloudModelProvider: 'deepseek', cloudModelAutoSession: false, cloudModelEnabled: true },
    { sessionModel: () => 'x' },
  )
  ok(resolveCloudSettings(off.config).kind !== 'session', 'S-6：autoSession:false 关得干净')
}

// ══════════ P0 集成回归：cordis 守卫 ctx 下 apply() 不得抛 ══════════
// 这是 v0.9.0「更新成功、重启失败」的复现用例——**没有它，31 项单测全绿也照样必崩**。
// 原因：既有测试用普通对象 stub ctx，绕过了 cordis 的 inject 守卫 Proxy。
section('P0 集成：apply() 在 cordis 守卫 ctx 下不抛（v0.9.0 必崩）')
{
  let S = null
  let plugin = null
  try {
    S = (await import('@deepseek-ai/schemastery')).default
    plugin = await import('../index.mjs')
  } catch {
    console.log('SKIP P0 集成回归：本机无 @deepseek-ai/schemastery（宿主 peer dep），跳过')
  }

  if (S && plugin) {
    // ① schema 默认值口径（根因留证）：schemastery 会把 cloudModelEnabled:false 填进 config
    const { value: defaults } = await plugin.Config['~standard'].validate({})
    ok(defaults.cloudModelEnabled === false, '根因留证：schema 默认 cloudModelEnabled=false（此前令自动会话恒不生效）')
    ok(defaults.cloudModelAutoSession !== false, 'cloudModelAutoSession 默认非 false（文档承诺的会话开关）')

    /**
     * 复刻 cordis 的 inject 守卫语义：
     *  - inject=['tools'] → tools 可直读；logger/get 等为 Context 内置成员；
     *  - 其余属性（如 sessionModel）直读即抛 "cannot get property X without inject"。
     * @param {{llm?:any}} services
     */
    const makeGuardedCtx = (services = {}) => {
      const registered = []
      const loggerLines = []
      const builtins = {
        tools: { register: (t) => registered.push(t && t.name) },
        logger: { info: (m) => loggerLines.push(m) },
        get: (name) => (name in services ? services[name] : undefined),
      }
      const guarded = new Proxy(builtins, {
        get(t, p) {
          if (p in t) return t[p]
          if (typeof p === 'symbol') return undefined
          throw new Error(`cannot get property "${String(p)}" without inject`)
        },
      })
      guarded.__registered = registered
      guarded.__logs = loggerLines
      return guarded
    }

    // ② 实网形态：Runtime 提供 llm 服务、**没有** sessionModel 服务
    //    v0.9.0 在此形态下 apply() 第一行就抛 → 插件 required → 整个 DSH 启动失败
    const llmStub = { chat: async () => 'ok' }
    const realCtx = makeGuardedCtx({ llm: llmStub })
    let threw = null
    try {
      await plugin.apply(realCtx, { ...defaults })
    } catch (e) {
      threw = e
    }
    ok(threw === null, `实网形态 apply() 不抛（v0.9.0 抛：${threw ? threw.message : '—'}）`)
    ok(realCtx.__registered.length === 6, `6 个工具全部注册（实际 ${realCtx.__registered.length}）`)
    ok(realCtx.__logs.length >= 2, `启动日志经安全通道落 2 条（实际 ${realCtx.__logs.length}）`)
    ok(
      realCtx.__logs.some((l) => String(l).includes('会话模型 已激活')),
      '实网形态：经 ctx.get("llm") 取到会话模型并激活',
    )

    // ③ 离线形态：无 llm、无 sessionModel → 诚实降级，插件照常加载
    const offCtx = makeGuardedCtx({})
    let offThrew = null
    try {
      await plugin.apply(offCtx, { ...defaults })
    } catch (e) {
      offThrew = e
    }
    ok(offThrew === null, `离线形态 apply() 不抛（${offThrew ? offThrew.message : '—'}）`)
    ok(offCtx.__registered.length === 6, '离线形态 6 工具照常注册')
    ok(
      offCtx.__logs.some((l) => String(l).includes('会话模型 未注入')),
      '离线形态：如实记录「未注入」，不伪造激活',
    )

    // ④ 用户显式选 qwen → 不被 session 接管（S-5）
    const qwenCtx = makeGuardedCtx({ llm: llmStub })
    let qwenThrew = null
    try {
      await plugin.apply(qwenCtx, { ...defaults, cloudModelProvider: 'qwen' })
    } catch (e) {
      qwenThrew = e
    }
    ok(qwenThrew === null, '显式 qwen 形态 apply() 不抛')
    // S-5 的真正约束：显式 qwen 时**不得**被 session 接管（无论有没有 Key 都不抢）。
    // 无 Key → 如实离线；有 Key → 走 qwen。二者都不允许静默替换/静默离线成 session。
    ok(
      qwenCtx.__logs.some((l) => String(l).includes('user-provider:qwen')),
      'S-5：显式 qwen → 会话层不接管（reason=user-provider:qwen）',
    )
    ok(
      qwenCtx.__logs.every((l) => !String(l).includes('会话模型 已激活')),
      'S-5：显式 qwen → 会话模型未被激活（不存在静默替换）',
    )
    // 有 Key 时应真正走 qwen（cloudModelEnabled 是用户自有云模型总闸，需一并置位）
    const qwenKeyCtx = makeGuardedCtx({ llm: llmStub })
    await plugin.apply(qwenKeyCtx, {
      ...defaults,
      cloudModelProvider: 'qwen',
      cloudModelApiKey: 'sk-qwen-test',
      cloudModelEnabled: true,
    })
    ok(
      qwenKeyCtx.__logs.some((l) => String(l).includes('已启用(qwen/')),
      'S-5：显式 qwen + 自有 Key + 总闸开 → 云模型走 qwen',
    )
    ok(
      qwenKeyCtx.__logs.every((l) => !String(l).includes('会话模型 已激活')),
      'S-5：有自有 Key 时也不抢会话模型',
    )

    // ⑤ 会话层关闭 → 关得干净（S-6）
    const off2Ctx = makeGuardedCtx({ llm: llmStub })
    await plugin.apply(off2Ctx, { ...defaults, cloudModelAutoSession: false })
    ok(
      off2Ctx.__logs.some((l) => String(l).includes('未启用(离线模板)')),
      'cloudModelAutoSession:false → 云模型离线，关得干净',
    )
  }
}

console.log(`\n===== v0.9.1 特性专项: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail === 0 ? 0 : 1)
