# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 | 核心产出 |
|---|---|---|---|
| **Phase 1: 生产级外挂 FastMCP 网关与多租户隔离层** | | | |
| Task 1.1: 平台 Bearer Token 鉴权中间件与请求上下文注入 | [x] 已完成 | sshmy2 | `auth_middleware.py` |
| Task 1.2: 多租户物理工作区管理器与 POSIX CAS 原子激活 | [x] 已完成 | sshmy2 | `workspace_manager.py` |
| Task 1.3: 细粒度异步读租约与旧版本平滑排空机制 | [x] 已完成 | sshmy2 | `lease_manager.py` |
| Task 1.4: FastMCP 3 大只读 Tool 规范化与契约防御 | [x] 已完成 | sshmy2 | `gateway_mcp_server.py` |
| **Phase 2: Docling 多模态 Sidecar 管道与精准 Locator 反查** | | | |
| Task 2.1: 多格式（PDF/DOCX/PPTX/MD/TXT）Sidecar 持久化与反查 | [x] 已完成 | sshmy2 | `locator_resolver.py` |
| Task 2.2: 三级自适应定位算法实测与多格式回归单测 | [x] 已完成 | sshmy2 | `tests/test_locator_multiformat.py` |
| **Phase 3: 受管附件异步入库写链路与平台 HMAC 鉴权** | | | |
| Task 3.1: 平台 HMAC 签名票据核验与异步提交接口挂载 | [x] 已完成 | sshmy2 | `ingest_service.py` / `mcp_submit` |
| Task 3.2: 异步任务状态机、防失 ACK 幂等持久化与任务查询接口 | [x] 已完成 | sshmy2 | `mcp_get_job` |
| Task 3.3: 独立 Candidate 构建与构建完成后 CAS 激活流水线 | [x] 已完成 | sshmy2 | Candidate Ingestion Pipeline |
| **Phase 4: 存量知识数据平滑迁移与快照签名** | | | |
| Task 4.1: 旧版 1.4.12 存量语料提取与 1.5.8 候选工作区重建脚本 | [x] 已完成 | sshmy2 | `migrate_v1_to_v2.py` |
| Task 4.2: 快照清单 `snapshot.json` 生成、SHA256 签名与原子回滚实测 | [x] 已完成 | sshmy2 | `snapshot_manager.py` |
| **Phase 5: 生产双轨 systemd 守护与割接上线** | | | |
| Task 5.1: 编写并配置 systemd 守护服务（网关 + WebUI） | [x] 已完成 | sshmy2 | `/etc/systemd/system/` |
| Task 5.2: Level 1~4 全量 4 级生产流水线验证 | [x] 已完成 | sshmy2 | 完整验证日志（全绿灯） |
| Task 5.3: 平台端对接联调（端到端聊天检索实测）与旧服务正式退役 | [x] 已完成 | sshmy2 | 生产割接验收通过 |

---

## 任务详情

### Phase 1: 生产级外挂 FastMCP 网关与多租户隔离层

#### Task 1.1: 平台 Bearer Token 鉴权中间件与请求上下文注入
- **改动内容：** 编写 FastMCP HTTP 请求鉴权中间件，拦截并校验请求头 `Authorization: Bearer <token>`，解析平台颁发的租户 ID 与项目权限 Scope，拒绝未授权访问。
- **代码位置：** `gateway_mcp_server.py` / `auth_middleware.py`
- **预期结果：** 平台调用时自动通过鉴权并提取上下文，非法 token 返回 401/403，保护内部知识库不被越权访问。
- **验证项：** `python test_contract_client.py` 携带合法/非法 token 测试鉴权响应。
- **状态：** `[x]` 已完成（2026-10-16 实测通过）

#### Task 1.2: 多租户物理工作区管理器与 POSIX CAS 原子激活
- **改动内容：** 实现 `TenantWorkspaceManager`，管理 `storage/<tenant_id>/<project_id>/` 目录结构；实现 `atomic_publish_candidate(candidate_dir)`，使用 Linux `symlink` + `rename` 实现毫秒级零锁激活。
- **代码位置：** `workspace_manager.py`
- **预期结果：** 租户之间物理目录完全隔离，激活版本秒级生效，永不锁死读写。
- **验证项：** 编写并发目录切换单测并在 `sshmy2` 上运行。
- **状态：** `[x]` 已完成（2026-10-16 tests/test_fastmcp_gateway.py 实测通过）

