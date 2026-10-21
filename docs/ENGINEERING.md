# 工程说明（ENGINEERING.md）

## 目录结构
```
dsh-daoyi-yijing/
├── manifest.json              # 插件元数据（displayName=道一-易经推演，id=cn.daoyi.dsh-yijing）
├── package.json               # name/version(type:module)/dsh 段
├── index.mjs                  # DSH 入口（apply 生命周期：registry 回灌 + 自校验 + 注册工具）
├── cordis.patch.yml           # 运行时配置补丁
├── skills/daoyi-divine/       # 给模型的技能指令
├── tools/yijing/              # 5 个工具（runXxx 纯函数 + registerXxx 薄封装）
│   ├── divine.mjs             # yijing_divine 主入口（model 每次调用覆盖 + LLM 额度紧凑输出）
│   ├── script-list.mjs        # yijing_script_list
│   ├── script-load.mjs        # yijing_script_load
│   ├── report.mjs             # yijing_report 详报（含云模型/额度行）
│   └── model-list.mjs         # yijing_model_list 模型清单 + 额度快照（v0.3.4 新增）
├── lib/yijing/                # 核心引擎（判定/聚合确定性；云模型仅作文案层）
│   ├── checkpoints.mjs        # 检查点库 + 剧本加载 + 规范 384 / 股票 384 / 商用 384 生成器 + NA 标记
│   ├── mapping.mjs            # 取值解析 + 阴阳判定（阈值兜底，boolean 对齐 Python value==1）
│   ├── aggregator.mjs         # 六层加权聚合（强关联一票否决）+ NA 排除 + 覆盖率
│   ├── reviewer.mjs           # 推演编排 + 报告生成 + 云模型集成点 + LLM 额度画像
│   ├── cloud-model.mjs        # 云模型适配器（OpenAI 兼容 + 6 厂商预设 + 自定义模型清单 + session 会话模型 + 离线降级）
│   ├── quota.mjs              # 免费额度闸门（按 LLM 调用计数，本地硬闸，v0.3.4 新增）
│   ├── grading.mjs            # 评估渐细轴（正/反 · 正/中/反 · 正/偏正/偏反/反，纯函数展示层）
│   ├── registry.mjs           # 自定义剧本注册表（fs 持久化 + 启动回灌）
│   ├── selfcheck.mjs          # 加载自校验（纯 lib，零 Runtime 依赖）
│   └── scripts/motor-design.mjs# 真实剧本（AUTO-GENERATED，来源 _extract_motor_design.py）
├── data/scripts/              # 自定义剧本落盘（运行时生成）
├── scripts/verify.mjs         # 裸 Node 离线自检
├── scripts/runtime-check.mjs  # DSH Runtime 联调预演（纯 run* 函数）
├── scripts/_mock_llm_test.mjs # 云模型适配器 e2e（本地 mock OpenAI 服务器，20 断言）
├── scripts/_selftest_llm_quota.mjs # LLM 调用计数闸门 + 自定义模型 + session 解析自检（v0.3.4 新增）
├── scripts/_probe_definetool.mjs # 真实 @deepseek-ai/dsh-tools defineTool 编译器校验（schema + execute 端到端，42 断言）
├── scripts/divine_with_llm.mjs# 真实 LLM 推演示例（env 驱动，无密钥自动降级）
├── scripts/divine_stock_600711.mjs # 盛屯矿业(600711) 一个月涨跌推演示例
├── scripts/divine_dsh_motor_ai_commercial.mjs # dsh-motor-ai 商业成功率推演示例
├── scripts/_extract_motor_design.py # 从 Python 原型 1:1 提取 motor-design.mjs
├── examples/README.md         # 内置剧本算例
└── CHANGELOG.md
```

## 契约（对齐 dsh-motor-ai-l0）
- `index.mjs`：`export const name / inject=['tools'] / Config=Schema.object / apply(ctx,config)`。
- 工具：`registerXxx(ctx,config)` 内 `ctx.tools.register(defineTool({name,description,parameters,output,execute}))`；
  `runXxx(args,config)` 为纯函数，零 DSH 依赖，可被 `verify.mjs` / `runtime-check.mjs` 直接加载。
- 顶层不 import DSH Runtime；仅 `registerXxx` 内 `await import('@deepseek-ai/dsh-tools')`。

