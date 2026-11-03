# 验证记录

## Phase 验证（每个 Task 完成后实测记录）

<!-- 遵循 Remote-First 原则，在 sshmy2 宿主机上执行并在此追加真实终端输出 -->

### Task 1.1: 恢复上游源码纯净度与运行时动态补丁
- **执行时间：** 2026-11-03 15:32:00
- **测试环境：** sshmy2 (Ubuntu 24.04)
- **验证项 1（Git 纯净度检查）：**
  - 命令：`git status --porcelain lightrag/`
  - 实际结果：输出完全为空，0 侵入完成。
- **验证项 2（动态命名空间隔离）：**
  - 命令：`tests/test_clean_architecture_patches.py::test_dynamic_namespace_isolation`
  - 实际结果：PASSED (100%)，不同 `working_dir` 自动携带隔离 MD5 前缀。

---

### Task 1.2: GraphExplorer 内存图单例缓存
- **执行时间：** 2026-11-03 15:33:29
- **测试环境：** sshmy2 (Ubuntu 24.04)
- **验证项 1（连续查询耗时对比）：**
  - 命令：`tests/test_clean_architecture_patches.py::test_graph_explorer_mtime_cache`
  - 实际结果：PASSED，10 次内存微秒级连续子图遍历总耗时 0.07s，无重复 XML 反序列化开销。

---

### Task 1.3: 候选沙箱硬链接构建优化
- **执行时间：** 2026-11-03 15:35:24
- **测试环境：** sshmy2 (Ubuntu 24.04)
- **验证项 1（硬链接与写时分离）：**
  - 命令：`tests/test_clean_architecture_patches.py::test_fast_candidate_link_inode_and_break_link`
  - 实际结果：PASSED，验证 inode 共享成立，且在 LightRAG 底层 `atomic_write` 触发替换时自动切断链接，源版本数据安全隔离。

---

### Task 1.4: 多租户实例 LRU 淘汰与优雅释放
- **执行时间：** 2026-11-03 15:37:43
- **测试环境：** sshmy2 (Ubuntu 24.04)
- **验证项 1（容量阈值与在读租约平滑排空）：**
  - 命令：`tests/test_clean_architecture_patches.py::test_workspace_manager_lru_and_addon_params`
  - 实际结果：PASSED，实例超过上限时将旧实例移入 `lease_mgr._draining_instances`，在读租约释放后平滑排空断开句柄，零在读报错。

---

### Task 1.5: 实体抽取锁定简体中文
- **执行时间：** 2026-11-03 15:37:43
- **测试环境：** sshmy2 (Ubuntu 24.04)
- **验证项 1（中文抽取一致性）：**
  - 命令：`tests/test_clean_architecture_patches.py::test_workspace_manager_lru_and_addon_params`
  - 实际结果：PASSED，初始化 LightRAG 默认注入 `addon_params={"language": "简体中文"}`。

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `uv run --with pytest --with pytest-asyncio pytest tests/ -v` 全部通过 (33 passed in 7.92s)

### Level 2: 平台 FastMCP 契约兼容性
- [x] 上层 `ai-agent-platform` 消费 8 大工具矩阵 0 异常，Pydantic 校验 0 报错 (verify_8_tools_live 全绿)

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 `HTTP/1.1 200 OK`
- [x] FastMCP 网关探活：端口 8001 正常响应探针与 MCP 初始化

### Level 4: 守护与进程稳定性
- [x] `sudo systemctl restart rag-service && uv run python verify_8_tools_live.py` 8 工具全部成功存活
- [x] `systemctl status rag-service` 状态为 `active (running)`，内存稳定在 162.4MB
