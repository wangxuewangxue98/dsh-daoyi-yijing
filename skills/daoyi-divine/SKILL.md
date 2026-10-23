---
name: daoyi-divine
description: 道一-易经推演 决策辅助技能：把任意决策事项套入六层推演框架（384爻→64卦→8宫→四象→三才→两仪→太极），输出可定/否定结论与易经风格研判。当用户要求推演/测算/评估某事项成功率、吉凶、涨跌，或提及万事决/易经推演/道一时使用。Use when the user asks for structured decision review, divination-style evaluation, or mentions 万事决 / 道一.
whenToUse: 用户提出决策研判需求（推演/测算/评估成功率/吉凶/涨跌/可行性）、提及「万事决」「易经推演」「道一」，或需要对电机电磁设计/股票趋势/商业成功率做结构化评审时加载。
metadata:
  version: 0.9.4
user-invocable: true
disable-model-invocation: false
---

# 道一-易经推演 技能

## 定位
通用决策辅助工具（**非迷信**）。把任意决策事项拆解为可量化检查点，套入六层推演框架
（384 爻 → 64 卦 → 8 宫 → 四象 → 三才 → 两仪 → 太极），输出结构化结论与易经风格研判。
结论由用户输入的参数与阈值决定，可追溯、可审计。

## 六层推演骨架（L1→L7 与 L7→L1）
插件把任意决策事项套入固定六层骨架，由 1 个问题目标逐层收敛到 384 个关键考虑因数，
再由其逐层归并回 1 个肯定/否定结论。

**L2/L3/L4 是“评估渐细轴”**：随层级下钻，对事项的研判粒度逐级加细——
两仪判「正/反」两端，三才分「正/中/反」三态，四象细到「正/偏正/偏反/反」四态；
L5/L6/L7 则是「分解粒度」：由 8 业务域拆到 64 子域再拆到 384 关键因数。

| 层级 | 名称 | 结构 | 含义 |
|------|------|------|------|
| L1 | 太极 | 1 | 1 个问题目标（决策事项） |
| L2 | 两仪 | 2 | **正 / 反** 两方面（肯定 / 否定 两条主线） |
| L3 | 三才 | 3 | **正 / 中 / 反** 三方面 |
| L4 | 四象 | 4 | **正 / 偏正 / 偏反 / 反** 四方面 |
| L5 | 八宫 | 8 | 8 个业务（分析）域 |
| L6 | 六十四卦 | 64 | 64 个子领域 |
| L7 | 384 爻 | 384 | 384 个关键考虑因数 |

> 说明：L2/L3/L4 的「正/中/反」为**评估分级轴**（表达研判的渐细梯度）；
> 而具体剧本仍可保留「天/地/人」等**域分组标签**（如商业剧本：天=产品力/赛道/宏观、
> 地=交付/机制/价值、人=品牌/风险），二者正交——前者是评分梯度，后者是域归类。

## 双向推演闭环（核心算法主轴）
- **正向分解 L1→L7（调用云模型）**：太极(L1)→两仪(L2，正·反)→三才(L3，正·中·反)→
  四象(L4，正·偏正·偏反·反)→八宫(L5)→六十四卦(L6)→384 爻(L7)。
  由 1 个问题目标，逐层调用云模型，推演分解到 384 个关键考虑因数。
- **反向聚合 L7→L1（调用云模型）**：384 爻(L7)→六十四卦(L6)→八宫(L5)→四象(L4)→
  三才(L3)→两仪(L2)→太极(L1)。由 384 个关键考虑因数，逐层调用云模型，推演归并到
  1 个问题目标的**肯定或否定**。
- **云模型是“翻译器”而非“裁判”**：L1→L7 的自然语言拆解 与 L1 卦象文案由云模型生成；
  判定与聚合（L7→L2 的阴阳判定、强关联一票否决、加权综合、verdict）永远走 aggregator.mjs 的
  确定性代码，云模型不介入 verdict 决策——保证可审计、可离线复算。
- **评估分级轴实现**：`lib/yijing/grading.mjs` 将连续评分映射为正/反、正/中/反、正/偏正/偏反/反
  三套等级并统计八宫分布，使 L2/L3/L4 表达真实梯度（根治阴阳硬二分失真）；**该分级仅作展示，
  不干预 verdict**。
