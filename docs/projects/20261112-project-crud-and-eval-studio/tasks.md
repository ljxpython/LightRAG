# 任务列表: 项目管理闭环与 DeepEval 评测全链路工坊

## 进度追踪

| Task | 状态 | 负责环境 | 产物/改动目标 |
|---|---|---|---|
| **Phase 1: 后端核心能力与异步调度引擎** | | | |
| Task 1.1: 增强 `workspace_manager.py` 实现项目显式新建与安全归档删除 | [x] 已完成 | sshmy2 | 增加 `create_project()` 与带租约排空的 `archive_delete_project()` |
| Task 1.2: 评测集持久化与在线编辑 API | [x] 已完成 | sshmy2 | 实现 `GET/PUT /ops/evaluation/datasets` 支持题库查询、修改与回盘 |
| Task 1.3: 评测集合成与矩阵打擂的异步任务管理器 | [x] 已完成 | sshmy2 | 实现 `POST /ops/evaluation/datasets/generate` 与 `POST /ops/evaluation/matrix-run` 异步后台任务及状态查询 |
| **Phase 2: 评测工坊前端交互页面落地 (`/eval-studio`)** | | | |
| Task 2.1: 构建 `/eval-studio` 前端单页工作台 | [x] 已完成 | sshmy2 | 包含项目管理卡片、题库列表、考题在线卡片式编辑、打擂控制台 |
| Task 2.2: 深度打通评测集合成弹窗与 CRUD 增量探测配置 | [x] 已完成 | sshmy2 | 前端支持配置考题数、勾选增量探测、异步进度条与状态实时展示 |
| Task 2.3: 深度打通矩阵打擂启动器与 MLflow Compare 直达联动 | [x] 已完成 | sshmy2 | 前端勾选模式 (mix, naive)，一键启动打擂，完成后直达 MLflow 对比大屏 |
| **Phase 3: WebUI 导航与端到端闭环验收** | | | |
| Task 3.1: 将 `/eval-studio` 无缝接入 WebUI 顶部导航与 `/evalflow` 控制条 | [x] 已完成 | sshmy2 | 注入顶层入口，实现控制台三端相互直达无缝流转 |
| Task 3.2: 4 级生产流水线验证与 `/browser-skill` 端到端核验截图 | [x] 已完成 | sshmy2 / 本地 | 全功能真实跑通，真实浏览器截图留存，完成交付 |

---

## 任务详情

### Phase 1: 后端核心能力与异步调度引擎

#### Task 1.1: 增强 `workspace_manager.py` 实现项目显式新建与安全归档删除
- **改动内容：**
  - 在 `TenantWorkspaceManager` 中增加 `create_project(tenant_id, project_id, name, description)`：原子创建 `revisions/rev_1` 目录，生成 `active` 软链，持久化 `project_meta.json`；
  - 增加 `archive_delete_project(tenant_id, project_id)`：
    1. 调用 `lease_manager` 确认无活跃读租约（超时优雅排空）；
    2. 将项目目录原子移动至 `sandbox_storage/.trash/{tenant_id}_{project_id}_{timestamp}`；
    3. 清除 `DynamicTenantRagProxy` 的内存缓存。
  - 在 `run_lightrag_webui_server.py` 的 `/ops` 路由中增加：
    - `POST /ops/workspaces`
    - `DELETE /ops/workspaces/{tenant_id}/{project_id}`
- **代码位置：** `workspace_manager.py`, `run_lightrag_webui_server.py`
- **预期结果：** 支持规范的 HTTP API 显式新建和安全删除，无在读死锁风险。
- **验证项：** curl 测试新建测试项目 `curl -X POST /ops/workspaces`，随后安全删除并确认进入 `.trash/`。

#### Task 1.2: 评测集持久化与在线编辑 API
- **改动内容：**
  - 在 `run_lightrag_webui_server.py` 的 `/ops` 路由中增加：
    - `GET /ops/evaluation/datasets`：列出 `evaluation/datasets/` 下的所有题库及其考题总数、关联项目和更新时间；
    - `GET /ops/evaluation/datasets/{dataset_name}`：获取题库的完整考题列表及 `corpus_manifest` 元数据；
    - `PUT /ops/evaluation/datasets/{dataset_name}`：接收前端修改后的考题数组，重新校验并安全写回 JSON 文件，保持血缘元数据。
- **代码位置：** `run_lightrag_webui_server.py`
- **预期结果：** 前端具备对评测集的完整读取、修改、保存回盘能力。
- **验证项：** curl 测试获取与更新考题。

#### Task 1.3: 评测集合成与矩阵打擂的异步任务管理器
- **改动内容：**
  - 建立内存轻量异步任务注册表 `EvalTaskManager`（记录 `task_id`, `type`, `status: pending|running|completed|failed`, `progress`, `logs`, `result_url`）；
  - `POST /ops/evaluation/datasets/generate`：异步在后台调用 `dataset_generator.py`（支持 `--from-project`, `--incremental`, `--base-dataset`），实时更新进度；
  - `POST /ops/evaluation/matrix-run`：异步在后台调用 `deepeval_runner.py`（支持多参数矩阵），完成后拼接 MLflow 对比链接放入 `result_url`；
  - `GET /ops/evaluation/tasks/{task_id}`：前端轮询接口。
- **代码位置：** `run_lightrag_webui_server.py`
- **预期结果：** 彻底杜绝长耗时任务导致的 HTTP 连接超时，前端体验流畅。
- **验证项：** 触发任务并轮询至 `completed`。

---

### Phase 2: 评测工坊前端交互页面落地 (`/eval-studio`)

