# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1: 客户端层新增 `create_lightrag_rerank_func()` | [x] 已完成 | sshmy2 |
| Task 2: 工作区管理器 `workspace_manager.py` 注入重排函数 | [x] 已完成 | sshmy2 |
| Task 3: 宿主机 `.env` 配置与真实单测套件验证 | [x] 已完成 | sshmy2 |
| Task 4: 生产守护进程重启与双轨 Live 探针验收 | [x] 已完成 | sshmy2 |

## 任务详情

### Task 1: 客户端层新增 `create_lightrag_rerank_func()`
- **改动内容：** 在 `llm_client.py` 中增加工厂函数 `create_lightrag_rerank_func()`，根据环境变量 `RERANK_BINDING`（如 `aliyun`）动态装配异步 rerank 适配器，适配 `gte-rerank-v2`，支持重试、超时与鉴权回退。
- **代码位置：** `llm_client.py` → `create_lightrag_rerank_func()`
- **预期结果：** 当环境变量配置正确时返回可调用的异步 rerank 函数，未配置时安全返回 `None`。
- **验证项：** `uv run pytest tests/test_rerank_integration.py -k test_create_lightrag_rerank_func -v`
- **状态：** `[x]` 已完成

### Task 2: 工作区管理器 `workspace_manager.py` 注入重排函数
- **改动内容：** 在 `workspace_manager.py` 的 `TenantWorkspaceManager.get_rag_engine()` 方法中，将 `rerank_model_func=create_lightrag_rerank_func()` 传入 `LightRAG` 构造器。
- **代码位置：** `workspace_manager.py` → `TenantWorkspaceManager.get_rag_engine()`
- **预期结果：** 多租户工作区实例创建的每一个 `LightRAG` 引擎实例均挂载重排函数。
- **验证项：** `uv run pytest tests/test_rerank_integration.py -k test_workspace_manager_rerank_injection -v`
- **状态：** `[x]` 已完成

### Task 3: 宿主机 `.env` 配置与真实单测套件验证
- **改动内容：** 在 `sshmy2` 的 `/home/ubuntu/lightrag-v2-exploration/LightRAG/.env` 写入百炼 `gte-rerank-v2` 的配置项，并编写 `tests/test_rerank_integration.py` 覆盖真实百炼 API 调用、top_n 裁剪和异常处理。
- **代码位置：** `.env` + `tests/test_rerank_integration.py`
- **预期结果：** 所有单测在 `sshmy2` 宿主机上 100% 通过，真实返回阿里云百炼打分与排序结果。
- **验证项：** `uv run --with pytest --with pytest-asyncio pytest tests/test_rerank_integration.py -v`
- **状态：** `[x]` 已完成

### Task 4: 生产守护进程重启与双轨 Live 探针验收
- **改动内容：** 重启 `rag-service` (端口 8001) 与 `rag-webui` (端口 9621)，执行 8 大工具矩阵与 WebUI 的真实探活测试。
- **代码位置：** systemd 守护 + `verify_8_tools_live.py`
- **预期结果：** 双轨服务均为 active (running)，8 大工具探针 100% 成功，WebUI 正常响应。
- **验证项：** `sudo systemctl restart rag-service rag-webui && uv run python verify_8_tools_live.py`
- **状态：** `[x]` 已完成