- **真实 LLM 已接通（v0.3.4）**：配置 `cloudModelEnabled=true` + 厂商/密钥（或环境变量
  `DAOYI_LLM_*`）后，L1→L7 分解（结构化 JSON：layers/key_factors/missing_data）与 L1 卦象总评
  由真实云模型生成；支持 deepseek/qwen/glm/moonshot/minimax/openai/custom（OpenAI 兼容）。
- **自定义模型清单（v0.3.4）**：`cloudModelCustomModels`（或 env `DAOYI_LLM_CUSTOM_MODELS`）传
  JSON 数组 `[{name,label,baseUrl,model,keyEnv}]`，`name` 即选用 id；`yijing_divine`/`yijing_report`
  的 `model` 参数可传厂商 id / 自定义模型 name / `session` 按调用热切换。
- **DSH 会话当前模型（v0.3.4，可选）**：`cloudModelProvider='session'`（或
  `cloudModelUseSessionModel=true`）时使用 Runtime 注入的 `config.sessionModel`
  （函数或 `{baseUrl,model,apiKey}`）或 env `DAOYI_LLM_SESSION_*`；未注入则离线模板。
- **免费 LLM 节流（v0.4.2）**：主节流为**每分钟速率上限**（默认 10 次/60s 滑动窗口，`freeLlmPerMinute`），
  超出进入 FIFO 队列**排队等待**，不拒绝不降级；每日硬上限 `freeLlmDailyLimit` 默认 0（关闭）作为可选兜底；
  `freeQuotaEnabled:false` 为运维旁路；`yijing_model_list` 可查额度快照（只读）。
- **对话中自动借用会话大模型（v0.5.1，默认开）**：Runtime 注入 `config.sessionModel` 且用户未配置
  自有 `apiKey` 时**自动启用当前对话的模型**——无需手动开 `cloudModelEnabled`、无需自备 Key
  （仍受 v0.4.2 速率闸门约束）。关闭：`cloudModelAutoSession:false` 或显式 `cloudModelEnabled:false`；
  自备 Key 时不抢会话模型（走用户厂商路径）。
- **64 卦判词库（v0.5.0）**：离线 L1 文案不再只有 verdict 三选一——`lib/yijing/hexagram-texts.mjs`
  为全部 64 卦提供独立判词（卦辞要义+行事建议+卦性），动爻变卦行带变卦判词；
  由 `scripts/test_hexagram_texts.mjs`（19 断言：双射一致/64 判词互异/离线文案逐卦唯一）守护。
- **可选在线模式（v0.5.0，v0.5.1 增强）**：`adapters/quote.mjs` 腾讯行情适配层（批量、免费、无鉴权），
  透明归一化（PE **对数连续映射**→GZ01、收盘位置→JS01、换手×方向→JS04、振幅→JS08、
  **外盘/内盘净主动买入**→ZJ01（真实资金流，与涨跌%解耦）；亏损/无字段→NA）；
  断网/超时/字段缺失回退 NA，整体失败回退基线，**离线核心不被污染**；代理环境用
  `createCurlFetcher({proxy})` 注入 fetcher。批处理：`node scripts/divine_batch_stocks.mjs --live`。
- **卦象分位数编码（v0.5.1）**：爻二值化由绝对阈值 `≥0.5` 改为**批次内中位数分位**
  （`hexagram.quantileThresholds`），使每个活跃爻阴阳各半（满熵）；批次内取值唯一的域判为
  `frozen` → **恒阴**（消除 NA 恒阳偏置）。单批卦种上限 = 2^(有效独立爻数)——有效爻数见下条（v0.5.2）。
- **补子域 + 卦象空间扩容（v0.5.2）**：每个宫由 1 个子域补到 2~5 个（腾讯快照中此前未用的字段全部启用：
  量比、自由流通比、静态/动态 PE 之比、相对板块、板块内资金占比、相对大盘、成交额占全市场、相对换手、
  距涨跌停、ROE 代理、跳空），**一个原始量只映射到一个子域**以避免爻间同源。
  有效爻 **4→6**，卦空间上限 **16→64**，56 只实测卦种 **11→28**，**冻结域清零**（JB/XX 亦从 NA 解冻）。
- **六爻位语义（v0.5.2）**：初爻 JS(基础·LSB) → 二爻 ZJ(内部) → 三爻 GZ(过渡) → 四爻 HG(外部) →
  五爻 HY(主导·君位) → 上爻 FX(极端·MSB)。股市指数与国际国内经济形势归 **HG 离·宏观面（四爻）**，
  且必须转成个股相对量（直接用指数绝对值会因批次内同值而判 frozen）。代理量子域**不具一票否决权**但照常计分。
