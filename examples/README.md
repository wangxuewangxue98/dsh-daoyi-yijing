# 内置剧本算例

## demo-384（默认，规范 384 结构）
8 宫(域) × 8 子领域 × 6 检查点 = 384 爻，每子领域首项为强关联（一票否决对象）。
阈值统一为 `min 0.5`，权重 1.0。用于骨架演示与 `verify.mjs` 交叉校验向量。

调用：
```
yijing_divine({ matter: "我要不要接这个 200kW 电机外包项目？", script: "demo-384" })
```

## 自定义剧本（M1 接入 motor-design 专业剧本）
通过 `yijing_script_load` 加载 JSON：
```json
{
  "script_id": "invest",
  "name": "投资理财决策",
  "domains": [
    { "code": "RET", "name": "收益性", "bagua": "乾",
      "subdomains": [ { "name": "预期回报",
        "checks": [ {"id":"RET01C01","name":"年化收益率","is_strong":true,
                     "threshold_type":"min","threshold":[0.03,null],"weight":0.2} ] } ] }
  ],
  "sancai_mapping": { "tian": ["RET"], "di": [], "ren": [] }
}
```

## 路线图
- M1：把 `Core/yijing_*.py` 四件套逐字节移植，并纳入 `motor-design` 专业剧本（真实电机阈值）。
- M2：自然语言→剧本骨架（云模型），补全 `decomposeWithCloudModel`。
