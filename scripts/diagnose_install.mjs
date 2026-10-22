#!/usr/bin/env node
/**
 * 安装/启动诊断（v0.9.0+）
 *
 * 用途：当「更新成功但重启失败 / 插件未激活」时，在本机（插件安装目录内）跑一次，
 *       把环境、包完整性、模块导出、JSON 可解析性一次性体检，并打印 index.mjs 的真实 import 错误。
 *
 * 用法（在插件安装目录内）：
 *   node scripts/diagnose_install.mjs
 * 或指定目录：
 *   node scripts/diagnose_install.mjs --dir "<...>/node_modules/dsh-daoyi-yijing"
 *
 * 说明：只读体检，不写任何文件、不联网、不消耗 LLM 额度。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const iDir = argv.indexOf('--dir')
const base = iDir >= 0 && argv[iDir + 1] ? argv[iDir + 1] : process.cwd()

let bad = 0
const mark = (ok, msg) => { if (!ok) bad++; console.log(`  ${ok ? '✓' : '✗'} ${msg}`) }

console.log('══ 道一易经 安装/启动诊断 ══')
console.log(`目录：${base}\n`)

console.log('── 1. 环境 ──')
console.log(`  Node: ${process.version}`)
console.log(`  平台: ${process.platform} ${process.arch}`)
mark(Number(process.versions.node.split('.')[0]) >= 22, 'Node ≥ 22（插件 compatibility 要求）')

console.log('\n── 2. 包版本一致性 ──')
const readJson = (p) => JSON.parse(readFileSync(join(base, p), 'utf8'))
let pkg = null, manifest = null
try { pkg = readJson('package.json'); console.log(`  package.json version = ${pkg.version}`) } catch (e) { mark(false, `package.json 读取失败：${e.message}`) }
try { manifest = readJson('manifest.json'); console.log(`  manifest.json version = ${manifest.version}`) } catch (e) { mark(false, `manifest.json 读取失败：${e.message}`) }
if (pkg && manifest) mark(pkg.version === manifest.version, `两处版本一致（${pkg.version}）`)
try {
  const skill = readFileSync(join(base, 'skills/daoyi-divine/SKILL.md'), 'utf8')
  const m = skill.match(/version:\s*([\d.]+)/)
  if (pkg && m) mark(m[1] === pkg.version, `SKILL.md version = ${m[1]} 与包版本一致`)
} catch { mark(false, 'SKILL.md 缺失') }

console.log('\n── 3. 关键文件存在性 ──')
for (const f of ['index.mjs', 'manifest.json', 'cordis.patch.yml', 'lib/yijing/cloud-model.mjs',
  'lib/yijing/quad-hexagram.mjs', 'lib/yijing/subfamily-map.mjs', 'lib/yijing/concurrency.mjs',
  'tools/yijing/divine.mjs', 'adapters/quote-history.mjs']) {
  mark(existsSync(join(base, f)), f)
}

console.log('\n── 4. 基线 JSON 可解析 ──')
const libDir = join(base, 'lib/yijing')
try {
  const jsons = readdirSync(libDir).filter((f) => f.endsWith('.json'))
  for (const f of jsons) {
    try { JSON.parse(readFileSync(join(libDir, f), 'utf8')); mark(true, `${f} 解析正常`) }
    catch (e) { mark(false, `${f} 解析失败：${e.message}`) }
  }
} catch (e) { mark(false, `lib/yijing 不可读：${e.message}`) }

console.log('\n── 5. 模块导出契约（v0.9.0 新依赖点）──')
// 逐条列 index.mjs 需要的导出，缺任一都会让宿主加载失败
const contracts = [
  ['lib/yijing/cloud-model.mjs', ['configureCloudModel', 'parseCustomModels', 'buildSessionCloudConfig', 'resolveSessionInjection']],
  ['lib/yijing/registry.mjs', ['configureRegistry']],
  ['lib/yijing/selfcheck.mjs', ['runSelfCheck']],
  ['lib/yijing/quota.mjs', ['checkLlmQuota']],
]
for (const [file, names] of contracts) {
  try {
    const mod = await import(pathToFileURL(join(base, file)).href)
    for (const n of names) mark(typeof mod[n] === 'function', `${file} → ${n}`)
  } catch (e) { mark(false, `${file} 导入失败：${String(e.message).split('\n')[0]}`) }
}

console.log('\n── 6. 库模块全量 import（抓语法/缺失导出）──')
function walk(dir, out = []) {
  let names = []
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (extname(p) === '.mjs') out.push(p)
  }
  return out
}
let modBad = 0
for (const d of ['lib', 'adapters', 'tools']) {
  for (const f of walk(join(base, d))) {
    try { await import(pathToFileURL(f).href) }
    catch (e) {
      const m = String(e.message)
      if (/does not provide an export|SyntaxError|Cannot find|is not defined/i.test(m)) {
        modBad++; console.log(`  ✗ ${relative(base, f)}: ${m.split('\n')[0]}`)
      }
    }
  }
}
mark(modBad === 0, `lib/adapters/tools 模块 import（异常 ${modBad} 个）`)

console.log('\n── 7. index.mjs 导入（宿主加载路径）──')
try {
  await import(pathToFileURL(join(base, 'index.mjs')).href)
  mark(true, 'index.mjs 可导入')
} catch (e) {
  const msg = String(e.message || e).split('\n')[0]
  // schemastery 由宿主提供，本地缺失属正常，不当成缺陷
  if (/@deepseek-ai\/schemastery/.test(msg)) {
    console.log('  · index.mjs 需要宿主提供 @deepseek-ai/schemastery（本机未装，属正常）')
  } else {
    mark(false, `index.mjs 导入失败：${msg}`)
  }
}

console.log('\n── 8. inject 越权读取扫描（v0.9.1 P0：重启失败根因）──')
// v0.9.0 事故：index.mjs 的 inject 只有 ['tools']，而 resolveSessionInjection 直读 ctx.sessionModel
// → cordis 守卫抛 "cannot get property sessionModel without inject" → 插件 required → DSH 启动失败。
// 本项静态扫描所有 ctx.<prop> 直读，凡不在 inject 声明、也不属于 cordis 内置成员的，一律报错。
const CORDIS_BUILTINS = new Set([
  'logger', 'get', 'set', 'emit', 'on', 'once', 'off', 'scope', 'state', 'effect',
  'provide', 'inject', 'plugin', 'component', 'command', 'context', 'root',
])
let injectDecl = []
try {
  const idxSrc = readFileSync(join(base, 'index.mjs'), 'utf8')
  const m = idxSrc.match(/export\s+const\s+inject\s*=\s*\[([^\]]*)\]/)
  if (m) {
    injectDecl = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    console.log(`  index.mjs inject = [${injectDecl.join(', ')}]`)
  } else {
    mark(false, '未找到 export const inject 声明')
  }
} catch (e) { mark(false, `index.mjs 读取失败：${e.message}`) }

// 去字符串字面量与注释后再扫：Config 的 .description('... ctx.sessionModel ...') 与
// 「// ⚠ 直读 ctx.sessionModel 会抛」这类说明文案都不是代码，不能误报。
const stripStrings = (src) => src
  .replace(/'(?:\\.|[^'\\])*'/g, "''")
  .replace(/"(?:\\.|[^"\\])*"/g, '""')
  .replace(/`(?:\\.|[^`\\])*`/g, '``')
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
const allowed = new Set([...injectDecl, ...CORDIS_BUILTINS])
let violations = []
// 只扫宿主 ctx 真正到达的入口：index.mjs 的 apply(ctx, config)。
// tools/adapters/scripts 里的 ctx.* 多为回调局部参数（如 inputsBuilder 的 ctx），不是宿主 ctx，不在此规则内。
try {
  const code = stripComments(stripStrings(readFileSync(join(base, 'index.mjs'), 'utf8')))
  const re = /\bctx\.([a-zA-Z_$][\w$]*)/g
  let mm
  while ((mm = re.exec(code)) !== null) {
    const prop = mm[1]
    if (prop === 'get') continue // ctx.get(...) 是 cordis 官方安全通道
    if (!allowed.has(prop)) {
      const line = code.slice(0, mm.index).split('\n').length
      violations.push(`index.mjs:${line} → ctx.${prop}`)
    }
  }
} catch (e) { mark(false, `index.mjs 扫描失败：${e.message}`) }
mark(violations.length === 0, `index.mjs 内 ctx.* 直读全部在 inject/内置白名单（越权 ${violations.length} 处）`)
for (const v of violations) console.log(`    ✗ ${v}`)

// 行为检查（权威）：在 cordis 守卫语义下真实调用 apply()，不抛才算过
let schemasteryOk = true
try { await import('@deepseek-ai/schemastery') } catch { schemasteryOk = false }
if (schemasteryOk) {
  try {
    const S = (await import('@deepseek-ai/schemastery')).default
    const plugin = await import(pathToFileURL(join(base, 'index.mjs')).href)
    const { value: defaults } = await plugin.Config['~standard'].validate({})
    const registered = []
    const logs = []
    const builtins = {
      tools: { register: (t) => registered.push(t && t.name) },
      logger: { info: (m) => logs.push(String(m)) },
      get: (n) => (n === 'llm' ? { chat: async () => 'ok' } : undefined), // 实网形态：有 llm、无 sessionModel
    }
    const guarded = new Proxy(builtins, {
      get(t, p) {
        if (p in t) return t[p]
        if (typeof p === 'symbol') return undefined
        throw new Error(`cannot get property "${String(p)}" without inject`)
      },
    })
    await plugin.apply(guarded, { ...defaults })
    mark(registered.length === 6, `守卫 ctx 下 apply() 不抛且注册 ${registered.length}/6 工具（v0.9.0 此处必崩）`)
    // 兜底 try/catch 会让越权直读「不抛」，故必须再查激活结果：实网形态下会话模型应经 ctx.get('llm') 激活
    mark(
      logs.some((l) => l.includes('会话模型 已激活')),
      '实网形态：会话模型经 ctx.get("llm") 激活（未激活=修复未到位或被兜底吞掉）',
    )
  } catch (e) {
    mark(false, `守卫 ctx 下 apply() 抛错：${String(e.message || e).split('\n')[0]}`)
  }
} else {
  console.log('  · 本机无 @deepseek-ai/schemastery（宿主 peer dep），跳过行为检查；请以静态扫描结果为准')
}

// 修复到位的正面证据
try {
  const cm = readFileSync(join(base, 'lib/yijing/cloud-model.mjs'), 'utf8')
  mark(!/if\s*\(\s*ctx\s*&&\s*ctx\.sessionModel\s*\)/.test(cm), 'cloud-model.mjs 无 ctx.sessionModel 裸读（v0.9.1 修复在位）')
  mark(/safeContextService/.test(cm), 'cloud-model.mjs 使用 safeContextService 安全通道')
} catch (e) { mark(false, `cloud-model.mjs 读取失败：${e.message}`) }

console.log(`\n════ 诊断结果: ${bad === 0 ? 'PASS（未发现本包缺陷）' : bad + ' 处异常'} ════`)
if (bad > 0) {
  console.log('\n若「inject 越权读取扫描」报错：这是 v0.9.0 重启失败的根因，升级到 ≥0.9.1 即可；')
  console.log('  或确认插件目录内 lib/yijing/cloud-model.mjs 已含 safeContextService。')
  console.log('若异常集中在「模块导出契约」或「库模块 import」，多半是**更新时文件未完整替换**：')
  console.log('  建议：dsh plugin remove dsh-daoyi-yijing && dsh plugin add dsh-daoyi-yijing')
}
process.exit(bad === 0 ? 0 : 1)
