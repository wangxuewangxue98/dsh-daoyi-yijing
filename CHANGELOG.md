# CHANGELOG

## 0.7.0 (2026-10-22)
### 四连卦纵向展开（阶段 1，纯加法）：同一 384 检查点的四正交投影 + 分组基线消恒阳

> 动机：v0.6.0 已把横向卦空间开满（49/64），但单事项只出**一枚卦**（卦①域投影），
> 「子域位 / 业务族 / 爻位」三个正交轴上的结构性信息被压缩丢失（叶位分组恒 2 种卦象的坍缩）。
> 本版在 384 引擎上**纯加法**落地四连卦机制（参照四连卦设计稿，1296+LLM 重建保留为阶段 2）：
> 完全离线可跑、旧单卦字段原样保留、全量断言零回归。

- **1) 四正交投影（新 `lib/yijing/quad-hexagram.mjs`）**
  - 卦① 域（复用 6 活跃域，与单卦同源同阈值）、卦② 子域位 si(1~6)、卦③ 业务族 ci(L/T/S/M/R/C)、卦④ 爻位/aspect xi(1~6)。
  - 每爻取组内阳率 ≥ 分组基线 p50 判阳；`distinct≤1` 的冻结组 → 恒阴（沿用 quantileThresholds 既有约定）。
  - 含 `hexNameFromYaos`（先天八卦名 + 64 卦判词）、四卦 tone 一致性矩阵（2×2 同/异 + 一致率）、`quad_text` 总述。
  - 非 stock-trend 型 6 字符 id 的剧本（motor-design/demo-384 等）诚实降级 `quad_hexagram: null`，不出退化卦。

- **2) 六业务族映射（新 `lib/yijing/subfamily-map.mjs`）**
  - 384 检查点 → 六族启发式映射：域基础族 + aspect 修正（边际变化/安全边际→R、催化→M 等），六族齐 L64/T16/S80/M64/R80/C80。
  - 导出 `FAMILY_LABELS` / `FAMILY_ORDER` / `familyOf` / `assertFamilyCoverage`，附单测覆盖校验。

- **3) 分组基线（改 `lib/yijing/baselines.mjs` + `baselines-stock.json` 重校准）**
  - 新增 `groupThresholdsFromBaselines`：schema 增 `groups{si,ci,xi}` 各组 `{n,coverage,p25,p50,p75,min,max,frozen}`。
  - `calibrate_stock_baselines.mjs` 重写校准统计：NA 检查点不计入组内阳率（修复 NA 污染致组基线假全 0）、
    域分直取不均值（修复浮点 1-ulp 边界翻转）、`--curl` 开关注入 curl fetcher（代理环境取数）。
  - 400 只随机样本重校准：分组 p50 落 0.39~0.61 真实分化；xi-6（催化）全市场冻结 → 标记 frozen 恒阴。

- **4) 推演接入（改 `lib/yijing/reviewer.mjs`，加法）**
  - `evaluate` / `evaluateDeterministic` 返回值新增 `quad_hexagram` 字段；`hexagram` 等旧字段不动，368 断言零回归。
  - 阴阳口径修复：`judgeYinYang` 返回 +1/-1（非 0/1），四卦投影统一按 `=== 1` 计阳（与聚合器同口径）。

- **5) 测试与实测**
  - 新 `scripts/test_quad_hexagram.mjs`：12 断言（六族覆盖、四卦 6 爻映射、基线阈值生效、冻结恒阴、一致性矩阵、接线冒烟）。
  - 56 只自选股实测（上证 -1.48%）：卦种 di 26 / si 18 / **ci 22** / xi 17（对照设计稿轮H：②10/③11/④17），阳率大部落 35~70% 满熵带；
    四卦同象 0/56，54 只 ≥3 卦分歧（人工复核优先清单见 output/quad_hexagram_demo_results.json）；
    卦① 与单卦 **56/56 逐只一致**（接线正确性）。
  - 质量门：`verify.mjs` PASS + 9 个测试套件全绿 + `runtime-check.mjs` PASS。

## 0.6.0 (2026-10-22)
### 单事项触达 64 卦：行情接入 + 全市场基线 + LLM 打分回填

> 动机：v0.5.2 把「卦空间上限」开到 64，但**单次调用**仍触达不到——`quantileThresholds` 是
> 「批次内」分位数，对话里推 1 只/1 件事没有批次 → 回落绝对 0.5 → 各宫分挤同一侧 → 恒出乾系。
> 2026-10-22《8 只股票测试记录分析》实测：`yijing_divine` 不传 inputs 时 8/8 全「乾为天/100%/可行」。
> 本版给单事项一个**独立于本次调用的参照系**，并把 LLM 拆解真正接进评分。

- **1) 阶段 1 · 工具层接行情（P0-1）**
  - 新增 `adapters/stock-inputs.mjs`：把「腾讯行情 → 子域信号 → 384 爻 inputs」的口径从批处理脚本抽出共享，
    `tools/yijing/divine.mjs`（对话单只）与 `scripts/calibrate_stock_baselines.mjs`（校准）**同源**——基线分位数才对单只调用有可比性。
  - `yijing_divine` 新增 `symbols` 参数：stock-trend 剧本下提供或从 `matter` 自动提取 6 位代码 → 自动拉行情；
    `useQuote=false` 可关；`config.stockQuoteEnabled=false` 全局关。
  - 实测单只（15 只手选大盘股）卦象 **1 种 → 6~8 种**，判决分化为「可行/有条件可行」多档。

- **2) 阶段 2 · 全市场校准基线（单事项的参照系）**
  - 新增 `lib/yijing/baselines.mjs` + `lib/yijing/baselines-stock.json`（随包发布）：
    各宫 p25/p50/p75，阈值默认取 **p50** → 爻义从「绝对分 ≥0.5」变为「**相对市场中位偏强/偏弱**」。
  - 新增 `scripts/calibrate_stock_baselines.mjs --n 400`：一次拉全市场样本、逐只确定性推演、写基线并回验覆盖。
    **实测 400 只随机样本：卦象 48/64 种**（v0.5.2 同口径 28/64，绝对阈值 8/64）；每爻阳率 50%~70%。
  - 基线自带 `meta.yao_yang_ratio`（每爻阳率）与 `hexagram_distinct_in_sample`，「满熵」声明可审计。
  - `yijing_divine` 新增 `hexEncoding` 参数：`auto`（默认，行情路径有基线即用）/ `baseline` / `absolute`。