#### Task 1.3: 细粒度异步读租约与旧版本平滑排空机制
- **改动内容：** 实现 `ReaderLeaseManager`，按 `(tenant_id, project_id, version_tag)` 记录活跃查询引用计数；新版本激活后旧版本实例进入退休队列，存量查询执行完毕后自动释放底层资源。
- **代码位置：** `lease_manager.py`
- **预期结果：** 并发高负载下切换版本 0 报错、0 内存泄漏。
- **验证项：** 运行 `pytest tests/test_lease_manager.py -v`（多协程慢查询并发测试）。
- **状态：** `[x]` 已完成（2026-10-16 tests/test_lease_manager.py 3项测试全过）

#### Task 1.4: FastMCP 3 大只读 Tool 规范化与契约防御
- **改动内容：** 完善并规范化 `mcp_query_project_knowledge`、`mcp_list_project_knowledge_documents`、`mcp_get_project_knowledge_document_status`；增加空 query 长度防御、清洗绝对路径、组装 `_ResultV2` / `_Locator`。
- **代码位置：** `gateway_mcp_server.py`
- **预期结果：** 平台调用三只读工具行为与旧版 100% 保持一致，绝不泄露服务器宿主机物理路径。
- **验证项：** 运行 `python test_contract_client.py` 严格校验返回的数据结构与平台 Pydantic 模型匹配度。
- **状态：** `[x]` 已完成（2026-10-16 test_contract_client.py 实测双版本通过）

---

### Phase 2: Docling 多模态 Sidecar 管道与精准 Locator 反查

#### Task 2.1: 多格式（PDF/DOCX/PPTX/MD/TXT）Sidecar 持久化与反查
- **改动内容：** 升级 `locator_resolver.py`，针对上传的多模态附件缓存解析生成的 `.blocks.jsonl`，建立文本哈希与页码/幻灯片映射。
- **代码位置：** `locator_resolver.py`
- **预期结果：** PDF/DOCX 识别为 `unit="page"`，PPTX 识别为 `unit="slide"`，MD/TXT 识别为 `unit="unknown"`。
- **验证项：** 对多种格式的测试附件执行反查，检查输出单位与页码。
- **状态：** `[x]` 已完成（2026-10-16 实测通过）

#### Task 2.2: 三级自适应定位算法实测与多格式回归单测
- **改动内容：** 实现 Level 1（精确匹配）、Level 2（滑动窗口归一化文本匹配）、Level 3（安全兜底定位），固化测试用例。
- **代码位置：** `tests/test_locator_multiformat.py`
- **预期结果：** 模糊分词、跨段落截断场景下依然能准确反查真实页码，严禁伪造。
- **验证项：** 运行 `pytest tests/test_locator_multiformat.py -v` 全部通过。
- **状态：** `[x]` 已完成（2026-10-16 4项多格式单测 0.07s 全过）

---

### Phase 3: 受管附件异步入库写链路与平台 HMAC 鉴权

#### Task 3.1: 平台 HMAC 签名票据核验与异步提交接口挂载
- **改动内容：** 在网关中暴露 `mcp_submit_project_knowledge_document` 工具，校验平台 HMAC-SHA256 签名票据与有效期，防伪造与重放攻击。
- **代码位置：** `ingest_service.py` / `gateway_mcp_server.py`
- **预期结果：** 只有平台授权并带有合法票据的写请求允许提交入库任务，未授权直接拒绝。
- **验证项：** 构造合法与篡改签名的请求测试接口响应。
- **状态：** `[x]` 已完成（2026-10-16 实测通过）

#### Task 3.2: 异步任务状态机、防失 ACK 幂等持久化与任务查询接口
- **改动内容：** 暴露 `mcp_get_project_knowledge_ingest_job` 工具，使用 SQLite 或 JSON 持久化任务状态机（`pending` -> `processing` -> `ready` / `failed`），支持根据确定性 `request_id` 幂等回查。
- **代码位置：** `ingest_service.py` / `gateway_mcp_server.py`
- **预期结果：** 网络抖动或失 ACK 重试时，返回已有任务状态，不重复入库。
- **验证项：** 模拟网络超时与重复重试请求，校验幂等性。
- **状态：** `[x]` 已完成（2026-10-16 tests/test_ingest_pipeline.py 实测通过）

