# 工程说明（ENGINEERING.md）

## 目录结构
```
dsh-daoyi-yijing/
├── manifest.json              # 插件元数据（displayName=道一-易经推演，id=cn.daoyi.dsh-yijing）
├── package.json               # name/version(type:module)/dsh 段
├── index.mjs                  # DSH 入口（apply 生命周期：registry 回灌 + 自校验 + 注册工具）
├── cordis.patch.yml           # 运行时配置补丁
├── skills/daoyi-divine/       # 给模型的技能指令
├── tools/yijing/              # 4 个工具（runXxx 纯函数 + registerXxx 薄封装）
├── lib/yijing/                # 核心引擎（判定/聚合确定性；云模型仅作文案层）
│   ├── checkpoints.mjs        # 检查点库 + 剧本加载 + 规范 384 / 股票 384 / 商用 384 生成器 + NA 标记
│   ├── mapping.mjs            # 取值解析 + 阴阳判定（阈值兜底，boolean 对齐 Python value==1）
│   ├── aggregator.mjs         # 六层加权聚合（强关联一票否决）+ NA 排除 + 覆盖率
│   ├── reviewer.mjs           # 推演编排 + 报告生成 + 云模型集成点
│   ├── cloud-model.mjs        # 云模型适配器（OpenAI 兼容真实调用 + 6 厂商预设 + env 解析 + 离线降级）
│   ├── grading.mjs            # 评估渐细轴（正/反 · 正/中/反 · 正/偏正/偏反/反，纯函数展示层）
│   ├── registry.mjs           # 自定义剧本注册表（fs 持久化 + 启动回灌）
│   ├── selfcheck.mjs          # 加载自校验（纯 lib，零 Runtime 依赖）
│   └── scripts/motor-design.mjs# 真实剧本（AUTO-GENERATED，来源 _extract_motor_design.py）
├── data/scripts/              # 自定义剧本落盘（运行时生成）
├── scripts/verify.mjs         # 裸 Node 离线自检
├── scripts/runtime-check.mjs  # DSH Runtime 联调预演（纯 run* 函数）
├── scripts/_mock_llm_test.mjs # 云模型适配器 e2e（本地 mock OpenAI 服务器，18 断言）
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
| cloudModelProvider | deepseek | 厂商：deepseek/qwen/glm/moonshot/minimax/openai/custom |
| cloudModelApiKey | '' | API Key（Bearer；绝不外发、不入日志；也可用 env `DAOYI_LLM_API_KEY`） |
| cloudModelName | '' | 模型名（留空取厂商默认：deepseek-chat/qwen-max/glm-4-plus/moonshot-v1-8k/abab6.5s-chat） |
| cloudModelBaseUrl | '' | 自定义 Base URL（留空取厂商默认；custom 厂商必填） |
| cloudModelTimeoutMs | 30000 | 单次调用超时（毫秒） |
| cloudModelTemperature | 0.3 | 采样温度（低值保稳） |
| cloudModelEndpoint | '' | 旧版简易协议端点（POST {messages}）；留空则不用 |
| freeQuotaEnabled | true | 本地闭环免费额度闸门（断网也拦；**尚未按 LLM 调用计数，见 CHANGELOG 0.3.4 披露**） |
| freeDailyLimit | 10 | 每日免费额度 |
| telemetryEnabled | false | 脱敏回传默认关 |
| knowledgeBaseUrl | '' | 在线知识库入口（可选） |

## 引擎架构边界（§2.1）
- **确定性层（L7→L2）**：`mapping.mjs` 阴阳判定 + `aggregator.mjs` 六层加权聚合，是 verdict 唯一裁判。
  含强关联一票否决、NA 域/单点排除（`yijing_mapping.py:204/206` 口径）、覆盖率审计。
- **云模型层（L1→L7 分解 / L1 结论文案）**：`cloud-model.mjs` 仅做“翻译器”，不参与 verdict 决策。
- **NA 处理**：COST/MANU 整域 + 单点 NA 清单排除出聚合（不造假），计入 `coverage`。

## 股票趋势研判剧本 stock-trend
- 8 域：基本面(乾)/技术面(坤)/资金面(震)/消息面(巽)/行业面(坎)/宏观面(离)/估值面(艮)/风险面(兑)。
- 三才：天(基本面/行业/宏观)、地(技术/资金/估值)、人(消息/风险)。
- 风险域评分采用「风险可控度」语义（高分=更安全=阳），在 inputs 映射时由调用方做 1-原始风险 翻转。
- `scripts/divine_stock_600711.mjs` 演示：把公开数据映射为 8 域因子评分 → 384 爻 → 综合分 →
  看涨/震荡/看跌 映射（≥0.62 看涨 / ≤0.45 看跌 / 之间震荡）。结果仅为多因子研判示意，非投资建议。

## 云模型接线（cloud-model.mjs，v0.3.4 真实 LLM 接通）
**调用链**：`reviewer.evaluate()` → `decomposeWithCloudModel`（L1→L7 分解）/
`concludeWithCloudModel`（L1 卦象总评）→ `callCloudModel(messages, opts)` → 适配器 → `null` 时走确定性模板。

**适配器解析优先级（从高到低）**：
1. 模块级 `setCloudModelAdapter(fn)` —— `index.mjs apply` 内经 `configureCloudModel(config)` 注入；
   测试亦可直接注入。`fn(messages, opts) => Promise<string|null>`。
2. `config.cloudModel`（函数）。
3. **config 云模型设置**（`cloudModelEnabled !== false` 且 `resolveCloudSettings` 解析出
   apiKey/baseUrl/model）→ OpenAI 兼容 `POST {baseUrl}/chat/completions`：
   `Authorization: Bearer <key>`、body `{model, messages, temperature, stream:false}`，
   AbortController 超时（`cloudModelTimeoutMs`），解析 `choices[0].message.content`。
4. `config.cloudModelEndpoint`（旧版简易协议：POST {messages}，响应含 text/reply/content）。
5. 以上皆无或任何一步失败（401/超时/断网/解析失败）→ 返回 `null`，调用方走确定性模板。

**厂商预设**（`LLM_PROVIDER_PRESETS`，对齐 MotorDesign `Core/cloud_services_config.py`）：
deepseek=api.deepseek.com/deepseek-chat · qwen=dashscope compatible-mode/qwen-max ·
glm=open.bigmodel.cn/api/paas/v4/glm-4-plus · moonshot=api.moonshot.cn/v1/moonshot-v1-8k ·
minimax=api.minimax.chat/v1/abab6.5s-chat · openai=api.openai.com/v1/gpt-4o-mini · custom=自填 baseUrl。

**环境变量兜底**：`DAOYI_LLM_ENABLED` / `DAOYI_LLM_PROVIDER` / `DAOYI_LLM_API_KEY` /
`DAOYI_LLM_MODEL` / `DAOYI_LLM_BASE_URL`；另兼容厂商专属 `DEEPSEEK_API_KEY` 等。
有密钥即视为启用（`cloudModelEnabled: false` 可显式关停）。

**密钥安全**：Key 只从 config/env 读取；日志只打印 provider/model/启用状态，绝不含 Key；
`telemetryEnabled` 默认 false，不外发决策内容。

**提示词**：decompose 要求模型按六层输出结构化 JSON（`layers`/`key_factors`/`missing_data`），
解析失败回退纯文本；conclude 要求 ≤120 字点明最弱之宫与补救之道。
**verdict 纪律**：无论 LLM 输出什么，判定与聚合（L7→L2）永远走 aggregator.mjs 确定性代码。

## 自定义剧本持久化（registry.mjs）
- `saveCustomScript(script)` 写 `data/scripts/<script_id>.json`；失败不致命（内存态仍有效）。
- `configureRegistry(dataDir)` 在 `index.mjs apply` 内调用，启动回灌磁盘剧本到内存。

## 自检
```
node scripts/verify.mjs          # 结构/阴阳/否决/覆盖率/NA 断言（27 项）
node scripts/runtime-check.mjs   # 模拟 apply：自校验 + 真实 divine + report
node scripts/_mock_llm_test.mjs  # 云模型适配器 e2e（mock OpenAI 服务器，18 项，无需密钥）
node scripts/divine_with_llm.mjs "决策事项" commercial   # 真实 LLM 推演示例（env 驱动）
```
