# LightRAG 独立外挂式多租户质量评测体系

基于香港大学最新官方 LightRAG 1.5.8 专有分支构建的企业级外挂式知识系统质量评测套件。
严格恪守 **“上游源码（`lightrag/`）0 侵入、0 篡改”** 红线，完全在外部解耦运行。

---

## 🌟 双轨评测框架矩阵

本项目同时支持业内两大主流评估框架，满足从学术度量到工业 CI/CD 自动化断言的全场景需求：

| 评估框架 | 核心定位 | 判定机制 | 关键优势 | 适用场景 |
|---|---|---|---|---|
| **RAGAS** (`runner.py`) | 学术型连续度量衡 (Scorer) | 0.0 ~ 1.0 连续浮点分值 | 社区基准对齐度高，标准打分成熟 | 算法调优、模型版本纵向基准对照 |
| **DeepEval** (`deepeval_runner.py`) | 工业级断言与诊断引擎 (Assertor) | 阈值断言 (Pass / Fail) + **逐字推理证据链 (Reason)** | **精准输出扣分理由**，指出哪个切片不相关、为何排序靠后 | CI/CD 门禁、回归测试、切片召回排查 |

---

## 📁 目录拓扑结构

```text
evaluation/
├── datasets/                       # 标准问答测试集
│   ├── sample_lightrag.json        # 港大官方 6 题标准基准集
│   └── business_qa.json            # 业务场景扩展问答集
├── documents/                      # 标准原始语料库 (5 篇核心 Markdown 原材料)
│   ├── a_brief_history_of_the_internet.md
│   ├── artificial_intelligence.md
│   ├── renewable_energy_revolution.md
│   ├── the_great_wall_of_china.md
│   └── the_quantum_leap_computing.md
├── results/                        # 自动生成的结构化报表 (CSV / JSON 带时间戳)
├── ingest_samples.py               # 原材料一键全自动灌库工具
├── engine.py                       # RAGAS 评估引擎 (含 bypass_n 补丁与两阶段信号量)
├── runner.py                       # RAGAS CLI 多租户评测运行器
├── deepeval_runner.py              # DeepEval 工业级断言与扣分诊断评测运行器
└── README.md                       # 模块规范说明文档
```

---

## 🚀 快速上手指南

### 步骤 1：为待测项目一键灌库（准备待测知识库）

评测前必须确保目标项目（例如 `eval_benchmark`）已灌入语料原材料并构建好图谱：

```bash
# 自动读取 .env 登录鉴权，将 evaluation/documents/ 下全部语料灌入目标项目
python evaluation/ingest_samples.py --project eval_benchmark
```

### 步骤 2 选项 A：运行 RAGAS 学术评测

```bash
# 对 eval_benchmark 项目运行 6 题 RAGAS 全量质量评测
python evaluation/runner.py --project eval_benchmark --dataset evaluation/datasets/sample_lightrag.json
```

**核心指标输出：**
- `Faithfulness`: 回答对检索切片的忠实度（反幻觉）
- `Context Recall`: 检索切片对参考答案的召回覆盖率
- `Context Precision`: 检索切片中相关内容的排序靠前度
- `Answer Relevancy`: 回答与提问语义的相关程度

---

### 步骤 2 选项 B：运行 DeepEval 工业级断言与诊断评测

```bash
# 激活独立评测沙箱环境
source evaluation/.eval_venv/bin/activate

# 运行 DeepEval 全量断言评测（设定 Pass 阈值为 0.7）
python evaluation/deepeval_runner.py --project eval_benchmark --threshold 0.7
```

**DeepEval 核心杀手锏：扣分理由逐字透传 (`Reason`)**

DeepEval 不仅输出分数与 PASS/FAIL 判定，还会针对低分项输出详细的医学手术刀式排查报告。例如针对检索切片排序低分的诊断：

```text
• contextual_precision: 0.3873 [❌ FAIL]
  └─ 🔍 理由: The score is 0.39 because relevant nodes in retrieval contexts are not ranked above irrelevant ones:
              nodes 1 and 2 are irrelevant, discussing Chinese API tokens. The first relevant node only appears at node 3,
              which states 'LightRAG solves the hallucination problem...'. Later relevant nodes at 5 and 7 are separated
              by irrelevant node 6 about vector databases. Multiple irrelevant nodes precede the relevant nodes.
```

---

### 步骤 3：高级超参数调优与检索模式打擂对比

两套评测执行器均已全量支持底层核心调度参数，可通过 CLI 灵活调整并对比评测表现：

```bash
# 1. 跑纯向量检索基准 (Naive RAG Baseline，不依赖知识图谱)
python evaluation/runner.py --project eval_benchmark --mode naive --chunk-top-k 10

# 2. 跑图谱混合模式 + 大配额 + 显式开启重排
python evaluation/deepeval_runner.py --project eval_benchmark \
  --mode mix \
  --top-k 40 \
  --chunk-top-k 20 \
  --enable-rerank \
  --threshold 0.7

# 3. 对比测试：显式关闭重排 (--no-rerank) 观察 Precision 变化
python evaluation/deepeval_runner.py --project eval_benchmark --mode mix --no-rerank

# 4. 注入用户自定义附加提示词 (限制字数与格式)
python evaluation/deepeval_runner.py --project eval_benchmark \
  --user-prompt "请直接给出核心结论，采用无序列表组织，控制在150字以内。"
```

| 参数项 | 说明 | 默认值 | 作用场景 |
|---|---|---|---|
| `--mode, -m` | 查询检索模式 (`naive`/`local`/`global`/`hybrid`/`mix`) | `mix` | 横向对比不同图谱与向量融合算法的质量差异 |
| `--top-k` | KG 图谱实体/关系候选上限 | `40` | 调整知识图谱检索深度与召回量 |
| `--chunk-top-k` | 文本切片向量检索候选上限 | `None` (服务端20) | 调整纯文本切片召回配额 |
| `--enable-rerank` | 显式开启检索重排 | 默认生效 | 提升切片精密度 (Context Precision) |
| `--no-rerank` | 显式关闭检索重排 | - | 对照实验，观察重排对排序质量的影响 |
| `--user-prompt` | 附加输出 System Prompt | `None` | 约束大模型回答风格、字数与格式 |
| `--max-total-tokens` | 上下文最大 Token 预算 | `None` (服务端30000) | 限制注入 Prompt 的硬性预算 |

---

## 🔒 生产环境安全与二开适配原则

1. **多租户严格物理隔离**：
   - 评测脚本所有请求均显式注入 `X-Project-Id`，禁止向默认根库混入测试数据。
2. **强制 JWT Bearer 鉴权对齐**：
   - 自动适配生产服务端 `AUTH_ACCOUNTS` 配置，通过 `/login` 获取 Token 并携带请求，严禁裸调。
3. **官方源码 0 侵入**：
   - 本套件完全位于根目录 `evaluation/` 下，执行 `git status --porcelain lightrag/` 恒定为空。