- **3) 阶段 3 · `yijing_factor_prompt`：L1→L7 拆解真正由 LLM 完成**
  - 新增工具 `yijing_factor_prompt`：返回「八宫打分表 prompt」（含打分语义、否决域提示、严格 JSON 要求、回填示例）；
    对话中的大模型填好 JSON → 扁平化为 `{"EM":0.6,…}` 作为 `inputs` 传给 `yijing_divine` → **LLM 打分驱动 384 爻**。
  - 这条路径同时绕开了「插件内自动调会话模型」的结构性阻塞（当前 DSH 内核不提供 `sessionModel` 服务，实测注入恒 pending），
    且让 `decomposition_json` 第一次真正参与判定（此前只被打印，不产分数）。
  - `inputs` 支持**宫级简写**：`{"EM":0.72}` 即该域全部活跃检查点同值（LLM 8 个数驱动全引擎）。
  - 宫级取值走**归一化语义**（`origin='domain'` → `>0.5 为阳`）：motor-design 的阈值是温升 K/温度 ℃/`boolean[1,1]` 等工程量纲，
    直接比阈值会全阴（实测 6 宫全否决、连「乐观」场景也判不可行）。默认 origin 仍走工程量纲阈值，两条路径显式解耦。

- **4) 输入可观测性：错码/缺输入不再静默出「100% 可行」**
  - `inputsCoverage` 重写：`provided` 按「活跃检查点被覆盖数」计，并新增 **`unmatched`** 名单
    （传入的键既不匹配检查点 id 也不匹配宫 code —— 典型事故：给 motor-design 传 JB/JS/ZJ）。
  - `yijing_divine` 紧凑输出新增 `degraded` 标记（无有效输入或覆盖率 <50% 即 true）与 `inputs.unmatched`；
    notice 会直接给出本剧本正确宫码，并提示用 `yijing_factor_prompt` 取打分表。
  - 回归实验：错宫码 → `degraded=true, coverage=0%, unmatched=[JB,JS,ZJ]`（旧实现照出「100% 可行」）。

- **5) 卦象显式字段**
  - `evaluate()` 返回值新增 `hexagram`：`{name, moving_yao, changed, yaos[6], threshold_source, thresholds}`。
    此前卦象只嵌在 `conclusion_text` 里，调用方（工具/报告/测试）取不到，「单只是否触达 64 卦」不可观测。
  - 新增 `evaluateDeterministic()`：跳过 L1 云模型的确定性入口（校准/批量预筛/单测复用），与 `evaluate` 判定部分同源。

- **6) 修复两个真 bug**
  - **腾讯响应 GBK 中文乱码**：`res.text()`/stdout 字符串拼接按 UTF-8 解 GBK 字节 → 所有中文名乱码（数字字段是 ASCII 所以不暴露）。
    新增 `decodeTencentBytes()`，默认取数器与 curl 取数器统一按 GBK 解码；已补 6 条 GBK 回归断言（含「旧行为确认会乱码」对照组）。
  - **`fetchIndexQuotes` 漏解码 Buffer**：注入 fetcher 回 Buffer 时 `typeof raw !== 'string'` 直接判 `empty-response` →
    指数上下文静默变 null → HY 宫（依赖指数 sectorPct）**整宫 NA** → 上卦少一位爻。校准脚本首跑即踩中（HY n=0）。
  - **校准分位四舍五入偏置**：p50 取 `toFixed(4)` 会把阈值抬高（0.55555→0.5556），恰好等于中位数的股票在 `>=` 判定中反被判阴，
    实测令 ZJ 爻阳率从 50% 掉到 35.5%。改为全精度存储、仅展示时格式化。

- **7) 质量门**
  - 10 套件 **368 断言全 PASS**（连续两轮全绿）：verify 27 + hexagram 29 + verdict 4 + rate_limit 22 + 判词 19 + 编码 15
    + 适配层 **106**（含 GBK 6 条）+ 自动会话 15 + **股票 inputs/基线/单事项 80（新）** + quota 51。
  - 新增 `test_stock_inputs.mjs` 覆盖：宫级简写与 origin 解耦、unmatched 审计、基线加载与满熵证据、
    factor-prompt 契约、degraded/notice、腾讯行构造器（按字段位显式赋值，杜绝手数 `~` 错位）、行情失败回退。
  - `scripts/divine_batch_stocks.mjs` 的铺开循环改调共享 `signalsToInputs`（消除同口径两份实现）；
    **56 只离线回归完全不变**（16/19/16/5，卦象仍 5 种）。
  - `test_rate_limit` 连续 15 次复跑 22/22 稳定。

- **8) 已知边界（如实披露）**
  - 64 卦**可达性**依赖样本代表性：400 只随机样本 48/64；15 只手选大盘股仅 6~8 种
    （大市值股天然高于各爻中位，属选择偏差而非缺陷）。要「任意单只都大概率落进新卦」仍需扩样本或分层抽样。
  - HY01/HY04 仍用**大盘涨跌代理**板块景气（无板块标签），`meta.sector_proxy` 已标注；HY08 不出信号（避免与 HG07 同源）。
  - JB/GZ 覆盖率 66%（亏损股无 PE → NA），这是数据限制不是 bug。
  - 另一会话的 `docs/stock-trend-v2-设计方案-暂定.md`（1296 新剥本）范围更大且**明确只规划未实施**，本版未触及。

## 0.5.2 (2026-10-22)
### 卦象空间再扩容：补子域（k 4→6，卦种 11→28）+ 语义与正确性修正 + 在线/离线对比工具

> 说明：0.5.1 条目内的「实测 8→11 种」「JB/HG 仍 frozen」「质量门 281 断言」为当时的口径，
> 已由本版覆盖（**28 种 / frozen 清零 / 8 套件全绿**）。历史条目保留原样，不再改写。

- **1) 补子域：每个宫由 1 个子域补到 2~5 个（直击「档位太粗」瓶颈）**
  - 原理：域 score 分辨率 = 活跃检查点数 + 1 = **6m+1**（m = 活跃子域数）。m=1 时仅 7 档，
    批次内中位数切不开 → 该爻偏斜 → 熵不足 1 bit。JS 此前 m=4（25 档）恰是最均衡的爻，印证该规律。
  - 腾讯快照中此前未被使用的字段全部启用，原则：**一个原始量只映射到一个子域**（避免新爻与旧爻同源）。
  - 新增子域：JS06 均价偏离｜ZJ03 量比、ZJ07 自由流通比｜GZ04 静态/动态 PE 之比｜
    HY04 相对板块、HY08 板块内资金占比｜HG03 相对大盘、HG07 成交额占全市场、HG08 相对换手｜
    FX08 距涨跌停｜JB01 ROE 代理(=PB/PE)｜XX08 跳空。
  - **JB、XX 从全域 NA 解冻**；各域 distinct 由 4~7 提到 8~16；六爻阳占比回到 50~55%（初爻 67.9% 系并列值所致）。
  - 结果：有效爻 **k 4→6**，卦空间上限 **16→64**，实测卦种 **11→28**，冻结域清零。
