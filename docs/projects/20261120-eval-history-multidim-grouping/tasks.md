# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1: 后端打擂记录跨项目查询兼容与校验 | [x] 已完成 | sshmy2 |
| Task 2: 评测工坊数据源与项目元数据向下透传 | [x] 已完成 | sshmy2 |
| Task 3: 归档多维聚类看板与交互重构（评测集聚类/最优分/涨跌幅/多维筛选） | [x] 已完成 | sshmy2 |
| Task 4: 4 级生产流水线验证与系统收尾（含 Upstream Guard） | [x] 已完成 | sshmy2 |
| Task 5: 历史打擂成果物理删除（后端 DELETE API + catalog_manager + 前端二次确认删除动作） | [x] 已完成 | sshmy2 |

---

## 任务详情

### Task 1: 后端打擂记录跨项目查询兼容与校验
- **改动内容：**
  - 检查并验证 `run_lightrag_webui_server.py` 中的 `list_evaluation_runs` 接口：
    - 当请求 `GET /ops/evaluation/runs?project_id=all` 时，能正确绕过当前工作区限制，拉取全量跨项目打擂记录；
    - 确保返回结构中 `project_id`、`dataset_name` 准确无空缺，支持聚合计算。
- **代码位置：** `run_lightrag_webui_server.py` → `list_evaluation_runs`
- **预期结果：** 在后端可无缝响应单个项目或全部项目的 runs 列表。
- **验证项：** 在 `sshmy2` 上运行 `curl -s "http://127.0.0.1:9621/ops/evaluation/runs?project_id=all" | jq .`
- **状态：** `[x]` 已完成 (2026-11-20)

---

### Task 2: 评测工坊数据源与项目元数据向下透传
- **改动内容：**
  - 在 `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx` 中：
    - 将 `workspaceList`（知识库列表）透传给 `EvaluationTaskCenter` 组件；
    - 增加 `EvaluationTaskCenter` 属性定义 `workspaceList?: Array<{ project_id: string; name?: string }>`。
- **代码位置：**
  - `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** `EvaluationTaskCenter` 可以直接将 raw `project_id` 转换为友好项目名称（如 `评测基准`、`平台默认项目`）。
- **验证项：** 前端 TypeScript 编译无类型报错。
- **状态：** `[x]` 已完成 (2026-11-20)

---

### Task 3: 归档多维聚类看板与交互重构（评测集聚类/最优分/涨跌幅/多维筛选）
- **改动内容：**
  - 在 `EvaluationTaskCenter.tsx` 中新增交互控制栏：
    - **知识库项目筛选下拉：** 支持选择当前项目（默认）、全部项目（`all`）或具体某一项目；
    - **评测集快速过滤：** 支持按评测集名称模糊/精确过滤；
    - **视图切换器（View Toggle）：** `[📦 按评测集聚类 (默认)]` vs `[⏱️ 时间流水账]`；
  - 实现纯函数评测集指标聚合引擎（`groupRunsByDataset`）：
    - 针对每个评测集计算：
      1. **历史最佳战绩 (Best Score & Champion Run)：** 包含最高得分、达成该得分的检索模式（如 mix）与达标率；
      2. **最新战绩与涨跌幅 (Latest & Quality Delta Δ)：** 计算最新完成打擂与上一轮打擂的得分差值百分比（如 `+41.7% ↑` 绿色 / `-5.0% ↓` 红色预警）；
      3. **各模式覆盖与胜出情况 (Mode Performance Breakdown)；**
      4. **打擂总场次统计与最后执行时间；**
  - 评测集卡片设计与展开交互：
    - 外层展示题库卡片、项目归属徽标、历史冠军分胶囊、最新战绩增跌幅、覆盖模式徽标；
    - 点击展开内层展示该题库专属的打擂时序子列表；
    - 原生保留每个任务的「重跑打擂」、「指标明细（5大雷达卡+用例诊断）」、「MLflow 外链」能力；
  - 兼容时间流水账视图，用户可一键切换回扁平时间倒序列表。
- **代码位置：** `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** 历史打擂成果归档清晰呈现按评测集分类、按项目筛选、包含最优分与涨跌幅的高质量看板。
- **验证项：** 前端构建无语法/类型报错，各模式展开与筛选响应灵敏无闪烁。
- **状态：** `[x]` 已完成 (2026-11-20)

---

### Task 4: 4 级生产流水线验证与系统收尾（含 Upstream Guard）
- **改动内容：**
  - 在 `sshmy2` 宿主机上执行完整流水线验证：
    1. Level 1: `git status --porcelain lightrag/` 必须为空（0 侵入底线）；
    2. Level 2: 后端单元测试回归 `uv run pytest tests/ -v`；
    3. Level 3: WebUI 前端编译与静态检查 `npm run build`；
    4. Level 4: 重启 WebUI 服务并做 Live 探针检查（端口 9621 返回 200）。
- **代码位置：** 全局
- **预期结果：** 4 级生产验证 100% 通过，系统状态稳定，无报错与内存泄漏。
- **验证项：** 真实命令执行输出日志记录于 `verification.md`。
- **状态：** `[x]` 已完成 (2026-11-20)

---

### Task 5: 历史打擂成果物理删除（后端 DELETE API + catalog_manager + 前端二次确认删除动作）
- **改动内容：**
  - 在 `catalog_manager.py` 新增 `delete_eval_run(task_id: str)`，原子执行 `DELETE FROM eval_runs WHERE task_id = ?` 并安全清理对应磁盘报告文件；
  - 在 `run_lightrag_webui_server.py` 暴露 `@ops_router.delete("/evaluation/runs/{task_id}")`，若内存中存在该任务一并清理；
  - 在 `tests/test_eval_runs_catalog.py` 扩充删除单元测试；
  - 在 `EvaluationTaskCenter.tsx` 中为每场打擂卡片增加 `[🗑️ 删除]` 操作按钮，配合确认弹窗防止手抖误删，删除后触发前端乐观更新与看板实时重新计算。
- **代码位置：**
  - `catalog_manager.py` → `delete_eval_run`
  - `run_lightrag_webui_server.py` → `delete_evaluation_run`
  - `tests/test_eval_runs_catalog.py`
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`
- **预期结果：** 用户可安全彻底删除任意不想要的打擂成果，列表及聚合看板即时刷新。
- **验证项：** 在 `sshmy2` 上运行单测并通过 curl 验证删除 API，前端构建通过。
- **状态：** `[x]` 已完成 (2026-11-20)
