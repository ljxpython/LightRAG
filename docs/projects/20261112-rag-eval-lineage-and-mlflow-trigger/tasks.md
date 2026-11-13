# 任务列表: 全生命周期血缘契约、UI 嵌入与 MLflow 参数化触发

## 进度追踪

| Task | 状态 | 负责环境 | 产物/改动目标 |
|---|---|---|---|
| **Phase 1: 全生命周期血缘契约标准设计与实现** | | | |
| Task 1.1: 升级契约 Schema 规范与物理血缘提取器 | [x] 已完成 | sshmy2 | `evaluation/dataset_generator.py` 支持 `--from-project` 读取真实物理索引 |
| Task 1.2: 实现增删改 (CRUD) 差量探测与状态演化 | [x] 已完成 | sshmy2 | 增加 `--incremental`，支持新增/更新/删除(负样本拒答)流转 |
| **Phase 2: 评测执行端血缘守卫与参数矩阵打擂** | | | |
| Task 2.1: 在 `deepeval_runner.py` 注入血缘校验守卫 | [x] 已完成 | sshmy2 | 运行前校验项目当前材料与题库 manifest，拦截张冠李戴 |
| Task 2.2: 实现多参数打擂矩阵运行与 MLflow 聚合 | [x] 已完成 | sshmy2 | 支持 `--matrix-mode`，生成打擂 Runs 并在 MLflow 统一呈现 |
| **Phase 3: 页面嵌入方案落地** | | | |
| Task 3.1: 规划并实现 LightRAG WebUI 嵌入 EvalFlow 中台通道 | [x] 已完成 | sshmy2 | 在 WebUI `/evalflow` 路由集成 iframe 生产大盘与导航头 |
| ~~Task 3.2: 暴露 FastMCP 评测触发工具~~ | [已取消] | - | 根据用户明确指示跳过，网关保持纯粹 |
| **Phase 4: 全量流水线验收与现场演示** | | | |
| Task 4.1: sshmy2 现场跑通矩阵评测并在 MLflow 呈现多维打擂 | [x] 已完成 | sshmy2 / sshmy1 | 在 MLflow 大屏完成 Compare 柱状图/平行坐标图核验与 browser-skill 存证 |

---

## 任务详情

### Phase 1: 全生命周期血缘契约标准设计与实现

#### Task 1.1: 升级契约 Schema 规范与物理血缘提取器
- **改动内容：** 升级 `evaluation/dataset_generator.py`，增加 `--from-project` 参数。直接扫描目标项目路径（`/sandbox_storage/<project>/rev_N/kv_store_full_docs.json`），提取所有文档的真实 `doc_id`、文件名、内容 SHA-256 哈希，生成题库头部的 `corpus_manifest`。
- **代码位置：** `evaluation/dataset_generator.py` → `extract_project_corpus_manifest()`
- **预期结果：** 生成的数据集 JSON 具备完整的物理出生证明与指纹签名。
- **验证项：** `python evaluation/dataset_generator.py --from-project eval_benchmark --size 2` 输出包含 `corpus_manifest`。

#### Task 1.2: 实现增删改 (CRUD) 差量探测与状态演化
- **改动内容：** 增加 `--incremental` 与 `--base-dataset` 参数：
  - 对比目标项目当前文档与老题库的 `corpus_manifest`；
  - **新增文档**：为新切片生成独立题目，并通过图谱实体关联老切片生成跨文档多跳题；
  - **修改文档**：标记受损老题目为 `stale`，触发裁判重新校验 `ground_truth`；
  - **删除文档**：将关联题目转换为 `refusal_verification`（负面拒答考题，要求 RAG 明确回复未提及）；
  - 自动归并生成带版本标签（`v2`）的演进数据集。
- **代码位置：** `evaluation/dataset_generator.py` → `evolve_incremental_dataset()`
- **预期结果：** 支持无需全量重跑，仅针对增删改文本毫秒级增补或修订题库。
- **验证项：** 模拟文档增删改场景，验证输出的数据集结构与状态标签转换正确。

---

### Phase 2: 评测执行端血缘守卫与参数矩阵打擂

#### Task 2.1: 在 `deepeval_runner.py` 注入血缘校验守卫
- **改动内容：** 在评测启动前读取数据集的 `corpus_manifest`，与目标项目当前已入库的文档做集合校验。若关键文档缺失，给出清晰警告或优雅跳过不可测题目，杜绝“拿A考卷考B知识库”导致的全盘 0 分误报。
- **代码位置：** `evaluation/deepeval_runner.py` → `validate_project_lineage()`
- **预期结果：** 形成健壮的测试前校验拦截机制。