- **2) 五爻错位修正 + 六爻位语义表（纯语义修正，卦种不变）**
  - `sancai_mapping.tian` 由 `['HY','HG','FX']` → **`['HG','HY','FX']`**：
    四爻 HG(外部/行动) / 五爻 HY(主导·君位) / 上爻 FX(终点·极端)。五爻为周易「九五」君位，当属主导变量（个股=赛道景气）。
  - 新增 `YAO_SEMANTICS_STOCK`（初爻 JS → 上爻 FX，含 LSB/MSB 与逐位释义），
    并加断言守护「语义表 ↔ 引擎 order」，以后再被改错会立刻红。
- **3) 修复真 bug：八卦表 震/巽 标签互换**
  - 按《八卦取象歌》「震仰盂」= `001`、「巽下断」= `110`；原代码误标为 `001:'巽'` / `110:'震'`（其余 6 卦正确）。
  - 长期查不出的原因：测试与引擎持有**同一份错误映射互相印证** → 已补「按取象歌逐卦硬校验」断言。
  - ⚠ 影响：上/下卦含震或巽的卦名会变（如 NA 用例由「雷天大壮」改「风天小畜」）——**卦种数不受影响，仅判读语义**；
    **历史报告的卦名需重新生成**。
- **4) 修复结构性缺陷：代理量不得拥有一票否决权**
  - 补子域后否决数由 5 只飙至 **34/56（60.7%）**——否决概率按 1−(1−p)^m 随子域数复合上升
    （XX08 独占 22 只：−0.1% 的微小低开即否决；FX02 19 只：「PB 略高」被当成黑天鹅）。
  - 新增 `PROXY_SUBDOMAINS`：代理量子域**不具否决权但照常计分** → 否决回到 **5 只**，卦种仍 **28**
    （证明只改裁决语义、不动评分）。这也回应了此前记录的「一票否决过严」。
- **5) 股市指数 / 国际国内经济形势的归属（写入 `docs/ENGINEERING.md`）**
  - 归 L5 八宫 **HG 离·宏观面，占四爻（外部/行动）**；指数同时作为 HG 的参照基准渗透到 FX 系统性风险。
  - 铁律：宏观/市场量必须转成**个股相对量**（个股涨跌−指数涨跌、个股成交额/指数成交额）。
    直接用「指数涨 0.6%」对同批股票是同一常数 → 判 frozen → 该爻必死（正是旧版 HG 冻结的病根）。
  - 不开第 9 宫、不加第 7 爻——否则脱离《周易》体系。
- **6) 新增在线/离线对比工具 `scripts/compare_live_offline.mjs`**
  - 同版本下跑两条数据链路，输出 A~G 七段对比并生成 `logs/mode-comparison.md`。
  - 一致性拆成两个口径，避免误读：**逐股配对**（同股同卦）与**集合口径**（能产出哪些卦）是两回事。
- **实测对比（同一份代码，56 只自选股）**

  | 指标 | 离线（截图快照） | 在线（腾讯行情） |
  |---|---|---|
  | 平均信号数（数据丰度） | 4.3 | 20.8 |
  | 平均活跃宫 /8 | 3.20 | 7.71 |
  | 检查点覆盖度 | 6.8% | **32.4%** |
  | 有效爻 k → 卦空间上限 | 4 → 16 | **6 → 64** |
  | 冻结域 | 3（JB/HG/GZ） | **0** |
  | **实得卦种数** | **5** | **28** |
  | 一票否决数 | 5 | 5 |

  一致性：逐股配对 卦名 0/56、趋势 46.4%、判决 46.4%、6 爻位 bit 50.0%；
  集合口径 离线 5 种 / 在线 28 种，共有 2 种（山地剥、山水蒙），Jaccard 6.5%。
  在线达成率 = 28 / 37.5（随机满熵期望）= **75%**。
- **已知限制（诚实披露）**
  - 在线模式的检查点覆盖度仍只有 **32.4%**（384 项中 126 项活跃）——这是 28 未达 37.5 的直接原因。
    再往上需补 JB/XX 真实财报与舆情数据源（本次未接任何外部数据源，全部用本地快照字段推算）。
  - **N=56 时物理上不可能覆盖 64 种**（鸽笼原理上限 56）；随机满熵期望 37.5；要触达 64 需 ~300 只样本。
  - 残余相关：HY~JS = 0.684、HG~HY ≈ 0.68，属单日快照的固有天花板。
  - 反直觉实证：把最偏斜的初爻由 67.9% 强行压到 46.4%，卦种**反而 28→26**。
    逐爻熵最大 ≠ 联合覆盖最大，**故阈值策略未改**。
  - 两份数据采集时刻不同（离线=截图收盘快照，在线=腾讯最新收盘），个股差异中含「时间差」成分。
- **质量门**：8 套件全 PASS（verify / test_hexagram / test_hex_encoding / test_hexagram_texts /
  test_verdict_continuity / test_quote_adapter / test_auto_session / test_rate_limit）。

## 0.5.1 (2026-10-21)
### 卦象多样性提升（去相关 + 满熵编码）+ 对话中自动借用会话大模型
- **卦象编码改为批次内分位数（③ 编码优化）**：
  - 旧：每爻用绝对阈值 `score ≥ 0.5` 二值化。当某域分数整体偏高/偏低时该爻恒阳或恒阴 → **该爻信息量为 0**（熵 0，卦种上限减半）。
  - 新：`hexagram.quantileThresholds(samples)` 取批次内中位数作阈值，使每个活跃爻**阴阳各半（满熵）**；`buildYaos/resolveHexagram/resolveHexagramForScript` 新增可选 `thresholds` 参数（不传则行为完全不变，向后兼容）。
  - **冻结域恒阴**：批次内取值唯一的域（如 NA 被填成同一值 0.5）判定为 `frozen`，阈值 `Infinity` → 恒阴，**消除长期存在的「NA 恒阳偏置」**（旧行为会让无数据域全判为阳、卦象偏向乾系）。
  - 批处理脚本改为两阶段（先 evaluate 收集全批次域分 → 求分位数 → 再定卦象），`meta.hex_encoding` 输出阈值/frozen/各域取值多样性，可审计。
  - 测试 `scripts/test_hex_encoding.mjs`（15 断言）：frozen 判定、恒阴、满熵（实测「JS 全 >0.5」场景下绝对阈值 20/20 全阳 vs 分位数 10/20 各半）、端到端卦种数 13→15、向后兼容。
