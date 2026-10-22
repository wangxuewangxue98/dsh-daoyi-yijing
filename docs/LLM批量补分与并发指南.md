# LLM 批量补分与并发指南（v0.9.0 / F-10）

> 面向「批量跑 L2/L3 补分」的使用者。先讲清约束，再给可执行的并发范例与成本表。
> 结论先行：**并发对 LLM 段无效**，提速只能靠放宽速率门、降档、或不用 LLM。

---

## 1. 三条硬事实（决定了后面所有做法）

| # | 事实 | 代码位置 | 推论 |
|---|---|---|---|
| 1 | `runLlmScoring` 内部是**串行 for 循环**，每个 prompt 前调一次 `acquireLlmRateLimit` | `lib/yijing/llm-scoring.mjs:176-183` | 单进程内 LLM 请求天然串行，不存在「并发打爆」风险 |
| 2 | 速率门是 **60s 滑动窗口**，默认 **10 次/分钟**，窗口满 → FIFO 排队等待（不拒绝、不降级） | `lib/yijing/quota.mjs:28,153-156` | **总墙钟 ≈ 总 prompt 数 ÷ 每分钟上限**，与并发度无关 |
| 3 | 计数只落本地 `$DSH_HOME/storages/dsh-daoyi-yijing/llm-quota.json` | README「免费额度闸门」节 | 断网也拦；多进程各持一个窗口，可绕过本进程门 → 属上游限流风险，不鼓励 |

> ⚠️ 常见误解：以为「开 8 个并发就能快 8 倍」。实际是 8 个请求一起排队，
> 第 8 个要等前面 7 个拿到额度，**总时长一分不少，单请求延迟反而变长**。

---

## 2. prompt 数量口径

| 档位 | 粒度 | prompt 数/只 | 计算式 |
|---|---|---|---|
| `L2` | 分域级 | **6** | 6 域 × 1 问 |
| `L3` | 子域×aspect | **36** | 6 域 × 6 aspect |

对话式 `yijing_divine` 另有 `decompose + conclude = 2 次`外发，**不计入上表**。

---

## 3. 成本 / 耗时表（默认速率门 10/min）

| 档位 | 标的数 | prompt/只 | 总 prompt | 预计耗时 |
|---|---|---|---|---|
| L2 | 1 | 6 | 6 | 0.6 分钟 |
| L3 | 1 | 36 | 36 | 3.6 分钟 |
| L2 | 10 | 6 | 60 | 6 分钟 |
| L3 | 10 | 36 | 360 | 36 分钟 |
| L3 | 56 | 36 | 2 016 | **201.6 分钟（≈3.4 小时）** |
| L3 | 400 | 36 | 14 400 | **1 440 分钟（≈24 小时）** |

放宽速率门后的对照（`freeLlmPerMinute`）：

| 速率门 | 56 只 L3 | 400 只 L3 |
|---|---|---|
| 10/min（默认） | 201.6 分钟 | 1 440 分钟 |
| 60/min | 33.6 分钟 | 240 分钟 |
| 300/min | 6.7 分钟 | 48 分钟 |
| 0（不限） | 取决于上游响应时延与并发度 | 同左 |

> 上表为**纯速率门排队时间**，未计模型响应时延；实测会比表内数字更长。

---

## 4. 提速优先级（前一级做不到，才退到下一级）

1. **放宽速率门** — `freeLlmPerMinute` 配置项 或 env `DAOYI_LLM_FREE_PER_MINUTE`（`0` = 不限）。
   最直接，但线性放大费用与上游限流风险。
2. **L3 降 L2** — 36 问 → 6 问/只（省 83%）。代价：粒度从子域降到分域，
   卦③（业务族卦）分辨率下降；v0.8.0 实测 L2 粒度下卦③坍缩为 **2 种**。
3. **不开 LLM，用 P2 精映射** — `fineMap: true`（v0.8.1 起为 v2 默认）。
   零费用零等待，400 只实测卦③ **2 → 31 种**。
4. **并发** — 只加速**不占额度**的那一段（拉行情 / 确定性推演 / 四连卦投影 / 分层查表），
   对 LLM 段**无效**。

---

## 5. 安全并发范例

可运行文件：`examples/llm-batch-concurrency.mjs`
（默认全 stub，**零网络、零费用**，不写任何配额文件）

```bash
node examples/llm-batch-concurrency.mjs                    # 估算表 + 两段式演示
node examples/llm-batch-concurrency.mjs --stocks 56 --level L3
node examples/llm-batch-concurrency.mjs --per-minute 60 --concurrency 8
node examples/llm-batch-concurrency.mjs --estimate-only    # 只打印估算表
```

### 5.1 两段式结构（正确姿势）

```js
import { mapLimit } from '../lib/yijing/concurrency.mjs'

// 阶段 A：确定性推演 —— 不占额度，可以并发
const phaseA = await mapLimit(codes, 4, async (code) => {
  return evaluateDeterministic(script, { inputs, ciGrouping: 'semantic' })
})

// 阶段 B：LLM 补分 —— 占额度，串行即可（本来就串行，加并发只会排队）
const llm = await runLlmScoring({ script, db, pack, llmCall, level: 'L3' })
```

### 5.2 `mapLimit` 约定

- 结果**按输入顺序**返回，与完成顺序无关；
- 单条失败**不影响整批**，该项为 `{ok:false, error}`，调用方自行决定是否重试；
- `limit < 1` 或非有限值 → 退化为串行（不会静默变成无限并发）。

### 5.3 节流注入点

`runLlmScoring({ ..., throttle })`，默认 `acquireLlmRateLimit`。
单测可注入计数桩（见 `scripts/test_v090_features.mjs` F-10 节）。
**生产环境不要覆盖 throttle**，否则等于拆掉速率保护。

---

## 6. 接真实 LLM 的三条路（能力边界如实说明）

| 路径 | 状态 | `cost_bearer` | 说明 |
|---|---|---|---|
| DSH 会话模型 | **v0.9.0 起可用** | `user-session` | `cloudModelAutoSession` 默认开；v0.9.0 修复了「schema 默认 `cloudModelEnabled:false` 导致自动借用永不生效」的缺陷 |
| 自有 Key | 可用 | `user-key` | 配 `cloudModelProvider` + `cloudModelApiKey`，此时不再借用会话模型 |
| 管理端 `/api/llm/score` | **未部署** | — | 管线机制已离线验证，**不要当作已实现的能力对外承诺** |

---

## 7. 合规提醒

- 批量跑之前先算预算（第 3 节表），别让 400 只 L3 静默跑一整天。
- 多进程并行可绕过进程内速率门，属上游限流风险，本指南不提供也不鼓励。
- 股票推演结果由公开数据映射的因子评分驱动，属结构化多因子研判示意，**不构成任何投资建议**。
