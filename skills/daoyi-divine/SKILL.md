---
name: daoyi-divine
description: 道一-易经推演 决策辅助技能：把任意决策事项套入六层推演框架（384爻→64卦→8宫→四象→三才→两仪→太极），输出可定/否定结论与易经风格研判。当用户要求推演/测算/评估某事项成功率、吉凶、涨跌，或提及万事决/易经推演/道一时使用。Use when the user asks for structured decision review, divination-style evaluation, or mentions 万事决 / 道一.
whenToUse: 用户提出决策研判需求（推演/测算/评估成功率/吉凶/涨跌/可行性）、提及「万事决」「易经推演」「道一」，或需要对电机电磁设计/股票趋势/商业成功率做结构化评审时加载。
metadata:
  version: 0.4.2
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
- **离线/断网降级**：未配置或调用失败（401/超时/断网）时，L1→L7 返回结构化因数清单（剧本骨架），
  L1 文案走确定性模板（易经卦象头 + 八宫明细），推演结论依然成立、verdict 不受影响。

## 工具用法
- `yijing_divine(matter, script?, inputs?, detail?, model?)`：主入口。给出可行/有条件可行/不可行结论；
  `model` 可按调用覆盖模型（厂商 id / 自定义模型 name / session）。
- `yijing_script_list()`：列出内置与自定义剧本。
- `yijing_script_load(script_json)`：加载自定义剧本（JSON）。
- `yijing_report(matter, script?, inputs?, model?)`：生成详细报告并回灌 `yijing_gray_logs/`。
- `yijing_model_list()`：列出可选模型（6 厂商预设 + 自定义清单 + session）、当前选择与今日 LLM 额度快照。

## 内置剧本
- `motor-design`：电机电磁设计·万事决（真实 384 检查点，226 活跃 / 158 NA）。
- `stock-trend`：股票趋势研判·万事决（8 股票分析域 × 64 子域 × 384 爻）。
- `demo-384`：规范 384 结构演示剧本（verify 向量）。

## 判定规则
- 符合阈值 = 阳(+1)，不符合 = 阴(-1)。
- 强关联检查点失败 → 该子领域一票否决 → 整条结论判“不可行”。
- 加权综合分 ≥ 0.75 → 可行；≥ 0.5 → 有条件可行；否则不可行（含否决优先）。
- 股票场景额外映射：综合分 ≥ 0.62 → 看涨；≤ 0.45 → 看跌；之间 → 震荡。
