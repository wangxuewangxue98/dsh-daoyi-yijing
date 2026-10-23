// test_stock_inputs.mjs — v0.6.1 股票 inputs / 基线 / 单事项 64 卦 专项测试
// 覆盖：宫级简写取值、origin 语义、inputsCoverage(unmatched)、baselines 加载与阈值、
//       factor-prompt 工具、GBK 解码、确定性推入口 evaluateDeterministic。
// 全部离线（不访问网络）；行情路径用注入 fetcher。
import {
  extractCodes,
  signalsToInputs,
  buildStockInputs,
  ASPECT_COEFS,
} from '../adapters/stock-inputs.mjs'
import { resolveValueWithOrigin, resolveValue, judgeYinYang, inputsCoverage } from '../lib/yijing/mapping.mjs'
import { loadBaselines, thresholdsFromBaselines, describeBaselines } from '../lib/yijing/baselines.mjs'
import { runYijingFactorPrompt } from '../tools/yijing/factor-prompt.mjs'
import { runYijingDivine } from '../tools/yijing/divine.mjs'
import { evaluateDeterministic, buildHexagramField } from '../lib/yijing/reviewer.mjs'
import { buildStockScript, buildCheckpointDatabase, getBuiltinScript } from '../lib/yijing/checkpoints.mjs'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

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

// ── 1. extractCodes ──
{
  ok(extractCodes('帮我看看 601398 和 600519 怎么样').join(',') === '601398,600519', '从自然语言提取两个代码')
  ok(extractCodes('没有代码的一句话').length === 0, '无代码 → 空数组')
  ok(extractCodes('000000 111111 601398').join(',') === '601398', '过滤全 0 与全同数字')
  ok(extractCodes('601398, 600519；000001').join(',') === '601398,600519,000001', '支持中英文标点分隔')
  ok(extractCodes('601398 ' + '600519 '.repeat(10)).length <= 8, '默认上限 8 个')
}

// ── 2. 宫级简写取值 + origin 语义（v0.6.1 核心）──
{
  const script = getBuiltinScript('motor-design')
  const db = buildCheckpointDatabase(script)
  const cp = db.checkpoints.find((c) => !c.na && c.domain === 'EM')
  const r1 = resolveValueWithOrigin(cp, { EM: 0.72 })
  ok(r1.value === 0.72 && r1.origin === 'domain', '宫级简写取值 → origin=domain')
  const r2 = resolveValueWithOrigin(cp, { [cp.id]: 0.9 })
  ok(r2.value === 0.9 && r2.origin === 'checkpoint', '检查点精确 id 优先 → origin=checkpoint')
  const r3 = resolveValueWithOrigin(cp, {})
  ok(r3.value === null && r3.origin === null, '缺值 → null')
  ok(resolveValue(cp, { EM: 0.6 }) === 0.6, 'resolveValue 兼容包装仍可用')

  // origin=domain → 归一化语义，绕开工程量纲阈值
  const engCp = db.checkpoints.find((c) => !c.na && c.threshold_type === 'range')
  ok(engCp != null, '找到工程量纲检查点（range 型）')
  if (engCp) {
    // 0.72 直接比 range[10,50] 必然阴；宫级语义下应判阳
    ok(judgeYinYang(engCp, 0.72, 'domain') === 1, '宫级 0.72 → 阳（绕开 range 阈值）')
    ok(judgeYinYang(engCp, 0.3, 'domain') === -1, '宫级 0.3 → 阴')
    ok(judgeYinYang(engCp, 0.5, 'domain') === 1, '宫级恰好 0.5 → 阳（与 factor_prompt「0.5 判阳边界」一致）')
    ok(judgeYinYang(engCp, 0.50001, 'domain') === 1, '宫级略高于 0.5 → 阳')
    ok(judgeYinYang(engCp, null, 'domain') === -1, '宫级 null → 阴')
    ok(judgeYinYang(engCp, 'abc', 'domain') === -1, '宫级非数值 → 阴')
    // 默认 origin 仍走工程量纲阈值（回归保护）：取一个 0.72 明显不在区间内的 range
    const far = db.checkpoints.find(
      (c) =>
        !c.na &&
        c.threshold_type === 'range' &&
        (0.72 < (c.threshold || [])[0] || 0.72 > (c.threshold || [])[1]),
    )
    ok(far != null, '找到 0.72 不在区间内的 range 检查点')
    if (far) {
      ok(judgeYinYang(far, 0.72) === -1, `默认 origin 按工程量纲阈值判定（${far.id} ${JSON.stringify(far.threshold)} → 阴）`)
      ok(judgeYinYang(far, 0.72, 'domain') === 1, '同一检查点宫级语义 → 阳（两条路径确实解耦）')
    }
  }
}

