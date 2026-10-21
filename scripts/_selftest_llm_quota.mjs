// _selftest_llm_quota.mjs — LLM 调用计数闸门 + 自定义模型 + session 解析自检（v0.3.4）
//
// 覆盖：
//  ① 计数：每次真实外发 +1（mock 适配器 / OpenAI 适配器同口径）
//  ② 用尽：第 N+1 次返回 null + 闸门事件（不抛栈）；evaluate 自动降级确定性模板
//  ③ 离线（无适配器/无配置）不计数
//  ④ 运维旁路 freeQuotaEnabled:false 不拦不计数
//  ⑤ 限额解析：freeLlmDailyLimit > freeDailyLimit(兼容别名) > env > 默认 20
//  ⑥ 自定义模型清单：JSON 字符串/env 解析、损坏条目跳过、listCloudModels、provider 命中
//  ⑦ per-call 模型覆盖：config 显式设置优先于模块级适配器（mock 服务器实证路由）
//  ⑧ session：函数形态 / openai 对象 / env / 未注入；configureCloudModel 与 callCloudModel 行为
//
// 隔离：配额文件走 env DAOYI_LLM_QUOTA_FILE（临时目录），不污染真实 ~/.dsh。
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import {
  setCloudModelAdapter,
  callCloudModel,
  resolveCloudSettings,
  resolveSessionModel,
  parseCustomModels,
  listCloudModels,
  configureCloudModel,
  isCloudSettingsViable,
  consumeLlmQuotaBlock,
} from '../lib/yijing/cloud-model.mjs'
import {
  checkLlmQuota,
  assertLlmQuota,
  getLlmDailyLimit,
  getLlmQuotaFilePath,
  LlmQuotaExceededError,
  buildLlmQuotaExceededMessage,
  DEFAULT_FREE_LLM_DAILY_LIMIT,
} from '../lib/yijing/quota.mjs'
import { buildCommercialScript } from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'
import { buildEffectiveConfig } from '../tools/yijing/divine.mjs'

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) {
    pass++
    console.log('  PASS', msg)
  } else {
    fail++
    console.error('  FAIL', msg)
  }
}

// ── 隔离配额文件（必须先于任何计数动作）──
const QUOTA_FILE = join(tmpdir(), `daoyi-quota-selftest-${process.pid}.json`)
function resetQuota() {
  rmSync(QUOTA_FILE, { force: true })
}
process.env.DAOYI_LLM_QUOTA_FILE = QUOTA_FILE
resetQuota()
assert(getLlmQuotaFilePath() === QUOTA_FILE, '隔离：配额文件路径 = env DAOYI_LLM_QUOTA_FILE')

