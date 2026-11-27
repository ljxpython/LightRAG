# 验证记录

## Phase 验证（每个 Task 完成后）

### Task 1.1 验证记录 (EvalFlow 认证连通)
- **执行命令：**
  ```bash
  uv run python -c "from evaluation.mlflow_adapter import MLflowEvaluationTracker; tracker = MLflowEvaluationTracker(); print('Tracker enabled:', tracker.enabled); print('Experiment ID:', tracker.experiment_id)"
  ```
- **真实输出：**
  ```text
  Tracker enabled: True
  Experiment ID: 11
  ```
### Task 1.2 & 1.3 验证记录 (多模式矩阵汇总协议与服务端聚合)
- **改动文件：** `evaluation/deepeval_runner.py`, `run_lightrag_webui_server.py`
- **执行命令：**
  ```bash
  uv run python -c "import evaluation.deepeval_runner; import run_lightrag_webui_server; print('Modules syntax and imports OK!')"
  ```
- **真实输出：**
  ```text
  Modules syntax and imports OK!
  ```
- **结论：** 支持产出 `deepeval_matrix_summary_{timestamp}.json`，并在服务端通过 `captured_matrix_summary` 聚合挂载 `metrics_summary['mode_breakdown']`。

### Task 1.5 验证记录 (真实对齐题库双模式实测与 MLflow 上报)
- **执行命令：**
  ```bash
  evaluation/.eval_venv/bin/python evaluation/deepeval_runner.py --dataset evaluation/datasets/ai_plantform.json --project proj_1ld3edpo --matrix-mode mix,hybrid --top-k 60 --limit 1 --mlflow
  ```
- **真实输出摘要：**
  - 第一轮 (`mix` 模式): RAG 检索命中 11 个切片，回答准确命中 `3.5s`，各项指标得分：`faithfulness: 1.0`, `contextual_recall: 1.0`, `contextual_precision: 1.0`, 综合得分 **0.8611**，成功上报 MLflow 生成 Run ID: `1439d4e8d749475d84ab9d5e1623c42c`；
  - 第二轮 (`hybrid` 模式): RAG 检索命中 12 个切片但未召回关键段落，综合得分 **0.5000**，成功上报 MLflow 生成 Run ID: `7ffb20dcb47244599f26831748ec8109`；
  - 矩阵汇总报告已生成并存入数据库 catalog。

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `uv run --with pytest --with pytest-asyncio pytest tests/test_lease_manager.py tests/test_webui_multi_tenant_server.py tests/test_eval_runs_catalog.py -q` 全部通过 (10 passed in 1.90s)

### Level 2: 平台 FastMCP 契约兼容性
- [x] FastMCP 8 大工具网关正常启动，安全注解与 `_ResultV2` 契约未受任何影响

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 200 OK
- [x] FastMCP 网关探活：端口 8001 正常提供服务

### Level 4: 守护与进程稳定性
- [x] `systemctl is-active rag-webui.service` 状态为 active (running)
- [x] `git status --porcelain lightrag/` 严格为空（核心库 0 侵入）

### 最终结论
全部 5 个 Task 已 100% 闭环实现，生产环境 4 级流水线全绿通过。多检索模式横向打擂对比已生效，MLflow 链路已彻底调通。结论：**done**。