- **ZJ 资金面改用真实资金流（① 去相关）**：
  - 旧：ZJ01 = 涨跌幅代理，**与 JS02 同源** → 两个爻实际是一个比特（这是卦象只有 8~15 种的主因）。
  - 新：`adapters/quote.mjs` 解析腾讯行情 **外盘/内盘**（`[7]/[8]`，恒等式 外盘+内盘=成交量 已实测校验），`ZJ01 = 净主动买入占比 × 2.5`，与涨跌% 不同源。
  - 实测解耦证据：紫金矿业 −2.45% 但资金净买 +0.16；科大讯飞 +2.55% 但资金净卖 −0.004；工商银行 −0.23% 但净买 +0.14。
  - 无外盘/内盘字段时回退涨跌幅代理并标注 `-fallback`。
  - **GZ01 改对数连续映射** `(ln20 − ln PE) × 0.25`：原分段锚定把多只压成同一值，削弱该爻分化能力。
  - 测试 `scripts/test_quote_adapter.mjs` 58 → **66 断言**。
- **对话中自动使用当前对话的大模型（LLM）**：
  - 需求：插件在 DSH 对话中被调用时，自动使用当前对话的模型，**无需手动开 `cloudModelEnabled`、无需自备 API Key**。
  - 现状：`apply()` 已有「provider 为默认时自动切 session」逻辑，但被 `cloudModelEnabled: false` 默认值挡住（session 分支 `enabled = active && config.cloudModelEnabled !== false` → false）。
  - 新增 `cloudModelAutoSession`（**默认 true**）：Runtime 注入 `config.sessionModel` 且用户未配置自有 `apiKey` 时自动启用，仍受 v0.4.2 速率闸门（10 次/分钟 + 排队）约束；`cloudModelAutoSession:false` 或显式 `cloudModelEnabled:false` 可关闭。
  - 修复真 bug：自备 apiKey 时仍误走 session 分支导致自有 Key 失效 → `useSession` 增加 `!hasOwnApiKey` 条件。
  - 测试 `scripts/test_auto_session.mjs`（15 断言）：自动启用/有 Key 不抢/关闭途径/env 形态/手动模式。
- **实测（2026-10-21 真实行情 56/56）**：在线模式卦象种类 **8 → 11 种**（4 个活跃爻，理论上限 16；JB/HG 仍 frozen 待补数据）；离线 5 种但卦象由「全乾系」转为「坎/坤系」（偏置已修）。
- **修复真 bug：速率限制器 `queued` 误报（P1）**：
  - 旧：`pumpRate` 用 `queued: waitMs > 0` 判定是否排队，而 `waitMs = Date.now() - enqueuedAt` 是**同一 tick 内的毫秒差值**。一旦跨过毫秒边界，即时放行的调用也会被判成「已排队等待 1ms」，进而在结果里向用户输出并不存在的排队提示。
  - 实测抖动：连续跑 `test_rate_limit` 约 **1/6 批次复现**（20 PASS / 1 FAIL），属发布前必须消除的不确定性。
  - 新：`queued` 改为**语义判定**——入队项带 `inline` 标记，只有「本调用自己的同步泵没放行、后被补位」才算 `queued=true`（`quota.mjs`）；`waitMs` 仍为真实等待时长。
  - 新增防抖动回归断言 `①b`：`freeLlmPerMinute=1000` 下连续 30 次调用必须全部 `queued=false`（修复前必然触发）。
- **质量门**：9 套件 **281 断言全 PASS**（verify 27 + hexagram 29 + verdict 4 + rate_limit **22** + 判词 19 + **编码 15** + 适配层 **99** + **自动会话 15** + quota 51）；其中 `test_rate_limit` 连续 15 次复跑 **15/15 稳定通过**（修复前 12/12 全部抖动）。
- **已知限制（诚实披露）**：单批卦种上限 = 2^(有效独立爻数)；当前 4 爻 → 上限 16，实测 11（HY 仅 4 档 + 残留相关）。要到 26+ 需补 JB/HG（阶段②，需财务/宏观数据源）；要在 56 只规模触达 64 种**结构上不可能**（需 ~300 只样本）。

## 0.5.0 (2026-10-21)
### 补全 64 卦判词 + 可选在线模式（行情适配层）
- **补全 64 卦判词**（新模块 `lib/yijing/hexagram-texts.mjs`）：
  - 旧版离线判词只有 `VERDICT_DESC` 三选一（可行/有条件可行/不可行）+ `HEX_DESC` 15 条，64 卦共用同一组描述（用户侧表现为「卦的判词只有两种」）。
  - 现在全部 **64 卦各有独立判词**（卦辞要义 `judgment` + 行事建议 `advice` + 卦性 `tone`），离线结论文案头部改为「卦名：判词（建议）——本卦判：verdict」；动爻变卦行带变卦判词。
  - `reviewer.generateConclusionText` 与 `hexagram.resolveHexagram.desc` 均切换到判词库；`HEX_DESC` 降级为兼容回退。
  - 测试 `scripts/test_hexagram_texts.mjs`（19 断言）：判词表与 HEXAGRAMS 双射一致、64 判词互异、离线文案 64 卦逐卦唯一（证明「只有两种」已修复）。
- **新增可选在线模式**（新模块 `adapters/quote.mjs`，产品化原型结论）：
  - 数据源：腾讯财经 `qt.gtimg.cn`（批量单请求、免费、无需鉴权；URL 用 sh/sz/bj 市场前缀符号，字段 `~` 分隔）。
  - 透明归一化规则（`RULES_TEXT` 导出，可审计）：GZ01 绝对估值（PE 分段锚定，便宜→阳/贵→阴，亏损→NA）、JS01 趋势方向（收盘位置居中化）、JS02 动量强度（同基线）、JS04 量能配合（换手分档×当日方向，弱信号）、JS08 波动特征（振幅分档）、ZJ01 主力资金（沿用基线代理口径，局限已声明）；JB/HG 无字段→NA。
  - **断网/超时/字段缺失 → 对应信号回退 NA，绝不污染离线核心**；整体取数失败 → 调用方整体回退基线（`test_quote_adapter.mjs` 验证回退后趋势与离线逐只一致）。
  - fetcher 可注入（测试/代理环境）；默认全局 fetch；`createCurlFetcher({proxy})` 供代理环境（undici 不读代理变量）。
