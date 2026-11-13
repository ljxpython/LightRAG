# 项目 ➔ 评测集 ➔ 评测材料 全生命周期血缘契约、UI 嵌入与 MLflow 参数化触发

- **时间：** 2026-11-12
- **目标：** 构建覆盖文本增删改（Add/Modify/Delete）的“项目-材料-评测集”强绑定血缘契约标准；设计 LightRAG 与 EvalFlow (MLflow) 页面双向嵌入方案；实现多参数（检索模式、Top-K、重排）矩阵触发与打擂对比机制。
- **影响模块：** `evaluation/dataset_generator.py`, `evaluation/deepeval_runner.py`, `evaluation/mlflow_adapter.py`, `gateway_mcp_server.py`
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 工具矩阵与平台 REST API）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 核心算法源码保持纯净，可随时升级 upstream）

---

## 方案概述

针对现有评测体系“数据血缘断裂”、“知识库更新后评测集腐烂”、“参数打擂缺少一键触发与可视化对比”三大痛点，本专项提出三位一体的工业级设计：

### 1. 全生命周期血缘契约标准 (Lineage Manifest v2)
构建基于真实物理存储（`sandbox_storage/<project>/active/kv_store_full_docs.json`）的出生证明契约，覆盖 CRUD 生命周期：
- **新增文本 (ADD)**：差量探测器筛出新增 `doc_id`，出题器靶向生成局部事实题，并基于 LightRAG 实体拓扑与存量切片交织生成跨代多跳题，打上 `v2` 标签并归并入主库；
- **修改文本 (MODIFY)**：通过 `content_hash` 变化检测受损题目范围，自动标记为 `stale`，并由 LLM 裁判针对新切片重新修正 `ground_truth`，杜绝虚假 Badcase；
- **删除文本 (DELETE)**：已下线文档关联的题目自动转化为**“负样本拒答题 (Refusal Verification)”**，要求 RAG 明确回答未提及，直接对齐华为诺亚方舟 RGB 负面拒答评测标准！

### 2. 页面嵌入与展示架构设计 (Dual-View Integration)
- **LightRAG WebUI (9621) 视角**：
  利用 MLflow 已配置的 `MLFLOW_SERVER_X_FRAME_OPTIONS=NONE` 安全放行，在原生 WebUI 导航栏增加“评测与观测中台 (EvalFlow)”导航项，支持一键无感嵌入 `http://49.233.222.54:9128`，无需切换窗口即可查看评测大盘；
- **EvalFlow (9128) 视角**：
  在平台现有的“数据集 (Datasets)”和“评估运行 (Evaluation Runs)”模块下，将生成的评测集结构化为可视表格（Table View），展示每一题的题干、参考答案、依赖文档列表与演化标签，并支持版本回溯。

### 3. MLflow 多参数矩阵触发与打擂机制 (Matrix Runner)
在评测端实现参数笛卡尔积扫参（Parameter Grid Execution）：
- 允许指定 `--matrix-mode mix,naive,hybrid` 与 `--matrix-top-k 20,40`；
- 评测器自动创建 Parent Run 与多个分立的 Child Runs，全量指标上报后直接在 MLflow UI 开启“Compare Runs”；
- 绘制平行坐标图与柱状对比图，量化呈现 LightRAG 图谱检索相比 Naive 纯向量检索在多跳推理与综合召回上的绝对优势。
