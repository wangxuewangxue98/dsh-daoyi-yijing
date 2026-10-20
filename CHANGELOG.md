# CHANGELOG

## 0.3.4 (2026-10-20)
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
- **未做（如实披露）**：免费额度闸门尚未按 LLM 调用计数（`freeQuotaEnabled` 配置项保留未接驳）；
  沙箱无真实密钥，真实凭证的完整 e2e 调用未跑（错误路径已实证）。

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
