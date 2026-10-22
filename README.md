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
- `stock-trend-v2`：**股票趋势研判·1296 四层**（6 域 × 6 分域 × 6 子域 × 6 aspect = 1296 检查点，
  8 位 id；与 384 并行注册、**默认不启用**，显式 `script:'stock-trend-v2'` 开启）：
  支持 `llmLevel:'L2'/'L3'` LLM 子域级补分（默认走用户 DSH 会话模型计费）与
  `fineMap` 规则→子域名精映射（P2，无 LLM 部分激活卦③）。
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
- `yijing_divine` 主入口（支持 `model` 参数按调用覆盖模型；`symbols` 触发股票行情自动接入；`hexEncoding` 控制卦象阈值来源）
- `yijing_factor_prompt` 生成八宫打分表 prompt（L1→L7 拆解交给对话大模型，打分回填 `inputs`）
- `yijing_script_list` 列剧本 · `yijing_script_load` 加载自定义剧本 · `yijing_report` 详报
- `yijing_model_list` 列全部可选模型 + 当前选择 + 今日 LLM 调用额度快照（只读，不消耗额度）

## 单事项如何触达 64 卦（v0.6.0）
「64 卦 → 1 卦」的映射一直都在（8 宫分 → 二值化 6 爻 → 64 选 1 + 动爻），缺的是**单次调用的熵**：
绝对阈值 0.5 会让各宫分挤在同一侧 → 恒出乾系。本版给单事项一个**独立于本次调用的参照系**：

| 路径 | 用法 | 效果 |
|---|---|---|
| **股票（自动）** | `yijing_divine { matter: "贵州茅台本周涨跌", script: "stock-trend", symbols: ["600519"] }` | 自动拉腾讯行情构建 384 爻 inputs；阈值取全市场基线分位 → 单只即可落进 64 卦任意一格 |
| **通用事项（LLM）** | ① `yijing_factor_prompt` 拿打分表 prompt ② 对话大模型填 JSON ③ 扁平化为 `inputs` 回传 `yijing_divine` | L1→L7 拆解真正由 LLM 完成，且打分**驱动** 384 爻（此前只产文案不产分数） |
| **批量/校准** | `node scripts/divine_batch_stocks.mjs --live` · `node scripts/calibrate_stock_baselines.mjs --n 400` | 批次内分位 / 生成基线表 |

- 基线表 `lib/yijing/baselines-stock.json`（随包发布）：各宫 p25/p50/p75 + 每爻阳率 + 样本内卦种数。
  400 只随机样本实测 **48/64 种**（绝对阈值 8/64、批次分位 28/64）。
- 爻义随之变为「**相对市场中位偏强/偏弱**」（如 JS 爻阳 = 技术面强于市场中位），比绝对阈值更有信息量。
- 宫级简写：`inputs: {"EM":0.72}` 即该域全部活跃检查点同值（8 个数驱动全引擎），走归一化语义 `>0.5 为阳`。
- 可观测性：输出带 `inputs_coverage`（含 `unmatched` 未匹配键名单）与 `degraded` 低置信标记——
  **传错宫码或没给输入，不会再静默输出「100% 可行」**。

## 云模型接线（v0.3.4 已接通真实 LLM）
**未配置时完全离线**：分解返回结构化因数清单、结论走确定性模板（断网也能跑，verdict 不受影响）。
**配置后由真实 LLM 生成** L1→L7 分解文案与 L1 卦象总评（判定/聚合仍为确定性代码）：

| 方式 | 做法 |
|------|------|
| 环境变量（推荐，密钥不落盘） | `DAOYI_LLM_API_KEY=sk-xxx DAOYI_LLM_PROVIDER=deepseek node scripts/divine_with_llm.mjs "决策事项" commercial` |
| 插件配置 | `cordis.patch.yml` / Config：`cloudModelEnabled: true` + `cloudModelProvider` + `cloudModelApiKey` + `cloudModelName` |
| 代码注入 | `setCloudModelAdapter(fn)`（测试 / DSH Runtime） |
| **DSH 会话当前模型（v0.5.1 起默认自动）** | 对话中被调用时**自动使用当前对话的模型**——Runtime 注入 `config.sessionModel`（或 env `DAOYI_LLM_SESSION_*`）即生效，**无需手动开 `cloudModelEnabled`、无需自备 Key**。关闭：`cloudModelAutoSession: false`（或显式 `cloudModelEnabled: false`）；自备 `apiKey` 时不抢会话模型 |

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

## 64 卦判词库（v0.5.0 补全）
- 离线结论文案不再只有「verdict 三选一」：`lib/yijing/hexagram-texts.mjs` 为**全部 64 卦**提供独立判词
  （卦辞要义 `judgment` + 行事建议 `advice` + 卦性 `tone`），文案头部形如
  「乾为天：元亨利贞，刚健不息（主动进取，忌用过刚）——本卦判：可行，刚健中正，宜进取」，
  动爻变卦行带变卦判词。
- 判词表与 `HEXAGRAMS` 双射一致、64 条互异，由 `scripts/test_hexagram_texts.mjs`（19 断言）守护。

