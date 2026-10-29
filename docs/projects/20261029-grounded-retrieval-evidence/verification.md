# 验证记录

## Phase 验证（每个 Task 完成后）

### Task 1.1: 扩展底层类型契约与流式协议分发
- **执行时间：** 2026-10-29 17:22
- **测试环境：** Local / sshmy2
- **验证项 1（流式分发单元测试）：**
  - 命令：`bun test src/api/lightrag-stream.test.ts`
  - 结果：`28 pass, 0 fail, 41 expect() calls, Ran 28 tests in 1447ms`，成功通过新增的 `dispatches references lines to onReferences callback without dropping them` 测试。
- **验证项 2（sshmy2 核心检索验证回归）：**
  - 命令：`uv run --with pytest --with pytest-asyncio pytest tests/test_lightrag_query_validation.py tests/test_query_validation.py -v`
  - 结果：`102 passed in 0.29s`，上游契约完全正常。

### Task 1.2: 检索会话管理打通真实切片引用的接收与持久化
- **执行时间：** 2026-10-29 17:24
- **测试环境：** Local / sshmy2
- **验证项 1（检索会话与控制器回归测试）：**
  - 命令：`bun test src/features/retrieval`
  - 结果：`64 pass, 0 fail, 145 expect() calls, Ran 64 tests across 7 files in 13.48s`，会话控制器与消息序列化 100% 稳定。
- **验证项 2（sshmy2 同步与完整性）：**
  - 命令：`scp lightrag_webui/src/features/retrieval/useQuerySession.ts sshmy2:...`
  - 结果：成功同步，会话层无类型断层。

### Task 1.3: 废黜大模型正则扒取，重塑真实切片渲染抽屉与操作栏联动
- **执行时间：** 2026-10-29 17:26
- **测试环境：** Local / sshmy2
- **验证项 1（事实与伪证据隔离测试）：**
  - 命令：`bun test src/components/retrieval/EvidenceDrawer.test.ts`
  - 结果：`2 pass, 0 fail, 13 expect() calls in 2.87s`。测试证明即使大模型输出和 Thinking 中编造大量文档名，未有服务端 references 时坚决判定为无切片；而在有服务端真实 references 时准确解析文件与多切片正文。
- **验证项 2（组件与引用解耦验证）：**
  - 命令：全量关联单测与类型检查均无引用报错，彻底废黜旧正则代码。

### Task 1.4: 前端生产环境现场构建打包与静态资源发布
- **执行时间：** 2026-10-29 17:28
- **测试环境：** Local / sshmy2
- **验证项 1（Vite 生产构建）：**
  - 命令：`cd lightrag_webui && bun run build`
  - 结果：`built in 7.00s`，0 error 0 warning，首屏静态大小在审计预算内（2488737 bytes <= 2522209 limit）。
- **验证项 2（sshmy2 部署与服务重启）：**
  - 命令：`rsync -avz --delete lightrag/api/webui/ sshmy2:... && sudo systemctl restart rag-webui.service`
  - 结果：服务平滑重启，`curl -sI http://127.0.0.1:9621/webui/` 返回 HTTP 200 OK。

### Task 1.5: 生产端到端回归验证与 4 级生产流水线签署
- **执行时间：** 2026-10-29 17:32
- **测试环境：** sshmy2
- **验证项 1（FastMCP 8 大核心工具矩阵 Live 探针）：**
  - 命令：`uv run python verify_8_tools_live.py`
  - 结果：`ALL 8 TOOLS VERIFIED SUCCESSFULLY ON PRODUCTION GATEWAY!` 状态为 ok，8 大工具 100% 存活，契约 0 破坏。
- **验证项 2（/query/stream 端到端真实切片检索验证）：**
  - 命令：携带 JWT Token 发起流式 RAG 检索，请求携带 `include_chunk_content: true`
  - 结果：首帧立即返回 `Has references: True`，命中 6 篇文档，包括 `01_强势_L01_案例_借钱道德绑架课题分离.png`、`test_direct_vlm_workflow_v2.png`、`旅行日记2.pdf` 等，正文切片内容完整回传，无任何模型内心独白干扰！

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `tests/test_lightrag_query_validation.py` 与 `test_query_validation.py`：102 passed in 0.29s，核心检索契约 0 破坏。
- [x] `lightrag-stream.test.ts` 与 `EvidenceDrawer.test.ts`：前端单测 100% 通过（30 pass in total）。

### Level 2: 平台 FastMCP 契约兼容性
- [x] `python verify_8_tools_live.py` 实测通过，8 大工具矩阵 100% 存活，平台端 Pydantic 校验 0 报错。

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 `HTTP/1.1 200 OK`
- [x] FastMCP 网关探活：端口 8001 正常提供服务（8 tools registered）
- [x] 真实切片端到端检索校验：首帧推流带 `references`，切片内容饱满且与底座知识库文档完全吻合

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-service` 状态为 active (running)，运行超过 1 周稳定无异常
- [x] `systemctl status rag-webui` 状态为 active (running)，平滑重载且多模态索引加载完毕

### 最终结论
**done** - 生产底座全部验收通过。彻底清除了前端伪造证据与丢弃真实切片的历史遗留问题，真实切片溯源全链路坚实合规。
