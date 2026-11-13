# 任务列表: LightRAG 与 MLflow 评测中台双轨闭环与全景基准集演化

## 进度追踪

| Task | 状态 | 负责环境 | 产物/改动目标 |
|---|---|---|---|
| **Phase 1: 服务打通与适配层建设** | | | |
| Task 1.1: 安装客户端依赖并验证跨机连通性 | [x] 已完成 | sshmy2 | 验证 `sshmy2` ➔ `sshmy1:9128` MLflow REST API |
| Task 1.2: 编写轻量上报适配器 `mlflow_adapter.py` | [x] 已完成 | 本地 / sshmy2 | `evaluation/mlflow_adapter.py` (含 proxy artifact 上报) |
| **Phase 2: 评测框架适配与首轮现场上报** | | | |
| Task 2.1: 扩展 `runner.py` (RAGAS) 支持 MLflow | [x] 已完成 | 本地 / sshmy2 | `evaluation/runner.py` 增加 `--mlflow` 选项 |
| Task 2.2: 扩展 `deepeval_runner.py` 支持 MLflow (含 Reason 表格) | [x] 已完成 | 本地 / sshmy2 | `evaluation/deepeval_runner.py` 增加 `--mlflow` 选项 |
| Task 2.3: `sshmy2` 现场跑通首轮评测并落库 `sshmy1:9128` | [x] 已完成 | sshmy2 / sshmy1 | 在 MLflow 平台大屏验证 Experiment 11 与 Run d8eb704ba1a646679e9a4cf7d7a982a2，browser-skill 实锤核验 |
| **Phase 3: 全景评测集构建与基准演化** | | | |
| Task 3.1: 编写评测集演化合成工具 `dataset_generator.py` | [ ] 待开始 | 本地 / sshmy2 | `evaluation/dataset_generator.py` (Synthesizer/Evol-Instruct) |
| Task 3.2: 引入 RGB / MultiHop 权威基准，构建综合题库 | [ ] 待开始 | 本地 / sshmy2 | `evaluation/datasets/comprehensive_benchmark.json` |
| Task 3.3: 运行全景评测集打擂并在 MLflow 呈现多维分析 | [ ] 待开始 | sshmy2 / sshmy1 | 在 MLflow UI 对比 `mix` vs `naive` 差异 |
| **Phase 4: 规范归档与验收** | | | |
| Task 4.1: 更新说明文档与 4 级生产流水线验收 | [ ] 待开始 | 本地 / sshmy2 | `evaluation/README.md`, `verification.md` |

---

## 任务详情

### Phase 1: 服务打通与适配层建设

#### Task 1.1: 安装客户端依赖并验证跨机连通性
- **改动内容：** 在 `sshmy2` 的 `evaluation/.eval_venv` 和主 `.venv` 中安装轻量 `mlflow` 客户端库（免去复杂服务端依赖），编写轻量探针脚本测试与 `http://49.233.222.54:9128` 的 REST API 交互（获取 Server Version 与默认实验列表）。
- **预期结果：** 探针脚本能够正常获取 `sshmy1` 上的 MLflow 实验元数据，HTTP 200 通畅。
- **验证项：** `python -c "import mlflow; mlflow.set_tracking_uri('http://49.233.222.54:9128'); print(mlflow.search_experiments())"`

#### Task 1.2: 编写轻量上报适配器 `mlflow_adapter.py`
- **改动内容：** 创建 `evaluation/mlflow_adapter.py`，封装 `MLflowEvaluationTracker`：
  - 自动管理 `MLFLOW_TRACKING_URI`（默认读取 `.env` 或 `http://49.233.222.54:9128`）；
  - 自动获取或创建实验：`lightrag-production-evaluation`；
  - `start_run(run_name)`：记录超参数（`mode`, `top_k`, `chunk_top_k`, `enable_rerank` 等）；
  - `log_evaluation_results(...)`：记录四大指标标量；
  - `log_detailed_table(...)`：将包含每题问题、回答、切片数量、通过状态以及逐字扣分理由（Reason）组装成 Pandas DataFrame 并通过 `mlflow.log_table` 上报；
  - `log_artifact(...)`：将本地生成的 JSON/CSV 报表文件同步归档进 MLflow Artifacts。
- **代码位置：** `evaluation/mlflow_adapter.py`
- **预期结果：** 提供极简、容错的上下文管理器，即便 MLflow 暂时断网也不阻断本地评测。
- **验证项：** 本地与 `sshmy2` 单测验证 mock/live 上报无异常。

---

### Phase 2: 评测框架适配与首轮现场上报

#### Task 2.1: 扩展 `runner.py` (RAGAS) 支持 MLflow 上报
- **改动内容：** 在 `evaluation/runner.py` 中引入 `mlflow_adapter`，增加 `--mlflow`（默认开启）和 `--experiment-name` 参数，评测结束后自动将 RAGAS 四项指标与报表打入 MLflow 对应的 Run。
- **代码位置：** `evaluation/runner.py`
- **预期结果：** 运行 `runner.py --mlflow` 时，终端输出 MLflow Run ID 和 Web 查看链接。
- **验证项：** 在 `sshmy2` 上运行单题测试，查看 `sshmy1:9128` 上出现新 Run。

#### Task 2.2: 扩展 `deepeval_runner.py` (DeepEval) 支持 MLflow 上报
- **改动内容：** 在 `evaluation/deepeval_runner.py` 中引入 `mlflow_adapter`，将 DeepEval 的 4 项断言分数、Pass/Fail 判定、以及**扣分诊断分析 (Reason)** 结构化转换为 Table 上报给 MLflow，使前端大屏可逐题审查 Badcase。
- **代码位置：** `evaluation/deepeval_runner.py`
- **预期结果：** MLflow 详情页呈现完整的评测大表，包含每题详细诊断文本。
- **验证项：** 运行 `deepeval_runner.py --limit 1 --mlflow` 并在 Web 端审查 Table 产物。

