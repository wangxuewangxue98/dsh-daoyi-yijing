// gen_stock_batch_report.mjs — 从 logs/stock-batch-results.json 生成 HTML 推演报告
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const data = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'logs', 'stock-batch-results.json'), 'utf8'),
)

const DOMAIN_NAMES = {
  JB: '基本面·乾', JS: '技术面·坤', ZJ: '资金面·震', XX: '消息面·巽',
  HY: '行业面·坎', HG: '宏观面·离', GZ: '估值面·艮', FX: '风险面·兑',
}
const SUB_NAMES = {
  JS0: '趋势方向', JS1: '动量强度', ZJ0: '主力资金', HY0: '行业景气',
  XX0: '公司公告', FX0: '系统性风险', FX1: '个股黑天鹅', FX7: '止损边界',
}
const RULE_TEXT = {
  'JS0': '0.5+clamp((涨跌%−0.12)×0.12)', 'JS1': '0.5+clamp(涨跌%×0.10)',
  'ZJ0': '0.5+clamp(涨跌%×0.10)', 'HY0': '0.5+clamp(板块均%×0.06)',
  'XX0': 'ST→0.25 / XD→0.55', 'FX0': '0.55', 'FX1': 'ST→0.20', 'FX7': '深跌→0.40 / 强涨→0.70',
}

const fmt = (x, d = 2) => Number(x).toFixed(d)
const pctCls = (p) => (p > 0 ? 'up' : p < 0 ? 'down' : 'flat')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ===== 汇总 =====
const { results, meta, sector_avg, trend_dist, hexagram_dist } = data
const up = results.filter((r) => r.trend === '看涨')
const flat = results.filter((r) => r.trend === '震荡(观望)')
const down = results.filter((r) => r.trend.startsWith('看跌') && !r.has_veto)
const vetoed = results.filter((r) => r.has_veto)

function stockRow(r, i) {
  return `<tr>
    <td>${i + 1}</td>
    <td class="lname">${esc(r.name)}<span class="code">${esc(r.code)}</span></td>
    <td>${fmt(r.price)}</td>
    <td class="${pctCls(r.pct)}">${r.pct > 0 ? '+' : ''}${fmt(r.pct)}%</td>
    <td>${esc(r.sector)}</td>
    <td>${fmt(r.overall_score * 100, 1)}</td>
    <td><span class="badge b-${r.verdict === '可行' ? 'up' : r.verdict === '不可行' ? 'down' : 'mid'}">${esc(r.verdict)}</span></td>
    <td><b class="${r.trend.startsWith('看涨') ? 'up' : r.trend.startsWith('看跌') ? 'down' : 'flat'}">${esc(r.trend)}</b>${r.has_veto ? '<span class="veto">⛔</span>' : ''}</td>
    <td>${esc(r.hexagram.name)}${r.hexagram.moving_yao ? `<span class="code">动${r.hexagram.moving_yao}爻→${esc(r.hexagram.changed)}</span>` : ''}</td>
    <td>${fmt(r.assess.margin * 100, 1)}${r.assess.margin <= 0.03 ? '<span class="code"> ⚠临界</span>' : ''}</td>
  </tr>`
}

