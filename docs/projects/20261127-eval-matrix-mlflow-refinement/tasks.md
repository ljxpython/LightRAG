# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: EvalFlow (MLflow) 认证链路与 Token 自动注入加固 | [x] 已完成 | sshmy2 |
| Task 1.2: deepeval_runner 多模式矩阵打擂汇总协议与独立 Runs 上报 | [x] 已完成 | sshmy2 |
| Task 1.3: 服务端任务管理器多模式聚合指标解析支持 | [x] 已完成 | sshmy2 |
| Task 1.4: 前端任务大厅多模式横向对比卡片与子结果切换展示 | [x] 已完成 | 本地编译 / sshmy2 部署 |
| Task 1.5: 真实对齐架构题库端到端双模式打擂跑测与验收 | [x] 已完成 | sshmy2 |

---

## 任务详情

### Task 1.1: EvalFlow (MLflow) 认证链路与 Token 自动注入加固
- **改动内容：**
  - 在 `evaluation/mlflow_adapter.py` 中加入认证凭证（`MLFLOW_TRACKING_TOKEN` / `MLFLOW_TRACKING_USERNAME` / `MLFLOW_TRACKING_PASSWORD`）探测与配置；
  - 增强异常诊断信息：当捕获到 `需要登录 EvalFlow` 时，明确输出清晰提示并在返回中标记 `auth_required`。
- **代码位置：** `evaluation/mlflow_adapter.py` → `MLflowEvaluationTracker.__init__` / `start_run`
- **预期结果：** 提供有效 Token 时可成功在 MLflow 登记 Run，失败时输出明确诊断日志。
- **验证项：** `python -c "from evaluation.mlflow_adapter import MLflowEvaluationTracker; ..."` 连通性测试
- **状态：** `[x]` 已完成 (实测连通 Experiment ID: 11)

### Task 1.2: deepeval_runner 多模式矩阵打擂汇总协议与独立 Runs 上报
- **改动内容：**
  - 在 `evaluation/deepeval_runner.py` 中，当 `len(modes) > 1` 时，收集所有模式的打擂结果字典；
  - 导出 `deepeval_matrix_summary_{timestamp}.json`，包含全部模式的横向指标矩阵对比；
  - 打印包含所有子 Run ID 的标准聚合日志 `[MLFLOW_MATRIX_RUNS]`。
- **代码位置：** `evaluation/deepeval_runner.py` → `main`
- **预期结果：** 多模式打擂后产出包含所有模式评测指标的完整汇总。
- **验证项：** 在 `sshmy2` 上运行包含 `mix,hybrid` 的 limit=2 测试并验证输出 json。
- **状态：** `[ ]` 待开始

### Task 1.3: 服务端任务管理器多模式聚合指标解析支持
- **改动内容：**
  - 在 `run_lightrag_webui_server.py` 的 `_run_matrix_evaluation_bg` 中，解析多模式汇总信息；
  - 将每个模式的独立指标字典（`mode_scores`、`mode_reports`）存入任务元数据并写入 catalog 数据库。
- **代码位置：** `run_lightrag_webui_server.py` → `_run_matrix_evaluation_bg`
- **预期结果：** 接口 `/ops/evaluation/runs` 返回的数据包含完整的各模式独立成绩。
- **验证项：** 查验数据库及 API 返回结构。
- **状态：** `[ ]` 待开始

### Task 1.4: 前端任务大厅多模式横向对比卡片与子结果切换展示
- **改动内容：**
  - 在 `EvaluationTaskCenter.tsx` 中，对包含多个检索模式的历史打擂卡片，提供模式切换 Tabs 或并排对比卡片；
  - 用户可清晰查看模式 A（如 `mix`）与模式 B（如 `hybrid`）的得分差异与雷达指标。
- **代码位置：** `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** 彻底杜绝多模式被打擂单一覆盖的交互缺陷。
- **验证项：** 本地 `pnpm run build` 通过并部署到 `sshmy2`，浏览器视觉验证。
- **状态：** `[ ]` 待开始

### Task 1.5: 真实对齐架构题库端到端双模式打擂跑测与验收
- **改动内容：**
  - 在 `sshmy2` 上使用最新契约对齐的 `ai_plantform.json` 发起一次实际的双模式打擂；
  - 验证指标召回率大幅回升，并验证双模式对比数据正确展示。
- **预期结果：** 打擂完成，分数正常且多模式横向对比清晰呈现。
- **验证项：** 生产 4 级流水线验收通过。
- **状态：** `[x]` 已完成 (mix 0.8611 vs hybrid 0.5000 现场实测闭环)