## 配置全表（cordis.patch.yml / Config）
| 配置键 | 默认 | 说明 |
|--------|------|------|
| defaultScript | motor-design | 默认决策剧本 id（motor-design / stock-trend / commercial / demo-384） |
| allowCustomScript | true | 允许 JSON 自定义剧本 |
| strongVetoEnabled | true | 强关联一票否决（引擎灵魂） |
| reportStyle | classic | classic=卦象风 / plain=报表风 |
| cloudModelEnabled | false | **启用真实云模型**（默认 OFF；开启后 L1→L7 分解与卦象文案由 LLM 生成） |
| cloudModelProvider | deepseek | 厂商：deepseek/qwen/glm/moonshot/minimax/openai/custom，或自定义模型清单里的 name，或 session=DSH 会话当前模型 |
| cloudModelApiKey | '' | API Key（Bearer；绝不外发、不入日志；也可用 env `DAOYI_LLM_API_KEY`） |
| cloudModelName | '' | 模型名（留空取厂商默认：deepseek-chat/qwen-max/glm-4-plus/moonshot-v1-8k/abab6.5s-chat） |
| cloudModelBaseUrl | '' | 自定义 Base URL（留空取厂商默认；custom 厂商必填） |
| cloudModelTimeoutMs | 30000 | 单次调用超时（毫秒） |
| cloudModelTemperature | 0.3 | 采样温度（低值保稳） |
| cloudModelEndpoint | '' | 旧版简易协议端点（POST {messages}）；留空则不用 |
| cloudModelCustomModels | '' | 自定义模型清单（JSON 数组字符串 `[{name,label,baseUrl,model,keyEnv}]`）；name 即选用 id（v0.3.4 新增；env `DAOYI_LLM_CUSTOM_MODELS` 同构） |
| cloudModelUseSessionModel | false | 可选：使用 DSH 会话当前模型（等价 provider=session；来源 config.sessionModel 或 env `DAOYI_LLM_SESSION_*`）（v0.3.4 新增） |
| freeQuotaEnabled | true | 本地闭环免费额度闸门（按 LLM 调用计数，断网也拦；false=旁路不计数） |
| freeLlmDailyLimit | 20 | 每日免费 LLM 调用额度（一次推演 = decompose + conclude = 2 次；离线推演不计数）（v0.3.4 起为计费口径） |
| freeDailyLimit | 10 | （兼容别名，deprecated）v0.3.4 前「每日推演次数」口径；设置后等同 freeLlmDailyLimit |
| telemetryEnabled | false | 脱敏回传默认关 |
| knowledgeBaseUrl | '' | 在线知识库入口（可选） |

## 引擎架构边界（§2.1）
- **确定性层（L7→L2）**：`mapping.mjs` 阴阳判定 + `aggregator.mjs` 六层加权聚合，是 verdict 唯一裁判。
  含强关联一票否决、NA 域/单点排除（`yijing_mapping.py:204/206` 口径）、覆盖率审计。
- **云模型层（L1→L7 分解 / L1 结论文案）**：`cloud-model.mjs` 仅做“翻译器”，不参与 verdict 决策。
- **NA 处理**：COST/MANU 整域 + 单点 NA 清单排除出聚合（不造假），计入 `coverage`。

## 股票趋势研判剧本 stock-trend
- 8 域：基本面(乾)/技术面(坤)/资金面(震)/消息面(巽)/行业面(坎)/宏观面(离)/估值面(艮)/风险面(兑)。
- 三才（v0.5.1）：**天**=外部环境与主导(宏观/行业/风险)、**地**=标的质地(技术/资金/估值)、
  **人**=公司层面(基本面/消息，**不占爻位**，仅作动爻候选与判决语义)。
  （历史口径为 天(基本面/行业/宏观)，因把常年 NA 的基本面放在上卦首位导致该爻恒阴，v0.5.0 起已改。）
- 风险域评分采用「风险可控度」语义（高分=更安全=阳），在 inputs 映射时由调用方做 1-原始风险 翻转。
- `scripts/divine_stock_600711.mjs` 演示：把公开数据映射为 8 域因子评分 → 384 爻 → 综合分 →
  看涨/震荡/看跌 映射（≥0.62 看涨 / ≤0.45 看跌 / 之间震荡）。结果仅为多因子研判示意，非投资建议。

