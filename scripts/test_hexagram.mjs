// test_hexagram.mjs — 真·64 卦映射单测
import { getBuiltinScript } from '../lib/yijing/checkpoints.mjs'
import {
  buildOrderFromScript,
  resolveHexagramForScript,
  hexNameFromYaos,
} from '../lib/yijing/hexagram.mjs'

let fail = 0
const ok = (c, m) => {
  if (c) console.log('  \u2713', m)
  else {
    console.log('  \u2717', m)
    fail++
  }
}

const stock = getBuiltinScript('stock-trend')
const order = buildOrderFromScript(stock)
const sixCodes = [...order.lower, ...order.upper]

console.log('== 64 卦映射单测 ==')

const allYang = Object.fromEntries(sixCodes.map((c) => [c, 1.0]))
const allYin = Object.fromEntries(sixCodes.map((c) => [c, 0.0]))
ok(resolveHexagramForScript(allYang, stock).name === '乾为天', '6 爻全阳 → 乾为天')
ok(resolveHexagramForScript(allYin, stock).name === '坤为地', '6 爻全阴 → 坤为地')

// 上乾(upper) 下坤(lower) → 天地否
const mix = { ...allYin }
for (const c of order.upper) mix[c] = 1.0
ok(resolveHexagramForScript(mix, stock).name === '天地否', '上乾下坤 → 天地否')

// 动爻变卦：乾为天 翻转一爻应得不同卦名
const hx = resolveHexagramForScript(allYang, stock)
ok(hx.changed && hx.changed.name !== '乾为天', `乾为天 动爻变卦 ≠ 乾为天（得 ${hx.changed && hx.changed.name}）`)

// 直接 yaos 入口
ok(hexNameFromYaos([1, 1, 1, 1, 1, 1]) === '乾为天', 'hexNameFromYaos 全阳 → 乾为天')
ok(hexNameFromYaos([0, 0, 0, 0, 0, 0]) === '坤为地', 'hexNameFromYaos 全阴 → 坤为地')

console.log(fail === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${fail})`)
process.exit(fail === 0 ? 0 : 1)