- **批处理脚本 `--live`**（`scripts/divine_batch_stocks.mjs`）：
  - 重构为可测试的 `runBatch({live, fetcher, stocks, outFile})`；`--live` 走适配层，输出 `logs/stock-batch-results-live.json`；默认离线路径行为不变（56 只回归 16/19/16/5、5 种卦，测试断言保护）。
  - 实测（2026-10-21 腾讯真实行情 56/56 拉取）：卦象种类 **5 → 8**（新增天泽履 11 / 火天大有 4 / 天地否 3 / 離为火 1），GZ 域 **37/56 激活**（其余 PE 缺失/亏损诚实 NA），平均覆盖率 6.8% → 11.2%。
- **质量门**：新增 2 套专项测试共 77 断言（判词 19 + 适配层 58）；全门 verify 23 + hexagram 13 + verdict 5 + rate_limit 21 + quota selftest 51 + 判词 19 + 适配层 58 = **190 断言全 PASS**。
- **修复**（由新测试抓出）：
  - `buildTencentUrl` 原用 secid（`1.601398`）格式，gtimg 实际只认市场前缀符号（`sh601398`）→ 全部 `none_match`；改为 `symbolOf()`。
  - `parseTencentQuote` 原按逗号分隔，gtimg 真实响应为 `~` 分隔 → 全部解析失败；改为 `/[~,]/` 兼容。
  - `fetchSignalsForStocks` 原按 `s.code` 取码，但批处理股票是位置数组（`s[1]`）→ 取出空码列表；改为兼容两种形态。
  - 一字线（最高=最低）`closePosition` 原为 null（误判 NA），改为中性 0.5。

## 0.4.2 (2026-10-21)
### 免费 LLM 节流改为「每分钟速率 + 队列等待」（v0.4.1 补充）
- **需求**：免费 LLM 调用限制改为 **10 次/分钟**；超出不拒绝、不降级，**排队等待**空位。
- **机制变更**（核心，非向后兼容）：
  - 旧「每日硬上限（默认 20 次/天）+ 用尽降级离线模板」作为主节流被**替换**为 **滑动窗口速率限制器**（`lib/yijing/quota.mjs` 新增 `acquireLlmRateLimit`）：在 60s 窗口内最多放行 `freeLlmPerMinute`（默认 10）次真实外发；窗口满时后来的调用进入 **FIFO 队列**，待最早的时间戳滑出窗口后逐个补位。
  - 「每日硬上限」降级为**可选兜底**：`freeLlmDailyLimit` 默认 **0 = 关闭**；仅显式配置 >0 时作为每日总闸（用尽仍降级离线模板）。
  - 全局运维旁路 `freeQuotaEnabled:false` 仍跳过速率与计数（不限速、不排队）。
- **行为保证**：队列等待**绝不丢调用、绝不降级**——这与旧「每日硬拒→null→离线模板」语义形成对照（见 `test_rate_limit.mjs` ⑦）。
- **配置新增/调整**（index.mjs Config + cordis.patch.yml 同步）：`freeLlmPerMinute`（默认 10，0=不限制）；`freeLlmDailyLimit` 默认 20→**0（关闭）**；`freeDailyLimit` 别名默认 10→**0**。env 同构：`DAOYI_LLM_FREE_PER_MINUTE`、新增 `DAOYI_LLM_RATE_WINDOW_MS`（窗口 ms，默认 60000，便于测试）。
- **可观测性**：`evaluate` 结果 `llm.rate` 暴露 `{rateLimit, queued, waitMs}`；`llm.notice` 在发生过排队时提示「已排队等待约 Nms 后放行，未降级」；`yijing_divine` 紧凑输出 `quota` 显示「速率 X 次/分钟(排队等待)」。
- **测试新增**：`scripts/test_rate_limit.mjs`（21 断言）：默认立即放行 / 排队补位 / FIFO 公平 / 不限速 / 运维旁路 / 集成不丢调用 / 超出不降级。与 `verify.mjs`(23)、`test_hexagram.mjs`(13)、`test_verdict_continuity.mjs`(5) 共同构成质量门（全绿）。
- **未发布/未推送**：本变更仅落地本地代码与文档；npm 发布与 git push 需显式确认后执行。

## 0.4.1 (2026-10-21)
### 卦名勘误 + 强化 64 卦专项测试（v0.4.0 补丁）
- **勘误**：`lib/yijing/hexagram.mjs` 的 `HEXAGRAMS` 表中 `'兑乾':'天泽履'` 为**错误**——上兑(泽)下乾(天)应为「泽天夬」；该键与 `'乾兑':'天泽履'`（上乾下兑）重名，导致 64 卦双射被破坏（全 64 组合仅映射出 63 个互异卦名，「泽天夬」不可达）。
- **发现方式**：强化 `scripts/test_hexagram.mjs`——新增「全 64 组合遍历 + 与《周易》正名逐一核对 + 双射性」断言。首跑 FAIL：#31（JS=阳 ZJ=阳 GZ=阳 JB=阳 HY=阳 HG=阴 → 兑乾）得「天泽履」应为「泽天夬」，并连带 双射性/可达性 共 3 项失败。
- **修复**：`'兑乾'` 改为 `'泽天夬'`；复跑 **13/13 PASS**（全 64 组合与正名 0 错位、64 互异、64 标准卦名全可达、动爻变卦合法、0.5 边界含入、NA 缺域→阴爻）。
- **测试增强**：`test_hexagram.mjs` 由 6 断言扩至 13 断言，覆盖 ① 已知基准 ② 全 64 组合正名核对 ③ 双射性 ④ 64 组合动爻变卦 ⑤ 动爻选取=距 0.5 最远域 ⑥ 0.5 边界含入 ⑦ NA(缺域)→阴爻(0)。与 `verify.mjs`(23)、`test_verdict_continuity.mjs`(含 8 卦象多样性) 共同构成质量门。
- **已知限制（待 P0 修复）**：批量推演脚本 `divine_batch_stocks.mjs` 在卦象层对 NA 域以 `?? 0.5`（阳界）覆盖，使 JB/HG 恒阳、卦象分布向乾系集中（本批 56 只仅得 5 种卦象，乾为天 36 只）；引擎原生 `buildYaos` 对缺域取 0（阴）。统一为 `neutral-yin` 策略见改进建议 P0。
- **未发布/未推送**：本补丁仅落地本地代码与文档；npm 发布与 git push 需显式确认后执行（已发布的 0.4.0 tarball 仍含旧 `'兑乾':'天泽履'`，待 re-publish 覆盖）。

