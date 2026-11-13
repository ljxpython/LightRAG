# LightRAG 与 MLflow 评测中台双轨闭环与全景基准集演化专项

- **时间：** 2026-11-12
- **目标：** 打通 LightRAG（`sshmy2`）与生产级 MLflow 评测底座（`sshmy1`:9128）跨网络通信，实现评测指标、超参数与推理证据链自动上报，并基于合成演化与 RGB/MultiHop 权威基准构建全景评测集。
- **影响模块：**
  - `evaluation/mlflow_adapter.py` (新增)
  - `evaluation/runner.py` (扩展 MLflow 上报)
  - `evaluation/deepeval_runner.py` (扩展 MLflow 上报)
  - `evaluation/dataset_generator.py` (新增数据集演化与转换工具)
  - `evaluation/datasets/` (新增高质量全景评测集)
  - `evaluation/README.md` (文档更新)
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行核心代码入侵！直接利用 `mlflow-eval-platform` 已投产的标准 REST API / SDK 协议直连通信，无需对 `sshmy1` 现有平台进行破坏性重构。
- **上游侵入度：** 0 行代码侵入！严格恪守 `lightrag/` 官方核心算法库的纯净性，所有客户端调度、数据上报和评测生成完全收敛在 `evaluation/` 外挂包内。
- **生产环境可复现：** 跨宿主机真实联通（`sshmy2` ➔ `sshmy1:9128`），拒绝 Mock，实测跑通全链路。

---

## 方案概述与双端适配权责划分

针对用户关于“两个项目分别需要做哪些适配”的核心诉求，整体系统遵循**客户端（被测方）上报、中枢平台（管理方）归档展示**的工业界标准解耦架构：

```
┌────────────────────────────────────────────────────────────────────────┐
│                   sshmy2: LightRAG 生产底座 (被测主体)                   │
│                                                                        │
│  1. 题库读取 (evaluation/datasets/sample_lightrag.json / rgb_qa.json)   │
│  2. 执行检索与生成 (FastAPI 9621: /query 携带 X-Project-Id 与 JWT)      │
│  3. 算子裁判打分 (RAGAS 连续度量 + DeepEval 工业断言 + Reason 提取)     │
│  4. MLflow 适配器 (evaluation/mlflow_adapter.py)                       │
│     └─ 通过标准 REST/gRPC 自动上报 Run、Params、Metrics、Table、JSON    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST 上报 (9128 端口)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                sshmy1: mlflow-eval-platform (评测管理中台)              │
│                                                                        │
│  - 服务地址：http://49.233.222.54:9128 (Nginx 反代 -> Gunicorn 5000)   │
│  - 实验空间：lightrag-production-evaluation                           │
│  - 存储中心：PostgreSQL / SQLite + Artifacts 目录                      │
│  - 前端大盘：React 18 SPA 实时展示折线对比、雷达图、Badcase 扣分原因    │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. 被测端（LightRAG 项目）适配工作
1. **安装轻量 Client 依赖**：在 `evaluation/.eval_venv` 和主环境中安装 `mlflow>=2.15.0`。
2. **构建解耦上报适配器 (`evaluation/mlflow_adapter.py`)**：
   - 封装 `MLflowEvaluationTracker` 类；
   - 自动读取 `MLFLOW_TRACKING_URI=http://49.233.222.54:9128`；
   - 自动创建并管理 Experiment（如 `lightrag-production-evaluation`）；
   - 在一个 Run 内部自动记录超参数（`mode`, `top_k`, `chunk_top_k`, `enable_rerank` 等）；
   - 记录四大黄金指标数值（`faithfulness`, `answer_relevancy`, `contextual_recall`, `contextual_precision`）；
   - 将每道题的评测详情与**逐字扣分理由 (Reason)** 构建为结构化表格（`mlflow.log_table`），在 MLflow 界面直接查阅表格大盘；
   - 将全量 JSON 报告作为 Artifact 归档（`mlflow.log_artifact`）。
3. **改造 CLI 调度器**：
   - 在 `runner.py` 与 `deepeval_runner.py` 增加 `--mlflow` / `--no-mlflow` 开关及 `--experiment-name` 参数。
4. **全景评测集构建工具 (`evaluation/dataset_generator.py`)**：
   - 封装 Ragas `TestsetGenerator` 与 DeepEval `Synthesizer`，读取 `evaluation/documents/` 自动生成覆盖多跳、复杂推理的题库；
   - 编写权威基准转换器（RGB / MultiHop-RAG 转换为 LightRAG 标准格式）。

### 2. 评测中枢端（`mlflow-eval-platform`）适配工作
1. **0 代码改动原则**：平台底座已经完美运行在 `sshmy1`（`http://49.233.222.54:9128`），无需修改任何已有业务代码。
2. **网络连通性保障**：已现场实测从 `sshmy2` 能够秒级直连 `49.233.222.54:9128`，端口畅通无阻。
3. **大盘体验对齐**：通过标准 `log_table` 与 `log_metrics`，前端原生支持直观呈现不同 Run 之间的指标走势与 Badcase 排查。
