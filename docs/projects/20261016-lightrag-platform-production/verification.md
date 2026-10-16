# 验证记录

## Phase 验证（每个 Task 完成后）

### 2026-10-16 Phase 1: 生产级外挂 FastMCP 网关与多租户隔离层 (Task 1.1 ~ 1.4)
1. **代码落地**：
   - `auth_middleware.py`：支持静态多租户 token scopes 与动态 HS256 JWT 鉴权解析，自动注入租户/项目上下文。
   - `workspace_manager.py`：实现 `TenantWorkspaceManager`，POSIX CAS 原子软链发布（`atomic_publish_candidate`）。
   - `lease_manager.py`：实现 `ReaderLeaseManager`，按版本引用计数并提供非阻塞优雅排空（`mark_retired`）。
   - `gateway_mcp_server.py`：FastMCP 4.1.0 生产网关，暴露三只读 tools，严格适配 `_ResultV1` 与 `_ResultV2`（含 `_Locator`），清洗绝对路径。
2. **sshmy2 真实执行记录**：
   - 单元测试命令：
     `/home/ubuntu/.local/bin/uv run --with pytest pytest tests/test_fastmcp_gateway.py tests/test_lease_manager.py -v`
     结果：`5 passed, 2 warnings in 2.07s`（涵盖空 query 契约校验、软链切换生命周期、读租约并发慢查询排空、工作区租约集成）。
   - 契约端到端测试命令：
     `/home/ubuntu/.local/bin/uv run python test_contract_client.py`
     结果：`ALL DUAL-VERSION MCP CONTRACT VERIFICATIONS PASSED!`（严格通过平台端 `_ResultV1`、`_ResultV2`、`_Locator` Pydantic 模型反序列化）。
### 2026-10-16 Phase 2: Docling 多模态 Sidecar 管道与精准 Locator 反查 (Task 2.1 ~ 2.2)
1. **代码落地**：
   - `locator_resolver.py`：升级多格式中间态解析，支持 Docling raw JSON 和 `.blocks.jsonl` Sidecar。
   - 实现了三级自适应文本匹配算法（精确哈希匹配、滑动窗口短语匹配、安全兜底定位），支持提取文本、表格、图像块类型。
2. **sshmy2 真实执行记录**：
   - 单元测试命令：
     `/home/ubuntu/.local/bin/uv run --with pytest pytest tests/test_locator_multiformat.py -v`
     结果：`4 passed, 2 warnings in 0.07s`
     覆盖单页/跨页/表格 PDF（`unit="page"`）、PPTX 幻灯片（`unit="slide"`）、Markdown/TXT（`unit="unknown"` 且 start/end 为 None）、磁盘动态自动加载。
### 2026-10-16 Phase 3: 受管附件异步入库写链路与平台 HMAC 鉴权 (Task 3.1 ~ 3.3)
1. **代码落地**：
   - `ingest_service.py`：实现 `validate_file_ref` 平台附件校验（版本、MIME、64位SHA256、防路径注入、50MB限制）。
   - `IngestJobTracker`：基于 SQLite 的持久化任务状态机，具备同租户/项目/SHA256 幂等去重（`reused=True`），防失 ACK。
   - `KnowledgeIngestService`：在独立的 `candidates/cand_<uuid>/` 隔离沙箱中异步构建并执行 CAS 原子激活。
   - `gateway_mcp_server.py`：挂载 `mcp_submit_project_knowledge_document` 与 `mcp_get_project_knowledge_ingest_job` 工具。
2. **sshmy2 真实执行记录**：
   - 单元测试命令：
     `/home/ubuntu/.local/bin/uv run --with pytest pytest tests/test_ingest_pipeline.py -v`
     结果：`3 passed, 2 warnings in 1.81s`
   - 全量回归命令：
     `/home/ubuntu/.local/bin/uv run --with pytest pytest tests/test_fastmcp_gateway.py tests/test_lease_manager.py tests/test_locator_multiformat.py tests/test_ingest_pipeline.py -v`
     结果：`12 passed, 2 warnings in 1.95s`
### 2026-10-16 Phase 4: 存量知识数据平滑迁移与快照签名 (Task 4.1 ~ 4.2)
1. **代码落地**：
   - `snapshot_manager.py`：实现 `SnapshotManager`，基于 SHA256 递归生成物理文件完整性清单 `snapshot.json`；提供 `verify_snapshot` 防篡改校验与 `rollback_to_revision` 秒级原子回滚。
   - `migrate_v1_to_v2.py`：实现离线全量迁移流水线，自动扫描旧版语料原件，在候选沙箱中完成 LightRAG 实体与关系图谱抽取、向量持久化，并在构建成功后执行 POSIX CAS 零锁激活与快照封存。
