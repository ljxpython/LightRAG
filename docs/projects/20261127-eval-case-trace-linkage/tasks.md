# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1: 评测执行器端到端 Trace 级联与 Trace ID 捕获 | [x] 已完成 | 本地 / sshmy2 |
| Task 2: 后端用例报告模型与 API 响应透传 trace_id 与 trace_url | [x] 已完成 | 本地 / sshmy2 |
| Task 3: 前端 TestCaseCard 渲染 🔗 Trace 直通胶囊与交互优化 | [x] 已完成 | 本地 / sshmy2 |
| Task 4: 端到端热重载并在 sshmy2 运行单题验证，调用 /browser 确认交付 | [x] 已完成 | sshmy2 |

## 任务详情

### Task 1: 评测执行器端到端 Trace 级联与 Trace ID 捕获
- **改动内容：** 在 `deepeval_runner.py` 中引入 `safe_span` 上下文管理器，覆盖父级 `eval_case_#{idx}` 及三个子 Span（`lightrag_retrieval`、`rag_generation`、`deepeval_judgement`）；捕获 `root_span.request_id` 并构造 `trace_url` 写入用例报告与 `mlflow_adapter` 大表。
- **代码位置：** `evaluation/deepeval_runner.py`、`evaluation/mlflow_adapter.py`
- **预期结果：** 每道考题产出的字典与 JSON 包含 `trace_id` 与 `trace_url`。
- **状态：** `[x]` 已完成

### Task 2: 后端用例报告模型与 API 响应透传 trace_id 与 trace_url
- **改动内容：** 确保 `/ops/evaluation/runs/{task_id}` 接口在返回 `cases` 时保留 `trace_id` 与 `trace_url`，并对缺失 URL 的情况实现基于环境变量与默认实验的自愈拼装；彻底修复 `project_id` 含中文字符时的 HTTP Header 和 Cookie 编码问题。
- **代码位置：** `run_lightrag_webui_server.py`
- **预期结果：** API 返回完整的用例链路元数据，服务健壮无 500。
- **状态：** `[x]` 已完成

### Task 3: 前端 TestCaseCard 渲染 🔗 Trace 直通胶囊与交互优化
- **改动内容：** 在 `EvaluationTaskCenter.tsx` 中扩展 `TestCaseResult` 接口（添加 `trace_id` 和 `trace_url`），在 `TestCaseCard` 右上角阶段耗时胶囊旁边渲染优雅的 `🔗 链路 (Trace)` 跳转药丸。
- **代码位置：** `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** 用例卡片右上角直观展示链路跳转按钮，支持在新标签页打开 EvalFlow。
- **状态：** `[x]` 已完成

### Task 4: 端到端热重载并在 sshmy2 运行单题验证，调用 /browser 确认交付
- **改动内容：** 同步修改至 `sshmy2`，通过 WebUI 发起快速单题打擂生成实际带有 Trace 的记录，调用 `browser` subagent（Model: `flash`）全自动化点击跳转并截图留存证据。
- **代码位置：** `sshmy2` 宿主机
- **预期结果：** 实机验证 100% 通过，Trace 级联树与卡片按钮均完美呈现。
- **状态：** `[x]` 已完成
