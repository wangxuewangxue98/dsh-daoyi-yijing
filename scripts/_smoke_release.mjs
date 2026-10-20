// _smoke_release.mjs — 发布前冒烟：report await 修复 / divine 兜底 / oneOf object 分支
import { runYijingReport } from '../tools/yijing/report.mjs'
import { runYijingDivine } from '../tools/yijing/divine.mjs'

// ① await 修复验证：path 必须是真实字符串
const out = await runYijingReport({ matter: '冒烟测试', script: 'stock-trend' }, {}, true)
console.log('① report.path =', typeof out.path === 'string' ? out.path : 'UNDEFINED(BUG)', '| text 头 =', out.text.split('\n')[0])

// ② divine 默认剧本兜底（不传 script → 应走 motor-design）
const d = await runYijingDivine({ matter: '默认剧本兜底测试' })
console.log('② divine verdict =', d.verdict, '| score =', d.overall_score)

// ③ oneOf object 分支：script 传 JSON 对象
const d2 = await runYijingDivine({
  matter: 'oneOf 测试',
  script: {
    script_id: 'smoke', name: '冒烟剧本',
    domains: [{ code: 'S1', name: 'S', bagua: '乾', subdomains: [{ name: 's', checks: [{ id: 'S1s1', name: 'c', is_strong: false, threshold_type: 'min', threshold: [0.5, null], weight: 1 }] }] }],
    sancai_mapping: { tian: ['S1'], di: [], ren: [] },
  },
})
console.log('③ oneOf object verdict =', d2.verdict)

// ④ matter 缺失时（schema required=true 在编译期拦；run 层仍应容错）
const d3 = await runYijingDivine({})
console.log('④ matter 缺省 verdict =', d3.verdict)