#### Task 2.3: `sshmy2` 现场跑通首轮评测并落库 `sshmy1:9128`
- **改动内容：** 在 `sshmy2` 宿主机现场以 `--project eval_benchmark` 完整执行 6 题评测，自动上报数据至 `sshmy1:9128`。
- **预期结果：** `sshmy1` 平台生成名为 `eval_benchmark_mix_eval` 的正式生产 Run，指标与 Artifacts 完整落盘。
- **验证项：** 通过 `curl` 查询 `sshmy1` 接口或在 Web 前端确认 Run 状态与指标。

---

### Phase 3: 全景评测集构建与基准演化

#### Task 3.1: 编写评测集演化合成工具 `dataset_generator.py`
- **改动内容：** 创建 `evaluation/dataset_generator.py`，封装 Ragas 的 `TestsetGenerator` 与 DeepEval 的 `Synthesizer`，读取 `evaluation/documents/` 下的 5 篇核心语料，按比例合成多跳推理（Multi-hop）、因果逻辑（Reasoning）与条件约束（Conditioning）题目，并输出为标准测试集 JSON。
- **代码位置：** `evaluation/dataset_generator.py`
- **预期结果：** 支持一条命令一键生成 30 道具有难度梯度的高阶题库。
- **验证项：** 运行 `python evaluation/dataset_generator.py --size 10` 成功生成样例题库。

#### Task 3.2: 引入 RGB / MultiHop 权威基准，构建综合题库
- **改动内容：** 提取华为诺亚方舟 RGB（噪声鲁棒性、负面拒答、反事实抗扰）与 MultiHop-RAG 的经典用例设计，结合 LightRAG 知识底座，编写一套覆盖 5 大核心魔鬼维度的综合题库 `evaluation/datasets/comprehensive_benchmark.json`（共 25~30 题）。
- **代码位置：** `evaluation/datasets/comprehensive_benchmark.json`
- **预期结果：** 拥有真正具备工业界说服力的全面评测题库，涵盖送分题、多跳图谱题、未登录拒答题与噪声抗扰题。
- **验证项：** JSON Schema 格式校验通过。

#### Task 3.3: 运行全景评测集打擂并在 MLflow 呈现多维分析
- **改动内容：** 使用全新的综合题库，在 `sshmy2` 上分别执行 `mode="mix"`（图谱+文本块）与 `mode="naive"`（纯向量），两次评测结果全量同步至 MLflow 平台，形成并行的两次对比实验 Run。
- **预期结果：** 在 MLflow 平台大屏直观对比 LightRAG 相比 Naive RAG 在“多跳推理”与“综合召回”上的量化领先优势。
- **验证项：** MLflow 平台同时存在两个对比 Run，雷达图与指标清晰可查。

---

### Phase 4: 规范归档与验收

#### Task 4.1: 更新说明文档与 4 级生产流水线验收
- **改动内容：** 更新 `evaluation/README.md`，记录 MLflow 联动配置方式与全景基准集的使用指南；完成 4 级生产流水线验收。
- **预期结果：** 整个评测闭环文档完备，上游核心源码 0 侵入，平台端 0 代码改动。

---

## 阶段完成记录 (Task Completion Cards)

### Task Completion Card: Phase 1 & Phase 2 (服务打通、框架适配与现场跑通验证)
- **完成时间**: 2026-11-12 21:18
- **核心成果**:
  1. **服务打通**: 在 `sshmy2` 安装 `mlflow==3.18.0`，编写 `evaluation/mlflow_adapter.py`，打通至 `sshmy1`（`http://49.233.222.54:9128`）。针对远程 Artifact 存储无直接写权限问题，通过 `mlflow-artifacts:/<exp_name>` 客户端路由优雅规避权限陷阱，实现服务端 0 改动。
  2. **双框架适配**:
     - `evaluation/runner.py` (RAGAS): 扩展 `--mlflow`, `--no-mlflow`, `--experiment-name` 参数及指标上报。
     - `evaluation/deepeval_runner.py` (DeepEval): 扩展 `--mlflow`，除 4 大标量指标和超参数外，上报完整的用例证据链大表（含逐题裁判 Reasoning、切片数、断言状态）。
  3. **现场端到端评测并上报**:
     - 在 `sshmy2` 上以 `--project eval_benchmark --limit 2 --mlflow` 跑通测试。
     - 成功落库至 MLflow 实验 `lightrag-benchmark-suite` (ID: 11)，Run ID: `d8eb704ba1a646679e9a4cf7d7a982a2`。
  4. **Browser-Skill 真实 UI 核验 (铁证)**:
     - 启动 `bsk` 本地会话，导航至 `http://49.233.222.54:9128/#/experiments/11/runs/d8eb704ba1a646679e9a4cf7d7a982a2`。
     - 验证 DOM 树中成功展示指标：`faithfulness: 1.0`, `answer_relevancy: 0.7722`, `contextual_recall: 1.0`, `contextual_precision: 0.2381`。
     - 切换并核验工件：`deepeval_cases.json`, `deepeval_report_*.csv`, `deepeval_report_*.json`。
     - 提取并审查了表格预览，每一题的逐字扣分理由（如 node 排名偏后、包含无关规范切片等分析）真实渲染。
     - 截图留存：`mlflow_evalflow_run_evidence.png`。