function stockCard(r, i) {
  const signals = r.signals
    .map((s) => {
      const key = `${s.domain}${s.sub - 1}`
      return `<tr><td>${DOMAIN_NAMES[s.domain]}</td><td>${SUB_NAMES[key] || s.sub}</td><td class="mono">${RULE_TEXT[key] || ''}</td><td class="mono">${s.delta >= 0 ? '+' : ''}${fmt(s.delta, 3)}</td></tr>`
    })
    .join('')
  const domains = Object.entries(r.domain_scores)
    .map(([code, sc]) => {
      const na = !r.active_domains.includes(code)
      const yao = sc >= 0.5 ? '阳' : '阴'
      return `<tr class="${na ? 'na' : ''}"><td>${DOMAIN_NAMES[code]}</td><td class="mono">${na ? '—' : fmt(sc * 100, 1) + '%'}</td><td>${na ? 'NA(无数据)' : yao}</td><td>${r.has_veto && (code === 'FX' || code === 'XX') && sc < 0.5 ? '⛔强关联失守' : ''}</td></tr>`
    })
    .join('')
  const sc = r.sancai
  const sancai = ['tian', 'di', 'ren']
    .map((g, gi) => {
      const nm = ['天(基本面/行业/宏观)', '地(技术/资金/估值)', '人(消息/风险)'][gi]
      const codes = sc[g]?.codes || []
      const present = codes.filter((c) => r.active_domains.includes(c))
      return `<tr><td>${nm}</td><td class="mono">${present.length ? fmt(sc[g].score * 100, 0) + '%' : 'NA'}</td><td class="code">${present.length ? present.map((c) => DOMAIN_NAMES[c].split('·')[0]).join('/') : '无数据域'}</td></tr>`
    })
    .join('')
  const hx = r.hexagram
  return `<details class="card" ${i === 0 ? 'open' : ''}>
  <summary><span class="idx">${i + 1}</span> <b>${esc(r.name)}</b> <span class="code">${esc(r.code)}</span>
    <span class="${pctCls(r.pct)}">${r.pct > 0 ? '+' : ''}${fmt(r.pct)}%</span>
    <span class="badge b-${r.verdict === '可行' ? 'up' : r.verdict === '不可行' ? 'down' : 'mid'}">${esc(r.verdict)}→${esc(r.trend)}</span>
    <span class="hx">☯ ${esc(hx.name)}</span></summary>
  <div class="cardbody">
    <p class="dim">板块：${esc(r.sector)}（当日均 ${r.sector_avg > 0 ? '+' : ''}${fmt(r.sector_avg)}%）｜现价 ¥${fmt(r.price)}｜快照涨跌 ${r.pct > 0 ? '+' : ''}${fmt(r.pct)}%</p>
    <h4>① 输入信号（子域级，其余子域 NA）</h4>
    <table><tr><th>八宫</th><th>活跃子域</th><th>映射规则</th><th>信号 δ</th></tr>${signals}</table>
    <h4>② 八宫聚合（域分 = 活跃检查点通过率）</h4>
    <table><tr><th>宫位</th><th>得分</th><th>阴阳</th><th>备注</th></tr>${domains}</table>
    <h4>③ 三才</h4>
    <table><tr><th>才</th><th>得分</th><th>参与域</th></tr>${sancai}</table>
    <h4>④ 卦象（64 卦动态映射）</h4>
    <p>☯ <b>${esc(hx.name)}</b> ${esc(hx.desc || '')}｜六爻位 <span class="mono">${hx.yaos}</span>（初→上，1=阳）${hx.moving_yao ? `｜<b>动第 ${hx.moving_yao} 爻</b> → 变卦 <b>${esc(hx.changed)}</b>` : '｜无动爻'}</p>
    <h4>⑤ 太极结论</h4>
    <p class="verdict">${esc(r.taiji_line || `【太极】${r.verdict}（风险${r.risk_level}，综合 ${fmt(r.overall_score * 100, 0)}%）`)}</p>
    ${r.veto_reason ? `<p class="veto-line">⛔ 否决依据：${esc(r.veto_reason)}</p>` : ''}
    <h4>⑥ 推演过程评价</h4>
    <ul>${r.assess.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
  </div>
</details>`
}

const sectorRows = Object.entries(sector_avg)
  .sort((a, b) => b[1] - a[1])
  .map(([s, v]) => `<tr><td>${esc(s)}</td><td class="${pctCls(v)}">${v > 0 ? '+' : ''}${fmt(v)}%</td><td>${results.filter((r) => r.sector === s).length}</td></tr>`)
  .join('')