// ── mock OpenAI 兼容服务器（自定义模型路由实证用）──
const captured = []
const server = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    captured.push({ url: req.url, body: JSON.parse(body || '{}') })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'MOCK-CUSTOM-OK' } }] }))
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}/v1`

const MSGS = [{ role: 'user', content: '测试' }]
const script = buildCommercialScript()

// ── ① 计数：mock 适配器每次外发 +1 ──
{
  resetQuota()
  const cfg = { freeLlmDailyLimit: 5 }
  setCloudModelAdapter(async () => 'MOCK-TEXT')
  await callCloudModel(MSGS, { config: cfg })
  await callCloudModel(MSGS, { config: cfg })
  const q = checkLlmQuota(cfg)
  assert(q.used === 2 && q.limit === 5 && q.remaining === 3, `① 计数：2 次外发 → used=${q.used}/${q.limit}（余 ${q.remaining}）`)
  assert(existsSync(QUOTA_FILE), '① 配额文件已落盘')
  const disk = JSON.parse(readFileSync(QUOTA_FILE, 'utf8'))
  assert(disk.used === 2 && disk.limit === 5, `① 磁盘计数 used=${disk.used} limit=${disk.limit}`)
}

// ── ② 用尽：第 N+1 次返回 null + 闸门事件；evaluate 降级模板 ──
{
  resetQuota()
  const cfg = { freeLlmDailyLimit: 1 }
  setCloudModelAdapter(async () => 'MOCK-TEXT')
  const t1 = await callCloudModel(MSGS, { config: cfg }) // 消耗唯一 1 次
  assert(t1 === 'MOCK-TEXT', '② 限额内第 1 次正常返回')
  const t2 = await callCloudModel(MSGS, { config: cfg }) // 用尽
  assert(t2 === null, '② 用尽后返回 null（不抛栈）')
  const block = consumeLlmQuotaBlock()
  assert(block && block.reason === 'quota-exhausted' && /额度已用尽/.test(block.message || ''), '② 闸门事件可被取走（reason/message）')
  assert(consumeLlmQuotaBlock() === null, '② 闸门事件一次性消费（取走后清空）')

  // 用尽后 evaluate：decompose 被拦 → 离线因数清单；conclude 被拦 → 确定性模板
  const r = await evaluate('额度用尽降级测试', script, { config: cfg })
  assert(r.llm.quota_blocked === true, '② evaluate 标记 quota_blocked')
  assert(typeof r.llm.notice === 'string' && r.llm.notice.includes('离线确定性模板'), '② notice 引导文案含降级说明')
  assert(
    /乾为天|水山蹇|地水师/.test(r.conclusion_text),
    '② 结论文案回退确定性模板（verdict 不受影响）',
  )
  assert(r.decomposition.decomposition_text === null && r.decomposition.factor_count > 0, '② 分解回退因数清单')
  assert(['可行', '有条件可行', '不可行'].includes(r.verdict), `② verdict 仍由确定性引擎给出（${r.verdict}）`)
}

// ── ③ 离线（无适配器/无配置）不计数 ──
{
  resetQuota()
  const cfg = { freeLlmDailyLimit: 3 }
  setCloudModelAdapter(null)
  const before = checkLlmQuota(cfg).used
  const t = await callCloudModel(MSGS, { config: cfg })
  assert(t === null, '③ 无适配器 → null')
  assert(checkLlmQuota(cfg).used === before, '③ 离线不计数')
  // 显式启用但设置不完整（custom 无 baseUrl/model）→ 也不计数（无真实外发，不误触外网）
  const t2 = await callCloudModel(MSGS, {
    config: { ...cfg, cloudModelProvider: 'custom', cloudModelEnabled: true, cloudModelApiKey: 'k' },
  })
  assert(t2 === null && checkLlmQuota(cfg).used === before, '③ 设置不完整无可外发 → 不计数')
}

// ── ④ 运维旁路：freeQuotaEnabled:false 不拦不计数 ──
{
  resetQuota()
  const cfg = { freeQuotaEnabled: false }
  setCloudModelAdapter(async () => 'MOCK-TEXT')
  for (let i = 0; i < 5; i++) await callCloudModel(MSGS, { config: cfg })
  assert(checkLlmQuota(cfg).enabled === false, '④ 旁路：checkLlmQuota enabled=false')
  assert(checkLlmQuota(cfg).used === 0, '④ 旁路：不计数')
}

// ── ⑤ 限额解析优先级 ──
{
  assert(getLlmDailyLimit({}) === DEFAULT_FREE_LLM_DAILY_LIMIT, `⑤ 默认限额 = ${DEFAULT_FREE_LLM_DAILY_LIMIT}`)
  assert(getLlmDailyLimit({ freeLlmDailyLimit: 7 }) === 7, '⑤ freeLlmDailyLimit 优先')
  assert(getLlmDailyLimit({ freeDailyLimit: 9 }) === 9, '⑤ 兼容别名 freeDailyLimit 生效')
  assert(getLlmDailyLimit({ freeLlmDailyLimit: 7, freeDailyLimit: 9 }) === 7, '⑤ 新键优先于兼容别名')
  const saved = process.env.DAOYI_LLM_FREE_DAILY_LIMIT
  process.env.DAOYI_LLM_FREE_DAILY_LIMIT = '4'
  assert(getLlmDailyLimit({}) === 4, '⑤ env DAOYI_LLM_FREE_DAILY_LIMIT 兜底')
  delete process.env.DAOYI_LLM_FREE_DAILY_LIMIT
  assert(getLlmDailyLimit({ freeLlmDailyLimit: 0 }) === DEFAULT_FREE_LLM_DAILY_LIMIT, '⑤ 非正数回退默认')
}

// ── ⑥ 自定义模型清单 ──
{
  const good = { name: 'my-gpt', label: '我的 GPT', baseUrl: 'https://api.example.com/v1/', model: 'gpt-4o', keyEnv: 'OPENAI_API_KEY' }
  const cfg = {
    cloudModelCustomModels: JSON.stringify([
      good,
      { name: 'bad-no-model', baseUrl: 'https://x', model: '' }, // 缺 model → 跳过
      null, // 坏条目 → 跳过
      { name: 'my-local', baseUrl: 'http://127.0.0.1:9/v1', model: 'qwen-local' },
    ]),
  }
  const customs = parseCustomModels(cfg)
  assert(customs.length === 2, `⑥ 解析 2 条有效自定义模型（实际 ${customs.length}）`)
  assert(customs[0].baseUrl === 'https://api.example.com/v1', '⑥ baseUrl 去尾斜杠')
  const s = resolveCloudSettings({ ...cfg, cloudModelProvider: 'my-gpt', cloudModelApiKey: 'k1' })
  assert(s.kind === 'custom' && s.baseUrl === 'https://api.example.com/v1' && s.model === 'gpt-4o', '⑥ provider=自定义 name 命中 baseUrl/model')
  assert(s.apiKey === 'k1', '⑥ 通用 apiKey 命中')
  // env 同构 + keyEnv 专属密钥
  const saved = process.env.DAOYI_LLM_CUSTOM_MODELS
  process.env.DAOYI_LLM_CUSTOM_MODELS = JSON.stringify([good])
  process.env.OPENAI_API_KEY = 'env-openai-key'
  const s2 = resolveCloudSettings({ cloudModelProvider: 'my-gpt' })
  assert(s2.apiKey === 'env-openai-key' && s2.enabled === true, '⑥ env DAOYI_LLM_CUSTOM_MODELS + keyEnv 专属密钥')
  delete process.env.DAOYI_LLM_CUSTOM_MODELS
  delete process.env.OPENAI_API_KEY
  // 清单查询
  const all = listCloudModels(cfg)
  const ids = all.map((m) => m.id)
  assert(ids.includes('deepseek') && ids.includes('custom') && ids.includes('session'), '⑥ 清单含预设 + custom + session')
  assert(ids.includes('my-gpt') && ids.includes('my-local'), '⑥ 清单含自定义模型')
  assert(parseCustomModels({ cloudModelCustomModels: 'not-json' }).length === 0, '⑥ 损坏 JSON 静默为空')
}

// ── ⑦ per-call 模型覆盖：config 显式设置优先于模块级适配器 ──
{
  setCloudModelAdapter(async () => 'MODULE-ADAPTER')
  // 7a) config 显式（自定义模型指向 mock 服务器）→ 走自定义适配器，不碰模块级
  const cfg = {
    cloudModelProvider: 'my-mock',
    cloudModelCustomModels: JSON.stringify([
      { name: 'my-mock', label: 'mock', baseUrl: BASE, model: 'mock-model-x' },
    ]),
    cloudModelApiKey: 'k-mock',
    freeQuotaEnabled: false, // 本组只验证路由，不验证计数
  }
  const t = await callCloudModel(MSGS, { config: cfg })
  assert(t === 'MOCK-CUSTOM-OK', '⑦ per-call config 显式设置 → 自定义模型适配器生效')
  const last = captured[captured.length - 1]
  assert(last.body.model === 'mock-model-x' && last.url === '/v1/chat/completions', '⑦ 请求打到自定义 baseUrl + model')
  // 7b) config 空 → 回落模块级适配器
  const t2 = await callCloudModel(MSGS, { config: { freeQuotaEnabled: false } })
  assert(t2 === 'MODULE-ADAPTER', '⑦ config 无显式设置 → 回落模块级适配器')
  // 7c) buildEffectiveConfig 合并语义
  const eff = buildEffectiveConfig({ defaultScript: 'motor-design' }, 'session')
  assert(eff.cloudModelProvider === 'session' && eff.cloudModelUseSessionModel === true && eff.defaultScript === 'motor-design', '⑦ buildEffectiveConfig(session)')
  assert(buildEffectiveConfig({ a: 1 }, 'my-gpt').cloudModelProvider === 'my-gpt', '⑦ buildEffectiveConfig(自定义 name)')
  assert(buildEffectiveConfig({ a: 1 }, '') .a === 1, '⑦ buildEffectiveConfig(空) 原样返回')
}

// ── ⑧ session：DSH 会话当前模型 ──
{
  // 8a) 函数形态
  const fn = async () => 'SESSION-FN-OK'
  const sm = resolveSessionModel({ sessionModel: fn })
  assert(sm.kind === 'function', '⑧ sessionModel 函数 → kind=function')
  const s8 = resolveCloudSettings({ cloudModelProvider: 'session', sessionModel: fn })
  assert(s8.kind === 'session' && s8.enabled === true && isCloudSettingsViable(s8), '⑧ provider=session + 函数注入 → enabled/viable')
  const cloud8 = configureCloudModel({ cloudModelProvider: 'session', sessionModel: fn })
  assert(cloud8.active === true && cloud8.kind === 'session', '⑧ configureCloudModel(session 函数) → active')
  const t8 = await callCloudModel(MSGS, { config: { freeQuotaEnabled: false } })
  assert(t8 === 'SESSION-FN-OK', '⑧ session 函数经模块级适配器被调用')
  // 8b) per-call session 函数（模块级为空时）
  setCloudModelAdapter(null)
  const t8b = await callCloudModel(MSGS, { config: { sessionModel: fn, freeQuotaEnabled: false } })
  assert(t8b === 'SESSION-FN-OK', '⑧ per-call sessionModel 函数直调')
  // 8c) openai 对象形态
  const s8c = resolveSessionModel({ sessionModel: { baseUrl: 'https://sess.example.com/v1/', model: 'sess-model', apiKey: 'sk' } })
  assert(s8c.kind === 'openai' && s8c.baseUrl === 'https://sess.example.com/v1' && s8c.model === 'sess-model', '⑧ sessionModel 对象 → openai 设置')
  // 8d) env 形态
  const savedB = process.env.DAOYI_LLM_SESSION_BASE_URL
  const savedM = process.env.DAOYI_LLM_SESSION_MODEL
  process.env.DAOYI_LLM_SESSION_BASE_URL = 'https://env-sess/v1'
  process.env.DAOYI_LLM_SESSION_MODEL = 'env-sess-model'
  const s8d = resolveSessionModel({})
  assert(s8d.kind === 'openai' && s8d.baseUrl === 'https://env-sess/v1' && s8d.model === 'env-sess-model', '⑧ env DAOYI_LLM_SESSION_* → openai 设置')
  delete process.env.DAOYI_LLM_SESSION_BASE_URL
  delete process.env.DAOYI_LLM_SESSION_MODEL
  // 8e) 未注入 → 未启用（离线模板，不报错）
  const s8e = resolveCloudSettings({ cloudModelProvider: 'session' })
  assert(s8e.kind === 'session' && s8e.enabled === false && !isCloudSettingsViable(s8e), '⑧ 未注入 session → 未启用')
  const cloud8e = configureCloudModel({ cloudModelProvider: 'session' })
  assert(cloud8e.active === false, '⑧ configureCloudModel(未注入 session) → active=false')
  // 8f) 开关形态 cloudModelUseSessionModel
  const s8f = resolveCloudSettings({ cloudModelUseSessionModel: true, sessionModel: fn })
  assert(s8f.kind === 'session' && s8f.provider === 'session', '⑧ cloudModelUseSessionModel=true 等价 session')
}

// ── ⑨ assertLlmQuota 抛错语义 + 引导文案 ──
{
  resetQuota()
  const cfg = { freeLlmDailyLimit: 1 }
  assertLlmQuota('t', cfg) // 消耗 1
  let threw = null
  try {
    assertLlmQuota('t', cfg)
  } catch (e) {
    threw = e
  }
  assert(threw instanceof LlmQuotaExceededError, '⑨ 用尽抛 LlmQuotaExceededError')
  assert(threw?.quota?.remaining === 0 && threw?.quota?.reason === 'quota-exhausted', '⑨ quota 信息完整')
  const msg = buildLlmQuotaExceededMessage({ limit: 1, used: 1 })
  assert(msg.includes('本地自然日重置') && msg.includes('13546196530@163.com'), '⑨ 引导文案含重置说明与联系邮箱')
}

// ── 收尾 ──
setCloudModelAdapter(null)
if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
server.close()
rmSync(QUOTA_FILE, { force: true })
console.log(`\n===== LLM QUOTA / CUSTOM MODEL / SESSION SELFTEST: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail ? 1 : 0)
