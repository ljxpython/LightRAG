# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 | 核心产出 |
|---|---|---|---|
| Task 1.1: 恢复上游源码纯净度，将多租户命名空间隔离改造成外挂运行时动态补丁 | [x] 已完成 | sshmy2 | `workspace_manager.py` / `lightrag/` 纯净度恢复 |
| Task 1.2: `GraphExplorer` 增加基于文件 mtime 的内存图单例缓存 | [x] 已完成 | sshmy2 | `graph_explorer.py` |
| Task 1.3: 候选沙箱构建引入操作系统级硬链接 (`os.link`) 优化 | [x] 已完成 | sshmy2 | `ingest_service.py` |
| Task 1.4: `TenantWorkspaceManager` 增加多租户实例 LRU 淘汰与优雅释放 | [x] 已完成 | sshmy2 | `workspace_manager.py` |
| Task 1.5: LightRAG 实体抽取默认锁死简体中文 (`addon_params`) | [x] 已完成 | sshmy2 | `workspace_manager.py` / `ingest_service.py` |
| Task 1.6: 生产环境现场全量回归与 4 级生产流水线签署 | [x] 已完成 | sshmy2 | `verification.md` / `verify_8_tools_live.py` |

---

## 任务详情

### Task 1.1: 恢复上游源码纯净度，将多租户命名空间隔离改造成外挂运行时动态补丁
- **改动内容：**
  1. 在 `workspace_manager.py` 中实现 `apply_workspace_namespace_patch()` 函数，通过动态 Monkey-Patching 拦截 `JsonKVStorage.__post_init__` 和 `JsonDocStatusStorage.__post_init__`，按 `working_dir` 计算 12 位 MD5 前缀并动态注入 `namespace`，内置 `_is_workspace_patched` 保证幂等；
  2. 在 `run_lightrag_webui_server.py`、`gateway_mcp_server.py` 以及单测初始化处（`tests/conftest.py`）调用该补丁函数；
  3. 执行 `git checkout -- lightrag/kg/json_doc_status_impl.py lightrag/kg/json_kv_impl.py`，彻底撤销对港大官方核心源码的修改。
- **代码位置：**
  - `workspace_manager.py`
  - `gateway_mcp_server.py`
  - `run_lightrag_webui_server.py`
  - `tests/conftest.py`
  - `lightrag/kg/json_doc_status_impl.py` (回退恢复)
  - `lightrag/kg/json_kv_impl.py` (回退恢复)
- **预期结果：** `git status --porcelain lightrag/` 输出完全为空；多租户运行时不同 working_dir 依然自动获得带哈希隔离的 namespace，杜绝跨租户串台。
- **验证项：** 运行单元测试并执行 `git status lightrag/` 验证纯净度。
- **状态：** `[ ]` 待开始

---

### Task 1.2: `GraphExplorer` 增加基于文件 mtime 的内存图单例缓存
- **改动内容：**
  1. 在 `GraphExplorer` 中引入 `_graph_cache: Dict[str, Tuple[float, nx.Graph]]`；
  2. 实现内部私有方法 `_get_cached_graph(graph_path: Path) -> nx.Graph`：
     - 读取目标文件的 `st_mtime`；
     - 若缓存命中且修改时间戳一致，直接返回已持有的 `nx.Graph` 内存对象；
     - 若缓存未命中或文件已更新（触发了版本发布），重新执行 `nx.read_graphml(graph_path)` 并刷新缓存；
  3. 重构 `query_subgraph`，将其中的直接 `nx.read_graphml` 替换为 `_get_cached_graph`。
- **代码位置：**
  - `graph_explorer.py` → `GraphExplorer.query_subgraph`
- **预期结果：** 同一版本下多次调用 `mcp_query_knowledge_graph` 工具时，图谱反序列化耗时从几秒降为纳秒级，内存零抖动。
- **验证项：** 编写微基准测试连续调用 10 次子图查询，验证耗时出现数量级下降。
- **状态：** `[ ]` 待开始

---

