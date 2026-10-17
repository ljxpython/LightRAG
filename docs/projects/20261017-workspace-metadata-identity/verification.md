# 验证记录

## Phase 验证（每个 Task 完成后）

### Task 1.1: 建立工作区元数据数据契约与读写协议
- **验证环境：** `sshmy2` (Ubuntu 24.04)
- **执行命令：** `uv run --with pytest --with pytest-asyncio pytest tests/test_workspace_meta.py -v`
- **实测结果：**
  ```text
  tests/test_workspace_meta.py::test_workspace_meta_default_fallbacks PASSED [ 50%]
  tests/test_workspace_meta.py::test_workspace_meta_atomic_save_and_load PASSED [100%]
  ============================== 2 passed in 0.73s ===============================
  ```
- **判定：** PASSED

### Task 1.2: 升级 WebUI 后端 `list_workspaces` 与 `/ops/workspaces/meta` 接口
- **验证环境：** `sshmy2` (Ubuntu 24.04)
- **执行命令：** `uv run --with pytest --with pytest-asyncio pytest tests/test_webui_multi_tenant_server.py -v`
- **实测结果：**
  ```text
  tests/test_webui_multi_tenant_server.py::test_ops_status_default PASSED  [ 16%]
  tests/test_webui_multi_tenant_server.py::test_ops_workspaces_list PASSED [ 33%]
  tests/test_webui_multi_tenant_server.py::test_dynamic_workspace_routing_by_header PASSED [ 50%]
  tests/test_webui_multi_tenant_server.py::test_workspace_select_sets_cookies PASSED [ 66%]
  tests/test_webui_multi_tenant_server.py::test_ops_snapshots_list PASSED  [ 83%]
  tests/test_webui_multi_tenant_server.py::test_ops_workspace_metadata PASSED [100%]
  ============================== 6 passed in 1.80s ===============================
  ```
- **判定：** PASSED

### Task 1.3: 升级 WebUI 前端 `ProjectSelector.tsx` 支持友好名称与内联编辑
- **验证环境：** `sshmy2` (Ubuntu 24.04)
- **编译命令：** `pnpm run build`
- **实测结果：**
  ```text
  ✓ built in 2.53s
  assets/index-ChxMTmsQ.js 934.63 kB
  ```
- **探活结果：** `systemctl restart rag-webui` ➔ `curl -sI http://127.0.0.1:9621/webui/` 返回 `HTTP/1.1 200 OK`
- **判定：** PASSED

### Task 1.4: FastMCP 入库与动态 URL 参数自愈补全
- **验证环境：** `sshmy2` (Ubuntu 24.04)
- **执行命令：** `uv run --with pytest --with pytest-asyncio pytest tests/test_fastmcp_gateway.py tests/test_mcp_expanded_suite.py -v`
- **实测结果：**
  ```text
  tests/test_fastmcp_gateway.py::test_fastmcp_gateway_contract_empty_query PASSED [ 12%]
  tests/test_fastmcp_gateway.py::test_workspace_manager_lifecycle PASSED   [ 25%]
  tests/test_mcp_expanded_suite.py::test_all_8_tools_registered PASSED     [ 37%]
  tests/test_mcp_expanded_suite.py::test_backward_compatible_query PASSED  [ 50%]
  tests/test_mcp_expanded_suite.py::test_subgraph_exploration_tool PASSED  [ 62%]
  tests/test_mcp_expanded_suite.py::test_project_stats_observability_tool PASSED [ 75%]
  tests/test_mcp_expanded_suite.py::test_list_and_status_tools PASSED      [ 87%]
  tests/test_mcp_expanded_suite.py::test_document_deletion_tool PASSED     [100%]
  ============================== 8 passed in 6.67s ===============================
  ```
- **判定：** PASSED

### Task 1.5: 存量历史项目一键对齐与回归实测
- **验证环境：** `sshmy2` (Ubuntu 24.04)
- **执行命令：** `uv run python scripts/migrate_workspace_meta.py && curl -s http://127.0.0.1:9621/ops/workspaces | jq .`
- **实测结果：**
  ```json
  {
    "total": 4,
    "workspaces": [
      { "tenant_id": "__default", "project_id": "eval_benchmark", "name": "评测基准 (eval_benchmark)" },
      { "tenant_id": "__default", "project_id": "5a5b7239-43e3-40e6-bba3-e64d96057607", "name": "DearFlow 主线业务项目" },
      { "tenant_id": "__default", "project_id": "11111111-1111-4111-8111-111111111111", "name": "平台默认项目" },
      { "tenant_id": "__default", "project_id": "17bc3aa1-5248-4237-874f-ffdcaa327ce5", "name": "业务验证项目 (17bc3aa1)" }
    ]
  }
  ```
- **判定：** PASSED

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `tests/test_workspace_meta.py` 2 passed in 0.73s
- [x] `tests/test_webui_multi_tenant_server.py` 6 passed in 1.80s

### Level 2: 平台 FastMCP 契约兼容性
- [x] `tests/test_fastmcp_gateway.py` 与 `tests/test_mcp_expanded_suite.py` 8 passed in 6.67s，平台端契约 100% 兼容。

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 `HTTP/1.1 200 OK`
- [x] FastMCP 网关探活：端口 8001 返回 MCP Session 响应
- [x] 下拉菜单元数据返回验证：`/ops/workspaces` 返回 4 个已完全对齐的业务项目名称

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-service` 状态为 active (running)
- [x] `systemctl status rag-webui` 状态为 active (running)