## 可选在线模式（v0.5.0：行情适配层）
插件核心**默认离线**（确定性、零额度、断网可用）；需要实时行情时可选用在线模式：
- **适配层** `adapters/quote.mjs`：腾讯财经 `qt.gtimg.cn`（批量、免费、无鉴权），输出与基线同构的
  子域信号 `{code, subIdx, delta}`。归一化规则透明（`RULES_TEXT` 导出）：
  GZ01 绝对估值（PE 分段锚定，便宜→阳/贵→阴，**亏损→NA**）、JS01 趋势方向（收盘位置居中化）、
  JS02 动量强度（同基线）、JS04 量能配合（换手分档×当日方向）、JS08 波动特征（振幅分档）；
  **JB/HG 无字段 → NA，不造假填充**。
- **断网/超时/字段缺失 → 回退 NA**；整体取数失败 → 调用方整体回退基线（测试验证回退后趋势与离线逐只一致）。
- **取数器可注入**：默认全局 `fetch`；代理环境（undici 不读代理变量）用
  `createCurlFetcher({ proxy: 'http://127.0.0.1:xxxx' })`。
- **批处理用法**：`node scripts/divine_batch_stocks.mjs --live` → 输出 `logs/stock-batch-results-live.json`。
- **实测**（2026-10-21 腾讯真实行情 56/56）：卦象种类 5 → **8**、GZ 域 37/56 激活、平均覆盖率 6.8% → 11.2%；
  但单期上限为 2⁵=32（HG 宏观是市场级常量、JS/ZJ/HY 价类域彼此相关），干净 64 结构上不可达——
  补数据的价值在多因子研判质量，卦象变多只是副产品。

> ⚠️ 股票推演结果由公开数据映射的因子评分驱动，属结构化多因子研判示意，**不构成任何投资建议**。

## v0.9.1：重启失败根因修复 + 分歧深度解读（重要，v0.9.0 用户必读）

**v0.9.0 在部分机器上「更新成功、重启失败」，根因是插件自身的必现缺陷，已在本版修掉。**

```
Error: cannot get property "sessionModel" without inject
    at resolveSessionInjection (cloud-model.mjs)
    at apply (index.mjs)      ← apply() 第一行
```

- **根因**：`index.mjs` 的 `inject` 仍是 `['tools']`，而 `resolveSessionInjection` **直读 `ctx.sessionModel`**
  —— 读了服务却没在 `inject` 里声明，cordis 注入守卫直接抛错；插件为 required → **整个 DSH 启动失败**。
- **更深一层**：DSH 主程序中 `sessionModel` 这个服务名**根本不存在**（真实 LLM 服务名是 `llm`）。
  这解释了历史困局：0.5.x 声明 `?sessionModel` → 永远等不到 → pending；v0.9.0 删声明却保留直读 → failed。
- **修复**：统一走 `ctx.get('llm')` 安全通道（cordis 官方访问方式，服务不存在返回 undefined **不抛**），
  直读一律经 `safeContextService()` 兜底；会话层是「可降级增强」，任何异常都不再拖垮插件加载。
- **为什么 31 项测试全绿却必崩**：既有测试用普通对象 stub ctx，**绕过了 cordis 的守卫 Proxy**。
  现新增带守卫语义的集成回归（`scripts/test_v091_features.mjs`），并做过 A/B：还原 v0.9.0 直读即复现生产错误。
- 其余收尾：S-5 显式厂商不再被 session 静默替换、S-6 `cloudModelAutoSession:false` 关得干净、
  P1 四卦分歧深度解读（`quad-divergence.mjs`）、N-1 absolute 口径护栏、N-2 基线版本提示、N-3 贴线摇摆股信号。

## v0.9.0：会话 LLM 层激活修复 + F-1..F-10 全量落地
- **★ 会话模型「透传了却不激活」缺陷已修**：Config schema 的 `cloudModelEnabled` 默认 `false` 会被填进 config，
  而会话分支用 `cloudModelEnabled !== false` 判启用 → 恒 false，会话模型**永不激活**（与文档承诺相悖）。
  现由 `buildSessionCloudConfig()` 在配置构建层显式置位并归一 `provider:'session'`；
  **`cloudModelAutoSession` 是会话模型的唯一开关**。验收 `scripts/test_session_activation.mjs` **31 PASS**。
- **F-1 爻序形状容错**：`hexOrderOf()` 对畸形 `hex_order` 返回可审计的降级状态（`declared` / `fallback:domains` / `sancai`），不再抛错。
- **F-2/F-3/F-7 批量**：`divine_batch_stocks.mjs` 支持 `--script`（含 v2）/ `--ci-grouping` / `--strong-override` / `--no-fine-map`；
  逐条输出 `verdict_grade` / `quad_hexagram` / 分层审计；`engine` 版本改为动态读 `package.json`（不再写死 v0.5.0）。
- **F-4 否决证据化**：`veto_notes` 写清代理量豁免依据；`applyStrongOverride` 可把代理项恢复强关联（v2 **204 → 216**）；
  新增 `veto_score_conflict`「骑墙」标记（verdict 三值不变）。