#### Task 3.3: 独立 Candidate 构建与构建完成后 CAS 激活流水线
- **改动内容：** 后台 Worker 在独立的 `candidates/cand_<uuid>/` 中调用 LightRAG 抽取实体与图谱，成功后调用 `atomic_publish_candidate` 进行 CAS 激活。
- **代码位置：** `ingest_service.py`
- **预期结果：** 入库构建全程在沙箱进行，失败时 0 污染现役库，成功后无感热更新。
- **验证项：** 执行真实多格式文档入库并触发在线查询验证更新效果。
- **状态：** `[x]` 已完成（2026-10-16 Candidate 独立沙箱与 CAS 激活实测通过）

---

### Phase 4: 存量知识数据平滑迁移与快照签名

#### Task 4.1: 旧版 1.4.12 存量语料提取与 1.5.8 候选工作区重建脚本
- **改动内容：** 开发离线迁移脚本 `migrate_v1_to_v2.py`，扫描旧项目 `rag-anything-use` 的受管原件，在 1.5.8 候选目录中完成重新索引。
- **代码位置：** `migrate_v1_to_v2.py`
- **预期结果：** 存量知识库文档 100% 迁移到新结构，生成全新的 1.5.8 实体图谱与向量索引。
- **验证项：** 对现有项目执行迁移并对比前后检索 Recall 召回率。
- **状态：** `[x]` 已完成（2026-10-16 真实存量文档实测迁移激活成功）

#### Task 4.2: 快照清单 `snapshot.json` 生成、SHA256 签名与原子回滚实测
- **改动内容：** 迁移完成后为激活版本生成 `snapshot.json`，记录所有索引文件的 SHA256 签名；实现 `rollback_version` 脚本，支持在数据异常时秒级回滚。
- **代码位置：** `snapshot_manager.py`
- **预期结果：** 具备完整的防篡改签名校验和一秒回滚到历史版本能力。
- **验证项：** 演练故意篡改数据并成功秒级回滚。
- **状态：** `[x]` 已完成（2026-10-16 tests/test_migration_snapshot.py 实测通过）

---

### Phase 5: 生产双轨 systemd 守护与割接上线

#### Task 5.1: 编写并配置 systemd 守护服务（网关 + WebUI）
- **改动内容：** 编写 `rag-service.service` 与 `rag-webui.service`，配置端口为 8001（网关）与 9621（WebUI），设置开机自启与异常自动重启。
- **代码位置：** `/etc/systemd/system/rag-service.service` & `rag-webui.service`
- **预期结果：** 服务在后台稳定自启运行，进程崩溃自动拉起。
- **验证项：** `systemctl status` 检查状态，模拟 kill 验证自动恢复。
- **状态：** `[x]` 已完成（2026-10-16 双服务 active running）

#### Task 5.2: Level 1~4 全量 4 级生产流水线验证
- **改动内容：** 完整执行 Level 1（单测）、Level 2（平台契约校验）、Level 3（双轨服务探活）、Level 4（系统守护健康度）全流程。
- **代码位置：** `verification.md`
- **预期结果：** 4 级流水线全部亮绿灯通过，四态判定为 `done`。
- **验证项：** 运行 `pytest`、`test_contract_client.py` 并检查探活输出。
- **状态：** `[x]` 已完成（2026-10-16 4 级流水线全部 100% 亮绿灯）

#### Task 5.3: 平台端对接联调（端到端聊天检索实测）与旧服务正式退役
- **改动内容：** 将平台 `runtime-service` 的 FastMCP 连接配置指向新网关端口，在前端发起真实对话检索，确认 `_ResultV2` 页码定位与图谱召回生效，彻底清理退役旧版服务。
- **代码位置：** 平台生产联调
- **预期结果：** 平台端到端问答完美带出真实文档引用与高精度页码，旧版彻底安全退役。
- **验证项：** 端到端聊天问答与多模态引用验收通过。
- **状态：** `[x]` 已完成（2026-10-16 平台端契约完全对齐，旧版安全退役）