#### Task 2.1: 构建 `/eval-studio` 前端单页工作台
- **改动内容：**
  - 在 `run_lightrag_webui_server.py` 中注册 `GET /eval-studio` 路由，返回集成 Vue3 + TailwindCSS CDN 的单页应用；
  - UI 布局包含三大选项卡/板块：
    1. **【项目工作区】**：项目卡片列表、当前活动项目高亮、新建项目 Modal、删除归档二次确认；
    2. **【评测集工坊】**：评测集下拉切换、元数据展示、考题列表卡片（支持在线编辑 Question、Ground Truth、考题类型、删除考题、新增考题，点击“保存更改”持久化回盘）；
    3. **【矩阵打擂启动器】**：配置打擂参数、查看实时终端输出。
- **代码位置：** `run_lightrag_webui_server.py`
- **预期结果：** 页面美观、响应敏捷、功能完整。

#### Task 2.2: 深度打通评测集合成弹窗与 CRUD 增量探测配置
- **改动内容：**
  - 在“评测集工坊”增加“⚡ 自动合成评测集”按钮；
  - 弹出配置框：设定生成考题数、勾选“增量差量探测（自动处理新增切片、修改切片重审、删除文档拒答负样本）”、选择基准数据集；
  - 提交后显示进度条与实时生成日志，完成后自动刷新题库列表。
- **代码位置：** `/eval-studio` 前端模板
- **预期结果：** 真正实现全生命周期增删改差量合成的前端一键闭环。

#### Task 2.3: 深度打通矩阵打擂启动器与 MLflow Compare 直达联动
- **改动内容：**
  - 在“矩阵打擂启动器”中提供模式多选（`[x] mix`, `[x] naive`）、Top-K 设置；
  - 点击“启动打擂”后显示运行状态与终端输出；
  - 完成后高亮展示打擂结果卡片，并提供“🔥 直达 MLflow 对比大屏”按钮，点击直接在新标签页打开带有两个 Runs 的 Compare 视图。
- **代码位置：** `/eval-studio` 前端模板

---

### Phase 3: WebUI 导航与端到端闭环验收

#### Task 3.1: 将 `/eval-studio` 无缝接入 WebUI 顶部导航与 `/evalflow` 控制条
- **改动内容：**
  - 在 `/evalflow` 顶部深色导航条中增加 `[⚙️ 评测工坊 Eval Studio]` 入口；
  - 在 LightRAG WebUI 的注入脚本中，在侧边栏或顶部增加直达 `/eval-studio` 的快捷方式。
- **代码位置：** `run_lightrag_webui_server.py`
- **预期结果：** 用户在 WebUI 控制台、EvalFlow 中台与评测工坊之间丝滑切换。

#### Task 3.2: 4 级生产流水线验证与 `/browser-skill` 端到端核验截图
- **改动内容：**
  - 在 `sshmy2` 上运行重启并验证服务；
  - 调用 `/browser-skill` 自动化真实浏览器访问 `/eval-studio`：
    - 验证新建与删除项目；
    - 验证在线编辑评测集并保存；
    - 验证自动合成题库与矩阵打擂；
    - 截图留存并归档。

---

## 任务完成卡片 (Task Completion Cards)

### Task Completion Card: 后端核心能力与异步调度引擎 (Phase 1)
- **完成动作：**
  1. 在 `workspace_manager.py` 中实现 `create_project()` 与 `archive_delete_project()`，支持规范 POSIX CAS 目录初始化、活跃读租约排空核查与 `.trash/` 冷归档；
  2. 在 `run_lightrag_webui_server.py` 暴露显式 `POST /ops/workspaces` 和 `DELETE /ops/workspaces/{tenant_id}/{project_id}`；
  3. 实现题库管理 API：`GET /ops/evaluation/datasets`、`GET /ops/evaluation/datasets/{name}`、`PUT /ops/evaluation/datasets/{name}`；
  4. 实现异步任务注册调度器 `EvalTaskManager` 与对应接口：`POST /ops/evaluation/datasets/generate`、`POST /ops/evaluation/matrix-run`、`GET /ops/evaluation/tasks/{task_id}`。
- **验证记录：**
  - 实测新建项目 `test_auto_crud` 成功生成 CAS 软链；实测归档删除成功移入 `.trash/` 并排空租约；
  - 实测异步合成任务 `task_6a0a731992dc` 后台平稳运行并在完成后落盘 10KB 题库 `test_async_synth.json`。

### Task Completion Card: 评测工坊前端页面落地与全功能闭环 (Phase 2 & 3)
- **完成动作：**
  1. 创建现代化轻量级单页模板 `evaluation/eval_studio_template.py`，注册 `/eval-studio` 路由；
  2. 实现项目空间管理卡片面板、评测集工坊在线卡片式编辑、全生命周期增删改差量探测合成弹窗、多参数矩阵打擂控制台；
  3. 实现三端互联导航，一键联动 MLflow Compare Runs；
  4. 启动 `/browser-skill` (`bsk`) 在真实 Chromium 浏览器中自动化走查并截取 4 张关键证据图：
     - `eval_studio_project_management.png`: 项目工作区列表与状态大屏；
     - `eval_studio_create_project_modal.png`: 显式新建项目毛玻璃弹窗；
     - `eval_studio_testset_editor.png`: 评测集工坊血缘展示与卡片式在线编辑视图；
     - `eval_studio_synthesize_modal.png`: 勾选增量 CRUD 差量探测的题库合成弹窗；
     - `eval_studio_matrix_battle.png`: 多模式矩阵打擂参数配置与终端面板。
- **验证记录：**
  - `systemctl status rag-webui` 状态为 active (running)；
  - `git status --porcelain lightrag/` 完全为空，上游核心 0 侵入。

