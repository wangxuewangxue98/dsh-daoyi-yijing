# -*- coding: utf-8 -*-
"""
提取器：把 MotorDesign Core/yijing_* (Python 原型) 的 8 域 / 64 子域 / 384 检查点
1:1 移植为 dsh-yijing-wanshijue 的内置剧本 JS 模块。

数据源（锚点）：
  Core/yijing_checkpoints.py:40  DOMAINS（八卦映射）
  Core/yijing_checkpoints.py:52  SUBDOMAINS
  Core/yijing_checkpoints.py:137 CHECKPOINT_TEMPLATES
  Core/yijing_checkpoints.py:688 build_checkpoint_database (cp_id 格式: {domain}{sub+1:02d}C{cp+1:02d})
  Core/yijing_mapping.py:204     NA_DOMAINS = {COST, MANU}
  Core/yijing_mapping.py:206     NA_CHECKPOINTS（单点 NA 清单）
  Core/yijing_aggregator.py:410  aggregate_sancai 三才分组 (tian=[EM,EF,RELIAB] / di=[ME,TH,MANU] / ren=[MT,COST])

输出：lib/yijing/scripts/motor-design.mjs （export default 剧本对象）
"""
import json
import sys
import os

PROJECT_ROOT = r"C:\Users\15389\WorkBuddy\Worktrees\MotorDesign\main-06bb5f71"
sys.path.insert(0, PROJECT_ROOT)

from Core.yijing_checkpoints import DOMAINS, SUBDOMAINS, CHECKPOINT_TEMPLATES
from Core.yijing_mapping import NA_DOMAINS, NA_CHECKPOINTS

# 三才分组（来自 yijing_aggregator.py:410 的硬编码常量）
SANCAI = {
    "tian": ["EM", "EF", "RELIAB"],
    "di": ["ME", "TH", "MANU"],
    "ren": ["MT", "COST"],
}

# cp_id 格式（对齐 build_checkpoint_database）
def cp_id(domain, sub_idx, cp_idx):
    return f"{domain}{sub_idx+1:02d}C{cp_idx+1:02d}"

def thr_to_list(t):
    # tuple -> [lo, hi]，None 保留为 null
    return [None if v is None else v for v in t]

domains_out = []
total_cp = 0
na_domains = sorted(NA_DOMAINS)
na_checks = sorted(NA_CHECKPOINTS.keys())

for code, name in DOMAINS.items():
    subdomains = SUBDOMAINS.get(code, [])
    subs_out = []
    for si, sub_name in enumerate(subdomains):
        templates = CHECKPOINT_TEMPLATES.get(sub_name, [])
        checks_out = []
        for ci, (cname, desc, is_strong, weight, ttype, tval) in enumerate(templates):
            cid = cp_id(code, si, ci)
            checks_out.append({
                "id": cid,
                "name": cname,
                "desc": desc,
                "is_strong": bool(is_strong),
                "weight": float(weight),
                "threshold_type": ttype,
                "threshold": thr_to_list(tval),
            })
            total_cp += 1
        subs_out.append({"name": sub_name, "checks": checks_out})
    domains_out.append({
        "code": code,
        "name": name,
        "bagua": None,  # 由 DOMAINS 顺序推断，下方统一填
        "subdomains": subs_out,
    })

# 填卦象（乾/坤/震/巽/坎/离/艮/兑 对应 DOMAINS 顺序）
BAGUA_ORDER = list(DOMAINS.values())  # 按 DOMAINS 出现序
# 但我们需要 code->bagua。原型未存 bagua，按 DOMAINS 顺序的八卦固定映射：
CODE_BAGUA = {}
# DOMAINS 定义顺序即八卦顺序：EM=乾, TH=坤, ME=震, MT=巽, EF=坎, COST=离, MANU=艮, RELIAB=兑
fixed = ["乾", "坤", "震", "巽", "坎", "离", "艮", "兑"]
for i, code in enumerate(DOMAINS.keys()):
    CODE_BAGUA[code] = fixed[i]
for d in domains_out:
    d["bagua"] = CODE_BAGUA[d["code"]]

script = {
    "script_id": "motor-design",
    "name": "电机电磁设计·万事决",
    "description": "移植自 MotorDesign 易经推演评审系统（Core/yijing_*）。8 技术领域×8 子领域×6 检查点=384 爻，"
                   "含强关联一票否决；COST/MANU 整域与若干单点项为外部数据域（NA，排除出聚合、计入覆盖率）。",
    "generated_from": "MotorDesign Core/yijing_checkpoints.py + yijing_mapping.py + yijing_aggregator.py (Python 原型)",
    "domains": domains_out,
    "sancai_mapping": SANCAI,
    "na": {
        "domains": na_domains,
        "checkpoints": na_checks,
    },
}

# 输出为 JS 模块
out_path = os.path.join(
    PROJECT_ROOT,
    "dsh-yijing-wanshijue", "lib", "yijing", "scripts", "motor-design.mjs",
)
os.makedirs(os.path.dirname(out_path), exist_ok=True)

js = "// AUTO-GENERATED — 勿手改。来源：scripts/_extract_motor_design.py\n"
js += "// 锚点：yijing_checkpoints.py:40/52/137/688 · yijing_mapping.py:204/206 · yijing_aggregator.py:410\n"
js += "export default " + json.dumps(script, ensure_ascii=False, indent=2) + "\n"

with open(out_path, "w", encoding="utf-8") as f:
    f.write(js)

# 统计
na_dom_cp = sum(
    8 * 6 for c in na_domains  # 整域 = 8 子域 × 6
)
# 精确计数：生成后再扫一遍
import re
na_set = set(na_checks)
na_total = 0
for d in domains_out:
    if d["code"] in na_domains:
        na_total += 48
    else:
        for sd in d["subdomains"]:
            for c in sd["checks"]:
                if c["id"] in na_set:
                    na_total += 1

print(f"总检查点(含NA): {total_cp}")
print(f"NA 检查点: {na_total}")
print(f"活跃检查点(进聚合): {total_cp - na_total}")
print(f"顶层域: {len(domains_out)} | 子域: {sum(len(d['subdomains']) for d in domains_out)}")
print(f"NA 域: {na_domains}")
print(f"写出: {out_path}")