- **单事项触达 64 卦（v0.6.0，本版核心）**
  - **参照系独立于本次调用**：卦象编码阈值默认取「全市场校准基线分位」
    （`lib/yijing/baselines.mjs` 读 `baselines-stock.json`，缺省 p50）。爻义从「绝对分 ≥0.5」
    变为「**相对市场中位偏强/偏弱**」——一只股票资金面 0.62 对比全市场中位 0.48 → 阳，下只 0.41 → 阴。
  - **校准**：`node scripts/calibrate_stock_baselines.mjs --n 400`（400 只随机样本）。
    实测卦象 **48/64 种**（绝对阈值 8/64、v0.5.2 批次分位 28/64）；基线内含 `yao_yang_ratio`
    与 `hexagram_distinct_in_sample`，「满熵」可审计。
  - **对话内自动拉行情**：stock-trend 剧本下 `yijing_divine` 传 `symbols`（或让 `matter` 里带 6 位代码）
    即自动构建 384 爻 inputs（`adapters/stock-inputs.mjs`，与校准脚本同口径）；
    `useQuote:false` 或 `stockQuoteEnabled:false` 可关。
  - **`hexEncoding`**：`auto`（默认：行情路径有基线即用）/ `baseline` / `absolute`。
- **`yijing_factor_prompt`：L1→L7 拆解由对话大模型完成（v0.6.0）**
  - 流程：本工具取「八宫打分表 prompt」→ 当前对话大模型按 prompt 填 JSON → 扁平化为
    `{"EM":0.6,…}` 作为 `inputs` 传给 `yijing_divine`。LLM 打分**第一次真正驱动 384 爻**
    （此前 `decomposition_json` 只被打印、不产分数）。
  - 这条路径同时绕开「插件内自动调会话模型」的结构性阻塞（当前 DSH 内核无 `sessionModel` 服务）。
  - `inputs` 支持**宫级简写**（`{"EM":0.72}` = 该域全部活跃检查点同值，8 个数驱动全引擎）；
    宫级取值走归一化语义 `>0.5 为阳`（motor-design 阈值是温升 K/温度 ℃/`boolean[1,1]` 等工程量纲，
    直接比阈值会全阴）；检查点精确 id 优先，仍走工程量纲阈值。
  - **宫码因剧本而异**：motor-design 是 `EM/TH/ME/MT/EF/COST/MANU/RELIAB`，
    stock-trend 是 `JB/JS/ZJ/XX/HY/HG/GZ/FX`。传错码会被 `unmatched` 点名并 `degraded`。
- **v0.9.2 反向委托显式化（让机制必被感知）**
  - **① 工具描述第一行**：`yijing_divine` 的工具描述首句即写「可调 `yijing_factor_prompt` 取八宫打分 prompt → 对话大模型填分 → 以 inputs 回传本工具（无需 API Key、费用计入当前对话）」。工具 schema 是插件与对话模型唯一共享面，放第一句必被感知——模型在任何一次 divine 调用前都能看到这条 100% 可行的替代路径。
  - **② 降级即给下一步**：任一降级返回（无输入 `source:'none'` / 覆盖率 `<50%` / `LLM 补分降级`）都带结构化 `next_action:{reason,remedy}`，`remedy.tool` 直指 `yijing_factor_prompt`、`remedy.args` 带本次 `matter` 与 `script`——模型见降级即知下一步调什么，把"无质量输入时的静默误报"转成"明确的下一步动作"。
- **输入可观测性（v0.6.0）**：`inputs_coverage` 现含 `unmatched`（不匹配任何检查点/宫的键）与
  `granularity`；紧凑输出有 `degraded`（无有效输入或覆盖率 <50%）。**错宫码/缺输入不再静默出「100% 可行」**。
- **卦象显式字段（v0.6.0）**：`evaluate()` 返回值新增 `hexagram`
  （`name/moving_yao/changed/yaos/threshold_source/thresholds`），不再只嵌在文案里。
- **腾讯响应 GBK 修复（v0.6.0）**：`decodeTencentBytes()` 统一按 GBK 解码（此前 `res.text()`
  按 UTF-8 解 → 中文名全乱码，数字字段是 ASCII 所以不暴露）。