- **F-5** `thresholdBasis: baseline | absolute` 可选；**F-6** `--days N` 多日滚动校准（日 K 适配层；
  `fqkline` 已被 WAF 拦截，改用 `newfqkline`）；**F-8** `scripts/migrate_hex_order.mjs` 历史卦象迁移。
- **F-9 卦③ 语义分组**：`SUBDOMAIN_V2_FAMILY` 覆盖 36 个 v2 分域，`ciGrouping:'semantic'`；
  400 只校准 `baselines-stock-v2-semantic.json`（四卦 di 56/si 51/ci 28/xi 29，位置分组 ci 31）。
- 全部为加法改动，v0.8.x 判定逐位不变；`scripts/test_v090_features.mjs` **79 PASS / 0 FAIL**，16 个既有套件全绿。

## LLM 批量补分与并发（v0.9.0 / F-10）
- **先讲清约束**：`runLlmScoring` 内部串行，每个 prompt 过一次全局速率门（默认 10 次/分钟，60s 滑动窗口）。
  ⇒ **并发度提高不提升 LLM 吞吐**，只会让更多请求排队等更久；真正吃并发的是拉行情 / 确定性推演 / 四连卦投影这些**不占额度**的段。
- **prompt 口径**：L2 = 6 问/只（分域级），L3 = 36 问/只（子域×aspect）；对话式 `yijing_divine` 另有 decompose+conclude = 2 次，不计入批量。

| 档位 | 标的数 | 总 prompt | 默认门(10/min) 预计耗时 |
|---|---|---|---|
| L3 | 1 | 36 | 3.6 分钟 |
| L3 | 10 | 360 | 36 分钟 |
| L3 | 56 | 2 016 | ≈3.4 小时 |
| L3 | 400 | 14 400 | ≈24 小时 |

- **提速优先级**（前一级做不到才退下一级）：① 放宽速率门（`freeLlmPerMinute` / env `DAOYI_LLM_FREE_PER_MINUTE`，0=不限）
  → ② L3 降 L2（省 83%，代价是卦③ 分辨率下降）→ ③ 不开 LLM 用 P2 精映射（零费用，卦③ 2→31 种）
  → ④ 并发（只加速非 LLM 段）。
- **安全并发范例**：`examples/llm-batch-concurrency.mjs`（默认全 stub，零网络零费用）；
  工具 `lib/yijing/concurrency.mjs` 提供 `mapLimit`（顺序返回、单条失败不炸整批）与 `estimateLlmBatch`/`renderEstimateTable`。
  节流注入点 `runLlmScoring({ throttle })`，生产环境**不要覆盖**。
- 完整指南见 `docs/LLM批量补分与并发指南.md`。

## 四连卦与 1296 四层（v0.7.0–v0.8.1）
- **四连卦（v0.7.0）**：stock-trend 推演返回值新增 `quad_hexagram`——同一批检查点按
  域卦①/子域位卦②/业务族卦③(L/T/S/M/R/C)/爻位卦④ 四个正交轴各投影成 6 爻卦，阈值取分组基线 p50，
  含四卦一致性矩阵（分歧样本建议人工复核）。
- **1296 四层 `stock-trend-v2`（v0.8.0，默认不启用）**：显式 `script:'stock-trend-v2'` 开启；
  实证复现「瓶颈在数据不在结构」——行情 L2 粒度下卦③坍缩为 2 种。
- **规则→子域名精映射 P2（v0.8.1，v2 默认开）**：`lib/yijing/subdomain-fine-map.mjs` 把行情规则
  按语义落到「分域×子域位」，无 LLM 部分激活卦③（400 只校准实测卦③ **2→31 种**）；
  `fineMap:false` 可 A/B 对照。数据丰度诚实可查（基线 `meta.mean_data_density` ≈8.6%，未命中子域 NA）。
- **LLM 子域级补分（v0.8.0 `llmLevel`，v0.8.1 费用默认用户会话）**：L2=分域 6 问≈36 秒、
  L3=子域×aspect 36 问≈3.6 分钟（四刀全激活）；**费用默认走用户 DSH 会话当前模型**
  （`cloudModelAutoSession` 默认开），`quote.llm_scoring.endpoint.cost_bearer` 可见；
  行情信号优先、LLM 只补 NA 缺口。管理服务器 `/api/llm/score` 未部署前仅完成管线机制验证。
- **「有条件可行」分级（v0.8.1）**：`verdict_grade` 把中间态按 0.625 切偏强/偏弱，
  `verdict_margin` 给距通过线余量；verdict 原值不变。
- **基线**：`baselines-stock-v2.json` 为 P2 粒度重校准版（400 只，四卦 di 56/si 51/ci 31/xi 29）；
  v0.9.0 另产出 `baselines-stock-v2-semantic.json`（语义分组，ci 28）与
  `baselines-stock-v2-d5.json`（60 只 × 5 日滚动，density 4.0%，**仅作层样本量对照**）；
  旧 L2 粒度版归档为 `baselines-stock-v2-l2.json`（仅 A/B 对照）。
