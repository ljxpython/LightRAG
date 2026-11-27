# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1: 题量参数主权治理（废除硬编码翻倍） | [x] 已设计，待编码 | sshmy2 |
| Task 2: 出题引擎 4 并发与 [CASE: X/Y] 精准进度上报 | [ ] 待开始 | sshmy2 |
| Task 3: 实时落盘与断点续传机制实现 (Checkpoint Recovery) | [ ] 待开始 | sshmy2 |
| Task 4: 网关层任务管理解析当前题数状态 | [ ] 待开始 | sshmy2 |
| Task 5: 前端交互重构 (容量选项 + 顶部常驻出题进度条 + 刷新自愈) | [ ] 待开始 | sshmy2 |
| Task 6: 全链路真实端到端验证与 4 级生产流水线 | [ ] 待开始 | sshmy2 |

## 任务详情

### Task 1: 题量参数主权治理（废除硬编码翻倍）
- **改动内容：** 废除 `size_to_gen = max(target_size, len(new_doc_ids) * 2)`，严格尊重用户传入的 `target_size`。当题数小于新增文档数时，采用跨文档分层覆盖抽样。
- **代码位置：** `evaluation/dataset_generator.py` → `evolve_lifecycle_dataset`
- **预期结果：** 指定 `--size 20` 时精准生成 20 题。
- **验证项：** `python dataset_generator.py ... --size 5` 验证最终总用例数恰为 5。
- **状态：** `[ ]` 待开始

### Task 2: 出题引擎 4 并发与进度协议升级
- **改动内容：** 引入 `asyncio.Semaphore(4)` 实现题目并发生成；同时标准化输出：`[PROGRESS: XX%] [CASE: N/TOTAL]`。
- **代码位置：** `evaluation/dataset_generator.py` → `NativeSynthesizer.generate_cases`
- **预期结果：** 多题并发生成，耗时大幅下降；标准输出携带题数指标。
- **验证项：** 运行合成观察日志输出格式与交替时戳。
- **状态：** `[ ]` 待开始

### Task 3: 实时落盘与断点续传机制实现
- **改动内容：** 引入 `checkpoint.json`，每完成一道题目即原子追加写盘；重新执行时优先加载已有 checkpoint，续跑剩余题目。
- **代码位置：** `evaluation/dataset_generator.py` → `evolve_lifecycle_dataset` & `generate_cases`
- **预期结果：** 即使进程意外中止，重新发起出题自动接着出，不丢已生成成果。
- **验证项：** 模拟 kill 进程后重新拉起，验证从已完成题目接力跑。
- **状态：** `[ ]` 待开始

### Task 4: 网关层任务状态字段丰富
- **改动内容：** 在 `eval_task_mgr` 解析 stdout 时，抓取 `[CASE: (\d+)/(\d+)]` 并更新到 `task["current_case"]` 与 `task["total_cases"]`。
- **代码位置：** `run_lightrag_webui_server.py` → `_run_dataset_generate_bg`
- **预期结果：** `GET /ops/evaluation/tasks/{id}` 返回结构化字段：`current_case` 与 `total_cases`。
- **验证项：** curl 接口验证返回 JSON。
- **状态：** `[ ]` 待开始

### Task 5: 前端交互重构 (容量选项 + 顶部常驻进度条 + 刷新自愈)
- **改动内容：**
  1. 弹窗支持：极速测试 (10/25) + 全库推荐 (N/2N) + 自由输入框 (3~300)；
  2. 页面顶部新增“后台出题常驻进度条”，展示任务名、进度百分比、`已完成 X/Y 题`、最新日志，支持一键重新唤出弹窗或终止；
  3. `localStorage` 缓存当前出题 `synthTaskId`，页面刷新后自动拉取状态继续轮询。
- **代码位置：** `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`
- **预期结果：** 用户哪怕关了弹窗或关了浏览器再打开，顶部依然清晰展示出题进度。
- **验证项：** WebUI 实际操作并刷新页面验证。
- **状态：** `[ ]` 待开始

### Task 6: 全链路真实端到端验证与 4 级生产流水线
- **改动内容：** 在 `sshmy2` 上启动 10 题真实测试，验证前端进度条动态展示、落盘完整性、WebUI 刷新无报错。
- **代码位置：** `sshmy2` 生产环境
- **预期结果：** 整个流水线畅通无阻，生成 10 题并自动落盘入库。
- **验证项：** `uv run --with pytest --with pytest-asyncio pytest tests/ -v` & `verify_8_tools_live.py`。
- **状态：** `[ ]` 待开始