// ── 3. inputsCoverage（含 unmatched 审计）──
{
  const script = getBuiltinScript('motor-design')
  const db = buildCheckpointDatabase(script)
  const cov0 = inputsCoverage(db, {})
  ok(cov0.coverage === 0 && cov0.granularity === 'none' && cov0.unmatched.length === 0, '空 inputs → 0 覆盖')
  const covD = inputsCoverage(db, { EM: 0.6, TH: 0.6 })
  ok(covD.granularity === 'domain' && covD.coverage > 0.25, `宫级 2 个键 → domain 粒度，覆盖 ${(covD.coverage * 100).toFixed(0)}%`)
  ok(covD.unmatched.length === 0, '正确宫码 → 无 unmatched')
  const covBad = inputsCoverage(db, { JB: 0.7, JS: 0.6, ZJ: 0.5 })
  ok(covBad.coverage === 0 && covBad.unmatched.join(',') === 'JB,JS,ZJ', '错宫码 → 0 覆盖 + unmatched 列出全部错键')
  const active = db.checkpoints.filter((c) => !c.na)
  const one = active[0].id
  const covC = inputsCoverage(db, { [one]: 0.8 })
  ok(covC.granularity === 'checkpoint' && covC.provided === 1, '单个检查点 id → checkpoint 粒度')
}

// ── 4. baselines 加载与阈值 ──
{
  const file = fileURLToPath(new URL('../lib/yijing/baselines-stock.json', import.meta.url))
  ok(existsSync(file), '随包基线文件存在（baselines-stock.json）')
  const bl = loadBaselines('stock-trend')
  ok(bl != null && bl.script_id === 'stock-trend', 'loadBaselines 读取内置基线')
  ok(bl.sample_size >= 300, `样本量 ${bl && bl.sample_size}（≥300 才有统计意义）`)
  const th = thresholdsFromBaselines(bl, 'p50')
  const codes = Object.keys(th)
  ok(codes.length >= 6, `p50 阈值覆盖 ${codes.length} 个宫（≥6 进卦爻）`)
  ok(codes.every((c) => typeof th[c] === 'number' && th[c] > 0 && th[c] < 1), '阈值均为 (0,1) 内数值')
  ok(Object.keys(thresholdsFromBaselines(null)).length === 0, 'null 基线 → 空阈值（回落 absolute）')
  ok(loadBaselines('motor-design') === null, '剧本不匹配 → null（不串用基线）')
  ok(loadBaselines('stock-trend', { file: '/nonexistent/x.json' }) === null, '文件不存在 → null')
  const desc = describeBaselines(bl)
  ok(desc && desc.sample_size === bl.sample_size && desc.domains.JS.p50 === bl.domains.JS.p50, 'describeBaselines 摘要一致')
  // 基线自带的满熵证据
  const yao = (bl.meta && bl.meta.yao_yang_ratio) || []
  ok(yao.length >= 6, `基线含每爻阳率证据（${yao.length} 爻）`)
  const skewed = yao.filter((y) => y.yang_ratio != null && (y.yang_ratio < 0.3 || y.yang_ratio > 0.7))
  ok(skewed.length <= 2, `严重偏斜爻 ≤2（实际 ${skewed.length}：${skewed.map((y) => y.domain).join(',') || '无'}）`)
}

// ── 5. evaluateDeterministic（不调 LLM 的确定性入口）──
{
  const script = getBuiltinScript('motor-design')
  const inputs = { EM: 0.8, TH: 0.7, ME: 0.6, MT: 0.6, EF: 0.7, COST: 0.5, MANU: 0.6, RELIAB: 0.7 }
  const r = evaluateDeterministic(script, { inputs })
  ok(r.script_id === 'motor-design', '确定性入口返回 script_id')
  ok(Object.keys(r.domain_results).length >= 5, `宫结果数 ${Object.keys(r.domain_results).length}`)
  ok(r.inputs_coverage.granularity === 'domain', '确定性入口带覆盖画像')
  ok(['可行', '有条件可行', '不可行'].includes(r.verdict), `判决合法：${r.verdict}`)
  ok(typeof r.overall_score === 'number', '综合分为数值')
  const hx = buildHexagramField(r, script, null)
  ok(typeof hx.name === 'string' && hx.name.length >= 2, `卦象字段：${hx.name}`)
  ok(hx.threshold_source === 'absolute(0.5)', '无阈值注入 → absolute')
  ok(hx.yaos.length === 6, `六爻长度 ${hx.yaos.length}`)
  ok(hx.yaos.every((y) => y === '阳' || y === '阴'), '六爻取值合法')
  const hx2 = buildHexagramField(r, script, { EM: 0.5, TH: 0.5 })
  ok(hx2.threshold_source === 'baseline' && hx2.thresholds.EM === 0.5, '注入阈值 → baseline 且回显阈值')
}

