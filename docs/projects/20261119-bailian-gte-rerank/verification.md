# 验证记录

## Phase 验证（每个 Task 完成后）

### Task 1 & Task 2 验证：工厂装配与工作区注入
- **命令：** `uv run --with pytest --with pytest-asyncio pytest tests/test_rerank_integration.py -k "test_create_lightrag_rerank_func or test_workspace_manager_rerank_injection" -v`
- **执行环境：** `sshmy2`
- **实测结果：**
  ```text
  tests/test_rerank_integration.py::test_create_lightrag_rerank_func_null PASSED
  tests/test_rerank_integration.py::test_create_lightrag_rerank_func_aliyun PASSED
  tests/test_rerank_integration.py::test_workspace_manager_rerank_injection PASSED
  3 passed in 0.85s
  ```

### Task 3 验证：阿里百炼 gte-rerank-v2 真实 API 排序探针
- **命令：** `uv run --with pytest --with pytest-asyncio pytest tests/test_rerank_integration.py -k test_bailian_gte_rerank_live_call -s`
- **执行环境：** `sshmy2`
- **实测结果：**
  ```text
  tests/test_rerank_integration.py::test_bailian_gte_rerank_live_call 
  [Live Rerank Result] [{'index': 0, 'relevance_score': 0.9512468061577956}, {'index': 2, 'relevance_score': 0.009353579921902722}]
  PASSED
  ```

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `uv run --with pytest --with pytest-asyncio pytest tests/test_rerank_integration.py -v`（4 passed in 1.00s）
- [x] `uv run --with pytest --with pytest-asyncio pytest tests/test_fastmcp_gateway.py tests/test_workspace_meta.py -v`（4 passed in 1.77s，0 破坏回归）

### Level 2: 平台 FastMCP 契约兼容性
- [x] FastMCP 8 大工具矩阵入参返回契约 100% 保持原有签名与字段定义

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 `HTTP/1.1 200 OK`
- [x] WebUI 启动日志确认：`INFO: Reranking is enabled: gte-rerank-v2 using aliyun provider`
- [x] FastMCP 网关探活：端口 8001 `uv run python verify_8_tools_live.py` 8 大工具矩阵全绿通过

### Level 4: 守护与进程稳定性
- [x] `systemctl is-active rag-service` 返回 `active`
- [x] `systemctl is-active rag-webui` 返回 `active`
- [x] `git status --porcelain lightrag/` 恒为空（坚守 0 侵入）