- **离线/断网降级**：未配置或调用失败（401/超时/断网）时，L1→L7 返回结构化因数清单（剧本骨架），
  L1 文案走确定性模板（64 卦判词头 + 动爻变卦 + 八宫明细），推演结论依然成立、verdict 不受影响。
- **四连卦纵向展开（v0.7.0）**：stock-trend 推演返回值新增 `quad_hexagram`——同一批 384 检查点按
  域卦①/子域位卦②/业务族卦③（L 水平存量·T 趋势变化·S 结构质量·M 边际拐点·R 风险安全·C 催化事件）/
  爻位卦④ 四个正交轴各投影成 6 爻卦，爻阈值取分组基线 p50（冻结组恒阴），含四卦 tone 一致性矩阵
  （分歧样本 = 最值得人工复核，分歧时以卦①域卦为基准趋势卦）。
- **工具层透出 + 分层校准（v0.7.1/v0.7.2）**：`yijing_divine` 紧凑输出含 `quad_hexagram` 摘要；
  卦象编码阈值支持**按层参照系**（市值带×涨跌带 stratum，层内 n<20 诚实回落总体），
  `hex_encoding` 标注 `baseline:stratum`/`baseline`/`absolute`。
- **1296 四层剧本 `stock-trend-v2`（v0.8.0，默认不启用）**：6 域 × 6 分域 × 6 子域 × 6 aspect = 1296
  检查点（8 位 id），与旧 384 并行注册零回归；显式 `script:'stock-trend-v2'` 开启。
- **规则→子域名精映射 P2（v0.8.1，v2 默认开）**：`lib/yijing/subdomain-fine-map.mjs` 把行情规则
  按语义落到「分域×子域位」——无 LLM 时**部分激活卦③**（400 只校准实测卦③ 2→31 种）；
  `fineMap:false` 回落 L2 分域粒度（卦③坍缩为 2 种，A/B 对照用）。数据丰度诚实可查
  （基线 meta.mean_data_density，P2 下约 8.6%——未命中子域全部 NA 不造假）。
- **LLM 子域级补分（v0.8.0，`llmLevel`）**：`yijing_divine` 对 stock-trend-v2 可传
  `llmLevel:'L2'`（分域级 6 问 ≈36 秒）或 `'L3'`（子域×aspect 36 问 ≈3.6 分钟，四刀全激活）；
  行情信号优先、LLM 只补 NA 缺口；无端点/超时/解析失败 → 该键 NA 不造假。
- **LLM 费用承担方（v0.8.1，默认用户会话）**：`llmLevel` 补分**默认走用户 DSH 会话当前模型**
  （`cloudModelAutoSession` 默认开：Runtime 注入 sessionModel 且无自有 Key 即自动启用，费用计入
  用户会话）；`quote.llm_scoring.endpoint` 回报 `cost_bearer`（`user-session`/`plugin-config`/`none`）；
  可用 `model` 参数改走厂商/自有 Key。管理服务器 `/api/llm/score` 端点未部署前，L3 只有管线机制
  验证（桩会话模型），未经真实 LLM 判断质量验证。
- **「有条件可行」分级（v0.8.1）**：中间态带宽 0.5~0.75 按中位 0.625 切
  `有条件可行·偏强`/`有条件可行·偏弱`（`verdict_grade` 字段），`verdict` 原值不变；
  `verdict_margin` = 距上一条通过线的带符号余量（否决 → null）。

## 工具用法
- `yijing_divine(matter, script?, inputs?, symbols?, useQuote?, llmLevel?, fineMap?, hexEncoding?, detail?, reportStyle?, model?)`：主入口。给出可行/有条件可行（·偏强/·偏弱）/不可行结论；
  `model` 可按调用覆盖模型（厂商 id / 自定义模型 name / session）；
  `symbols`（股票代码，多个取第一个，也可省略自动从 matter 提取）在 stock-trend 下触发**自动拉行情**；
  `hexEncoding` 控制卦象阈值来源（`auto`/`baseline`/`absolute`）；
  `llmLevel`（仅 stock-trend-v2）：`L2`/`L3` LLM 子域级补分，默认走用户会话模型计费；
  `fineMap`（仅 stock-trend-v2，默认 true）：规则→子域名精映射 P2。
- `yijing_factor_prompt(matter, script?)`：生成八宫打分表 prompt（L1→L7 拆解用）。
  拿 prompt 给当前对话大模型填 JSON → 扁平化为 `{宫code: 分数}` 回传 `yijing_divine` 的 `inputs`。
