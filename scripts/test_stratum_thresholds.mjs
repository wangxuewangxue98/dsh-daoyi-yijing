// 按层阈值专项测试（v0.7.2）：分层带定义 + 层阈值解析 + 四连卦接线 + 回落链
// 证明：① 分层带边界正确；② stratumThresholdsFromBaselines 层内阈值/缺层回落/小样本回落/冻结恒阴；
//       ③ baselinesForStratum 包装形态可被 resolveQuadHexagram 直接消费（域阈值+分组阈值生效）；
//       ④ 分组缺键回落总体 groups。
import {
  capBand,
  pctBand,
  stratumOfQuote,
  stratumThresholdsFromBaselines,
  baselinesForStratum,
} from '../lib/yijing/baselines.mjs'
import { resolveQuadHexagram } from '../lib/yijing/quad-hexagram.mjs'
import { buildStockScript, buildCheckpointDatabase } from '../lib/yijing/checkpoints.mjs'

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

// ── 1. 分层带定义 ──
section('1. 分层带边界')
{
  ok(capBand(49) === 'a_<50亿' && capBand(50) === 'b_50-200亿' && capBand(199) === 'b_50-200亿', `capBand 低中界（实际 ${capBand(49)}/${capBand(50)}）`)
  ok(capBand(200) === 'c_200-1000亿' && capBand(999) === 'c_200-1000亿' && capBand(1000) === 'd_>1000亿', `capBand 中高界（实际 ${capBand(200)}/${capBand(999)}/${capBand(1000)}）`)
  ok(capBand(null) === 'u_未知', `capBand 缺失→未知（实际 ${capBand(null)}）`)
  ok(pctBand(-2) === 'a_≤-2%' && pctBand(-1.9) === 'b_-2~0%' && pctBand(0) === 'c_0~2%' && pctBand(1.9) === 'c_0~2%' && pctBand(2) === 'd_≥2%', `pctBand 四带（实际 ${pctBand(-2)}/${pctBand(-1.9)}/${pctBand(0)}/${pctBand(1.9)}/${pctBand(2)}）`)
  ok(stratumOfQuote({ totalCap: 3000, pct: 1.5 }) === 'd_>1000亿|c_0~2%', `stratumOfQuote 组合键（实际 ${stratumOfQuote({ totalCap: 3000, pct: 1.5 })}）`)
  ok(stratumOfQuote({ totalCap: null, pct: null }) === 'u_未知|u_未知', 'stratumOfQuote 双缺失→未知层')
}

// ── 2. 合成基线（两层：一个可用 n=30，一个小样本 n=5，一个缺失层）──
const mkGroup = (p50, n = 30, frozen = false) => (frozen ? { frozen: true, n } : { n, p25: p50 - 0.1, p50, p75: p50 + 0.1 })
const synthBaselines = {
  script_id: 'stock-trend',
  domains: { JS: { p50: 0.5 }, ZJ: { p50: 0.5 } },
  groups: { si: { '1': { p50: 0.5 } }, ci: { L: { p50: 0.5 } }, xi: { '1': { p50: 0.5 } } },
  strata: {
    definition: 'test',
    cells: {
      'a_<50亿|c_0~2%': {
        n: 30,
        domain_thresholds: { JS: 0.7, ZJ: 0.3 },
        group_thresholds: { si: { '1': mkGroup(0.8) }, ci: { L: mkGroup(0.2) }, xi: { '1': mkGroup(1, 30, true) } },
      },
      'a_<50亿|d_≥2%': { n: 5, domain_thresholds: { JS: 0.9 }, group_thresholds: {} },
    },
  },
}

section('2. 层阈值解析与回落链')
{
  const st = stratumThresholdsFromBaselines(synthBaselines, 'a_<50亿|c_0~2%')
  ok(st && st.domains.JS === 0.7 && st.domains.ZJ === 0.3, `可用层域阈值（实际 ${JSON.stringify(st && st.domains)}）`)
  ok(st && st.groups.si['1'] === 0.8 && st.groups.ci.L === 0.2, `可用层分组阈值（实际 si=${st && st.groups.si['1']} ci=${st && st.groups.ci.L}）`)
  ok(st && st.groups.xi['1'] === Infinity, `层内冻结组→Infinity 恒阴（实际 ${st && st.groups.xi['1']}）`)
  ok(stratumThresholdsFromBaselines(synthBaselines, 'a_<50亿|d_≥2%') === null, '小样本层（n=5<20）→ null 回落总体')
  ok(stratumThresholdsFromBaselines(synthBaselines, 'd_>1000亿|a_≤-2%') === null, '缺失层 → null 回落总体')
  ok(stratumThresholdsFromBaselines(null, 'x') === null, '无基线 → null')
}

// ── 3. baselinesForStratum → resolveQuadHexagram 接线 ──
section('3. 分层基线驱动四连卦')
{
  const script = buildStockScript()
  const db = buildCheckpointDatabase(script)
  // 合成 evals：全部阳性（yinYang=1）——层阈值下高阈值组应判阴、冻结组恒阴
  const evals = new Map()
  for (const cp of db.checkpoints) {
    if (cp.na) continue
    evals.set(cp.id, { value: 0.9, yinYang: 1, pass: true, origin: 'test' })
  }
  const cell = baselinesForStratum(synthBaselines, 'a_<50亿|c_0~2%')
  ok(cell && cell.stratum === 'a_<50亿|c_0~2%', 'baselinesForStratum 标记 stratum')
  ok(cell && cell.domains.JS && cell.domains.JS.p50 === 0.7, `包装域阈值同构（实际 ${cell && cell.domains.JS.p50}）`)
  const quad = resolveQuadHexagram(db, evals, script, cell, { domain_results: {} })
  ok(Boolean(quad), 'resolveQuadHexagram 可吃分层基线')
  const si1 = quad.hexes.hex_si.groups.find((g) => String(g.key) === '1')
  // 合成阳率=1.0：若阈值取总体 0.5 或分层 0.8 都判阳；判别点是 threshold 必须=分层值 0.8
  ok(si1 && Math.abs(si1.threshold - 0.8) < 1e-9 && si1.yang === 1,
    `si-1 阈值取自分层（th=${si1 && si1.threshold}，总体为 0.5；阳率 1.0 ≥ 0.8 → 阳）`)
  const xi1 = quad.hexes.hex_xi.groups.find((g) => String(g.key) === '1')
  ok(xi1 && xi1.yang === 0, `xi-1 冻结组恒阴（实际 yang=${xi1 && xi1.yang}）`)
}

// ── 4. 分组缺键回落总体 ──
section('4. 分组缺键回落')
{
  const partial = {
    script_id: 'stock-trend',
    domains: { JS: { p50: 0.5 } },
    groups: { si: { '1': { p50: 0.4 } }, ci: {}, xi: {} },
    strata: {
      cells: {
        'b_50-200亿|b_-2~0%': { n: 40, domain_thresholds: { JS: 0.6 }, group_thresholds: { si: {}, ci: {}, xi: {} } },
      },
    },
  }
  const cell = baselinesForStratum(partial, 'b_50-200亿|b_-2~0%')
  ok(cell && cell.groups.si['1'] && cell.groups.si['1'].p50 === 0.4, `层内无分组键 → 回落总体 groups.si（实际 ${cell && cell.groups.si['1'] && cell.groups.si['1'].p50}）`)
  ok(baselinesForStratum(partial, 'nope') === null, '缺层 → baselinesForStratum null')
}

console.log(fail === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${fail})`)
process.exit(fail === 0 ? 0 : 1)
