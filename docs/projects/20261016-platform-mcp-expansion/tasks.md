# 任务列表 (已全部完成)

## 进度追踪

| Task | 状态 | 负责环境 | 核心产出 |
|---|---|---|---|
| **Phase 1: 核心检索工具能力扩展与向后兼容** | | | |
| Task 1.1: `mcp_query_project_knowledge` 支持 `mode` 与 `history_messages` | [x] 已完成 | sshmy2 | `gateway_mcp_server.py` (向后兼容+模式支持) |
| Task 1.2: `mcp_query_project_knowledge` 支持 `document_ids` 定向范围过滤 | [x] 已完成 | sshmy2 | 检索过滤逻辑与兼容性测试通过 |
| **Phase 2: 知识图谱深度推理与实体网络探查接口** | | | |
| Task 2.1: 实体局部子图抽取算法实现（NetworkX 邻居遍历与深度控制） | [x] 已完成 | sshmy2 | `graph_explorer.py` (BFS子图与模糊匹配) |
| Task 2.2: 网关挂载 `mcp_query_knowledge_graph` 工具与契约验证 | [x] 已完成 | sshmy2 | `mcp_query_knowledge_graph` 跑通实测 |
| **Phase 3: 文档全生命周期管理之删除下架与 CAS 重新发布** | | | |
| Task 3.1: 文档删除下架与 Candidate 沙箱重构激活流水线 | [x] 已完成 | sshmy2 | `ingest_service.py` 扩展 (adelete+CAS) |
| Task 3.2: 网关挂载 `mcp_delete_project_knowledge_document` 工具与状态同步 | [x] 已完成 | sshmy2 | `mcp_delete` 工具与单测全过 |
| **Phase 4: 知识库可观测性、统计监控与生产联调验证** | | | |
| Task 4.1: 网关挂载 `mcp_get_project_knowledge_stats` 统计接口 | [x] 已完成 | sshmy2 | `mcp_get_stats` 工具实测返回 7 实体 5 关系 |
| Task 4.2: 全量 8 大 MCP 工具 4 级生产流水线验证与 systemd 热重载 | [x] 已完成 | sshmy2 | 20 项单测全绿，Live Client 8 工具联调全过 |

---

## 任务详情

### Phase 1: 核心检索工具能力扩展与向后兼容
- **Task 1.1 & 1.2 落地证据：**
  - 在 `gateway_mcp_server.py` 中扩展 `mcp_query_project_knowledge` 签名，添加带默认值的可选参数：`mode: str = "hybrid"`, `document_ids: Optional[List[str]] = None`, `history_messages: Optional[List[Dict[str, str]]] = None`。
  - 保留原有 `query`, `top_k`, `sources_version` 位置与语义，100% 满足平台 `_ResultV2` 规范。
  - 自动化测试 `test_backward_compatible_query` 与端到端脚本 `verify_8_tools_live.py` 验证默认调用与过滤调用均正常返回。

### Phase 2: 知识图谱深度推理与实体网络探查接口
- **Task 2.1 & 2.2 落地证据：**
  - 实现 `graph_explorer.py`，支持基于 NetworkX 的快速局部子图抽取（限制深度 1~3，最多 30 个节点，防止图谱爆炸）。
  - 支持精确与模糊大小写实体匹配，返回节点列表与边列表（含权重与实体描述）。
  - 在 `gateway_mcp_server.py` 挂载 `mcp_query_knowledge_graph` 工具。
  - 端到端测试检索 `'接口文档.pdf'`，秒级命中 3 节点 2 条边。

### Phase 3: 文档全生命周期管理之删除下架与 CAS 重新发布
- **Task 3.1 & 3.2 落地证据：**
  - 在 `ingest_service.py` 实现 `delete_document` 异步方法：从 `managed_assets` 移除物理原件，在候选沙箱调用 `candidate_rag.adelete_by_doc_id` 修剪图谱与向量索引，通过 POSIX CAS 原子激活，并在 SQLite 中更新状态为 `deleted`。
  - 单测 `test_document_deletion_tool` 验证删除后顺利提升为 `rev_2` 且物理文件被正确清理。
  - 在 `gateway_mcp_server.py` 成功挂载 `mcp_delete_project_knowledge_document`。

### Phase 4: 知识库可观测性、统计监控与生产联调验证
- **Task 4.1 & 4.2 落地证据：**
  - 在 `gateway_mcp_server.py` 挂载 `mcp_get_project_knowledge_stats`，实时采集文档数、实体数、关系数、文本切片数、磁盘存储字节数与 `snapshot.json` 签名校验状态。
  - 修正 `snapshot_manager.py` 排除易变 LLM 运行时缓存 `kv_store_llm_response_cache.json`，确保生产快照校验绝对稳定（`Verified: (True, [])`）。
  - 执行 `sudo systemctl restart rag-service`，热加载 8 大工具。
  - 全量回归测试 20 项用例全部通过（`20 passed in 8.72s`）。
  - 运行 `verify_8_tools_live.py` 真实调用 8001 端口 FastMCP Streamable HTTP 服务，全流程通过。
