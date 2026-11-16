# 任务列表 (Task Breakdown)

## 进度追踪

| Task | 状态 | 核心模块 | 负责环境 |
|---|---|---|---|
| Task 1.1: 修复 MLflow Compare-Runs 路由参数与直达 URL 规范 | [x] 已完成 | `run_lightrag_webui_server.py` & `deepeval_runner.py` | sshmy2 |
| Task 2.1: 后端新增评测集前置就绪度与原材料重合度探测接口 | [x] 已完成 | `run_lightrag_webui_server.py` | sshmy2 |
| Task 2.2: 前端评测工坊三色就绪度卡片与打擂条件前置拦截 | [x] 已完成 | `EvaluationStudio.tsx` | sshmy2 / Local |
| Task 3.1: 后端新增题库安全删除与回收站归档端点 | [x] 已完成 | `run_lightrag_webui_server.py` | sshmy2 |
| Task 3.2: 题库合成模态框支持原地覆盖升级与版本迭代选项 | [x] 已完成 | `EvaluationStudio.tsx` & `dataset_generator.py` | sshmy2 / Local |
| Task 3.3: 评测集工具栏支持一键删除过期题库与 UI 即时刷新 | [x] 已完成 | `EvaluationStudio.tsx` | sshmy2 / Local |
| Task 3.4: 落地轻量级 catalog.sqlite 元数据关系目录管理器 | [x] 已完成 | `catalog_manager.py` & `run_lightrag_webui_server.py` | sshmy2 |
| Task 4.1: 前端静态资产编译构建与生产部署 | [x] 已完成 | `lightrag_webui` & 生产静态目录 | sshmy2 |
| Task 5.1: 4 级生产流水线全量验收与闭环验证 | [x] 已完成 | 全系统 | sshmy2 |

---

## Task Completion Cards

### [Task Completion Card: Task 1.1]
- **修改文件**：`run_lightrag_webui_server.py`, `evaluation/deepeval_runner.py`
- **交付目标**：修正 MLflow Compare Runs 直达 URL，移除导致路由丢失的 `/#/`，规范使用标准查询参数；
- **验证结果**：现场打擂生成的 URL 精准直达并排比对视图。

### [Task Completion Card: Task 2.1 & 2.2]
- **修改文件**：`run_lightrag_webui_server.py`, `EvaluationStudio.tsx`
- **交付目标**：实现前置就绪度探针与前端三色契约卡片，对材料缺失题库实施打擂拦截与切换基准库提示；
- **验证结果**：实测空库/不匹配库亮红灯并拦截，就绪库亮绿灯，截图已留痕。

### [Task Completion Card: Task 3.1, 3.2, 3.3 & 3.4]
- **修改文件**：`catalog_manager.py`, `run_lightrag_webui_server.py`, `EvaluationStudio.tsx`
- **交付目标**：支持题库移入回收站软删除，自动合成支持原地覆盖升级防膨胀，落地 SQLite (WAL 模式) 元数据关系库；
- **验证结果**：`catalog.sqlite` 自愈建表收纳 3 个项目与 8 个题库，删除受保护基准受阻，普通题库可正常移入 `.trash`。

### [Task Completion Card: Task 4.1 & 5.1]
- **修改文件**：`lightrag_webui` 编译产物, `verification.md`
- **交付目标**：WebUI 生产构建完成，上游核心库 0 侵入，跑通 4 级流水线（11 个回归单测全绿，8 大 MCP 工具全通，浏览器全链路实操通过）；
- **验证结果**：服务平稳运行，各项功能经浏览器操作实证有效。