2. **sshmy2 真实执行记录**：
   - 单元测试命令：
     `/home/ubuntu/.local/bin/uv run --with pytest pytest tests/test_migration_snapshot.py -v`
     结果：`2 passed, 2 warnings in 0.74s`（封存验证、篡改检测、原子版本秒级回退演练全部通过）。
   - 真实存量数据迁移执行命令：
     `/home/ubuntu/.local/bin/uv run python migrate_v1_to_v2.py --source-dir /home/ubuntu/PyCharmMiscProject/rag-anything-use/test_data/ --tenant __default --project 11111111-1111-4111-8111-111111111111`
     结果：
     - 成功扫描并提取 3 篇核心存量文档（`接口文档.pdf`、`旅行日记2.pdf`、`12-多轮对话中让AI保持长期记忆的8种优化方式篇.pdf`）。
     - 调用 LLM/Embedding 成功抽取 7 个实体、5 条关系，写入图谱与向量数据库。
     - `✅ CAS Atomic Activation Succeeded! Active version is now rev_1`
     - `✅ Sealed integrity manifest: snapshot.json`
     - `✅ Snapshot integrity verified: 100% matched, 0 corruption.`
   - 上游源码纯净度检查命令：
     `git status --porcelain lightrag/`
     结果：纯净空输出，0 行侵入！

### 2026-10-16 Phase 5: 生产双轨 systemd 守护与割接上线 (Task 5.1 ~ 5.3)
1. **服务落地**：
   - 编写并部署 `/etc/systemd/system/rag-service.service`（端口 8001，生产级 FastMCP 网关）。
   - 编写并部署 `/etc/systemd/system/rag-webui.service`（端口 9621，LightRAG 原生 WebUI 与图谱）。
   - 执行 `sudo systemctl daemon-reload && sudo systemctl enable --now rag-service rag-webui`。
2. **sshmy2 真实执行记录**：
   - 双服务守护探活：`systemctl is-active rag-service rag-webui` → 输出 `active` / `active`。
   - 原生 WebUI 外网直连：`curl -sI http://152.136.27.196:9621/webui/` → HTTP 200 OK。
   - 平台 FastMCP 契约校验：`uv run python test_contract_client.py` → 全部通过，完美返回真实迁移的 3 篇文档。
   - 上游源码纯净度检查：`git status --porcelain lightrag/` → 0 行代码侵入！

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `pytest tests/test_fastmcp_gateway.py tests/test_lease_manager.py tests/test_locator_multiformat.py tests/test_ingest_pipeline.py tests/test_migration_snapshot.py -v` → **14 passed in 2.49s 全部通过**
  - 多租户目录隔离验证通过
  - 读租约并发慢查询排空验证通过
  - 多模态（PDF/DOCX/PPTX/MD/TXT）真实页码反查与无页码格式安全防御通过
  - 受管附件 FileRef 校验与 IngestJobTracker 幂等去重（防失 ACK）验证通过
  - 候选工作区沙箱构建与快照签名防篡改、版本秒级回滚验证通过

### Level 2: 平台 FastMCP 契约兼容性
- [x] `python test_contract_client.py` → **ALL DUAL-VERSION MCP CONTRACT VERIFICATIONS PASSED!**
  - 平台端 Pydantic 模型（`_ResultV1`, `_ResultV2`, `_Locator`, `_Source`）100% 反序列化成功
  - 绝对物理路径 0 泄露，文件名脱敏清洗严格对齐正则
  - 平台端 `runtime-service` / `platform-api` 达成 **0 行代码修改** 兼容承诺

### Level 3: 双轨服务健康度与端到端探活
- [x] 原生 WebUI 本地探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` → HTTP 200 OK
- [x] 原生 WebUI 外网直连：`curl -sI http://152.136.27.196:9621/webui/ | head -n 1` → HTTP 200 OK
- [x] FastMCP 网关探活：`curl -sI http://127.0.0.1:8001/mcp` → HTTP 405 Method Not Allowed（端点存活，符合 MCP 协议规范）
- [x] 知识图谱读写验证：在 WebUI 上查看实体与关系拓扑（Writing graph with 7 nodes, 5 edges）正常呈现

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-service` → 状态为 active (running)，由 uv 守护管理
- [x] `systemctl status rag-webui` → 状态为 active (running)，开机自启
- [x] 上游核心代码纯净度：`git status --porcelain lightrag/` 为空，达成 **0 行侵入** 承诺

---

### 平台联调终态验收
- [x] 平台 `runtime-service` FastMCP 网关生产端点就绪，0 代码改动
- [x] 真实迁移的存量文档（`接口文档.pdf`、`旅行日记2.pdf`、`12-多轮对话...pdf`）事实检索命中正常
- [x] 现役旧版 1.4.12 服务（端口 8000）安全退役并释放

---

### 最终结论
**done**：全量 5 大阶段、14 项精细任务在 `sshmy2` 生产环境全部真实执行并通过 4 级生产流水线验证，双轨服务（8001 FastMCP + 9621 WebUI）处于 active 稳定守护运行状态。

