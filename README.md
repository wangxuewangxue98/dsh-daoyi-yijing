# 道一-易经推演（dsh-daoyi-yijing）

通用决策辅助 DSH 插件（**决策辅助，非迷信**）。把任意决策事项拆解为可量化检查点，套入
六层推演框架（384 爻 → 64 卦 → 8 宫 → 四象 → 三才 → 两仪 → 太极），输出结构化结论与
易经风格研判。结论由用户输入的参数与阈值决定，可追溯、可审计。

> 原名「易经推演-万事决」（dsh-yijing-wanshijue），v0.3.0 起重命名为「道一-易经推演」。

## 双向云模型推演闭环（§2.1）
- **正向分解 L1→L7**：1 个问题目标 → 逐层调用云模型拆解 → 384 个关键考虑因数。
- **反向聚合 L7→L1**：384 因数 → 逐层聚合 → 1 个可定/否定结论（可行 / 有条件可行 / 不可行）。
- 云模型是“翻译器”而非“裁判”：**判定与聚合（L7→L2）为确定性规则，云模型不介入 verdict 决策**。

## 内置剧本
- `motor-design`：**电机电磁设计·万事决**（从 MotorDesign `Core/yijing_*` Python 原型 1:1 移植）。
  真实 8 技术领域 × 8 子领域 × 6 检查点 = **384 爻**；其中 158 项为外部数据域（NA，排除出聚合、计入覆盖率），
  **226 活跃检查点**进聚合。含强关联一票否决、六层加权聚合、天/地/人三才分组。
- `stock-trend`：**股票趋势研判·万事决**（8 股票分析域 × 64 子域 × 384 爻）：
  基本面/技术面/资金面/消息面/行业面/宏观面/估值面/风险面，三才分组为
  天(基本面/行业/宏观)·地(技术/资金/估值)·人(消息/风险)。
- `demo-384`：规范 384 结构演示剧本（verify 向量）。
- 自定义剧本：经 `yijing_script_load` 提交 JSON，落盘 `data/scripts/` 持久化（重启回灌）。

## 快速开始
```
# 安装到 DSH（web profile；dsh 未进 PATH 时用 npx）
npx -y @deepseek-ai/dsh plugin --profile web add dsh-daoyi-yijing

# 本地离线自检（零依赖）
node scripts/verify.mjs          # 离线自检（27 项断言）
node scripts/runtime-check.mjs   # DSH Runtime 联调预演（纯 run* 函数）
node scripts/_mock_llm_test.mjs  # 云模型适配器 e2e（mock 服务器，无需密钥）
node scripts/_selftest_llm_quota.mjs # LLM 调用计数闸门 + 自定义模型 + session 解析自检
node scripts/_probe_definetool.mjs   # 真实 defineTool 编译器校验（需准备 node_modules，见脚本头注）
node scripts/divine_stock_600711.mjs   # 盛屯矿业(600711) 一个月涨跌推演示例
```
安装后对模型说「推演：我要不要接这个 200kW 电机外包项目」即可触发 `yijing_divine`。

## 工具
- `yijing_divine` 主入口（支持 `model` 参数按调用覆盖模型）
- `yijing_script_list` 列剧本 · `yijing_script_load` 加载自定义剧本 · `yijing_report` 详报
- `yijing_model_list` 列全部可选模型 + 当前选择 + 今日 LLM 调用额度快照（只读，不消耗额度）

## 云模型接线（v0.3.4 已接通真实 LLM）
**未配置时完全离线**：分解返回结构化因数清单、结论走确定性模板（断网也能跑，verdict 不受影响）。
**配置后由真实 LLM 生成** L1→L7 分解文案与 L1 卦象总评（判定/聚合仍为确定性代码）：

| 方式 | 做法 |
|------|------|
| 环境变量（推荐，密钥不落盘） | `DAOYI_LLM_API_KEY=sk-xxx DAOYI_LLM_PROVIDER=deepseek node scripts/divine_with_llm.mjs "决策事项" commercial` |
| 插件配置 | `cordis.patch.yml` / Config：`cloudModelEnabled: true` + `cloudModelProvider` + `cloudModelApiKey` + `cloudModelName` |
| 代码注入 | `setCloudModelAdapter(fn)`（测试 / DSH Runtime） |
| DSH 会话当前模型（可选） | `cloudModelProvider: 'session'`（或 `cloudModelUseSessionModel: true`），由 Runtime 注入 `config.sessionModel`，或 env `DAOYI_LLM_SESSION_BASE_URL/MODEL/API_KEY` |

- 厂商预设：`deepseek`(deepseek-chat) / `qwen`(qwen-max) / `glm`(glm-4-plus) / `moonshot`(moonshot-v1-8k) /
  `minimax`(abab6.5s-chat) / `openai`(gpt-4o-mini) / `custom`（自填 Base URL，任意 OpenAI 兼容端点）。
- **自定义模型清单（v0.3.4）**：`cloudModelCustomModels` 传 JSON 数组
  `[{"name":"my-gpt","label":"我的 GPT","baseUrl":"https://api.example.com/v1","model":"gpt-4o","keyEnv":"OPENAI_API_KEY"}]`
  （env `DAOYI_LLM_CUSTOM_MODELS` 同构）；`name` 即选用 id，`yijing_divine`/`yijing_report` 的 `model` 参数
  或 `cloudModelProvider` 传它即可热切换；`yijing_model_list` 随时查清单与当前选择。
- 环境变量：`DAOYI_LLM_ENABLED` / `DAOYI_LLM_PROVIDER` / `DAOYI_LLM_API_KEY` / `DAOYI_LLM_MODEL` / `DAOYI_LLM_BASE_URL`。
- 安全：API Key 只从 config/env 读取，**绝不出现在日志与回传中**；`telemetryEnabled` 默认关。
- 任何失败（401 / 超时 / 断网）自动降级为确定性模板，推演结论依然成立。

## 免费额度闸门（v0.4.2 起：每分钟速率 + 队列等待）
- **主节流 = 每分钟速率限制**（v0.4.2 变更）：免费 LLM 调用默认上限 **10 次/分钟**（滑动窗口 60s，
  `freeLlmPerMinute` / env `DAOYI_LLM_FREE_PER_MINUTE` 可调，0=不限制）。窗口满时后来的调用**进入 FIFO 队列排队等待**，
  待最早的时间戳滑出窗口后逐个补位——**超出不拒绝、不降级**，仅延迟。
- **每日硬上限降级为可选兜底**：`freeLlmDailyLimit` 默认 **0（关闭）**；仅显式配置 >0 时作为每日总闸，用尽才降级离线模板。
- **计数口径**：每次真实 LLM 外发计 1 次（一次 `yijing_divine` = decompose + conclude = **2 次**；离线推演不计数、不花钱）。
- **本地硬闸**：计数/限速只认本地 `$DSH_HOME/storages/dsh-daoyi-yijing/llm-quota.json`
  （env `DAOYI_LLM_QUOTA_FILE` 可覆盖），**断网也拦**，无任何后端请求/遥测。
- **可观测**：`evaluate` 结果 `llm.rate` 暴露 `{rateLimit, queued, waitMs}`；发生过排队时 `llm.notice` 提示等待时长；
  `yijing_model_list` 可查额度快照（只读）。
- **运维旁路**：`freeQuotaEnabled: false` → 不限速、不排队、不计数。
- 详见 `docs/ENGINEERING.md`「免费额度闸门」节与 `CHANGELOG.md` 0.4.2 条目。

> ⚠️ 股票推演结果由公开数据映射的因子评分驱动，属结构化多因子研判示意，**不构成任何投资建议**。