// ── 6. factor-prompt 工具 ──
{
  const fp = runYijingFactorPrompt({ matter: '要不要接 200kW 电机外包项目', script: 'motor-design' }, {})
  ok(fp.script_id === 'motor-design', 'factor-prompt 返回剧本 id')
  ok(fp.domains.length === 8 && fp.domains.every((d) => d.code && d.name && d.bagua), '八个宫齐全')
  ok(fp.prompt.includes('要不要接 200kW 电机外包项目'), 'prompt 内含决策事项')
  ok(fp.prompt.includes('0=极弱'), 'prompt 明示打分语义')
  ok(fp.prompt.includes('严格只输出如下 JSON'), 'prompt 要求严格 JSON 输出')
  ok(fp.usage.example.includes('inputs'), '回填示例给出 inputs 形态')
  const fpStock = runYijingFactorPrompt({ matter: '贵州茅台本周涨跌', script: 'stock-trend' }, {})
  ok(fpStock.domains.map((d) => d.code).join(',') === 'JB,JS,ZJ,XX,HY,HG,GZ,FX', '股票剧本宫码正确')
  const fpDefault = runYijingFactorPrompt({ matter: 'x' }, {})
  ok(fpDefault.script_id === 'motor-design', '缺省剧本 motor-design')
}

// ── 7. yijing_divine 的 inputs 三级来源 + unmatched 告警 ──
{
  // 错宫码 → degraded + unmatched 告警（回归 2026-10-22 静默退化事故）
  const bad = await runYijingDivine(
    { matter: '测试事项', script: 'motor-design', inputs: { JB: 0.7, JS: 0.6 } },
    {},
  )
  ok(bad.degraded === true, '错宫码 → degraded=true')
  ok(bad.inputs.coverage === 0, '错宫码 → 覆盖率 0')
  ok(bad.inputs.unmatched.join(',') === 'JB,JS', 'unmatched 列出错键')
  ok(typeof bad.notice === 'string' && bad.notice.includes('未匹配'), 'notice 说明未匹配')
  ok(bad.notice.includes('EM/TH/ME/MT/EF/COST/MANU/RELIAB'), 'notice 给出正确宫码')

  // 正确宫码 → 正常判定、不 degraded
  const good = await runYijingDivine(
    {
      matter: '测试事项',
      script: 'motor-design',
      inputs: { EM: 0.8, TH: 0.75, ME: 0.7, MT: 0.65, EF: 0.72, COST: 0.68, MANU: 0.7, RELIAB: 0.75 },
    },
    {},
  )
  ok(good.degraded === false, '正确宫码 → 不 degraded')
  ok(good.inputs.granularity === 'domain' && good.inputs.coverage === 1, '宫级覆盖 100%')
  ok(good.notice == null, '无告警')

  // 高低分化为不同判决（64 卦空间的可行性证明）
  const hi = await runYijingDivine(
    { matter: 'm', script: 'motor-design', inputs: { EM: 0.9, TH: 0.9, ME: 0.9, MT: 0.9, EF: 0.9, COST: 0.9, MANU: 0.9, RELIAB: 0.9 } },
    {},
  )
  const lo = await runYijingDivine(
    { matter: 'm', script: 'motor-design', inputs: { EM: 0.1, TH: 0.1, ME: 0.1, MT: 0.1, EF: 0.1, COST: 0.1, MANU: 0.1, RELIAB: 0.1 } },
    {},
  )
  ok(hi.overall_score > lo.overall_score, `高分 ${hi.overall_score} > 低分 ${lo.overall_score}`)
  ok(hi.verdict !== lo.verdict, `判决分化：${hi.verdict} vs ${lo.verdict}`)

  // 无 inputs → notice 提示走兜底
  const none = await runYijingDivine({ matter: '电机项目评估', script: 'motor-design' }, {})
  ok(none.degraded === true && none.notice.includes('未提供'), '无 inputs → degraded + 兜底提示')

  // 股票剧本 + useQuote=false → 不联网
  const noNet = await runYijingDivine(
    { matter: '601398 涨跌', script: 'stock-trend', symbols: ['601398'], useQuote: false },
    {},
  )
  ok(noNet.degraded === true, 'useQuote=false → 不拉行情、按无输入处理')
}

