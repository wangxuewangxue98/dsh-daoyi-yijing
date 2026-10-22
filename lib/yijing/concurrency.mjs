/**
 * 并发与批量成本工具（v0.9.0 / F-10）
 *
 * 背景（为什么要单独一个文件）：
 * 1. LLM 补分管线 `runLlmScoring` 内部是**串行 for 循环**，每个 prompt 前都过一次
 *    `acquireLlmRateLimit`（全局 60s 滑动窗口，默认 10 次/分钟）。
 *    ⇒ **把并发度调高不会提高 LLM 吞吐**，只会让更多请求挤在队列里等更久。
 * 2. 但批量流程里**不占 LLM 额度的部分**（拉行情、确定性推演、四连卦投影、分层查表）
 *    是纯 CPU/IO 等待，这部分**确实**能吃并发。
 * 3. 所以正确做法是「两段式」：非 LLM 段有界并发，LLM 段串行并预留额度预算。
 *
 * 本文件只提供工具，不改变任何既有管线行为。
 */

/**
 * 有界并发 map：结果按输入顺序返回，单条失败不影响整批。
 * @template T,R
 * @param {T[]} items 输入数组
 * @param {number} limit 并发上限（<1 或 非有限值 时退化为 1，即串行）
 * @param {(item:T, index:number)=>Promise<R>|R} fn 处理函数
 * @returns {Promise<Array<{ok:true, index:number, item:T, value:R}|{ok:false, index:number, item:T, error:Error}>>}
 */
export async function mapLimit(items, limit, fn) {
  const list = Array.isArray(items) ? items : []
  const n = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 1)
  const out = new Array(list.length)
  let cursor = 0
  const workers = []
  const workerCount = Math.min(n, list.length)
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        for (;;) {
          const i = cursor++
          if (i >= list.length) return
          try {
            const v = await fn(list[i], i)
            out[i] = { ok: true, index: i, item: list[i], value: v }
          } catch (err) {
            out[i] = { ok: false, index: i, item: list[i], error: err instanceof Error ? err : new Error(String(err)) }
          }
        }
      })(),
    )
  }
  await Promise.all(workers)
  return out
}

/**
 * 每只标的的 LLM prompt 数（与 llm-scoring.mjs 的构造口径一致）。
 * L2：每域 1 问 → domains 个；L3：每域 × 每子域位 1 问 → domains × aspects 个。
 * @param {'L2'|'L3'} level
 * @param {{domains?:number, aspects?:number}} [shape] 剧本形状（v2 = 6 域 × 6 aspect）
 */
export function promptsPerStock(level = 'L3', shape = {}) {
  const domains = Number.isFinite(shape.domains) && shape.domains > 0 ? Math.floor(shape.domains) : 6
  const aspects = Number.isFinite(shape.aspects) && shape.aspects > 0 ? Math.floor(shape.aspects) : 6
  return level === 'L2' ? domains : domains * aspects
}

/**
 * 批量 LLM 补分的耗时/成本预算估算。
 *
 * 关键事实（诚实口径）：速率门是**进程内**滑动窗口，默认 10 次/分钟。
 * 总墙钟时间 ≈ 总 prompt 数 / 每分钟上限（分钟）——与并发度无关。
 * 多进程并行会各自持有一个窗口，可绕过本进程的门，但那是**上游服务侧限流**风险，不在本工具鼓励范围内。
 *
 * @param {object} opts
 * @param {'L2'|'L3'} [opts.level] 默认 L3
 * @param {number} [opts.stocks] 标的数量，默认 1
 * @param {number} [opts.perMinute] 每分钟放行次数（Infinity/0 表示不限速），默认 10
 * @param {{domains?:number, aspects?:number}} [opts.shape]
 * @returns {{level:string, stocks:number, promptsPerStock:number, prompts:number, perMinute:number|'Infinity', minutes:number, note:string}}
 */
export function estimateLlmBatch({ level = 'L3', stocks = 1, perMinute = 10, shape = {} } = {}) {
  const per = promptsPerStock(level, shape)
  const n = Math.max(0, Number.isFinite(stocks) ? Math.floor(stocks) : 0)
  const total = per * n
  const unlimited = !Number.isFinite(perMinute) || perMinute <= 0
  const rpm = unlimited ? Infinity : Math.max(1, Math.floor(perMinute))
  const minutes = unlimited ? 0 : total / rpm
  return {
    level,
    stocks: n,
    promptsPerStock: per,
    prompts: total,
    perMinute: unlimited ? 'Infinity' : rpm,
    minutes: Math.round(minutes * 100) / 100,
    note: unlimited
      ? '不限速：耗时由上游模型响应时延决定，与并发度相关'
      : `速率门 ${rpm}/min 为进程内全局队列等待；并发度提高不提升吞吐，仅延长队列`,
  }
}

/** 显示宽度：CJK/全角按 2 计，避免中文表格对不齐 */
function displayWidth(s) {
  let w = 0
  for (const ch of String(s)) {
    const c = ch.codePointAt(0)
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd)
    w += wide ? 2 : 1
  }
  return w
}

/**
 * 把估算结果渲染成中文表格行（供日志/文档复用，避免各处手写口径不一致）。
 * 速率门口径统一在表下单独说明，不进表格（否则表格过宽不可读）。
 * @param {Array<ReturnType<typeof estimateLlmBatch>>} rows
 */
export function renderEstimateTable(rows) {
  const head = ['档位', '标的数', 'prompt/只', '总 prompt', '速率门', '预计耗时']
  const body = rows.map((r) => [
    r.level,
    String(r.stocks),
    String(r.promptsPerStock),
    String(r.prompts),
    `${r.perMinute}/min`,
    r.perMinute === 'Infinity' ? '取决于上游时延' : `${r.minutes} 分钟`,
  ])
  const width = head.map((h, i) => Math.max(displayWidth(h), ...body.map((b) => displayWidth(b[i]))))
  const line = (cells) =>
    `| ${cells.map((c, i) => c + ' '.repeat(Math.max(0, width[i] - displayWidth(c)))).join(' | ')} |`
  return [line(head), `| ${width.map((w) => '-'.repeat(w)).join(' | ')} |`, ...body.map(line)].join('\n')
}

export default { mapLimit, promptsPerStock, estimateLlmBatch, renderEstimateTable }