## 0.4.0 (2026-10-21)
### P0（breaking）：修复「64 卦仅坍缩为乾为天/地水师两卦」
- **现象**：推演结果几乎恒为乾为天或地水师，64 卦框架退化成二元查表，「水山蹇（有条件可行）」结构不可达。
- **根因（对照 v0.3.5 现行代码实证）**：
  1. 卦象由 `verdict` **三元查表**生成（`reviewer.mjs` 旧 `head` 逻辑），与 64 卦/阴阳无关，最多 3 态；
  2. `overall_score` 用阳爻占比 `gs/gw`（`aggregator.mjs`），一维标量丢 8 宫分布；
  3. `verdict` 二值坍缩：`hasVeto` 一票否决 + 阈值 0.75，中间带 0.5~0.75 难以触达；
  4. 阴阳布尔硬切 `threshold≥0.5→阳`（`mapping.mjs`），梯度消失；
  5. 否决点泛滥：每子域首项 `ci===0` 皆强关联，8×8=**64 个**强否决点，任一失败全盘翻成地水师。
- **修复**：
  - 新增 `lib/yijing/hexagram.mjs`：**真·64 卦动态映射**。取 6 主域（下3+上3）按 `score≥0.5→阳` 组 6 爻，用「上卦+下卦」组合查《周易》64 卦标准表（非二进制序，规避歧义），含全阳→乾为天、全阴→坤为地断言；动爻取 6 爻内与 0.5 距离最显著一爻翻转得变卦。
  - `reviewer.mjs`：卦象改为 `resolveHexagram(domain_scores, script 域顺序)` 动态生成，保留 `verdict` 语义解读与动爻变卦注记。
  - `aggregator.mjs`：引入**连续分 verdict**（阈值 `PASS_THRESHOLD=0.65` / `COND_THRESHOLD=0.50`，基于 8 宫连续均分 `avg`）复活「有条件可行」；`overall_score` 改连续分（保留 `yang_ratio` 审计）。
  - `checkpoints.mjs`：新增**否决策略** `veto: {mode:'any'|'whiteList', whiteList:[域], minCount:N}`；`stock-trend`/`commercial` 设 `whiteList`（风险/合规域）且 `minCount:2`，`motor-design`/`demo-384` 保持 `any` 不变（向下兼容）。
- **测试**：新增 `scripts/test_hexagram.mjs`（全阳→乾为天、全阴→坤为地、组合命中、动爻变卦）与 `scripts/test_verdict_continuity.mjs`（否决收窄 + 中间态复活 + 卦象多样性，实测 8 种卦象）。端到端 5 种输入得 5 种不同卦象（乾为天/坤为地/天雷无妄/天泽履/山天大畜）。
- **Breaking**：`verdict`/`overall_score` 语义与卦象生成方式变更，次版本 bumps 0.3.5→0.4.0；`evaluate` 输出 `hexagram_info` 结构新增 `changing_yao` 字段。

## 0.3.5 (2026-10-21)
### P0 修复：`dsh.bundle.patch` 字段形态导致安装失败
- **现象**：`dsh plugin add dsh-daoyi-yijing` 安装失败，报
  `dsh.bundle.patch must be a file path or a list of file paths`。
- **根因**：`package.json` 的 `dsh.bundle.patch` 被写成嵌套对象
  （`{id,name,entry}`）——0.3.3 审计时改错了方向；DSH 安装器只接受
  **文件路径或路径列表**（参照安装正常的 `dsh-motor-ai-l0@0.6.5`：
  `"patch": "./cordis.patch.yml"`）。0.3.3 / 0.3.4 均带此缺陷发布
  （0.3.3 曾观察到安装异常，当时未定位到该字段）。
- **修复**：`dsh.bundle.patch` 改回 `"./cordis.patch.yml"`，并补 `exports`
  （`"."` / `"./cordis.patch.yml"` / `"./package.json"`，对齐 l0 发布形态）。
  发布前新增本地断言：`bundle.patch` 必须是 string 或 string[]，且指向的
  文件真实存在于 files 清单内（见 `scripts/_smoke_release.mjs`）。
- 版本对齐：manifest `version` / `skill_version` / skills[0].version、
  package.json version、SKILL.md front-matter 全部升至 0.3.5。
- 其余特性（0.3.4 的真实 LLM 接通、自定义模型清单、DSH 会话模型、
  LLM 调用计数闸门）不变，测试全量不回归。

## 0.3.4 (2026-10-20)
### ② 自定义模型清单 + DSH 会话当前模型 + LLM 调用计数计费闸门（同日补齐，随 0.3.4 一并发布）
- **自定义模型清单**（`lib/yijing/cloud-model.mjs`）：新增 `cloudModelCustomModels`（JSON 数组字符串）
  与 env `DAOYI_LLM_CUSTOM_MODELS`，每项 `{name,label,baseUrl,model,keyEnv}`；`name` 即选用 id，
  `parseCustomModels` / `listCloudModels` 纯函数解析；`resolveCloudSettings` 的 provider 查找扩展到
  「预设 ∪ 自定义清单 ∪ session」。`yijing_divine` / `yijing_report` 新增 **`model` 参数**，
  可按调用热切换模型（厂商 id / 自定义模型 name / `session`），经 `buildEffectiveConfig` 合并生效。
- **DSH 会话当前模型（可选）**：新增 provider `session` 与开关 `cloudModelUseSessionModel`；
  来源按序为 `config.sessionModel`（函数直调 / `{baseUrl,model,apiKey}`，Runtime 可经 `apply(ctx,config)`
  的 `ctx.sessionModel` 注入）→ env `DAOYI_LLM_SESSION_BASE_URL/MODEL/API_KEY`；未注入即未启用
  （离线模板，不报错）。`callCloudModel` 适配器优先级重排为「per-call config 显式设置 > config.cloudModel
  函数 > 模块级适配器 > 旧版 endpoint」，使 per-call 覆盖真正生效。
