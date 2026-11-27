# 评测单题全链路 Trace 级联追踪与 WebUI 直通跳转

- **时间：** 2026-11-27
- **目标：** 构建单题全链路 OpenTelemetry Trace 级联树（RAG 检索 -> LLM 生成 -> 裁判打分），捕获每道考题的真实 Trace ID，并在 WebUI 用例卡片提供一键直通 EvalFlow Trace 详情的大屏跳转。
- **影响模块：**
  - `evaluation/deepeval_runner.py`
  - `evaluation/mlflow_adapter.py`
  - `run_lightrag_webui_server.py`
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **状态：** 进行中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 _ResultV2 契约）
- **上游侵入度：** 0 行代码侵入（lightrag/ 保持官方纯净，可随时升级）

## 方案概述
1. **单题父子 Span 级联树构建**：
   在 `evaluation/deepeval_runner.py` 中，使用 MLflow / OpenTelemetry 对每道评测题目开启父级 Trace（`eval_case_{test_number}`）：
   - 子 Span 1：`lightrag_retrieval`，记录检索模式、Top-K、耗时及召回切片摘要；
   - 子 Span 2：`llm_generation`，记录大模型生成答案、Prompt 与耗时；
   - 子 Span 3：`deepeval_judgement`，记录 4 项黄金指标得分与深度裁判理由。
2. **Trace ID 捕获与关联**：
   评测执行器提取该用例专属的 `trace_id`，并拼装出标准的 EvalFlow 直通 URL（`http://49.233.222.54:9128/#/experiments/{exp_id}/traces/{trace_id}`），注入每道用例的 JSON 报告中。
3. **WebUI 用例卡片直通胶囊**：
   在 WebUI 打擂任务大厅的 `TestCaseCard` 右上角，在耗时胶囊旁边增加 `🔗 链路 (Trace)` 小药丸按钮，点击即在新标签页直达 EvalFlow 对应的单题 Trace 级联时序图。
