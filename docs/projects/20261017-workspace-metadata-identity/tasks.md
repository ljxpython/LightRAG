# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 建立工作区元数据数据契约与读写协议 | [x] 已完成 | sshmy2 |
| Task 1.2: 升级 WebUI 后端 `list_workspaces` 与 `/ops/workspaces/meta` 接口 | [x] 已完成 | sshmy2 |
| Task 1.3: 升级 WebUI 前端 `ProjectSelector.tsx` 支持友好名称与内联编辑 | [x] 已完成 | sshmy2 |
| Task 1.4: FastMCP 入库与动态 URL 参数自愈补全 | [x] 已完成 | sshmy2 |
| Task 1.5: 存量历史项目（5a5b7239... / 17bc3aa1...）一键对齐与回归实测 | [x] 已完成 | sshmy2 |

## 任务详情

### Task 1.1: 建立工作区元数据数据契约与读写协议
- **改动内容：** 在 `workspace_manager.py` 中新增 `get_project_meta_path` / `get_project_meta` / `save_project_meta` 方法，物理映射至 `sandbox_storage/<tenant_id>/<project_id>/meta.json`，采用 POSIX tempfile 原子替换。
- **代码位置：** `workspace_manager.py` → `TenantWorkspaceManager`
- **预期结果：** 规范化读写项目名称、代号、描述与更新时间，若文件不存在则安全返回兜底对象。
- **验证项：** `pytest tests/test_workspace_meta.py -v`
- **状态：** `[x]` 已完成

### Task 1.2: 升级 WebUI 后端 `list_workspaces` 与 `/ops/workspaces/meta` 接口
- **改动内容：** 在 `run_lightrag_webui_server.py` 中将 `list_workspaces()` 响应扩充 `name`、`code`、`description` 字段；新增 `GET /ops/workspaces/{tenant_id}/{project_id}/meta` 与 `PUT /ops/workspaces/{tenant_id}/{project_id}/meta` 供运维和前端查询与在线修改。
- **代码位置：** `run_lightrag_webui_server.py` → `list_workspaces`, `get_workspace_meta`, `update_workspace_meta`
- **预期结果：** `/ops/workspaces` 返回完整元数据，前端能准确获取各项目的中文/业务别名。
- **验证项：** `pytest tests/test_webui_multi_tenant_server.py -v`
- **状态：** `[x]` 已完成

### Task 1.3: 升级 WebUI 前端 `ProjectSelector.tsx` 支持友好名称与内联编辑
- **改动内容：** 优化下拉菜单列表项，将 raw UUID 渲染升级为 `项目名称 (shortId)`；添加改名气泡与内联编辑功能，支持即时 PUT 保存至后端 `/ops/workspaces/{tenant}/{project}/meta`。
- **代码位置：** `lightrag_webui/src/components/ProjectSelector.tsx`
- **预期结果：** 告别 raw UUID 裸奔，优雅展示层级与当前激活版本。
- **验证项：** Vite 前端编译通过，`rag-webui` 探活返回 HTTP 200。
- **状态：** `[x]` 已完成

### Task 1.4: FastMCP 入库与动态 URL 参数自愈补全
- **改动内容：** WebUI `TenantResolutionMiddleware` 支持从 URL `?project_name=xxx` 自动识别并保存；FastMCP 网关在 `mcp_submit_project_knowledge_document`、`_resolve_scope_from_request` 与 `mcp_get_project_knowledge_stats` 中完成元数据自愈沉淀与透出。
- **代码位置：** `run_lightrag_webui_server.py` & `gateway_mcp_server.py`
- **预期结果：** 上层平台未来任何一次带名跳转或调用均能实现物理底座“零操作自愈持久化”。
- **验证项：** `pytest tests/test_fastmcp_gateway.py tests/test_mcp_expanded_suite.py -v` 全部通过。
- **状态：** `[x]` 已完成

### Task 1.5: 存量历史项目一键对齐与回归实测
- **改动内容：** 扫描现有 `sandbox_storage/__default/` 下的历史项目，对照平台真实项目信息生成 `meta.json`。
- **代码位置：** `scripts/migrate_workspace_meta.py`
- **预期结果：** 现存所有 4 个知识库项目在 WebUI 下拉框中全部对齐展示清晰的业务中文名称。
- **验证项：** `curl -s http://127.0.0.1:9621/ops/workspaces | jq .` 实测 4 个项目名称完全对齐。
- **状态：** `[x]` 已完成