- `yijing_script_list()`：列出内置与自定义剧本。
- `yijing_script_load(script_json)`：加载自定义剧本（JSON）。
- `yijing_report(matter, script?, inputs?, model?)`：生成详细报告并回灌 `yijing_gray_logs/`。
- `yijing_model_list()`：列出可选模型（6 厂商预设 + 自定义清单 + session）、当前选择与今日 LLM 额度快照。

### LLM 批量补分与并发（v0.9.0）
- **并发对 LLM 段无效**：`runLlmScoring` 串行逐 prompt 过全局速率门（默认 10/min），
  总耗时 ≈ 总 prompt 数 ÷ 速率门；并发只会让请求一起排队。
- **prompt 口径**：L2 = 6 问/只，L3 = 36 问/只 → 56 只 L3 默认门下 ≈3.4 小时，400 只 ≈24 小时。批量前先算预算。
- **提速优先级**：放宽速率门 → L3 降 L2 → 不开 LLM 用 P2 精映射 → 并发（仅加速拉行情/确定性推演等非 LLM 段）。
- **两段式写法**：非 LLM 段用 `mapLimit(items, limit, fn)`（`lib/yijing/concurrency.mjs`，顺序返回、单条失败不炸整批）；
  LLM 段直接用 `runLlmScoring`，别覆盖 `throttle`。范例：`examples/llm-batch-concurrency.mjs`。
- 详见 `docs/LLM批量补分与并发指南.md`。

### 配置项（cordis.patch.yml / index.mjs）
| 字段 | 默认 | 说明 |
|---|---|---|
| `stockQuoteEnabled` | `true` | stock-trend 下 `yijing_divine` 自动拉腾讯行情构建 inputs 的总开关 |
| `stockBaselinesPath` | `''` | 卦象编码基线表路径；留空用内置 `baselines-stock.json` |
| `freeLlmPerMinute` | `10` | 免费 LLM 每分钟速率上限（60s 滑动窗口），超出排队等待 |
| `freeLlmDailyLimit` | `0` | 每日硬上限（可选兜底，0=关闭） |
| `freeQuotaEnabled` | `true` | 本地额度闸门总开关 |
| `cloudModelAutoSession` | `true` | **会话模型唯一开关**（v0.9.1 起经 `ctx.get('llm')` 安全通道取用，不再是 inject 越权直读） |
| `cloudModelEnabled` | `false` | **用户自有云模型**总闸（与会话层解耦）；v0.9.1 起不再影响会话模型激活 |

> **v0.9.1 必读（v0.9.0 重启失败）**：v0.9.0 的 `resolveSessionInjection` 直读 `ctx.sessionModel`，
> 而 `inject` 只有 `['tools']` → cordis 守卫抛 `cannot get property "sessionModel" without inject`
> → 插件 required → DSH 启动失败。且 DSH 中该服务名并不存在（真实服务是 `llm`）。
> 修复：一律走 `ctx.get('llm')` / `safeContextService()` 安全通道，绝不外抛。
> 若在那台电脑上仍停留在 0.9.0，升级到 0.9.1 即可；也可跑 `node scripts/diagnose_install.mjs` 自检。

## 内置剧本
- `motor-design`：电机电磁设计·万事决（真实 384 检查点，226 活跃 / 158 NA）。
- `stock-trend`：股票趋势研判·万事决（8 股票分析域 × 64 子域 × 384 爻）。
- `stock-trend-v2`：股票趋势研判·1296 四层（6 域 × 6 分域 × 6 子域 × 6 aspect，8 位 id；
  默认不启用，显式指定开启；支持 `llmLevel`/`fineMap`）。
- `demo-384`：规范 384 结构演示剧本（verify 向量）。

## 判定规则
- 符合阈值 = 阳(+1)，不符合 = 阴(-1)。
- 强关联检查点失败 → 该子领域一票否决 → 整条结论判“不可行”。
- 加权综合分 ≥ 0.75 → 可行；≥ 0.5 → 有条件可行；否则不可行（含否决优先）。
- 「有条件可行」分级（v0.8.1，仅沟通/排序辅助，不改 verdict）：≥0.625 → 有条件可行·偏强；
  <0.625 → 有条件可行·偏弱。`verdict_margin` 为距上一条通过线的带符号余量。
- 股票场景额外映射：综合分 ≥ 0.62 → 看涨；≤ 0.45 → 看跌；之间 → 震荡。