#### Task 2.2: 实现多参数打擂矩阵运行与 MLflow 聚合
- **改动内容：** 扩展 `evaluation/deepeval_runner.py` 支持 `--matrix-mode mix,naive` 等批量参数。主进程启动 Parent Run，子任务分别运行指定模式并作为 Nested Runs 上报，打上对应参数标签。
- **代码位置：** `evaluation/deepeval_runner.py` → `run_matrix_evaluation()`
- **预期结果：** 一条命令完成多检索模式横向打擂，自动落库至 MLflow 进行可视化 Compare。
- **验证项：** `python evaluation/deepeval_runner.py --matrix-mode mix,naive --limit 2 --mlflow` 跑通。

---

### Phase 3: 页面嵌入方案落地与 FastMCP 工具暴露

#### Task 3.1: 规划并实现 LightRAG WebUI 嵌入 EvalFlow 中台
- **改动内容：** 在港大原生 WebUI 或外挂入口中配置直达 EvalFlow 的 Iframe/跳转通道，利用现有跨域配置（`MLFLOW_SERVER_X_FRAME_OPTIONS=NONE`）实现单点大屏聚合体验。
- **代码位置：** WebUI 配置或外挂 HTML 页面。
- **预期结果：** 用户在 Web 端可无缝查看评测大屏。

#### Task 3.2: 暴露 FastMCP 评测触发工具供 Agent 消费
- **改动内容：** 在 `gateway_mcp_server.py` 中新增 `mcp_trigger_project_evaluation` 工具，允许上层 Agent 通过自然语言调度带参评测并获取 MLflow 直达链接。
- **代码位置：** `gateway_mcp_server.py`
- **预期结果：** 契约严格遵循 FastMCP 规范，平台端 0 改动。

---

### Phase 4: 全量流水线验收与现场演示

#### Task 4.1: sshmy2 现场跑通矩阵评测并在 MLflow 呈现多维打擂
- **改动内容：** 在 `sshmy2` 宿主机现场跑通全生命周期演化与打擂对比，调用 `/browser-skill` 在 MLflow 大屏完成 UI 验证并截图存证。

---

## 任务完成卡片 (Task Completion Cards)

### Task Completion Card: 全生命周期血缘契约标准设计 (Phase 1)
- **完成动作：**
  1. 在 `evaluation/dataset_generator.py` 中实现 `--from-project`，直接提取真实入库文档的 SHA-256 哈希与切片元数据，生成携带 `corpus_manifest` 的标准数据集；
  2. 实现全生命周期 CRUD 差量探测器 `evolve_lifecycle_dataset`：
     - **新增文档 (ADD)**：靶向新切片生成独立考题，结合老切片生成跨文档多跳考题（`evolution_type: "multi_hop"`）；
     - **修改文档 (MODIFY)**：标记受影响老题为 `stale`，触发大模型重新审查修正 `ground_truth`，打上 `ACTIVE`；
     - **删除文档 (DELETE)**：将失效老题自动转换为**“负样本拒答题（Huawei RGB 标准）”**（`evolution_type: "refusal_verification"`, `lifecycle_tag: "REFUSAL_NEGATIVE"`），断言系统明确拒答，杜绝幻觉。
- **验证记录：**
  - 在 `sshmy2` 上成功运行 `lineage_benchmark_v1.json` 生成，单测模拟删除文档断言 100% 转换为负样本拒答题；增量差量为 0 时零 Token 消耗继承。

### Task Completion Card: 评测血缘守卫与参数矩阵打擂 (Phase 2)
- **完成动作：**
  1. 在 `deepeval_runner.py` 中注入 `validate_dataset_lineage`，评测前强校验签约项目 ID 与文档指纹集合，拦截张冠李戴；
  2. 实现 `--matrix-mode` 与 `--matrix-top-k` 参数矩阵打擂，依次执行 `mix` 与 `naive` 评测，并在 MLflow 统一记录。
- **验证记录：**
  - 实测打擂：`mode=mix` (综合得分 0.7219, 上下文召回率 0.6667) 远胜 `mode=naive` (综合得分 0.6324, 上下文召回率 0.3333)。

### Task Completion Card: WebUI 嵌入与可视化核验 (Phase 3 & 4)
- **完成动作：**
  1. 在 `run_lightrag_webui_server.py` 增加 `/evalflow` 路由，iframe 嵌入 MLflow 评测大盘并附带深色导航栏；
  2. 利用 `/browser-skill` (`bsk`) 自动化操作浏览器完成真实端到端核验与双重视图截图留存：
     - `mlflow_evaluation_runs_dashboard.png`: 评估运行多维指标走势与 Runs 列表大屏；
     - `mlflow_matrix_compare_evidence.png` & `mlflow_matrix_metrics_evidence.png`: 参数矩阵打擂对比表与指标差异视图；
     - `lightrag_embedded_evalflow_evidence.png`: LightRAG 生产控制台无缝嵌入大盘视图。