const hxDistRows = Object.entries(hexagram_dist)
  .sort((a, b) => b[1] - a[1])
  .map(([h, n]) => `<span class="hxchip">${esc(h)} ×${n}</span>`)
  .join(' ')

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>道一-易经推演 · 自选股本周涨跌研判报告（56 只）</title>
<style>
:root{--bg:#f7f8fa;--card:#fff;--ink:#1c2330;--dim:#68738a;--line:#e3e7ef;--up:#c8102e;--down:#0a8f5b;--flat:#8a93a6;--accent:#3b5bdb}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:8px 0 4px}h2{font-size:20px;margin:36px 0 12px;border-left:4px solid var(--accent);padding-left:10px}
h3{font-size:17px;margin:20px 0 8px}h4{font-size:14px;margin:14px 0 6px;color:var(--accent)}
.dim{color:var(--dim);font-size:13px}.mono{font-family:Consolas,monospace;font-size:13px}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:13.5px}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
th{background:#eef1f7;white-space:nowrap}
.up{color:var(--up)}.down{color:var(--down)}.flat{color:var(--flat)}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12.5px;color:#fff}
.b-up{background:var(--up)}.b-down{background:var(--down)}.b-mid{background:#d99000}
.veto{margin-left:4px}.veto-line{color:var(--down);font-weight:600}
.hx{color:#7048c9;font-weight:600}.hxchip{display:inline-block;background:#f1ecfb;color:#7048c9;border-radius:12px;padding:2px 10px;margin:2px;font-size:13px}
.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:14px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.stat .num{font-size:28px;font-weight:700}.stat .lab{color:var(--dim);font-size:13px}
details.card{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:10px 0}
details.card summary{cursor:pointer;padding:12px 16px;font-size:15px;list-style:none}
details.card summary::-webkit-details-marker{display:none}
details.card[open] summary{border-bottom:1px solid var(--line)}
.cardbody{padding:12px 18px 18px}
.cardbody table{margin:4px 0 8px}
tr.na td{color:var(--flat);background:#fafbfd}
.idx{display:inline-block;background:var(--accent);color:#fff;border-radius:6px;padding:0 7px;font-size:13px;margin-right:4px}
.code{color:var(--dim);font-size:12px;margin-left:4px}
.verdict{background:#f0f4ff;border-left:4px solid var(--accent);padding:8px 12px;border-radius:0 8px 8px 0;font-weight:600}
.warn{background:#fff7e8;border:1px solid #f0d9a8;border-radius:10px;padding:12px 16px;margin:12px 0;font-size:13.5px}
ul{margin:6px 0;padding-left:20px}li{margin:4px 0}
.lname b{font-size:14px}
</style></head><body><div class="wrap">
<h1>☯ 道一-易经推演 · 自选股本周涨跌研判报告</h1>
<p class="dim">引擎：dsh-daoyi-yijing <b>v0.4.0</b>（384 爻确定性引擎 · 离线模板 · 零 LLM 额度消耗）｜剧本：股票趋势研判·万事决（stock-trend）｜生成时间：${esc(meta.generated_at)}<br>
数据快照：同花顺自选股截图（周三 21:50 收盘）：上证 <b class="up">+0.12%</b>／深成 <b class="down">-0.14%</b>／创业板 <b class="down">-0.26%</b>｜推演区间：<b>本周内（剩余周四/周五共 2 个交易日）</b></p>

<div class="warn">⚠️ <b>免责声明</b>：本报告为结构化多因子研判示意（决策辅助，非迷信、非荐股）。全部结论由截图当日数据按公开规则线性映射后经确定性引擎推演得出，可审计、可复现；<b>不构成任何投资建议</b>，股市有风险，投资需谨慎。</div>

<h2>一、标的清单与数据源</h2>
<p>截图中可完整识别 <b>${results.length} 只</b>自选股（用户口径 55 只；截图另有第 57 行被截断、名称与数据不完整，无法可靠识别，未纳入）。板块归类按证券名称关键词人工确定（银行 11、装备制造 11、科技电子 8、有色金属 6、消费 3、证券/汽车/基建/核工/电力/化工/新材料各 2、医药/光伏/通信线缆各 1）。</p>

<h2>二、推演方法（八宫信号映射规则，全透明）</h2>
<p>截图仅提供「名称/代码/现价/当日涨跌幅」四类信息。按<b>「有数据才评分、无数据标 NA 不造假」</b>原则，仅以下子域激活：</p>
<table>
<tr><th>八宫</th><th>活跃子域</th><th>映射规则（δ=信号强度）</th><th>数据来源</th></tr>
<tr><td>技术面·坤</td><td>趋势方向</td><td class="mono">0.5+clamp((涨跌%−上证0.12)×0.12, ±0.42)</td><td>截图当日涨跌（相对大盘强弱）</td></tr>
<tr><td>技术面·坤</td><td>动量强度</td><td class="mono">0.5+clamp(涨跌%×0.10, ±0.42)</td><td>截图当日涨跌</td></tr>
<tr><td>资金面·震</td><td>主力资金</td><td class="mono">0.5+clamp(涨跌%×0.10, ±0.42)</td><td>当日涨跌作短线资金流代理（局限已声明）</td></tr>
<tr><td>行业面·坎</td><td>行业景气</td><td class="mono">0.5+clamp(板块日均涨跌%×0.06, ±0.20)</td><td>截图内同板块个股均值</td></tr>
<tr><td>消息面·巽</td><td>公司公告</td><td class="mono">ST→0.25；XD→0.55；其余 NA</td><td>证券名称标记</td></tr>
<tr><td>风险面·兑</td><td>系统性风险</td><td class="mono">0.55（仅随其他 FX 信号激活）</td><td>指数微涨、无系统性冲击</td></tr>
<tr><td>风险面·兑</td><td>个股黑天鹅</td><td class="mono">ST→0.20；其余 NA</td><td>ST 风险警示</td></tr>
<tr><td>风险面·兑</td><td>止损边界</td><td class="mono">涨跌%≤−4.5→0.40；≥+4.5→0.70；其余 NA</td><td>当日深跌/强涨</td></tr>
<tr class="na"><td>基本面·乾 / 估值面·艮 / 宏观面·离</td><td>全部</td><td class="mono">NA</td><td>截图无财务/估值/宏观数据 → 不评分</td></tr>
</table>
<p>每个活跃子域的 6 个评估侧面（强度/持续性/确定性/边际变化/安全边际/催化）按敏感度系数 [1.0,0.5,0.7,0.8,0.3,0.0] 与基准偏置 [0,−0.08,+0.08,−0.04,+0.04,0] 铺开（确定性常量，使涨跌幅<b>量级</b>而非仅符号产生梯度）。<br>
<b>结论映射</b>：verdict 可行→<b class="up">看涨</b>／有条件可行→<b class="flat">震荡(观望)</b>／不可行→<b class="down">看跌</b>；FX/XX 白名单强关联失守→<b class="down">看跌(否决)</b>。</p>

<h2>三、汇总结论</h2>
<div class="summary-grid">
  <div class="stat"><div class="num up">${up.length}</div><div class="lab">看涨（可行）</div></div>
  <div class="stat"><div class="num flat">${flat.length}</div><div class="lab">震荡/观望（有条件可行）</div></div>
  <div class="stat"><div class="num down">${down.length}</div><div class="lab">看跌（不可行）</div></div>
  <div class="stat"><div class="num down">${vetoed.length}</div><div class="lab">看跌（风控否决：ST×3 + 深跌×2）</div></div>
</div>
<p class="dim">卦象分布（64 卦动态映射，NA 宫按 0.5 中性处理）：${hxDistRows}</p>

<h3>3.1 板块当日均值（行业景气 δ 的来源）</h3>
<table><tr><th>板块</th><th>当日均值</th><th>样本数</th></tr>${sectorRows}</table>

<h3>3.2 分组解读</h3>
<ul>
<li><b class="up">看涨组（${up.length} 只）</b>：共同特征 = 当日上涨（+0.4%~+8.8%）且所属板块当日均值为正（科技电子 +2.00%、装备制造 +0.84%、化工 +0.98%、新材料 +0.67% 等）。代表：立讯精密 +3.03%、弘讯科技 +2.85%、华辰装备 +2.82%、科大讯飞 +2.55%、工业富联 +2.22%、夏厦精密 +8.82%、日盈电子 +6.46%。含义：<b>强动量 + 强板块共振，短线惯性延续概率相对高</b>，但注意其中大涨股（日盈/夏厦）波动风险大。</li>
<li><b class="flat">震荡组（${flat.length} 只）</b>：当日微涨/微跌（|涨跌| ≲ 1%）或个股与板块信号背离（如贝因美 +1.18% 但消费板块 −0.11% → 综合 0.72 距可行仅差 3 个百分点）。含义：<b>方向信息不足，建议观望等待确认</b>。其中瑞丰/邮储/建行/工商/西藏天路/中银证券综合分恰为 0.50，处于档位临界。</li>
<li><b class="down">看跌组（${down.length + vetoed.length} 只）</b>：三类——① <b>有色/资源链</b>（洛钼 −7.00%、西矿 −3.24%、江铜 −2.61%、紫金 −2.45%、盛屯 −2.22%、赤峰 −0.99%，板块日均 −3.09% 最弱）；② <b>银行/证券</b>（11 只银行当日均跌，板块 −0.83%；广发 −2.53%）；③ <b>风控否决 5 只</b>（ST兴化/ST南新/ST联光：风险警示；雪人集团 −4.89%、洛阳钼业 −7.00%：深跌风险暴露）。</li>
</ul>

<h3>3.3 全量汇总表（${results.length} 只，按截图顺序）</h3>
<table>
<tr><th>#</th><th>名称</th><th>现价</th><th>当日涨跌</th><th>板块</th><th>综合分</th><th>verdict</th><th>本周趋势</th><th>卦象</th><th>临界距 %</th></tr>
${results.map(stockRow).join('\n')}
</table>

<h2>四、个股完整推演过程报告（${results.length} 份）</h2>
<p class="dim">每份含：① 输入信号 → ② 八宫聚合 → ③ 三才 → ④ 卦象（含动爻/变卦）→ ⑤ 太极结论 → ⑥ 过程评价（输入完备度/结论置信/可复核性）。点击卡片展开。</p>
${results.map(stockCard).join('\n')}

<h2>五、推演过程横向评价</h2>
<ul>
<li><b>输入完备度：低（结构性限制）</b>。每只股票仅 ${results[0].active_domains.length}~5/8 个域有真实信号（覆盖率约 5%~9%），基本面/估值/宏观完全缺失。引擎的 NA 机制如实暴露了这一缺口（而非用 0.5 造假填充）——这是本次批次输入的诚实画像：<b>本次推演本质是「当日动量+板块强弱」的周度筛选，不是全因子研判</b>。</li>
<li><b>档位梯度：可用但偏粗</b>。verdict 阈值固定（可行≥0.75 / 有条件≥0.50），域分=检查点通过率。实测中涨跌幅量级经侧面系数/偏置铺开后可产生梯度（0.17/0.28/0.36/0.47/0.50/0.58/0.61/0.69/0.72/0.78/0.83/0.94），但同域内仍偏「符号驱动」——微小跌幅（工商 −0.23%）与深跌（广发 −2.53%）之间只差 1~2 档而非连续函数。</li>
<li><b>风控否决：表现最好的一环</b>。ST×3 全部被 FX/XX 白名单否决拦下（无论当日涨跌，如 ST兴化 +1.87% 仍判不可行）；深跌 2 只（雪人 −4.89%、洛钼 −7.00%）被止损边界子域拦下。<b>「先排雷、再排序」的决策语义清晰</b>。</li>
<li><b>卦象层：能工作但信息量有限</b>。64 卦动态映射生效（本批 5 种卦象），但 NA 宫按 0.5 中性（阳界）处理 → JB/HG 恒为阳，卦象分布向乾系集中（乾为天 36 只）。卦象在本批次中更多是「结论的可读性外壳」，不承载独立信息。</li>
<li><b>可复核性：优秀</b>。全流程零隐藏参数：截图涨跌幅 → 公开规则 → 384 爻 → 档位。<b>下周收盘后即可回看统计命中率</b>（见改进建议 P2-1）。</li>
</ul>

<h2>六、插件使用效果评价（v0.4.0 实测）</h2>
<h3>6.1 表现良好的方面</h3>
<ul>
<li><b>确定性 & 速度</b>：56 只 × 384 爻 = 21,504 检查点全量推演，单进程秒级完成，离线零成本、结果可复现。</li>
<li><b>NA 机制诚实</b>：无数据的 3 个域（JB/GZ/HG）整体 NA，不参与聚合、计入覆盖率——避免了「中性 0.5 全通过」造成的系统性看多偏差（实测 v1 曾因此把 56 只推成 29 只看涨，改 NA 后分布回归均衡）。</li>
<li><b>白名单否决（v0.4.0 新增）</b>：stock-trend 剧本仅 FX/XX 可一票否决，5 只风险标的全部正确拦截，且非风险域的失守不再误杀（对照 0.3.x 的 64 个强否决点泛滥）。</li>
<li><b>64 卦动态映射（v0.4.0 新增）</b>：卦象由八宫阴阳动态生成并有动爻/变卦注记，替代旧三元查表；本批 5 种卦象、动爻随个股变化。</li>
<li><b>可批量化</b>：一个脚本循环 evaluate() 即可完成 56 只推演 + 结构化落盘，适合纳入定时任务。</li>
</ul>
<h3>6.2 实测暴露的问题</h3>
<ul>
<li><b>域分语义是「通过率」而非「连续分」</b>：域分=子域内检查点阳爻占比；同宫输入同值时域分退化为二值（v1 实测：日盈电子综合分=1、ST兴化=0.75 但被否决）。0.4.0 的「verdict 连续化」只在检查点分级输入时有效——<b>文档与 CHANGELOG 的「连续分」表述需如实收窄</b>。</li>
<li><b>无原生数据适配层</b>：行情快照 → 八宫因子分的映射只能由调用方自建（本次约 60 行规则代码）。这是批量化使用的最大摩擦点。</li>
<li><b>无 horizon 参数</b>：剧本不区分日/周/月推演口径，本次「本周=2 个交易日」的语义只能写进 matter 文案，阈值与衰减无法按周期调整。</li>
<li><b>无批量工具</b>：插件未内置 yijing_batch_divine 工具，56 只循环属于调用方 DIY。</li>
<li><b>LLM 额度闸门与批量场景冲突</b>：默认 20 次/天，56 只 × 2 次 = 112 次 → 必然触发降级。离线模式可绕过（本次即离线），但「批量+LLM 文案」没有官方路径（如抽样 LLM 化/组合文案）。</li>
<li><b>卦象层 NA 宫偏阳</b>：NA 域按 0.5 处理落在阳界，使卦象分布系统性偏向乾系，削弱了 64 卦层的表现力。</li>
</ul>

<h2>七、改进建议（按优先级）</h2>
<table>
<tr><th>级别</th><th>建议</th><th>具体落点</th></tr>
<tr><td><b>P0</b></td><td>如实收窄「连续分」文档表述</td><td>CHANGELOG/ENGINEERING 注明：域分=检查点通过率，连续化仅在检查点分级输入时成立；同宫同值输入会二值化</td></tr>
<tr><td><b>P0</b></td><td>内置批量推演工具 yijing_batch_divine</td><td>tools/yijing/batch.mjs：接受 [{matter, script, inputs}] 数组，一次调用返回结构化数组 + 汇总分布；含离线模式开关</td></tr>
<tr><td><b>P0</b></td><td>卦象层 NA 宫策略显式化</td><td>hexagram.mjs：NA 域爻位可选 'skip'|'neutral-yin'|'neutral-yang'，默认 neutral-yin（保守），避免恒阳偏置</td></tr>
<tr><td><b>P1</b></td><td>行情数据适配层</td><td>lib/yijing/adapters/quote.mjs：标准接口（快照 → 八宫因子分），内置本报告的动量/板块映射作为默认策略，支持自定义覆盖</td></tr>
<tr><td><b>P1</b></td><td>horizon 原生参数</td><td>divine 入参 horizon: 'day'|'week'|'month'；剧本按周期切换阈值/衰减系数（如周度 PASS 阈值放宽至 0.70）</td></tr>
<tr><td><b>P1</b></td><td>verdict 输出置信分级</td><td>aggregator 返回 margin（距档位边界距离）与 confidence: 高/中/临界，前端直接展示（本报告已用 assess.margin 自行计算）</td></tr>
<tr><td><b>P1</b></td><td>检查点级差异化阈值</td><td>6 个侧面（强度/持续性/…）应有不同 threshold（本次用外部偏置模拟，应收进引擎，即 P1-A 落地）</td></tr>
<tr><td><b>P2</b></td><td>回测校准闭环</td><td>下周收盘后拉取 56 只实际涨跌，与本报告档位对照，统计命中率/混淆矩阵，据此校准阈值与系数——<b>这是把「研判示意」升级为「可验证工具」的唯一路径</b></td></tr>
<tr><td><b>P2</b></td><td>批量 LLM 文案策略</td><td>批量场景默认离线模板；可选「Top-N 抽样 LLM 化」或「分组合并文案」，尊重每日额度闸门</td></tr>
</table>

<h2>八、结论</h2>
<p>用 v0.4.0 插件对 56 只自选股完成「本周内涨跌」批量推演：<b class="up">看涨 ${up.length} 只</b>（科技/装备强动量共振）、<b class="flat">震荡观望 ${flat.length} 只</b>、<b class="down">看跌 ${down.length + vetoed.length} 只</b>（资源/银行链走弱 + 风控否决 5 只）。引擎侧确定性、可审计、否决机制与 64 卦映射均按设计工作；主要短板在输入侧（无数据适配层、无 horizon、域分二值化语义）。<b>本报告结论的有效性须以下周实际行情回看检验</b>——建议按第七节 P2-1 建立回测闭环后再评估是否用于实盘参考。</p>
<p class="dim">原始推演数据：dsh-daoyi-yijing/logs/stock-batch-results.json（含每只 384 爻聚合明细）｜推演脚本：scripts/divine_batch_stocks.mjs（规则全透明可改）<br>⚠️ 再度声明：结构化多因子研判示意，不构成任何投资建议。</p>
</div></body></html>`

const outDir = join(ROOT, 'output')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, '道一易经-自选股56只本周涨跌推演报告.html')
writeFileSync(out, html, 'utf8')
console.log('报告已生成:', out, `(${(html.length / 1024).toFixed(0)} KB)`)
