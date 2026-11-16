# 验证记录

## Phase 验证（每个 Task 完成后）

<!-- 每个 Task 完成时在这里追加一条，附带 sshmy2 实测输出 -->

### Phase 1: 后端任务列表与指标聚合扩展
- **Task 1.1 实测：**
  - 执行命令：`uv run python -c "from catalog_manager import catalog_mgr; ..."`
  - 输出结果：`get_eval_run passed: test_task_001 0.88 {'faithfulness': 0.9, 'answer_relevancy': 0.85}; list_eval_runs count: 2; Task 1.1 verification SUCCESS!`
  - 确认项：`eval_runs` 表平滑迁移增加 `overall_score`, `pass_rate`, `metrics_summary_json`, `report_file`，数据读写准确。
- **Task 1.2 实测：**
  - 执行命令：`curl -s 'http://127.0.0.1:9621/ops/evaluation/runs?project_id=eval_rgb_zh'` 与 `GET /ops/evaluation/runs/task_bef617973088`
  - 输出结果：返回结构化打擂列表与单任务用例报告，`overall_score: 0.5005`, 5 大指标均值（Faithfulness: 1.0, Relevancy: 0.6568, Recall: 0.4 等）与用例 cases 数组全量返回。
- **Task 1.3 实测：**
  - 执行命令：调用 `POST /ops/evaluation/matrix-run` 启动任务后调用 `POST /ops/evaluation/tasks/{tid}/abort`
  - 输出结果：`Abort response: 200 {'status': 'aborted'}, Task status after abort: aborted`，子进程安全终止。

### Phase 2: 前端任务中心与指标概览看板
- **Task 2.1 实测：**
  - 构建命令：`cd lightrag_webui && npm run build`
  - 输出结果：`✓ 5446 modules transformed. ✓ built in 2.09s`，编译产物正常写入 `lightrag/api/webui/`。
- **Task 2.2 实测：**
  - 验证项：运行中任务实时流式跟踪面板正常轮询，点击日志按钮成功弹窗展示终端实时日志流，中止按钮调用 abort 接口成功使任务退出。
- **Task 2.3 实测：**
  - 验证项：历史打擂列表正常渲染综合得分与通过率，展开单次打擂成功呈现忠实度、回答相关性、召回率、精确度与反事实抗扰度 5 大指标卡片，用例扣分诊断大表正常加载。

### Phase 3: 全链路打擂闭环与回归
- **Task 3.1 实测：**
  - 现场实测：启动任务 `task_d5e234df0417`，经历 `status=running (progress 10% -> 90%)`，最终完成 `status=completed (progress 100%)`。
  - 数据捕获：`overall_score: 0.9167`, `metrics_summary: {'answer_relevancy': 0.75, 'contextual_recall': 1.0, 'contextual_precision': 1.0}`, MLflow 实验上报成功，用例报告成功关联落盘。

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `uv run --with pytest --with pytest-asyncio pytest tests/test_*.py -q`
  - 实测输出：`315 passed, 2 warnings in 21.43s`（全量单测 100% PASS）

### Level 2: 平台 FastMCP 契约兼容性
- [x] 8 大工具网关（端口 8001）健康度检查通过，双轨服务 LISTEN，平台端契约 0 破坏

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 `HTTP/1.1 200 OK`
- [x] 任务管理接口探活：`curl -s http://127.0.0.1:9621/ops/evaluation/runs?project_id=eval_rgb_zh` 正常返回结构化打擂列表

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-service` 状态为 active (running)，无崩溃重启
- [x] `systemctl status rag-webui` 状态为 active (running)，无崩溃重启

---

### 最终结论
结论：**done**
所有 7 项 Task 全量在 `sshmy2` 宿主机现场实现并验证闭环，上游核心库 `lightrag/` 恒定 0 侵入，平台契约 0 破坏，评测任务大厅与指标看板已完全投产。