### 六爻位语义与占用域（v0.5.1）
6 爻不仅是 6 个 bit，还带位置语义（`checkpoints.mjs` 的 `YAO_SEMANTICS_STOCK` 为唯一权威定义，
由 `scripts/test_hexagram.mjs` 的「爻位语义 vs 引擎 order」断言守护）：

| 爻位 | 位置语义 | bit | 占用域 | 主要驱动量（v0.5.1） |
|---|---|---|---|---|
| 初爻 | 起始/基础 | LSB | JS 技术面 | 收盘位置、涨跌%、换手×方向、均价偏离、振幅 |
| 二爻 | 内部/稳定 | | ZJ 资金面 | 净主动买入、量比、自由流通占比 |
| 三爻 | 过渡/风险 | | GZ 估值面 | PE(对数)、静态/动态 PE 之比 |
| 四爻 | 外部/行动 | | HG 宏观面 | 总市值、相对大盘、成交额占全市场比、相对换手 |
| 五爻 | 主导/核心(君位) | | HY 行业面 | 板块景气、相对板块、板块内资金占比 |
| 上爻 | 终点/极端 | MSB | FX 风险面 | PB 泡沫、距涨跌停距离（配 FX 否决白名单） |

### 股市指数 / 国际国内经济形势归属哪一层、哪一爻（FAQ）
| 对象 | 层 | 爻位 | 说明 |
|---|---|---|---|
| **国际国内经济形势**（货币/利率/地缘/通胀） | L5 八宫 **HG 离·宏观面** → L6 子域「货币政策/利率汇率/经济数据/地缘局势…」→ L7 检查点 | **四爻（外部/行动）** | 属"天"（外卦），是施加于所有标的的共同背景；不对单一标的私有，故不占初/二爻 |
| **股市指数**（上证/沪深300…） | **不是第 9 宫**，而是 HG **宏观面的参照基准**；另外作为 FX「系统性风险」的风险源 | **四爻 HG** + 渗透到 FX | 指数对所有同批标的是**同一常数**，直接入爻必然 frozen（见下），故只用"个股 × 指数"的交互项 |

三条铁律（违反任一条，该爻必然失效）：
1. **宏观/市场类数据必须转成个股相对量**才能入爻：`个股涨跌 − 指数涨跌`、`个股成交额 / 指数成交额`、`个股换手 / 指数换手`。
   若直接用"指数涨了 0.6%"，批次内全样本同值 → `quantileThresholds` 判 frozen → 恒阴，爻失去分化能力
   （v0.5.0 之前的"宏观面全市场常数"正是此病根）。
2. **八卦固定 8 宫、一卦固定 6 爻**：指数与经济形势不得新开第 9 宫或第 7 爻——那会脱离《周易》体系
   （8 爻=256 卦不再是可判读的卦）。
3. 想把"大盘本身"当推演对象时，让它**独立走完整 8 宫 384 爻**（此时它的 JB/XX 多为 NA，主导位落在 HG/HY）。

### 卦空间数学（为什么"只有 20 多种"而不是 64）
- 6 爻 = 6 bit → 卦**空间**上限 2^6 = **64**，引擎侧早已完备（`test_hexagram` 64 组合双射且卦名全对）。
- 但"一批样本能踩中多少种"是另一回事，三条硬约束：
  1. **有效独立爻 k**：一个宫冻结（全 NA/取值唯一）就少 1 bit。冻结 k=4 → 空间仅 16，正是最初 13~15 种的原因。
  2. **样本量 N 是硬天花板**：cover ≤ min(N,64)。N=56 时上限只有 56；6 bit 独立且满熵的**期望**约 37.5 种；
     要集齐 64 种，coupon collector 期望需 ≈303 个样本。**N<64 时物理上不可能覆盖 64 种。**
  3. **域间相关性**：|r|>0.6 视为同源，比特不叠加（实测 HY~JS、HG~HY 约 0.68）。
- 分辨率：**域 score 档位 ≈ 6m+1**（m=活跃子域数）。只激活 1 个子域时仅 7 档，中位数切不开 → 爻阳占比偏斜
  （v0.5.0 实测 HY 89.3%、HG 87.5%）。因此"补子域"是提高熵的主要手段。
