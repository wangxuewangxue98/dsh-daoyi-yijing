// AUTO-GENERATED — 勿手改。来源：scripts/_extract_motor_design.py
// 锚点：yijing_checkpoints.py:40/52/137/688 · yijing_mapping.py:204/206 · yijing_aggregator.py:410
export default {
  "script_id": "motor-design",
  "name": "电机电磁设计·万事决",
  "description": "移植自 MotorDesign 易经推演评审系统（Core/yijing_*）。8 技术领域×8 子领域×6 检查点=384 爻，含强关联一票否决；COST/MANU 整域与若干单点项为外部数据域（NA，排除出聚合、计入覆盖率）。",
  "generated_from": "MotorDesign Core/yijing_checkpoints.py + yijing_mapping.py + yijing_aggregator.py (Python 原型)",
  "domains": [
    {
      "code": "EM",
      "name": "电磁性能",
      "bagua": "乾",
      "subdomains": [
        {
          "name": "磁路设计",
          "checks": [
            {
              "id": "EM01C01",
              "name": "气隙磁密 Bg",
              "desc": "气隙磁密是否在合理范围 0.55~0.85T",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                0.55,
                0.85
              ]
            },
            {
              "id": "EM01C02",
              "name": "齿磁密 Bt",
              "desc": "定子齿磁密是否在合理范围 1.4~1.7T",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1.4,
                1.7
              ]
            },
            {
              "id": "EM01C03",
              "name": "轭磁密 By",
              "desc": "定子轭磁密是否在合理范围 0.8~1.2T",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                0.8,
                1.2
              ]
            },
            {
              "id": "EM01C04",
              "name": "磁通密度均匀性",
              "desc": "气隙磁密波形谐波含量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.15
              ]
            },
            {
              "id": "EM01C05",
              "name": "磁路饱和裕度",
              "desc": "铁心饱和程度评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.3,
                0.8
              ]
            },
            {
              "id": "EM01C06",
              "name": "漏磁系数",
              "desc": "漏磁对性能影响评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.25
              ]
            }
          ]
        },
        {
          "name": "绕组配置",
          "checks": [
            {
              "id": "EM02C01",
              "name": "匝数合理性",
              "desc": "每相串联匝数是否合适",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                10,
                50
              ]
            },
            {
              "id": "EM02C02",
              "name": "线规选择",
              "desc": "导线截面积是否合理",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                0.5,
                4.0
              ]
            },
            {
              "id": "EM02C03",
              "name": "槽满率",
              "desc": "槽内导线填充率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                0.4,
                0.8
              ]
            },
            {
              "id": "EM02C04",
              "name": "绕组系数",
              "desc": "分布/短距绕组系数",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.85,
                null
              ]
            },
            {
              "id": "EM02C05",
              "name": "电流密度",
              "desc": "导线电流密度是否合理",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                8.0
              ]
            },
            {
              "id": "EM02C06",
              "name": "并联支路数",
              "desc": "并联电路数是否合适",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                1,
                6
              ]
            }
          ]
        },
        {
          "name": "槽形几何",
          "checks": [
            {
              "id": "EM03C01",
              "name": "槽深 Hs2",
              "desc": "定子槽深度是否合理",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                8.0,
                25.0
              ]
            },
            {
              "id": "EM03C02",
              "name": "槽宽 Bs2",
              "desc": "定子槽宽度是否合理",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                5.0,
                15.0
              ]
            },
            {
              "id": "EM03C03",
              "name": "齿宽 bt",
              "desc": "定子齿宽度是否合理",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                3.0,
                8.0
              ]
            },
            {
              "id": "EM03C04",
              "name": "轭厚 yk",
              "desc": "定子轭部厚度是否合理",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                5.0,
                15.0
              ]
            },
            {
              "id": "EM03C05",
              "name": "槽口宽度",
              "desc": "槽口开口宽度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                2.0,
                5.0
              ]
            },
            {
              "id": "EM03C06",
              "name": "齿槽比 ζ",
              "desc": "齿宽与槽距比值",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.3,
                0.7
              ]
            }
          ]
        },
        {
          "name": "极槽配合",
          "checks": [
            {
              "id": "EM04C01",
              "name": "极数 p",
              "desc": "电机极数是否合适",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                2,
                12
              ]
            },
            {
              "id": "EM04C02",
              "name": "槽数 Qs",
              "desc": "定子槽数是否合适",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                12,
                48
              ]
            },
            {
              "id": "EM04C03",
              "name": "极距 τp",
              "desc": "极距计算是否正确",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                50.0,
                null
              ]
            },
            {
              "id": "EM04C04",
              "name": "节距 y",
              "desc": "绕组节距是否合适",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.8,
                1.2
              ]
            },
            {
              "id": "EM04C05",
              "name": "谐波含量",
              "desc": "空间谐波对转矩影响",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.1
              ]
            },
            {
              "id": "EM04C06",
              "name": "齿槽转矩",
              "desc": "齿槽转矩脉动幅度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.15
              ]
            }
          ]
        },
        {
          "name": "转矩特性",
          "checks": [
            {
              "id": "EM05C01",
              "name": "额定转矩",
              "desc": "额定转矩是否达标",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                null,
                null
              ]
            },
            {
              "id": "EM05C02",
              "name": "起动转矩",
              "desc": "起动转矩倍数是否足够",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "EM05C03",
              "name": "最大转矩",
              "desc": "最大转矩倍数是否足够",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                2.0,
                null
              ]
            },
            {
              "id": "EM05C04",
              "name": "转矩脉动",
              "desc": "转矩波动幅度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.15
              ]
            },
            {
              "id": "EM05C05",
              "name": "过载能力",
              "desc": "短时过载倍数",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "EM05C06",
              "name": "转矩密度",
              "desc": "单位体积转矩输出（H30 按 4D normal 带 91 真解点 P5 标定 0.0004；原 min5000 为 Nm/mm³ 绝对值口径，归一值恒 <0.02 必失）",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.0004,
                null
              ]
            }
          ]
        },
        {
          "name": "损耗分布",
          "checks": [
            {
              "id": "EM06C01",
              "name": "铜耗 Pc",
              "desc": "定子铜耗是否在合理范围",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                1500
              ]
            },
            {
              "id": "EM06C02",
              "name": "铁耗 PFe",
              "desc": "铁心损耗是否在合理范围",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                800
              ]
            },
            {
              "id": "EM06C03",
              "name": "机械损耗 Pm",
              "desc": "风摩损耗评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                200
              ]
            },
            {
              "id": "EM06C04",
              "name": "杂散损耗 Pd",
              "desc": "附加损耗评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                150
              ]
            },
            {
              "id": "EM06C05",
              "name": "损耗占比",
              "desc": "铜耗/铁耗比例是否合理",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.6,
                0.9
              ]
            },
            {
              "id": "EM06C06",
              "name": "总损耗",
              "desc": "总损耗是否在预算内",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                2500
              ]
            }
          ]
        },
        {
          "name": "电磁兼容",
          "checks": [
            {
              "id": "EM07C01",
              "name": "电磁干扰 EMI",
              "desc": "电磁辐射强度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                80
              ]
            },
            {
              "id": "EM07C02",
              "name": "谐波电流",
              "desc": "电流谐波含量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            },
            {
              "id": "EM07C03",
              "name": "转矩 ripple",
              "desc": "转矩纹波频率成分",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.1
              ]
            },
            {
              "id": "EM07C04",
              "name": "磁力线畸变",
              "desc": "气隙磁场波形质量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.15
              ]
            },
            {
              "id": "EM07C05",
              "name": "感应电压",
              "desc": "绕组感应过电压",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                1.5
              ]
            },
            {
              "id": "EM07C06",
              "name": "涡流损耗",
              "desc": "结构件涡流损耗",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                100
              ]
            }
          ]
        },
        {
          "name": "启动性能",
          "checks": [
            {
              "id": "EM08C01",
              "name": "起动电流",
              "desc": "起动电流倍数",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                7.0
              ]
            },
            {
              "id": "EM08C02",
              "name": "起动转矩",
              "desc": "起动转矩大小",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "EM08C03",
              "name": "加速时间",
              "desc": "从静止到额定转速时间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                5.0
              ]
            },
            {
              "id": "EM08C04",
              "name": "起动 torque/slip",
              "desc": "转矩-滑差特性曲线",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.8,
                1.5
              ]
            },
            {
              "id": "EM08C05",
              "name": "转子电阻",
              "desc": "转子等效电阻",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.05,
                0.3
              ]
            },
            {
              "id": "EM08C06",
              "name": "启动方式适配",
              "desc": "起动方式与负载匹配",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        }
      ]
    },
    {
      "code": "TH",
      "name": "热管理",
      "bagua": "坤",
      "subdomains": [
        {
          "name": "温升分布",
          "checks": [
            {
              "id": "TH01C01",
              "name": "绕组温升 ΔT_w",
              "desc": "定子绕组温升",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                125
              ]
            },
            {
              "id": "TH01C02",
              "name": "铁心温升 ΔT_fe",
              "desc": "定子铁心温升",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                100
              ]
            },
            {
              "id": "TH01C03",
              "name": "转子温升 ΔT_r",
              "desc": "转子温升",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                150
              ]
            },
            {
              "id": "TH01C04",
              "name": "温升均匀性",
              "desc": "各部件温差",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                30
              ]
            },
            {
              "id": "TH01C05",
              "name": "热点位置",
              "desc": "最高温度点定位",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0,
                1
              ]
            },
            {
              "id": "TH01C06",
              "name": "热耦合系数",
              "desc": "热-电耦合强度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.5
              ]
            }
          ]
        },
        {
          "name": "冷却效率",
          "checks": [
            {
              "id": "TH02C01",
              "name": "冷却方式适配",
              "desc": "冷却方式是否合适",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH02C02",
              "name": "传热系数 h",
              "desc": "对流换热系数",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                50.0,
                null
              ]
            },
            {
              "id": "TH02C03",
              "name": "冷却风速",
              "desc": "空气流速是否足够",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                10.0,
                null
              ]
            },
            {
              "id": "TH02C04",
              "name": "散热面积",
              "desc": "有效散热面积",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.5,
                null
              ]
            },
            {
              "id": "TH02C05",
              "name": "冷却通道设计",
              "desc": "冷却水路/油路设计",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH02C06",
              "name": "温差效率",
              "desc": "进出口温差评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                5.0,
                20.0
              ]
            }
          ]
        },
        {
          "name": "热点控制",
          "checks": [
            {
              "id": "TH03C01",
              "name": "热点温度 T_max",
              "desc": "最高温度值",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                150
              ]
            },
            {
              "id": "TH03C02",
              "name": "热点位置稳定性",
              "desc": "热点位置是否固定",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH03C03",
              "name": "热点梯度",
              "desc": "热点附近温度梯度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                50
              ]
            },
            {
              "id": "TH03C04",
              "name": "热点持续时间",
              "desc": "热点出现概率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.1
              ]
            },
            {
              "id": "TH03C05",
              "name": "热点补偿措施",
              "desc": "是否设计热点缓解",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH03C06",
              "name": "热仿真验证",
              "desc": "CFD 仿真置信度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.8,
                null
              ]
            }
          ]
        },
        {
          "name": "热应力",
          "checks": [
            {
              "id": "TH04C01",
              "name": "热应力 σ_th",
              "desc": "热膨胀引起的应力",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                100
              ]
            },
            {
              "id": "TH04C02",
              "name": "热循环寿命",
              "desc": "热疲劳寿命评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                10000.0,
                null
              ]
            },
            {
              "id": "TH04C03",
              "name": "材料热膨胀系数",
              "desc": "CTE 匹配度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                15
              ]
            },
            {
              "id": "TH04C04",
              "name": "应力集中系数",
              "desc": "几何突变处应力集中",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                2.5
              ]
            },
            {
              "id": "TH04C05",
              "name": "残余应力",
              "desc": "制造残余应力",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                50
              ]
            },
            {
              "id": "TH04C06",
              "name": "热应力分布均匀性",
              "desc": "热应力离散度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.3
              ]
            }
          ]
        },
        {
          "name": "绝缘耐热",
          "checks": [
            {
              "id": "TH05C01",
              "name": "绝缘等级",
              "desc": "绝缘材料耐热等级",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                6
              ]
            },
            {
              "id": "TH05C02",
              "name": "温升余量",
              "desc": "实际温升 vs 绝缘极限",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                15.0,
                null
              ]
            },
            {
              "id": "TH05C03",
              "name": "绝缘老化速率",
              "desc": "热老化预测寿命",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                10,
                null
              ]
            },
            {
              "id": "TH05C04",
              "name": "绝缘电阻",
              "desc": "绝缘电阻值",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                100,
                null
              ]
            },
            {
              "id": "TH05C05",
              "name": "介电强度",
              "desc": "耐压能力",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                500,
                null
              ]
            },
            {
              "id": "TH05C06",
              "name": "绝缘厚度",
              "desc": "绝缘层厚度是否合适",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.5,
                3.0
              ]
            }
          ]
        },
        {
          "name": "热阻抗",
          "checks": [
            {
              "id": "TH06C01",
              "name": "结到环境热阻 R_thJA",
              "desc": "总热阻评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                2.0
              ]
            },
            {
              "id": "TH06C02",
              "name": "热通路设计",
              "desc": "热传导路径是否优化",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH06C03",
              "name": "接触热阻",
              "desc": "界面接触热阻",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.5
              ]
            },
            {
              "id": "TH06C04",
              "name": "热界面材料",
              "desc": "TIM 性能评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.1
              ]
            },
            {
              "id": "TH06C05",
              "name": "热仿真精度",
              "desc": "CFD 模型置信度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.85,
                null
              ]
            },
            {
              "id": "TH06C06",
              "name": "热时间常数",
              "desc": "热惯性评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                10,
                300
              ]
            }
          ]
        },
        {
          "name": "热平衡",
          "checks": [
            {
              "id": "TH07C01",
              "name": "产热=散热",
              "desc": "热平衡方程是否成立",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH07C02",
              "name": "稳态时间",
              "desc": "达到稳态所需时间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                1800
              ]
            },
            {
              "id": "TH07C03",
              "name": "瞬态温升",
              "desc": "短时过载温升响应",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                50
              ]
            },
            {
              "id": "TH07C04",
              "name": "热耦合系数",
              "desc": "多物理场耦合强度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.3
              ]
            },
            {
              "id": "TH07C05",
              "name": "环境温度适应性",
              "desc": "不同环境温度下的表现",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH07C06",
              "name": "热保护阈值",
              "desc": "温度保护设定值",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.8,
                0.95
              ]
            }
          ]
        },
        {
          "name": "热失控防护",
          "checks": [
            {
              "id": "TH08C01",
              "name": "热失控条件",
              "desc": "是否存在热失控风险",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                0,
                1
              ]
            },
            {
              "id": "TH08C02",
              "name": "温度反馈控制",
              "desc": "是否有温度监控",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH08C03",
              "name": "过温保护",
              "desc": "过热保护机制",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH08C04",
              "name": "散热冗余",
              "desc": "散热能力余量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.2,
                null
              ]
            },
            {
              "id": "TH08C05",
              "name": "故障模式分析",
              "desc": "热故障 FMEA",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "TH08C06",
              "name": "应急措施",
              "desc": "热失控应急预案",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        }
      ]
    },
    {
      "code": "ME",
      "name": "机械结构",
      "bagua": "震",
      "subdomains": [
        {
          "name": "转子结构",
          "checks": [
            {
              "id": "ME01C01",
              "name": "转子外径 Dr",
              "desc": "转子外径是否合理",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                50.0,
                200.0
              ]
            },
            {
              "id": "ME01C02",
              "name": "转子内径 d_r",
              "desc": "转子轴孔直径",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                15.0,
                60.0
              ]
            },
            {
              "id": "ME01C03",
              "name": "转子轭厚 yr",
              "desc": "转子轭部厚度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                5.0,
                20.0
              ]
            },
            {
              "id": "ME01C04",
              "name": "转子磁体厚",
              "desc": "永磁体厚度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                2.0,
                15.0
              ]
            },
            {
              "id": "ME01C05",
              "name": "转子结构强度",
              "desc": "离心力下的强度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME01C06",
              "name": "转子惯量",
              "desc": "转动惯量评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.01,
                1.0
              ]
            }
          ]
        },
        {
          "name": "定子铁心",
          "checks": [
            {
              "id": "ME02C01",
              "name": "定子外径 Ds",
              "desc": "定子外径是否合理",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                100.0,
                300.0
              ]
            },
            {
              "id": "ME02C02",
              "name": "定子内径 Dsi",
              "desc": "定子内径是否合理",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                50.0,
                200.0
              ]
            },
            {
              "id": "ME02C03",
              "name": "铁心长度 L",
              "desc": "叠压铁心长度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                50.0,
                300.0
              ]
            },
            {
              "id": "ME02C04",
              "name": "叠压系数 k_st",
              "desc": "铁心叠压系数",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                0.95,
                0.99
              ]
            },
            {
              "id": "ME02C05",
              "name": "铁心夹紧",
              "desc": "铁心轴向夹紧力",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME02C06",
              "name": "铁心通风",
              "desc": "铁心通风道设计",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "轴承系统",
          "checks": [
            {
              "id": "ME03C01",
              "name": "轴承类型",
              "desc": "轴承选型是否合适",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                4
              ]
            },
            {
              "id": "ME03C02",
              "name": "轴承寿命 L10",
              "desc": "轴承额定寿命",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                20000,
                null
              ]
            },
            {
              "id": "ME03C03",
              "name": "轴承 preload",
              "desc": "轴承预紧力",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0,
                500
              ]
            },
            {
              "id": "ME03C04",
              "name": "轴承润滑",
              "desc": "润滑方式与油脂",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME03C05",
              "name": "轴承座设计",
              "desc": "轴承室配合与加工",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME03C06",
              "name": "轴承温升",
              "desc": "轴承运行温度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                90
              ]
            }
          ]
        },
        {
          "name": "轴系强度",
          "checks": [
            {
              "id": "ME04C01",
              "name": "轴径 d_shaft",
              "desc": "输出轴直径",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                20.0,
                80.0
              ]
            },
            {
              "id": "ME04C02",
              "name": "轴的扭转强度",
              "desc": "扭转应力是否达标",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                150
              ]
            },
            {
              "id": "ME04C03",
              "name": "轴的弯曲强度",
              "desc": "弯曲应力是否达标",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                120
              ]
            },
            {
              "id": "ME04C04",
              "name": "临界转速",
              "desc": "一阶临界转速评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                2.0,
                null
              ]
            },
            {
              "id": "ME04C05",
              "name": "键槽强度",
              "desc": "键连接强度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                100
              ]
            },
            {
              "id": "ME04C06",
              "name": "轴伸长度",
              "desc": "轴伸端长度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                40.0,
                120.0
              ]
            }
          ]
        },
        {
          "name": "振动模态",
          "checks": [
            {
              "id": "ME05C01",
              "name": "一阶固有频率",
              "desc": "转子系统固有频率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                150.0,
                null
              ]
            },
            {
              "id": "ME05C02",
              "name": "模态振型",
              "desc": "主要振型分析",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME05C03",
              "name": "振级 Lv",
              "desc": "振动速度级",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                7.1
              ]
            },
            {
              "id": "ME05C04",
              "name": "不平衡响应",
              "desc": "残余不平衡量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                6.3
              ]
            },
            {
              "id": "ME05C05",
              "name": "临界转速避让",
              "desc": "工作转速与临界转速距离",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.2,
                null
              ]
            },
            {
              "id": "ME05C06",
              "name": "振动传递率",
              "desc": "隔振效果评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.3
              ]
            }
          ]
        },
        {
          "name": "噪声控制",
          "checks": [
            {
              "id": "ME06C01",
              "name": "声压级 Lp",
              "desc": "噪声声压级",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                85
              ]
            },
            {
              "id": "ME06C02",
              "name": "电磁噪声",
              "desc": "电磁力波引起的噪声",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                5.0
              ]
            },
            {
              "id": "ME06C03",
              "name": "机械噪声",
              "desc": "轴承/风磨噪声",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                3.0
              ]
            },
            {
              "id": "ME06C04",
              "name": "频谱分析",
              "desc": "噪声频谱特征",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME06C05",
              "name": "隔声设计",
              "desc": "噪声防护措施",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME06C06",
              "name": "噪声标准符合",
              "desc": "是否符合 ISO 标准",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "密封结构",
          "checks": [
            {
              "id": "ME07C01",
              "name": "密封等级 IP",
              "desc": "防护等级是否达标",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                54,
                68
              ]
            },
            {
              "id": "ME07C02",
              "name": "轴封设计",
              "desc": "旋转轴密封方式",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME07C03",
              "name": "端盖密封",
              "desc": "静止结合面密封",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME07C04",
              "name": "冷却介质隔离",
              "desc": "水冷/油冷密封",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME07C05",
              "name": "防尘设计",
              "desc": "粉尘防护能力",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME07C06",
              "name": "密封寿命",
              "desc": "密封件预期寿命",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                10000,
                null
              ]
            }
          ]
        },
        {
          "name": "安装接口",
          "checks": [
            {
              "id": "ME08C01",
              "name": "机座型号",
              "desc": "机座号是否标准",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                63,
                355
              ]
            },
            {
              "id": "ME08C02",
              "name": "安装方式",
              "desc": "IM 安装型式",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME08C03",
              "name": "法兰尺寸",
              "desc": "输出法兰标准",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME08C04",
              "name": "接线盒位置",
              "desc": "接线盒方位",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME08C05",
              "name": "地脚孔距",
              "desc": "安装孔距标准",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "ME08C06",
              "name": "运输吊点",
              "desc": "吊装结构设计",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        }
      ]
    },
    {
      "code": "MT",
      "name": "材料选型",
      "bagua": "巽",
      "subdomains": [
        {
          "name": "永磁材料",
          "checks": [
            {
              "id": "MT01C01",
              "name": "磁材牌号",
              "desc": "永磁体材料类型",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                4
              ]
            },
            {
              "id": "MT01C02",
              "name": "剩磁 Br",
              "desc": "剩磁密度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1.0,
                null
              ]
            },
            {
              "id": "MT01C03",
              "name": "矫顽力 Hc",
              "desc": "内禀矫顽力",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                700.0,
                null
              ]
            },
            {
              "id": "MT01C04",
              "name": "最大磁能积 (BH)max",
              "desc": "磁能积指标",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                200,
                null
              ]
            },
            {
              "id": "MT01C05",
              "name": "温度系数 β",
              "desc": "剩磁温度系数",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.001
              ]
            },
            {
              "id": "MT01C06",
              "name": "磁材利用率",
              "desc": "磁体体积利用率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.7,
                null
              ]
            }
          ]
        },
        {
          "name": "导磁材料",
          "checks": [
            {
              "id": "MT02C01",
              "name": "硅钢牌号",
              "desc": "定子铁心材料",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                6
              ]
            },
            {
              "id": "MT02C02",
              "name": "铁损 P1.0/400",
              "desc": "比铁损指标",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                2.5
              ]
            },
            {
              "id": "MT02C03",
              "name": "磁导率 μr",
              "desc": "相对磁导率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                3000,
                null
              ]
            },
            {
              "id": "MT02C04",
              "name": "叠片厚度",
              "desc": "硅钢片厚度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.35,
                0.5
              ]
            },
            {
              "id": "MT02C05",
              "name": "表面处理",
              "desc": "绝缘涂层类型",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MT02C06",
              "name": "冲裁毛刺",
              "desc": "冲片边缘质量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            }
          ]
        },
        {
          "name": "导电材料",
          "checks": [
            {
              "id": "MT03C01",
              "name": "铜材纯度",
              "desc": "导体材料纯度（H30 小数口径：0.9995=99.95%，原 [99.9,99.99] 为百分数口径误判）",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                0.999,
                0.9999
              ]
            },
            {
              "id": "MT03C02",
              "name": "电阻率 ρ",
              "desc": "导体电阻率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                1.72e-08
              ]
            },
            {
              "id": "MT03C03",
              "name": "导线镀层",
              "desc": "导线绝缘镀层",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MT03C04",
              "name": "绞线结构",
              "desc": "利兹线/扁线结构",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MT03C05",
              "name": "趋肤效应",
              "desc": "高频损耗评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.15
              ]
            },
            {
              "id": "MT03C06",
              "name": "焊接质量",
              "desc": "导线连接可靠性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "结构材料",
          "checks": [
            {
              "id": "MT04C01",
              "name": "机壳材料",
              "desc": "机座铸造材料",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                4
              ]
            },
            {
              "id": "MT04C02",
              "name": "强度指标",
              "desc": "抗拉强度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                180,
                null
              ]
            },
            {
              "id": "MT04C03",
              "name": "铸造/锻造",
              "desc": "制造工艺选择",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MT04C04",
              "name": "热处理",
              "desc": "退火/正火处理",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MT04C05",
              "name": "表面涂层",
              "desc": "防腐处理",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MT04C06",
              "name": "材料一致性",
              "desc": "批次质量稳定性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            }
          ]
        },
        {
          "name": "绝缘材料",
          "checks": [
            {
              "id": "MT05C01",
              "name": "绝缘等级",
              "desc": "耐热等级 (F/H/C)",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                3,
                6
              ]
            },
            {
              "id": "MT05C02",
              "name": "击穿电压",
              "desc": "绝缘强度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                15,
                null
              ]
            },
            {
              "id": "MT05C03",
              "name": "耐电弧性",
              "desc": "抗电痕化能力",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                3.0,
                null
              ]
            },
            {
              "id": "MT05C04",
              "name": "吸湿性",
              "desc": "防潮性能",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.5
              ]
            },
            {
              "id": "MT05C05",
              "name": "导热性",
              "desc": "绝缘材料导热系数",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.2,
                null
              ]
            },
            {
              "id": "MT05C06",
              "name": "固化工艺",
              "desc": "浸漆/真空压力浸渍",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "冷却介质",
          "checks": [
            {
              "id": "MT06C01",
              "name": "冷却方式",
              "desc": "空气/水/油冷",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                3
              ]
            },
            {
              "id": "MT06C02",
              "name": "流量/风速",
              "desc": "冷却介质流量",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.5,
                null
              ]
            },
            {
              "id": "MT06C03",
              "name": "进口温度",
              "desc": "冷却介质入口温度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                20,
                40
              ]
            },
            {
              "id": "MT06C04",
              "name": "温差 ΔT",
              "desc": "进出口温差",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                5,
                20
              ]
            },
            {
              "id": "MT06C05",
              "name": "过滤精度",
              "desc": "介质清洁度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                50
              ]
            },
            {
              "id": "MT06C06",
              "name": "防腐性能",
              "desc": "介质对材料腐蚀",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "润滑材料",
          "checks": [
            {
              "id": "MT07C01",
              "name": "润滑脂类型",
              "desc": "油脂牌号",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                5
              ]
            },
            {
              "id": "MT07C02",
              "name": "粘度等级",
              "desc": "油脂粘度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                10,
                500
              ]
            },
            {
              "id": "MT07C03",
              "name": "滴点温度",
              "desc": "油脂耐温性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                150,
                null
              ]
            },
            {
              "id": "MT07C04",
              "name": "加注量",
              "desc": "润滑脂填充量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.3,
                0.5
              ]
            },
            {
              "id": "MT07C05",
              "name": "换油周期",
              "desc": "油脂寿命",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                2000,
                null
              ]
            },
            {
              "id": "MT07C06",
              "name": "密封兼容性",
              "desc": "油脂与密封件相容",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "粘接材料",
          "checks": [
            {
              "id": "MT08C01",
              "name": "粘接强度",
              "desc": "粘合剂剪切强度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                10,
                null
              ]
            },
            {
              "id": "MT08C02",
              "name": "耐温性",
              "desc": "工作温度范围",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                200
              ]
            },
            {
              "id": "MT08C03",
              "name": "固化时间",
              "desc": "工艺周期",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                3600
              ]
            },
            {
              "id": "MT08C04",
              "name": "收缩率",
              "desc": "固化收缩",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.03
              ]
            },
            {
              "id": "MT08C05",
              "name": "环保性",
              "desc": "VOC 排放",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MT08C06",
              "name": "存储稳定性",
              "desc": "胶液保质期",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                6,
                null
              ]
            }
          ]
        }
      ]
    },
    {
      "code": "EF",
      "name": "效率能耗",
      "bagua": "坎",
      "subdomains": [
        {
          "name": "额定效率",
          "checks": [
            {
              "id": "EF01C01",
              "name": "效率 η",
              "desc": "额定效率值",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.92,
                null
              ]
            },
            {
              "id": "EF01C02",
              "name": "效率等级",
              "desc": "IE 标准等级",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                3,
                5
              ]
            },
            {
              "id": "EF01C03",
              "name": "负载率适配",
              "desc": "部分负载效率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.88,
                null
              ]
            },
            {
              "id": "EF01C04",
              "name": "峰值效率",
              "desc": "最高效率点",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.95,
                null
              ]
            },
            {
              "id": "EF01C05",
              "name": "效率-map 图",
              "desc": "全域效率分布",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "EF01C06",
              "name": "效率测试",
              "desc": "台架验证数据",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "部分负载效率",
          "checks": [
            {
              "id": "EF02C01",
              "name": "25% 负载效率",
              "desc": "低负载效率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.85,
                null
              ]
            },
            {
              "id": "EF02C02",
              "name": "50% 负载效率",
              "desc": "半载效率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.9,
                null
              ]
            },
            {
              "id": "EF02C03",
              "name": "75% 负载效率",
              "desc": "满载效率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.92,
                null
              ]
            },
            {
              "id": "EF02C04",
              "name": "效率曲线平滑度",
              "desc": "负载变化时效率稳定性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.03
              ]
            },
            {
              "id": "EF02C05",
              "name": "高效区宽度",
              "desc": "高效率工作区间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.3,
                null
              ]
            },
            {
              "id": "EF02C06",
              "name": "应用场景匹配",
              "desc": "实际负载谱匹配度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.8,
                null
              ]
            }
          ]
        },
        {
          "name": "功率因数",
          "checks": [
            {
              "id": "EF03C01",
              "name": "功率因数 cosφ",
              "desc": "额定功率因数",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.85,
                null
              ]
            },
            {
              "id": "EF03C02",
              "name": "功率因数曲线",
              "desc": "负载变化时 PF 稳定性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.8,
                null
              ]
            },
            {
              "id": "EF03C03",
              "name": "无功需求",
              "desc": "无功功率消耗",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.5
              ]
            },
            {
              "id": "EF03C04",
              "name": "补偿措施",
              "desc": "电容补偿方案",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "EF03C05",
              "name": "谐波影响",
              "desc": "PF 畸变评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            },
            {
              "id": "EF03C06",
              "name": "电网适配",
              "desc": "与电网特性匹配",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "启动效率",
          "checks": [
            {
              "id": "EF04C01",
              "name": "起动效率 η_start",
              "desc": "起动过程效率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.6,
                null
              ]
            },
            {
              "id": "EF04C02",
              "name": "起动电流 I_start",
              "desc": "起动电流倍数",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                7.0
              ]
            },
            {
              "id": "EF04C03",
              "name": "加速时间 t_acc",
              "desc": "从静止到额定转速",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                5.0
              ]
            },
            {
              "id": "EF04C04",
              "name": "起动转矩倍数",
              "desc": "Tst/Tn 比值",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "EF04C05",
              "name": "起动损耗",
              "desc": "起动过程能量损失",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                500
              ]
            },
            {
              "id": "EF04C06",
              "name": "软起动适配",
              "desc": "是否需要软起动",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "能效等级",
          "checks": [
            {
              "id": "EF05C01",
              "name": "IE 标准符合",
              "desc": "是否达到 IE3/IE4/IE5",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                3,
                5
              ]
            },
            {
              "id": "EF05C02",
              "name": "能效对标",
              "desc": "与行业标杆对比",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.95,
                null
              ]
            },
            {
              "id": "EF05C03",
              "name": "政策合规",
              "desc": "是否符合能效标准",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "EF05C04",
              "name": "标签要求",
              "desc": "能效标识要求",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "EF05C05",
              "name": "碳足迹",
              "desc": "制造碳排放评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                500
              ]
            },
            {
              "id": "EF05C06",
              "name": "能效提升潜力",
              "desc": "进一步优化空间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.5,
                null
              ]
            }
          ]
        },
        {
          "name": "能耗指标",
          "checks": [
            {
              "id": "EF06C01",
              "name": "空载损耗 P0",
              "desc": "空载铁耗评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                100
              ]
            },
            {
              "id": "EF06C02",
              "name": "负载损耗 PK",
              "desc": "额定负载损耗",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                1500
              ]
            },
            {
              "id": "EF06C03",
              "name": "日均能耗",
              "desc": "典型工况日能耗",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                100
              ]
            },
            {
              "id": "EF06C04",
              "name": "年运行成本",
              "desc": "年度电费估算",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                5000
              ]
            },
            {
              "id": "EF06C05",
              "name": "节能率",
              "desc": "对比基型节能效果",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.03,
                null
              ]
            },
            {
              "id": "EF06C06",
              "name": "碳减排量",
              "desc": "年度 CO2 减排",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                50,
                null
              ]
            }
          ]
        },
        {
          "name": "功率密度",
          "checks": [
            {
              "id": "EF07C01",
              "name": "功率密度 Pd",
              "desc": "单位归一功率（H30 按 4D normal 带 91 真解点 P5 标定 0.005；原 2.0 为 450kW 大型机口径）",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.005,
                null
              ]
            },
            {
              "id": "EF07C02",
              "name": "转矩密度 Td",
              "desc": "单位归一转矩（H30 按 4D normal 带 91 真解点 P5 标定 0.0004；原 5000 为 Nm/mm³ 绝对值口径）",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.0004,
                null
              ]
            },
            {
              "id": "EF07C03",
              "name": "重量功率比",
              "desc": "单位重量功率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                3.0,
                null
              ]
            },
            {
              "id": "EF07C04",
              "name": "尺寸紧凑度",
              "desc": "外形尺寸评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                0.8,
                1.5
              ]
            },
            {
              "id": "EF07C05",
              "name": "散热面积比",
              "desc": "比表面积",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                50,
                null
              ]
            },
            {
              "id": "EF07C06",
              "name": "材料利用率",
              "desc": "有效材料占比",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.6,
                null
              ]
            }
          ]
        },
        {
          "name": "扭矩密度",
          "checks": [
            {
              "id": "EF08C01",
              "name": "峰值扭矩密度",
              "desc": "峰值转矩/体积（H30 按 4D normal 带 91 真解点 P5 标定 0.0005；原 8000 为 Nm/mm³ 绝对值口径）",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.0005,
                null
              ]
            },
            {
              "id": "EF08C02",
              "name": "额定转矩密度",
              "desc": "额定转矩/体积（H30 按 4D normal 带 91 真解点 P5 标定 0.0004；原 5000 同口径问题）",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.0004,
                null
              ]
            },
            {
              "id": "EF08C03",
              "name": "过载能力",
              "desc": "短时过载倍数",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "EF08C04",
              "name": "转矩波动",
              "desc": "转矩脉动幅度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.15
              ]
            },
            {
              "id": "EF08C05",
              "name": "转矩线性度",
              "desc": "转矩-电流关系",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.95,
                null
              ]
            },
            {
              "id": "EF08C06",
              "name": "动态响应",
              "desc": "转矩响应时间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.01
              ]
            }
          ]
        }
      ]
    },
    {
      "code": "COST",
      "name": "成本效益",
      "bagua": "离",
      "subdomains": [
        {
          "name": "材料成本",
          "checks": [
            {
              "id": "COST01C01",
              "name": "铜材成本",
              "desc": "导体材料费用",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                3000
              ]
            },
            {
              "id": "COST01C02",
              "name": "磁材成本",
              "desc": "永磁体费用",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                2000
              ]
            },
            {
              "id": "COST01C03",
              "name": "硅钢成本",
              "desc": "铁芯材料费用",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                1500
              ]
            },
            {
              "id": "COST01C04",
              "name": "结构材料",
              "desc": "机壳/端盖材料",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                800
              ]
            },
            {
              "id": "COST01C05",
              "name": "绝缘材料",
              "desc": "绝缘系统费用",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                500
              ]
            },
            {
              "id": "COST01C06",
              "name": "材料利用率",
              "desc": "材料浪费率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.15
              ]
            }
          ]
        },
        {
          "name": "制造成本",
          "checks": [
            {
              "id": "COST02C01",
              "name": "加工工时",
              "desc": "机加工时间",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                40
              ]
            },
            {
              "id": "COST02C02",
              "name": "绕线工时",
              "desc": "绕组装配时间",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                20
              ]
            },
            {
              "id": "COST02C03",
              "name": "装配工时",
              "desc": "总装时间",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                15
              ]
            },
            {
              "id": "COST02C04",
              "name": "测试工时",
              "desc": "台架测试时间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                4
              ]
            },
            {
              "id": "COST02C05",
              "name": "模具成本",
              "desc": "冲模/绕模摊销",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                5000
              ]
            },
            {
              "id": "COST02C06",
              "name": "良率",
              "desc": "一次合格率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.95,
                null
              ]
            }
          ]
        },
        {
          "name": "维护成本",
          "checks": [
            {
              "id": "COST03C01",
              "name": "保养周期",
              "desc": "例行维护间隔",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                2000,
                null
              ]
            },
            {
              "id": "COST03C02",
              "name": "备件成本",
              "desc": "易损件费用",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                500
              ]
            },
            {
              "id": "COST03C03",
              "name": "故障率",
              "desc": "MTBF 评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                20000,
                null
              ]
            },
            {
              "id": "COST03C04",
              "name": "维修难度",
              "desc": "可维修性评级",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                1,
                5
              ]
            },
            {
              "id": "COST03C05",
              "name": "大修周期",
              "desc": "大修间隔时间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                30000,
                null
              ]
            },
            {
              "id": "COST03C06",
              "name": "备件库存",
              "desc": "常用备件储备",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "全生命周期成本",
          "checks": [
            {
              "id": "COST04C01",
              "name": "购置成本",
              "desc": "设备采购价",
              "is_strong": true,
              "weight": 0.15,
              "threshold_type": "max",
              "threshold": [
                null,
                50000
              ]
            },
            {
              "id": "COST04C02",
              "name": "运行成本",
              "desc": "10 年电费",
              "is_strong": true,
              "weight": 0.15,
              "threshold_type": "max",
              "threshold": [
                null,
                30000
              ]
            },
            {
              "id": "COST04C03",
              "name": "维护成本",
              "desc": "10 年维护费",
              "is_strong": true,
              "weight": 0.15,
              "threshold_type": "max",
              "threshold": [
                null,
                10000
              ]
            },
            {
              "id": "COST04C04",
              "name": "残值",
              "desc": "报废回收值",
              "is_strong": false,
              "weight": 0.05,
              "threshold_type": "min",
              "threshold": [
                2000,
                null
              ]
            },
            {
              "id": "COST04C05",
              "name": "NPV",
              "desc": "净现值评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0,
                null
              ]
            },
            {
              "id": "COST04C06",
              "name": "TCO",
              "desc": "总拥有成本",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                80000
              ]
            }
          ]
        },
        {
          "name": "性价比指数",
          "checks": [
            {
              "id": "COST05C01",
              "name": "性能/成本比",
              "desc": "单位成本性能",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.05,
                null
              ]
            },
            {
              "id": "COST05C02",
              "name": "效率/成本比",
              "desc": "单位成本效率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                2e-05,
                null
              ]
            },
            {
              "id": "COST05C03",
              "name": "功率/成本比",
              "desc": "单位成本功率",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.02,
                null
              ]
            },
            {
              "id": "COST05C04",
              "name": "竞品对比",
              "desc": "与市场竞品对比",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.9,
                null
              ]
            },
            {
              "id": "COST05C05",
              "name": "客户满意度",
              "desc": "主观评价评分",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                7,
                null
              ]
            },
            {
              "id": "COST05C06",
              "name": "市场接受度",
              "desc": "同类产品销量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                100,
                null
              ]
            }
          ]
        },
        {
          "name": "规模化潜力",
          "checks": [
            {
              "id": "COST06C01",
              "name": "批量生产能力",
              "desc": "日产能力评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                10,
                null
              ]
            },
            {
              "id": "COST06C02",
              "name": "工艺成熟度",
              "desc": "制造工艺成熟度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.7,
                null
              ]
            },
            {
              "id": "COST06C03",
              "name": "供应链稳定",
              "desc": "关键材料供应",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.9,
                null
              ]
            },
            {
              "id": "COST06C04",
              "name": "产能扩张",
              "desc": "扩产可行性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                2.0,
                null
              ]
            },
            {
              "id": "COST06C05",
              "name": "自动化程度",
              "desc": "生产线自动化",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.6,
                null
              ]
            },
            {
              "id": "COST06C06",
              "name": "质量一致性",
              "desc": "批次间差异",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            }
          ]
        },
        {
          "name": "供应链风险",
          "checks": [
            {
              "id": "COST07C01",
              "name": "关键材料依赖",
              "desc": "稀土/铜依赖度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.6
              ]
            },
            {
              "id": "COST07C02",
              "name": "供应商集中度",
              "desc": "单一供应商风险",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.4
              ]
            },
            {
              "id": "COST07C03",
              "name": "价格波动",
              "desc": "材料价格稳定性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.2
              ]
            },
            {
              "id": "COST07C04",
              "name": "地缘政治",
              "desc": "贸易风险",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.3
              ]
            },
            {
              "id": "COST07C05",
              "name": "替代材料",
              "desc": "备选材料方案",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "COST07C06",
              "name": "库存策略",
              "desc": "安全库存水平",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                30,
                null
              ]
            }
          ]
        },
        {
          "name": "替代方案成本",
          "checks": [
            {
              "id": "COST08C01",
              "name": "技术替代",
              "desc": "替代技术可行性",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "COST08C02",
              "name": "成本对比",
              "desc": "替代方案经济性",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                1.2
              ]
            },
            {
              "id": "COST08C03",
              "name": "性能对比",
              "desc": "替代方案性能",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.85,
                null
              ]
            },
            {
              "id": "COST08C04",
              "name": "转换成本",
              "desc": "切换代价评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.3
              ]
            },
            {
              "id": "COST08C05",
              "name": "风险收益",
              "desc": "替代方案 ROI",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.15,
                null
              ]
            },
            {
              "id": "COST08C06",
              "name": "实施周期",
              "desc": "方案切换时间",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                180
              ]
            }
          ]
        }
      ]
    },
    {
      "code": "MANU",
      "name": "制造工艺",
      "bagua": "艮",
      "subdomains": [
        {
          "name": "冲片工艺",
          "checks": [
            {
              "id": "MANU01C01",
              "name": "冲裁精度",
              "desc": "冲片尺寸公差",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            },
            {
              "id": "MANU01C02",
              "name": "毛刺控制",
              "desc": "冲裁边缘质量",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.03
              ]
            },
            {
              "id": "MANU01C03",
              "name": "叠片角度",
              "desc": "冲片叠装角度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                0,
                90
              ]
            },
            {
              "id": "MANU01C04",
              "name": "绝缘涂层",
              "desc": "冲片表面处理",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU01C05",
              "name": "模具寿命",
              "desc": "冲模使用次数",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                10000,
                null
              ]
            },
            {
              "id": "MANU01C06",
              "name": "废料率",
              "desc": "冲压材料利用率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.3
              ]
            }
          ]
        },
        {
          "name": "绕组工艺",
          "checks": [
            {
              "id": "MANU02C01",
              "name": "绕线精度",
              "desc": "匝数误差控制",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                1
              ]
            },
            {
              "id": "MANU02C02",
              "name": "线圈成型",
              "desc": "绕组形状精度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.5
              ]
            },
            {
              "id": "MANU02C03",
              "name": "绝缘处理",
              "desc": "浸漆真空压力",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU02C04",
              "name": "接线方式",
              "desc": "极相组连接",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU02C05",
              "name": "绑扎固定",
              "desc": "绕组机械固定",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU02C06",
              "name": "焊接质量",
              "desc": "导线连接可靠性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.02
              ]
            }
          ]
        },
        {
          "name": "装配工艺",
          "checks": [
            {
              "id": "MANU03C01",
              "name": "定子转子间隙",
              "desc": "气隙控制精度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            },
            {
              "id": "MANU03C02",
              "name": "轴承装配",
              "desc": "轴承压装工艺",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU03C03",
              "name": "轴系对中",
              "desc": "转子同心度",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.03
              ]
            },
            {
              "id": "MANU03C04",
              "name": "端盖安装",
              "desc": "静配合公差",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.02
              ]
            },
            {
              "id": "MANU03C05",
              "name": "接线盒",
              "desc": "电气连接质量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU03C06",
              "name": "密封装配",
              "desc": "防水防尘密封",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "焊接工艺",
          "checks": [
            {
              "id": "MANU04C01",
              "name": "焊接方法",
              "desc": "连接工艺选择",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                4
              ]
            },
            {
              "id": "MANU04C02",
              "name": "焊接强度",
              "desc": "接头强度测试",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                0.8,
                null
              ]
            },
            {
              "id": "MANU04C03",
              "name": "焊缝质量",
              "desc": "外观与探伤",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            },
            {
              "id": "MANU04C04",
              "name": "热影响区",
              "desc": "焊接变形控制",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.1
              ]
            },
            {
              "id": "MANU04C05",
              "name": "焊接速度",
              "desc": "生产效率",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                100,
                null
              ]
            },
            {
              "id": "MANU04C06",
              "name": "自动化程度",
              "desc": "机器人焊接",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "测试验证",
          "checks": [
            {
              "id": "MANU05C01",
              "name": "出厂测试",
              "desc": "全项目测试覆盖",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU05C02",
              "name": "性能测试",
              "desc": "效率/转矩/温升",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU05C03",
              "name": "绝缘测试",
              "desc": "耐压/绝缘电阻",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU05C04",
              "name": "振动测试",
              "desc": "噪声与振动",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU05C05",
              "name": "耐久性测试",
              "desc": "寿命验证试验",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU05C06",
              "name": "环境测试",
              "desc": "高低温/湿热",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "质量控制",
          "checks": [
            {
              "id": "MANU06C01",
              "name": "QC 流程",
              "desc": "质量管控体系",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU06C02",
              "name": "首件检验",
              "desc": "批量首件确认",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU06C03",
              "name": "过程检验",
              "desc": "工序间检验",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU06C04",
              "name": "最终检验",
              "desc": "成品出厂检验",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU06C05",
              "name": "SPC 控制",
              "desc": "统计过程控制",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU06C06",
              "name": "追溯体系",
              "desc": "批次追踪能力",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "生产节拍",
          "checks": [
            {
              "id": "MANU07C01",
              "name": "单台工时",
              "desc": "总装配时间",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                120
              ]
            },
            {
              "id": "MANU07C02",
              "name": "瓶颈工序",
              "desc": "关键路径识别",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU07C03",
              "name": "产能规划",
              "desc": "日/月产量",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                10,
                null
              ]
            },
            {
              "id": "MANU07C04",
              "name": "柔性生产",
              "desc": "多品种切换",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU07C05",
              "name": "自动化率",
              "desc": "自动化设备占比",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.5,
                null
              ]
            },
            {
              "id": "MANU07C06",
              "name": "人机工程",
              "desc": "工人操作便利性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                7,
                null
              ]
            }
          ]
        },
        {
          "name": "工艺容差",
          "checks": [
            {
              "id": "MANU08C01",
              "name": "尺寸公差",
              "desc": "关键尺寸容差",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.1
              ]
            },
            {
              "id": "MANU08C02",
              "name": "参数漂移",
              "desc": "性能参数离散",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.05
              ]
            },
            {
              "id": "MANU08C03",
              "name": "工艺鲁棒性",
              "desc": "容错能力评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                0.8,
                null
              ]
            },
            {
              "id": "MANU08C04",
              "name": "敏感性分析",
              "desc": "关键参数敏感度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU08C05",
              "name": "DOE 实验",
              "desc": "工艺优化实验",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "MANU08C06",
              "name": "工艺文件",
              "desc": "作业指导书完整性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        }
      ]
    },
    {
      "code": "RELIAB",
      "name": "可靠性寿命",
      "bagua": "兑",
      "subdomains": [
        {
          "name": "绝缘寿命",
          "checks": [
            {
              "id": "RELIAB01C01",
              "name": "绝缘老化",
              "desc": "热老化预测寿命",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                20,
                null
              ]
            },
            {
              "id": "RELIAB01C02",
              "name": "热冲击",
              "desc": "温度循环耐受",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                100,
                null
              ]
            },
            {
              "id": "RELIAB01C03",
              "name": "电应力",
              "desc": "局部放电评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                5
              ]
            },
            {
              "id": "RELIAB01C04",
              "name": "环境应力",
              "desc": "湿热/盐雾测试",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB01C05",
              "name": "机械应力",
              "desc": "振动/冲击测试",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB01C06",
              "name": "寿命模型",
              "desc": "Arrhenius 模型",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "磁体寿命",
          "checks": [
            {
              "id": "RELIAB02C01",
              "name": "磁体衰减",
              "desc": "退磁风险评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                0.02
              ]
            },
            {
              "id": "RELIAB02C02",
              "name": "温度稳定性",
              "desc": "工作温度上限",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                150
              ]
            },
            {
              "id": "RELIAB02C03",
              "name": "抗去磁能力",
              "desc": "反向磁场耐受",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "RELIAB02C04",
              "name": "氧化防护",
              "desc": "磁体表面涂层",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB02C05",
              "name": "机械固定",
              "desc": "磁体防脱落设计",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB02C06",
              "name": " Replacement 策略",
              "desc": "磁体更换方案",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "轴承寿命",
          "checks": [
            {
              "id": "RELIAB03C01",
              "name": "L10 寿命",
              "desc": "额定寿命评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                20000,
                null
              ]
            },
            {
              "id": "RELIAB03C02",
              "name": "载荷能力",
              "desc": "径向/轴向载荷",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "RELIAB03C03",
              "name": "润滑状态",
              "desc": "油脂状态监测",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB03C04",
              "name": "密封状态",
              "desc": "防尘防水密封",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB03C05",
              "name": "振动监测",
              "desc": "轴承健康诊断",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB03C06",
              "name": "更换周期",
              "desc": "预防性维护间隔",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                10000,
                null
              ]
            }
          ]
        },
        {
          "name": "疲劳强度",
          "checks": [
            {
              "id": "RELIAB04C01",
              "name": "应力幅值",
              "desc": "交变应力评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                100
              ]
            },
            {
              "id": "RELIAB04C02",
              "name": "循环次数",
              "desc": "疲劳寿命预测",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1000000.0,
                null
              ]
            },
            {
              "id": "RELIAB04C03",
              "name": "裂纹扩展",
              "desc": "缺陷敏感性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                0.01
              ]
            },
            {
              "id": "RELIAB04C04",
              "name": "安全系数",
              "desc": "强度安全裕度",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "RELIAB04C05",
              "name": "失效模式",
              "desc": "FMEA 分析",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB04C06",
              "name": "修复策略",
              "desc": "损伤容限设计",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "腐蚀防护",
          "checks": [
            {
              "id": "RELIAB05C01",
              "name": "环境等级",
              "desc": "腐蚀环境评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                5
              ]
            },
            {
              "id": "RELIAB05C02",
              "name": "表面涂层",
              "desc": "防腐处理工艺",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB05C03",
              "name": "材料选择",
              "desc": "耐腐蚀材料",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                4
              ]
            },
            {
              "id": "RELIAB05C04",
              "name": "密封防护",
              "desc": "内部防护",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB05C05",
              "name": "定期维护",
              "desc": "检查周期",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1000,
                null
              ]
            },
            {
              "id": "RELIAB05C06",
              "name": "失效分析",
              "desc": "腐蚀机理研究",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "环境适应",
          "checks": [
            {
              "id": "RELIAB06C01",
              "name": "温度范围",
              "desc": "工作温度适应性",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                5
              ]
            },
            {
              "id": "RELIAB06C02",
              "name": "湿度范围",
              "desc": "湿度耐受能力",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "range",
              "threshold": [
                1,
                4
              ]
            },
            {
              "id": "RELIAB06C03",
              "name": "海拔高度",
              "desc": "高空降容评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "max",
              "threshold": [
                null,
                1000
              ]
            },
            {
              "id": "RELIAB06C04",
              "name": "防护等级 IP",
              "desc": "防尘防水等级",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                54,
                68
              ]
            },
            {
              "id": "RELIAB06C05",
              "name": "抗震性能",
              "desc": "地震适应性",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "range",
              "threshold": [
                1,
                4
              ]
            },
            {
              "id": "RELIAB06C06",
              "name": "特殊环境",
              "desc": "腐蚀/爆炸环境",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "故障模式",
          "checks": [
            {
              "id": "RELIAB07C01",
              "name": "FMEA 分析",
              "desc": "失效模式影响分析",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB07C02",
              "name": "关键故障",
              "desc": "严重度评估",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "max",
              "threshold": [
                null,
                3
              ]
            },
            {
              "id": "RELIAB07C03",
              "name": "故障树",
              "desc": "FTA 分析",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB07C04",
              "name": "冗余设计",
              "desc": "故障安全策略",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB07C05",
              "name": "预警系统",
              "desc": "状态监测方案",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            },
            {
              "id": "RELIAB07C06",
              "name": "应急预案",
              "desc": "故障响应流程",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "boolean",
              "threshold": [
                1,
                1
              ]
            }
          ]
        },
        {
          "name": "安全裕度",
          "checks": [
            {
              "id": "RELIAB08C01",
              "name": "设计裕度",
              "desc": "性能预留空间",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1.2,
                null
              ]
            },
            {
              "id": "RELIAB08C02",
              "name": "热裕度",
              "desc": "温升余量",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                15,
                null
              ]
            },
            {
              "id": "RELIAB08C03",
              "name": "机械裕度",
              "desc": "强度安全系数",
              "is_strong": true,
              "weight": 0.2,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "RELIAB08C04",
              "name": "电气裕度",
              "desc": "绝缘耐压余量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.5,
                null
              ]
            },
            {
              "id": "RELIAB08C05",
              "name": "寿命裕度",
              "desc": "设计寿命余量",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.2,
                null
              ]
            },
            {
              "id": "RELIAB08C06",
              "name": "综合裕度",
              "desc": "多维度安全评估",
              "is_strong": false,
              "weight": 0.1,
              "threshold_type": "min",
              "threshold": [
                1.3,
                null
              ]
            }
          ]
        }
      ]
    }
  ],
  "sancai_mapping": {
    "tian": [
      "EM",
      "EF",
      "RELIAB"
    ],
    "di": [
      "ME",
      "TH",
      "MANU"
    ],
    "ren": [
      "MT",
      "COST"
    ]
  },
  "na": {
    "domains": [
      "COST",
      "MANU"
    ],
    "checkpoints": [
      "EF01C05",
      "EF01C06",
      "EF02C04",
      "EF02C05",
      "EF02C06",
      "EF03C04",
      "EF03C05",
      "EF03C06",
      "EF05C01",
      "EF05C03",
      "EF05C04",
      "EF05C05",
      "EF05C06",
      "EF06C05",
      "EF06C06",
      "EF07C03",
      "EF07C05",
      "EF08C03",
      "EF08C04",
      "EF08C05",
      "EF08C06",
      "EM01C04",
      "EM01C05",
      "EM01C06",
      "EM03C01",
      "EM03C02",
      "EM03C03",
      "EM03C04",
      "EM03C05",
      "EM03C06",
      "EM04C03",
      "EM04C04",
      "EM04C05",
      "EM04C06",
      "EM05C02",
      "EM05C03",
      "EM05C04",
      "EM05C05",
      "EM07C01",
      "EM07C02",
      "EM07C03",
      "EM07C04",
      "EM07C05",
      "EM07C06",
      "EM08C01",
      "EM08C02",
      "EM08C03",
      "EM08C04",
      "EM08C05",
      "EM08C06",
      "ME05C01",
      "ME05C02",
      "ME05C03",
      "ME05C04",
      "ME05C05",
      "ME05C06",
      "ME06C01",
      "ME06C02",
      "ME06C03",
      "ME06C04",
      "ME06C05",
      "ME06C06"
    ]
  }
}