- **LLM 调用计数计费闸门**（新增 `lib/yijing/quota.mjs`）：口径由「每日推演次数」改为
  **「每次真实 LLM 外发计 1 次」**（一次推演 = decompose + conclude = 2 次；离线推演不计数）；
  本地硬闸 fail-closed（`$DSH_HOME/storages/dsh-daoyi-yijing/llm-quota.json`，env
  `DAOYI_LLM_QUOTA_FILE` 可覆盖），默认 **20 次/天**（`freeLlmDailyLimit`；env
  `DAOYI_LLM_FREE_DAILY_LIMIT`；`freeDailyLimit` 保留为兼容别名）；用尽抛
  `LlmQuotaExceededError` → `callCloudModel` 返回 null 并记录闸门事件 → 推演自动降级
  确定性模板（verdict 不受影响），`evaluate` 结果新增 `llm` 画像（active/provider/model/
  quota/quota_blocked/notice），`yijing_report` 新增【云模型】【额度提示】行。
  `freeQuotaEnabled: false` 为运维旁路（不拦不计数）。与 l0 `lib/quota.mjs` 同口径：本地为准、
  无后端、无遥测；失败调用也计数（计费诚实）。
- **新增工具 `yijing_model_list`**（第 5 个工具）：列全部可选模型（6 预设 + 自定义清单 + session）、
  当前生效模型与今日 LLM 额度快照（只读，不消耗额度）；`manifest.json` tools 同步。
- 文档同步：`cordis.patch.yml` 新增 4 个配置键；`README` 新增「自定义模型」「免费额度闸门」节；
  `ENGINEERING.md` 配置全表 + 云模型接线优先级 + 新增「免费额度闸门」节；`SKILL.md` 工具用法补充。
- **P0 修复（真实编译器探针实证）**：`tools/yijing/divine.mjs` 的 `execute` 漏 `await` async
  `runYijingDivine`，`JSON.stringify(Promise)` 恒返回 `"{}"`——主入口工具在真实 DSH Runtime 下
  输出为空（与 0.3.3 修复的 report.mjs 同类事故，本次补上）；修复后经真实
  `@deepseek-ai/dsh-tools` defineTool 注册 + execute 端到端直调验证（42/42 PASS）。
- **新增 `scripts/_probe_definetool.mjs`**：用真实 `defineTool` 编译器注册全部 5 个工具
  （schema 合规：`matter` required=true、`script` oneOf、`model` type=string）+ execute 端到端，
  把此类事故纳入可回归检查（脚本头注附依赖树准备步骤）。

### 接通真实云模型 LLM（L1→L7 分解 + L1 卦象文案）
- 重写 `lib/yijing/cloud-model.mjs`：新增 **OpenAI 兼容真实调用适配器**（`/chat/completions`，
  Bearer 鉴权、AbortController 超时、`choices[0].message.content` 解析），内置 6 厂商预设
  （deepseek / qwen / glm / moonshot / minimax / openai / custom，与 MotorDesign
  `Core/cloud_services_config.py` 对齐）；配置经 `resolveCloudSettings(config+env)` 双源解析
  （`DAOYI_LLM_API_KEY` / `DAOYI_LLM_PROVIDER` / `DAOYI_LLM_MODEL` / `DAOYI_LLM_BASE_URL` / `DAOYI_LLM_ENABLED`）。
- `decomposeWithCloudModel` 提示词升级：要求模型按六层输出**结构化 JSON**
  （layers / key_factors / missing_data），解析失败自动回退纯文本；`concludeWithCloudModel`
  要求点明最弱之宫与补救之道（≤120 字）。
- 新增配置（默认 **OFF**，单变量对照）：`cloudModelEnabled` / `cloudModelProvider` /
  `cloudModelApiKey` / `cloudModelName` / `cloudModelBaseUrl` / `cloudModelTimeoutMs` /
  `cloudModelTemperature`；`apply()` 启动时 `configureCloudModel` 注入适配器并打印启用状态
  （不含密钥）；`cordis.patch.yml` 同步。
- 验证：mock OpenAI 服务器 e2e **18/18 PASS**（请求形状/鉴权头/模型名/温度/JSON 解析/401 降级/
  超时降级/env 解析）；真实端点 401 探针通过（假 key → 265ms 标准错误 → 降级）；
  `verify.mjs` 27/27 不回归；`runtime-check` PASS；16 源文件 `node --check` 全 OK；
  真实 `defineTool` schema 校验 4/4 OK。
- 新增示例 `scripts/divine_with_llm.mjs`（env 驱动，无密钥自动降级）。
- **架构纪律不变**：判定与聚合（L7→L2）仍为确定性代码，云模型只做翻译器；任何 LLM 失败
  （401/超时/断网）均降级为确定性模板，verdict 不受影响。
- **未做（如实披露）**：沙箱无真实密钥，真实凭证的完整 e2e 调用未跑（错误路径已实证；
  当日补齐的自定义模型/session/计费闸门均有离线自检覆盖，见下）。
- **当日补齐自检**：`scripts/_selftest_llm_quota.mjs`（LLM 调用计数闸门 + 自定义模型解析 +
  session 解析 + per-call 模型覆盖，隔离配额文件）**51/51 PASS**；`_mock_llm_test.mjs` 增 quota
  隔离与计数断言 **20/20 PASS**；`_probe_definetool.mjs` 真实 defineTool 编译 + execute 端到端
  **42/42 PASS**；`verify.mjs` 27/27 不回归；`runtime-check` PASS；`node --check` 全量 OK。

## 0.3.3 (2026-10-20)
### 发布工程加固（对齐 DSH 插件发布契约）
- `package.json`：`dsh.bundle.patch` 由旧字符串写法改为**嵌套对象** `{id, name, entry}`
  （playbook 实证：字符串写法会导致 profile 启动失败 `bundle declares no dsh.bundle.patch`）；
  补 `repository` / `bugs` / `homepage` 字段；`files` 加 `LICENSE`。
- 工具 schema 合规化（真实 `defineTool` 编译器实证）：`script` 参数的 `type: ['string','object']`
  联合数组被编译器拒绝（`unsupported JSON schema`），改为 `oneOf`；`yijing_divine` 的 `matter`
  补 `required: true`（编译器铁律：required 只能 true）。
- 修复 `yijing_report` 执行链真 bug：`execute` 调 async `runYijingReport` 未 `await`，
  导致 `out.path` 为 undefined（Promise），详报文件交接失效。