- 实测演进（56 只真实行情）：15 → 16（加 HG01/FX02）→ 23（三才重排）→ **28**（补子域至 m=2~5，frozen 清零）。
- ⚠ 反直觉结论（有实测支撑）：**"逐爻熵最大"≠"卦种最多"**。实验把最偏斜的初爻从 67.9% 强行压到 46.4%，
  卦种反而由 28 掉到 26——因为联合覆盖取决于 64 宫格上的实际落点，而非单轴均衡。

### 补子域与 proxy 口径（v0.5.1）
- **同源规避**：一个原始量只映射到一个子域（见 `adapters/quote.mjs` 的 `RULES_TEXT`），
  否则新增爻与旧爻相关，卦种不增反成冗余比特。
- **代理量必须标注**：rule 名带 `-proxy`（如 `JB01-roe-proxy-pb-over-pe`、`XX08-gap-open-event-proxy`），
  并在 `RULES_TEXT` 写明推导口径（例：ROE 代理 = PB / PE，恒等式 PB/PE = E/B = ROE）。无真实财报/舆情数据源前，
  JB/XX 其余子域仍保持 NA，**不造假填充**。
- **代理量不具一票否决资格**（`PROXY_SUBDOMAINS`）：强关联失守的判定是"强度侧面值 < 0.5"，
  delta 略小于 0（如跳空 −0.1%）即跌破；而否决概率按 1−(1−p)^m 随子域数复合上升。
  实测量化：补子域后 FX/XX 激活 3~4 个子域 → 否决由 5 只飙到 **34/56（60.7%）**（XX08 独占 22 只、
  FX02 19 只，等于把"略高 PB"当黑天鹅）。豁免代理子域后 → **5 只**，且与离线基线一致；
  卦种不受影响（代理仍计入 8 宫分与六爻，仅不再单独决定 verdict）。

## 云模型接线（cloud-model.mjs，v0.3.4 真实 LLM 接通）
**调用链**：`reviewer.evaluate()` → `decomposeWithCloudModel`（L1→L7 分解）/
`concludeWithCloudModel`（L1 卦象总评）→ `callCloudModel(messages, opts)` → 适配器 → `null` 时走确定性模板。

**适配器解析优先级（从高到低）**：
1. **每次调用的 config 显式云模型设置**（`cloudModelProvider`/`cloudModelName`/`cloudModelApiKey`/
   `cloudModelCustomModels`/`sessionModel`/`cloudModelUseSessionModel` 任一非空）→ 按本次调用解析
   （工具层 `model` 参数覆盖走此路；DSH Runtime 下 config 恒带默认 provider，故默认即走此路）。
2. `config.cloudModel`（函数）。
3. 模块级 `setCloudModelAdapter(fn)` —— `index.mjs apply` 内经 `configureCloudModel(config)` 注入；
   测试亦可直接注入。`fn(messages, opts) => Promise<string|null>`。
4. **config 云模型设置**（`cloudModelEnabled !== false` 且 `resolveCloudSettings` 解析出
   apiKey/baseUrl/model）→ OpenAI 兼容 `POST {baseUrl}/chat/completions`：
   `Authorization: Bearer <key>`、body `{model, messages, temperature, stream:false}`，
   AbortController 超时（`cloudModelTimeoutMs`），解析 `choices[0].message.content`。
5. `config.cloudModelEndpoint`（旧版简易协议：POST {messages}，响应含 text/reply/content）。
6. 以上皆无或任何一步失败（401/超时/断网/解析失败）→ 返回 `null`，调用方走确定性模板。

**厂商预设**（`LLM_PROVIDER_PRESETS`，对齐 MotorDesign `Core/cloud_services_config.py`）：
deepseek=api.deepseek.com/deepseek-chat · qwen=dashscope compatible-mode/qwen-max ·
glm=open.bigmodel.cn/api/paas/v4/glm-4-plus · moonshot=api.moonshot.cn/v1/moonshot-v1-8k ·
minimax=api.minimax.chat/v1/abab6.5s-chat · openai=api.openai.com/v1/gpt-4o-mini · custom=自填 baseUrl。

**自定义模型清单（v0.3.4）**：`cloudModelCustomModels`（或 env `DAOYI_LLM_CUSTOM_MODELS`）传
JSON 数组 `[{"name":"my-gpt","label":"我的 GPT","baseUrl":"https://api.example.com/v1","model":"gpt-4o","keyEnv":"OPENAI_API_KEY"}]`；
`name` 即选用 id——`cloudModelProvider` 或 `yijing_divine`/`yijing_report` 的 `model` 参数传它即可热切换；
`keyEnv` 指定该模型专属 key 的环境变量名（留空则用通用 `DAOYI_LLM_API_KEY`）。
`yijing_model_list` 工具可列出全部可选模型与当前选择。

