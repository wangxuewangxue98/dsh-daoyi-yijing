// _smoke_release.mjs — 发布前冒烟：report await 修复 / divine 兜底 / oneOf object 分支 / bundle.patch 形态
import { runYijingReport } from '../tools/yijing/report.mjs'
import { runYijingDivine } from '../tools/yijing/divine.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

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

// ⑤ bundle.patch 形态（v0.3.5 P0 回归）：安装器要求「文件路径或路径列表」，
//    0.3.3/0.3.4 误写成嵌套对象导致 dsh plugin add 直接失败。
{
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const patch = pkg?.dsh?.bundle?.patch
  const ok = typeof patch === 'string' || (Array.isArray(patch) && patch.every((p) => typeof p === 'string'))
  console.log('⑤ dsh.bundle.patch 形态 =', ok ? (typeof patch === 'string' ? patch : patch.join(',')) : JSON.stringify(patch), ok ? 'OK' : 'BAD(安装器将拒绝)')
  if (!ok) {
    console.error('⑤ 失败：dsh.bundle.patch 必须是文件路径字符串或字符串数组（如 "./cordis.patch.yml"）')
    process.exitCode = 1
  } else {
    const files = Array.isArray(pkg.files) ? pkg.files : []
    for (const p of [patch].flat()) {
      const rel = p.replace(/^\.\//, '')
      if (!existsSync(join(ROOT, rel))) {
        console.error(`⑤ 失败：bundle.patch 指向的文件不存在: ${p}`)
        process.exitCode = 1
      } else if (!files.some((f) => f === rel || f === p || f === rel + '/')) {
        console.error(`⑤ 警告：bundle.patch 指向 ${p}，但不在 package.json files 白名单（安装后可能缺失）`)
        process.exitCode = 1
      }
    }
  }
}