// ── 8. buildStockInputs 的 meta 契约（mock fetcher，不打网络）──
{
  // 腾讯行构造器：按字段位显式赋值，避免手数 ~ 分隔符错位（v0.6.1 踩过：
  // 手写 fixture 把 pct 放到 34 位，导致 HY 宫因 sectorPct 缺失而整宫 NA）
  const gbk = (s) => Buffer.from(
    [...s].flatMap((ch) => {
      // 反查 GBK 双字节（测试专用；生产编码由 decodeTencentBytes 负责）
      const buf = Buffer.from([0x81, 0x40])
      return [buf[0], buf[1]]
    }),
  )
  // 预计算常用汉字 GBK 字节（2026-10-22 穷举 GBK 空间反查）
  const GBK_MAP = {
    工: [0xb9, 0xa4], 商: [0xc9, 0xcc], 银: [0xd2, 0xf8], 行: [0xd0, 0xd0],
    上: [0xc9, 0xcf], 证: [0xd6, 0xa4], 指: [0xd6, 0xb8], 数: [0xca, 0xfd],
  }
  const nameGbk = (s) => Buffer.from([...s].flatMap((ch) => GBK_MAP[ch]))
  function tencentLine(secid, name, fields) {
    const arr = new Array(60).fill('')
    for (const [idx, v] of Object.entries(fields)) arr[Number(idx)] = String(v)
    const parts = [arr[0], ...arr.slice(1)]
    return Buffer.concat([
      Buffer.from(`v_${secid}="${parts[0]}~`, 'utf8'),
      nameGbk(name),
      Buffer.from(`~${parts.slice(2).join('~')}";`, 'utf8'),
    ])
  }
  void gbk

  const stockLine = tencentLine('sh601398', '工商银行', {
    2: 601398, 3: 8.58, 4: 8.6, 5: 8.62, 7: 100, 8: 90,
    31: -0.02, 32: -0.23, 33: 8.71, 34: 8.45, 36: 123456, 37: 106500, 38: 0.53,
    39: 6.2, 43: 1.45, 44: 8000, 45: 10000, 46: 1.05, 47: 8.5, 48: 8.7,
    49: 1.2, 50: 200, 51: 8.55, 52: 6.2, 53: 7.1,
  })
  const indexLine = tencentLine('sh000001', '上证指数', {
    2: '000001', 3: 3885.0, 4: 3900.0, 5: 3890.0,
    31: -14.0, 32: -0.36, 33: 3905.0, 34: 3865.0, 36: 9999999, 37: 41115614, 38: 0.53,
    39: 12.5, 43: 1.45,
  })
  const fetcher = async (url) => (String(url).includes('sh000001') ? indexLine : stockLine)
  const r = await buildStockInputs(['601398'], { fetcher })
  ok(r.meta.fetched === 1 && !r.meta.error, 'mock fetcher 取到 1 只')
  const hit = r.byCode.get('601398')
  ok(hit != null, 'Map 命中 601398')
  ok(hit.name === '工商银行', `GBK 名称正确解析：${hit && hit.name}`)
  ok(r.meta.indexContext && r.meta.indexContext.name === '上证指数', '指数上下文名称正常（GBK）')
  ok(r.meta.indexContext && r.meta.indexContext.pct === -0.36, '指数 pct 正确（字段位无错位）')
  ok(Object.keys(hit.inputs).length > 50, `inputs 键数 ${Object.keys(hit.inputs).length}（>50）`)
  ok(hit.activeDomains.length === 8, `活跃宫 8 个：${hit.activeDomains.join(',')}`)
  ok(hit.activeDomains.includes('HY'), 'HY 宫激活（依赖指数 sectorPct）')
  ok(hit.signals.length >= 15, `信号规则命中 ${hit.signals.length} 条`)
  ok(hit.signals.some((s) => s.rule.startsWith('HY01')) && hit.signals.some((s) => s.rule.startsWith('HY04')), 'HY01/HY04 均命中')
  ok(hit.signals.every((s) => s.rule && s.source === 'tencent'), '信号带 rule 溯源与来源')
  ok(r.meta.rules.length >= 15, `RULES_TEXT 导出 ${r.meta.rules.length} 条`)
  ok(typeof r.meta.sector_proxy === 'string', 'sector_proxy 口径如实标注')
  // ASPECT_COEFS 常量契约
  ok(ASPECT_COEFS.length === 6 && ASPECT_COEFS[0] === 1.0, 'ASPECT_COEFS 6 侧面')
  // 行情失败 → 整体 error，调用方可回退
  const failRes = await buildStockInputs(['601398'], {
    fetcher: async () => {
      throw new Error('boom')
    },
  })
  ok(failRes.meta.error && failRes.byCode.size === 0, '取数失败 → error + 空 Map（调用方回退基线）')
}

console.log(`\n股票 inputs / 基线 / 单事项专项：${pass} PASS / ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