**DSH 会话当前模型（v0.3.4，可选）**：`cloudModelProvider='session'` 或 `cloudModelUseSessionModel=true` 时，
按序解析 `config.sessionModel`（DSH Runtime 注入：函数直接作为适配器，或 `{baseUrl,model,apiKey}` 对象）→
env `DAOYI_LLM_SESSION_BASE_URL`/`DAOYI_LLM_SESSION_MODEL`/`DAOYI_LLM_SESSION_API_KEY`；
两者皆无 → 视为未启用（离线模板，不报错）。`index.mjs apply` 亦接受 `ctx.sessionModel` 注入。

**环境变量兜底**：`DAOYI_LLM_ENABLED` / `DAOYI_LLM_PROVIDER` / `DAOYI_LLM_API_KEY` /
`DAOYI_LLM_MODEL` / `DAOYI_LLM_BASE_URL`；另兼容厂商专属 `DEEPSEEK_API_KEY` 等。
有密钥即视为启用（`cloudModelEnabled: false` 可显式关停）。

**密钥安全**：Key 只从 config/env 读取；日志只打印 provider/model/启用状态，绝不含 Key；
`telemetryEnabled` 默认 false，不外发决策内容。

**提示词**：decompose 要求模型按六层输出结构化 JSON（`layers`/`key_factors`/`missing_data`），
解析失败回退纯文本；conclude 要求 ≤120 字点明最弱之宫与补救之道。
**verdict 纪律**：无论 LLM 输出什么，判定与聚合（L7→L2）永远走 aggregator.mjs 确定性代码。

## 免费额度闸门（quota.mjs，v0.3.4 起按 LLM 调用计数）
- **计数口径**：每次**真实 LLM 外发前** `assertLlmQuota` 计数（401/超时/断网同样计——失败调用也产生费用）；
  一次 `yijing_divine` = decompose + conclude = **2 次**；离线（未配置云模型）不计数。
- **本地硬闸（fail-closed）**：计数只认本地 `$DSH_HOME/storages/dsh-daoyi-yijing/llm-quota.json`
  （env `DAOYI_LLM_QUOTA_FILE` 可覆盖），默认 **20 次/天**（`freeLlmDailyLimit` / env
  `DAOYI_LLM_FREE_DAILY_LIMIT` 可调；兼容别名 `freeDailyLimit`）。断网也拦，无任何后端/遥测。
- **用尽行为**：`callCloudModel` 抛接 `LlmQuotaExceededError` → 记录闸门事件 → 返回 `null` →
  推演自动降级确定性模板（结论依然成立，verdict 不受影响）；`evaluate` 结果 `llm.quota_blocked/notice`
  与 `yijing_report` 的【额度提示】行向用户说明原因。
- **运维旁路**：`freeQuotaEnabled: false` → 不拦、不计数（自建部署场景）。
- **诚实边界**：本地软限制——可删/改 llm-quota.json 清零；与 l0 `lib/quota.mjs` 同口径。

## 自定义剧本持久化（registry.mjs）
- `saveCustomScript(script)` 写 `data/scripts/<script_id>.json`；失败不致命（内存态仍有效）。
- `configureRegistry(dataDir)` 在 `index.mjs apply` 内调用，启动回灌磁盘剧本到内存。

## 自检
```
node scripts/verify.mjs          # 结构/阴阳/否决/覆盖率/NA 断言（27 项）
node scripts/runtime-check.mjs   # 模拟 apply：自校验 + 真实 divine + report + 模型清单
node scripts/_mock_llm_test.mjs  # 云模型适配器 e2e（mock OpenAI 服务器，20 项，无需密钥）
node scripts/_selftest_llm_quota.mjs # LLM 调用计数闸门 + 自定义模型 + session 解析（隔离配额文件）
node scripts/_probe_definetool.mjs   # 真实 defineTool 编译器校验（需 node_modules/@deepseek-ai/dsh-tools，见脚本头注）
node scripts/divine_with_llm.mjs "决策事项" commercial   # 真实 LLM 推演示例（env 驱动）
```