### Task 1.3: 候选沙箱构建引入操作系统级硬链接 (`os.link`) 优化
- **改动内容：**
  1. 在 `ingest_service.py` 中编写 `fast_candidate_link(source_dir: Path, target_dir: Path) -> None` 辅助函数；
  2. 遍历源版本目录中的所有非临时文件，优先调用 `os.link(str(src), str(dst))` 建立硬链接；
  3. 捕获 `OSError`（如跨文件系统、无权限等边缘场景），平滑降级为 `shutil.copy2`；
  4. 替换 `_process_document_job` 和 `delete_document` 中原有的直接 `shutil.copy2` 循环。
- **代码位置：**
  - `ingest_service.py` → `_process_document_job`, `delete_document`
- **预期结果：** 候选沙箱初始化耗时从几秒降为毫秒级（0 秒体验），磁盘写入量减少 99% 以上。依托底层 `atomic_write` 实现写入时自动解绑，源文件无损。
- **验证项：** 在测试目录下对百兆文件进行构建验证，检查 inode 共享状态及 LightRAG 写入时硬链接自动安全解绑（Break Link）机制。
- **状态：** `[ ]` 待开始

---

### Task 1.4: `TenantWorkspaceManager` 增加多租户实例 LRU 淘汰与优雅释放
- **改动内容：**
  1. 将 `TenantWorkspaceManager._rag_instances` 类型升级为 `collections.OrderedDict[str, LightRAG]`；
  2. 在 `__init__` 中增加 `max_cached_instances: int = 8` 可配参数（支持环境变量 `MAX_ACTIVE_RAG_INSTANCES` 注入）；
  3. 在 `get_rag_engine` 路径中：
     - 命中缓存时调用 `self._rag_instances.move_to_end(key)`；
     - 当缓存实例数达到上限时，循环调用 `popitem(last=False)` 淘汰最久未访问实例；
     - 为防止在读请求被暴力中断，淘汰实例交由 `self.lease_mgr.mark_retired(old_tenant, old_project, old_ver, old_rag, cleanup_callback=lambda rag: rag.finalize_storages())`，在在读租约清零后平滑排空断开；
  4. 保证在 CAS 版本发布（`atomic_publish_candidate`）时同步清理对应的失效缓存。
- **代码位置：**
  - `workspace_manager.py` → `TenantWorkspaceManager`
- **预期结果：** 常驻内存的 LightRAG 实例被严格约束在上限内，冷租户自动卸载，读并发平滑优雅排空，彻底杜绝单机内存无界泄露。
- **验证项：** 模拟并发访问 20 个虚拟租户，检查进程内存曲线和活跃实例数是否稳定封顶在设定阈值，且淘汰过程无在读报错。
- **状态：** `[ ]` 待开始

---

### Task 1.5: LightRAG 实体抽取默认锁死简体中文 (`addon_params`)
- **改动内容：**
  1. 在 `workspace_manager.py` 构建 `LightRAG` 实例的传参中，追加 `addon_params={"language": "简体中文"}`；
  2. 在 `llm_client.py` 或备用初始化路径中保持一致配置；
  3. 确保对外暴露的 Prompt 构造不被外部恶意注入覆盖。
- **代码位置：**
  - `workspace_manager.py` → `get_rag_engine`
  - `ingest_service.py` → `_process_document_job`
- **预期结果：** 中文知识库在实体与关系抽取阶段，强制输出简体中文实体名与关系描述，杜绝中英文混杂割裂。
- **验证项：** 写入一篇包含英文术语的中文测试文档，核实抽取的图谱节点与边全量对齐简体中文规范。
- **状态：** `[ ]` 待开始

---

### Task 1.6: 生产环境现场全量回归与 4 级生产流水线签署
- **改动内容：**
  1. 在 `sshmy2`（Ubuntu 24.04）上运行全量自动化测试套件；
  2. 运行 `verify_8_tools_live.py` 进行生产网关 8 大工具矩阵存活探测；
  3. 重启 `rag-service` 和 `rag-webui` 守护进程，检查日志 0 异常并完成 `verification.md` 签署。
- **代码位置：**
  - `tests/`
  - `verify_8_tools_live.py`
- **预期结果：** 全量测试绿灯通过，生产环境服务运行平稳，性能指标大幅改善。
- **验证项：** 4 级验证签署（Level 1~4）。
- **状态：** `[ ]` 待开始