- 默认值三处对齐（playbook 0.2.1 教训）：`cordis.patch.yml` 的 `defaultScript` 由 `demo-384`
  改为 `motor-design`，与 Config schema `.default()` 及工具函数兜底一致；补 `cloudModelEndpoint` 配置项。
- `SKILL.md` frontmatter 合规：`version` 平铺改 `metadata.version`，新增 `whenToUse`（中英触发词）
  与 kebab 调用策略键 `user-invocable` / `disable-model-invocation`。
- 版本四处对齐：package.json = manifest.json(version/skill_version/skills[0].version) =
  SKILL.md metadata.version = CHANGELOG 最新条目 = 0.3.3。
- 新增 `LICENSE`（MIT）与 `.gitignore`（logs/ data/ 等运行时产物不入库）。

## 0.3.2 (2026-10-20)
### 一·L2/L3/L4 评估渐细轴精确化（用户二次澄清）
- `skills/daoyi-divine/SKILL.md` 把 L2/L3/L4 语义精确写为评估分级轴：
  **L2 两仪=正/反(2) · L3 三才=正/中/反(3) · L4 四象=正/偏正/偏反/反(4)**；
  L5/L6/L7 为分解粒度（8 域/64 子域/384 因数）。分级轴与「天/地/人」域分组正交。
- 新增 `lib/yijing/grading.mjs`（纯函数，additive，不改动核心 aggregator）：
  `gradeTwo/gradeThree/gradeFour + gradedView`，将连续评分映射为正/反、正/中/反、正/偏正/偏反/反
  三套等级并统计八宫分布——**根治此前阴阳硬二分(≥0.5=阳)把 52%–72% 全判阳=100% 的上界失真**。
- `scripts/divine_dsh_motor_ai_commercial.mjs` 接入 `gradedView`，报告新增 L2/L3/L4 分级视图。

## 0.3.1 (2026-10-20)
### 一·插件流程规范（L1–L7 双向云模型闭环）
- `skills/daoyi-divine/SKILL.md` 新增六层骨架表与双向推演闭环说明，精确对齐用户定义的：
  L1 太极 → L2 两仪 → L3 三才 → L4 四象 → L5 八宫(8 业务域) → L6 六十四卦(64 子域) → L7 384 爻(384 因数)；
  正向分解(L1→L7)与反向聚合(L7→L1)均“调用云模型”，云模型只做翻译器、不介入 verdict。
- 商用成功率剧本 `commercial`（commercial 域 RK 语义为“风险可控度”，高分=更安全=阳）。

## 0.3.0 (2026-10-20)
### 插件改名：易经推演-万事决 → 道一-易经推演
- 目录 `dsh-yijing-wanshijue` → `dsh-daoyi-yijing`；技能 `yijing-divine` → `daoyi-divine`。
- `manifest.json`：id=`cn.daoyi.dsh-yijing`、displayName=`道一-易经推演`、channel=`daoyi`、version=0.3.0。
- `package.json`：name=`dsh-daoyi-yijing`、version=0.3.0。
- `index.mjs`：`export const name='dsh-daoyi-yijing'` + 日志前缀统一为「道一-易经推演」。
- 工具内部名 `yijing_*` 保持不变（运行时契约稳定，避免断裂）。

### ②-新增 股票趋势研判剧本 stock-trend + 600711 推演示例
- `checkpoints.mjs` 新增 `buildStockScript()`：8 股票分析域 × 8 子域 × 6 检查点 = **384 爻**，
  三才分组 天(基本面/行业/宏观)·地(技术/资金/估值)·人(消息/风险)，已注册为内置剧本。
- `scripts/divine_stock_600711.mjs`：以公开数据把 8 域映射为因子评分，调用 `runYijingDivine`
  出 verdict + 卦象，并映射为「看涨 / 震荡 / 看跌」结论（含非投资建议声明）。

## 0.2.0 (2026-10-20)
### ① 移植 motor-design 真实阈值剧本
- 新增 `lib/yijing/scripts/motor-design.mjs`（AUTO-GENERATED，由 `scripts/_extract_motor_design.py` 从
  `Core/yijing_checkpoints.py:40/52/137/688` + `yijing_mapping.py:204/206` + `yijing_aggregator.py:410` 1:1 提取）：
  真实 8 域 × 64 子域 × 384 检查点（含阈值/权重/八卦/三才），**226 活跃 / 158 NA**，已注册为默认内置剧本。
- `aggregator.mjs` 新增 NA 排除（COST/MANU 整域 + 单点 NA 清单不进聚合、计入覆盖率），与 Python 原型口径一致。
- `mapping.mjs` 修复 boolean 判定口径：对齐 Python `value == 1`（原 `value === true` 会错判数值 0/1）。
- `index.mjs` 默认剧本切到 `motor-design`。

### ② 接通云模型分解 / 文案
- 新增 `cloud-model.mjs` 适配器：可注入 `setCloudModelAdapter` / `config.cloudModel` / `config.cloudModelEndpoint`，离线降级为确定性模板。
- `reviewer.mjs` 的 `decomposeWithCloudModel`（L1→L7 分解，返回 226 因数 + 云文案）与 `concludeWithCloudModel`（L1 卦象总评）已真接线；
  判定/聚合保持确定性（云模型不介入 verdict）。

### ③ fs 持久化 + 运行时联调
- `registry.mjs` 自定义剧本从内存态改为 `data/scripts/*.json` 落盘 + 启动 `configureRegistry` 回灌。
- 新增 `selfcheck.mjs`（纯 lib 自校验）与 `runtime-check.mjs`（DSH Runtime 联调预演：自校验 + 真实 divine + report）。

### 验证
- `verify.mjs` 27/27 PASS；`runtime-check.mjs` PASS；14 个源文件 `node --check` 全 OK；
  云模型注入与 fs 回灌冒烟验证通过。

## 0.1.0 (2026-10-20)
- 初始骨架：DSH 插件形态（manifest/index.mjs/cordis.patch.yml/skills/tools）。
- 核心引擎 lib/yijing：检查点库 + 规范 384 结构生成器、阴阳判定、六层加权聚合（强关联一票否决）、推演编排与报告生成。
- 4 个工具：yijing_divine / yijing_script_list / yijing_script_load / yijing_report。
- 双向云模型推演闭环（§2.1）架构边界落地：判定/聚合确定性，云模型仅作翻译器（占位）。
- 离线自检 scripts/verify.mjs（裸 Node，零依赖）。
