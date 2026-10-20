// _mock_llm_test.mjs — 云模型适配器端到端测试（本地 mock OpenAI 服务器，无需真实密钥）
// 覆盖：① 请求形状/鉴权头/模型名/温度 ② 响应解析 ③ 401 错误降级 ④ 超时降级 ⑤ 环境变量解析
import { createServer } from 'node:http'
import {
  setCloudModelAdapter,
  resolveCloudSettings,
  configureCloudModel,
  callCloudModel,
  decomposeWithCloudModel,
  concludeWithCloudModel,
} from '../lib/yijing/cloud-model.mjs'
import { buildCommercialScript } from '../lib/yijing/checkpoints.mjs'
import { evaluate } from '../lib/yijing/reviewer.mjs'

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

// ── mock OpenAI 兼容服务器 ──
let mode = 'ok' // ok | 401 | hang
const captured = []
const server = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    captured.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') })
    if (mode === 'hang') return // 不响应，触发客户端超时
    if (mode === '401') {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'invalid api key' } }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                '{"layers":[{"level":"太极","note":"一案之主，成败在月内可见"}],' +
                '"key_factors":[{"domain":"CP","factor":"产品成熟度","reason":"决定付费转化"}],' +
                '"missing_data":["近30日激活率"]}',
            },
          },
        ],
      }),
    )
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port
const BASE = `http://127.0.0.1:${PORT}/v1`
console.log(`mock LLM server → ${BASE}`)

const script = buildCommercialScript()
const MSGS = [{ role: 'user', content: '测试' }]

// ── ① 请求形状 + ② 响应解析（happy path）──
mode = 'ok'
configureCloudModel({
  cloudModelEnabled: true,
  cloudModelProvider: 'custom',
  cloudModelBaseUrl: BASE,
  cloudModelApiKey: 'test-key-123',
  cloudModelName: 'mock-model',
  cloudModelTemperature: 0.3,
})
{
  const text = await callCloudModel(MSGS, { config: {} })
  assert(typeof text === 'string' && text.includes('key_factors'), '① 响应解析：choices[0].message.content 提取成功')
  const req = captured[captured.length - 1]
  assert(req.method === 'POST' && req.url === '/v1/chat/completions', `① 请求路径 = ${req.url}`)
  assert(req.auth === 'Bearer test-key-123', `① 鉴权头 = ${req.auth}`)
  assert(req.body.model === 'mock-model', `① 模型名 = ${req.body.model}`)
  assert(req.body.stream === false && Array.isArray(req.body.messages), '① stream=false + messages 数组')
  assert(req.body.temperature === 0.3, `① temperature = ${req.body.temperature}`)
}
{
  const dec = await decomposeWithCloudModel('dsh-motor-ai 未来一个月商业成功率', script, { config: {} })
  assert(dec.decomposition_text && dec.decomposition_text.includes('key_factors'), '② decompose 走真实 LLM 文案')
  assert(
    dec.decomposition_json && Array.isArray(dec.decomposition_json.key_factors),
    '② decompose JSON 解析成功（layers/key_factors/missing_data）',
  )
  assert(dec.factor_count > 0 && Array.isArray(dec.factors), `② 因数清单仍在（${dec.factor_count} 个）`)
}
{
  const agg = {
    verdict: '可行',
    risk_level: '低',
    overall_score: 0.9,
    domain_results: { CP: { bagua: '乾', name: '产品力', score: 0.9, strong_veto: false } },
  }
  const con = await concludeWithCloudModel(agg, script, '测试事项', { config: {} })
  assert(typeof con === 'string' && con.includes('key_factors'), '② conclude 卦象文案来自真实 LLM')
}

// ── ③ 401 错误降级 ──
mode = '401'
{
  const text = await callCloudModel(MSGS, { config: {} })
  assert(text === null, '③ 401 → 返回 null（不抛出）')
  const DS = { CP: 0.72, TR: 0.58, MA: 0.55, DL: 0.65, CM: 0.62, VP: 0.66, BR: 0.54, RK: 0.52 }
  const inputs = {}
  const { buildCheckpointDatabase } = await import('../lib/yijing/checkpoints.mjs')
  for (const cp of buildCheckpointDatabase(script).checkpoints) inputs[cp.id] = DS[cp.domain]
  const r = await evaluate('401 降级测试', script, { inputs, config: {} })
  assert(
    typeof r.conclusion_text === 'string' && (r.conclusion_text.includes('乾为天') || r.conclusion_text.includes('地水师') || r.conclusion_text.includes('水山蹇')),
    '③ LLM 失败 → evaluate 回退确定性模板文案',
  )
  assert(r.verdict === '可行' || r.verdict === '不可行', `③ verdict 仍由确定性引擎给出（${r.verdict}）`)
}

// ── ④ 超时降级 ──
mode = 'hang'
configureCloudModel({
  cloudModelEnabled: true,
  cloudModelProvider: 'custom',
  cloudModelBaseUrl: BASE,
  cloudModelApiKey: 'test-key-123',
  cloudModelName: 'mock-model',
  cloudModelTimeoutMs: 300,
})
{
  const t0 = Date.now()
  const text = await callCloudModel(MSGS, { config: {} })
  const dt = Date.now() - t0
  assert(text === null && dt < 3000, `④ 挂起 → ${dt}ms 内超时返回 null`)
}

// ── ⑤ 环境变量解析 + 未启用离线 ──
{
  process.env.DAOYI_LLM_API_KEY = 'env-key-456'
  process.env.DAOYI_LLM_MODEL = 'env-model'
  process.env.DAOYI_LLM_BASE_URL = 'https://env.example.com/v1'
  const s = resolveCloudSettings({})
  assert(s.apiKey === 'env-key-456' && s.model === 'env-model' && s.baseUrl === 'https://env.example.com/v1', '⑤ env 解析 apiKey/model/baseUrl')
  assert(s.enabled === true, '⑤ 有 env 密钥 → enabled=true')
  delete process.env.DAOYI_LLM_API_KEY
  delete process.env.DAOYI_LLM_MODEL
  delete process.env.DAOYI_LLM_BASE_URL

  const off = configureCloudModel({})
  assert(off.active === false, '⑤ 无密钥无配置 → 离线（active=false）')
  setCloudModelAdapter(null)
  const t = await callCloudModel(MSGS, { config: {} })
  assert(t === null, '⑤ 未启用 → null')
}

server.close()
console.log(`\n===== MOCK LLM E2E: ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail ? 1 : 0)
