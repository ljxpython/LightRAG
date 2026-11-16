# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 后端 `eval_runs` 数据模型与指标聚合持久化扩展 | [x] 已完成 | sshmy2 |
| Task 1.2: 后端任务列表与详情接口实现 (`GET /ops/evaluation/runs`, `GET /ops/evaluation/runs/{task_id}`) | [x] 已完成 | sshmy2 |
| Task 1.3: 后端任务中止能力 (`POST /ops/evaluation/tasks/{task_id}/abort`) | [x] 已完成 | sshmy2 |
| Task 2.1: 前端双视图导航与任务中心框架搭建 (`EvaluationTaskCenter.tsx` + `EvaluationStudio.tsx`) | [x] 已完成 | sshmy2 |
| Task 2.2: 前端运行中任务实时流式跟踪面板与日志弹窗 | [x] 已完成 | sshmy2 |
| Task 2.3: 前端历史打擂指标卡片（Faithfulness/Relevancy/Recall/Precision/专项断言）与用例扣分诊断详情表 | [x] 已完成 | sshmy2 |
| Task 3.1: 现场端到端打擂、任务流转与 MLflow 联动全量回归验证 | [x] 已完成 | sshmy2 |

---

## 任务详情

### Task 1.1: 后端 `eval_runs` 数据模型与指标聚合持久化扩展
- **改动内容：** 
  - 扩展 `catalog_manager.py` 中的 `eval_runs` 表结构，安全迁移增加 `overall_score`, `pass_rate`, `metrics_summary_json`, `report_file` 字段。
  - 在打擂执行逻辑 `_run_matrix_evaluation_bg` 完成时，读取生成的 `deepeval_report_*.json` 文件，自动计算汇总各维度指标均值，并原子写入 `catalog_mgr.update_eval_run(...)`。
- **代码位置：** 
  - `catalog_manager.py` → `CatalogManager._init_schema`, `update_eval_run`, `list_eval_runs`
  - `run_lightrag_webui_server.py` → `_run_matrix_evaluation_bg`
- **预期结果：** 打擂进程结束时，SQLite 中自动持久化该任务的综合分、通过率、各指标平均分和报告路径。
- **验证项：** 在 `sshmy2` 上运行测试脚本或读取 sqlite 库，验证 `eval_runs` 字段完整且更新成功。
- **状态：** `[x]` 已完成

---

### Task 1.2: 后端任务列表与详情接口实现
- **改动内容：** 
  - 实现 `GET /ops/evaluation/runs`：支持过滤 `project_id`、`status`，返回所有任务卡片列表（包含运行中任务的实时百分比，以及历史任务的评分总览）。
  - 实现 `GET /ops/evaluation/runs/{task_id}`：读取对应落盘的 JSON 报告，返回详细到单题级别的 scores、reasons 与 passed 状态。
- **代码位置：** 
  - `run_lightrag_webui_server.py` → `list_evaluation_runs`, `get_evaluation_run_detail`
- **预期结果：** 接口返回 200，字段格式与前端 TaskStatus / MetricCard 契约完美对齐。
- **验证项：** `curl http://127.0.0.1:9621/ops/evaluation/runs` 返回 JSON 任务列表。
- **状态：** `[x]` 已完成

---

### Task 1.3: 后端任务中止能力
- **改动内容：** 
  - 记录打擂子进程的 `PID`（或进程对象），提供 `POST /ops/evaluation/tasks/{task_id}/abort` 接口。
  - 收到 abort 请求时，优雅向子进程发送 `SIGTERM`（超时后 `SIGKILL`），更新任务状态为 `aborted`。
- **代码位置：** 
  - `run_lightrag_webui_server.py` → `EvalTaskManager`, `abort_evaluation_task`
- **预期结果：** 用户点击停止后，服务器后台子进程立即终止，释放资源，状态转为已中止。
- **验证项：** 触发打擂并在 10 秒内调用 abort 接口，确认进程退出。
- **状态：** `[x]` 已完成

---

### Task 2.1: 前端双视图导航与任务中心框架搭建
- **改动内容：** 
  - 在 `EvaluationStudio.tsx` 顶部增加二级 Tab 切换：【考题题库编排】与【打擂任务大厅】。
  - 标签上展示徽标 Badge：正在运行的任务数（如动态闪烁的 `⚡ 1 运行中`）。
  - 创建独立子组件或同级组件 `EvaluationTaskCenter.tsx`，保持代码职责单一（SOLID-S原则）。
- **代码位置：** 
  - `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** 点击切换 Tab 零卡顿，题库编辑台与任务大厅状态各自隔离。
- **验证项：** 浏览器中点击导航无报错，Tab 切换顺畅。
- **状态：** `[x]` 已完成

---

### Task 2.2: 前端运行中任务实时流式跟踪面板与日志弹窗
- **改动内容：** 
  - 在任务大厅顶部常驻【进行中任务】卡片区域。
  - 无论是否关闭过打擂弹窗，进入任务大厅均会自动按 2 秒周期轮询运行中任务。
  - 提供“查看实时推流日志”按钮，随时拉起终端日志抽屉（无需中断当前页面操作）。
  - 提供“终止打擂”红色按钮，联动后端 abort 接口。
- **代码位置：** 
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** 任务进度实时更新，关掉弹窗或刷新网页后重新打开，依然能看到正在运行的任务和最新进度。
- **验证项：** 启动一次打擂后刷新页面，进入任务中心能无缝恢复进度条与日志流。
- **状态：** `[x]` 已完成

---

### Task 2.3: 前端历史打擂指标卡片与用例扣分诊断详情表
- **改动内容：** 
  - 渲染【历史打擂列表】：以时间倒序展示历史打擂，包含题库名称、检索模式、综合得分、通过率、耗时、执行时间。
  - 点击单行展开【核心指标雷达/概览卡】：
    - 5 大核心指标卡片：忠实度、相关性、召回率、精确度、反事实/拒答抗扰度（带色彩标识与得分条）。
  - 展开单题扣分详情大表：显示哪些用例未通过、扣分理由（LLM 裁判输出的 Reason 证据链）。
  - 提供外链快捷操作：一键跳转对应 MLflow Run、下载 JSON 报告。
- **代码位置：** 
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** 历史打擂成果一目了然，无需离开系统即可获知各维度的优劣势。
- **验证项：** 点击 19:25:55 的历史打擂，能够完整渲染指标卡片与考题明细。
- **状态：** `[x]` 已完成

---

### Task 3.1: 现场端到端打擂、任务流转与 MLflow 联动全量回归验证
- **改动内容：** 
  - 在 `sshmy2` 宿主机现场运行前端打包编译（`npm run build`）并同步至 WebUI 生产目录。
  - 重启 `rag-webui` 守护进程。
  - 发起一次真实打擂，验证从“启动打擂 → 关掉弹窗 → 进入任务大厅查看进度 → 打擂完成自动归档到历史表 → 展开查看指标卡片 → 点击跳转 MLflow”全链路闭环。
- **代码位置：** 
  - `sshmy2` 生产环境全量联动。
- **预期结果：** 4 级流水线全部 PASS，前端交互流畅，无任何控制台报错。
- **验证项：** 输出完整的 verification.md 实测日志。
- **状态：** `[x]` 已完成
