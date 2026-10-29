# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 扩展底层类型契约与流式协议分发（解除 references 静默丢弃） | [x] 已完成 | sshmy2 |
| Task 1.2: 检索会话管理打通真实切片引用的接收与持久化 | [x] 已完成 | sshmy2 |
| Task 1.3: 废黜大模型正则扒取，重塑真实切片渲染抽屉与操作栏联动 | [x] 已完成 | sshmy2 |
| Task 1.4: 前端生产环境现场构建打包与静态资源发布 | [x] 已完成 | sshmy2 |
| Task 1.5: 生产端到端回归验证与 4 级生产流水线签署 | [x] 已完成 | sshmy2 |

---

## 任务详情

### Task 1.1: 扩展底层类型契约与流式协议分发（解除 references 静默丢弃）
- **改动内容：**
  1. 在 `lightrag_webui/src/api/lightrag.ts` 中定义 `ReferenceItem` 接口（`reference_id`, `file_path`, `content?: string[]`）；
  2. 在 `QueryRequest` 中加入 `include_chunk_content?: boolean`，并在请求构造时默认传入 `true`；
  3. 在 `StreamCallbacks` 中增加 `onReferences?: (references: ReferenceItem[]) => void`；
  4. 修改 `queryTextStream` 的 NDJSON 行解析逻辑，检测到 `parsed.references` 时触发 `onReferences` 回调，删除原有的静默丢弃逻辑；
  5. 在 `lightrag_webui/src/types/retrieval.ts` 的 `MessageWithError` 类型中增加 `references?: ReferenceItem[]` 字段。
- **代码位置：**
  - `lightrag_webui/src/api/lightrag.ts`
  - `lightrag_webui/src/types/retrieval.ts`
- **预期结果：** 服务端首帧推来的 `{"references": [...]}` 能够被前端完整接收并向外分发。
- **验证项：** `npm run test` 或单测验证流式解析逻辑，确保 `onReferences` 被正确调用。
- **状态：** `[x]` 已完成

---

### Task 1.2: 检索会话管理打通真实切片引用的接收与持久化
- **改动内容：**
  1. 在 `lightrag_webui/src/features/retrieval/useQuerySession.ts` 中，在调用 `queryTextStream` 时提供 `onReferences` 处理函数；
  2. 接收到 `references` 时，通过 `updateMessage` 立即同步挂载到当前 Assistant 消息状态上；
  3. 在非流式 `queryText` 调用路径中，同样将后端返回的 `response.references` 挂载到消息对象中；
  4. 确保历史消息加载与上下文切换时，`references` 数据不会丢失。
- **代码位置：**
  - `lightrag_webui/src/features/retrieval/useQuerySession.ts`
- **预期结果：** 对话树中的每一条 Assistant 回答消息都具备完整的 `references` 切片数据支撑。
- **验证项：** 发起一次实际问答检索，检查前端 Assistant 消息对象中包含非空的 `references` 数组。
- **状态：** `[x]` 已完成

---

### Task 1.3: 废黜大模型正则扒取，重塑真实切片渲染抽屉与操作栏联动
- **改动内容：**
  1. 彻底移除 `EvidenceDrawer.tsx` 中使用正则表达式从文本和思考链里提取“伪切片”的 `extractEvidenceFromMessage` 逻辑；
  2. 重构 `EvidenceDrawer.tsx`，直接接收并消费 `message.references`：
     - 按文件（`file_path`）分组展示卡片；
     - 展开展示该文档下命中的真实文本切片（`content` 列表）；
     - 提供代码/文本高亮排版、字数统计、复制切片文本与复制文件名操作；
     - 提供清晰真实的空态说明（如“本次回答未命中具体文档切片”）；
  3. 在 `ChatMessage.tsx` 中同步更新“证据溯源”按钮，按真实引用的切片总数展示计数徽章（如 `证据溯源 (3)`），无引用时优雅隐藏或置灰。
- **代码位置：**
  - `lightrag_webui/src/components/retrieval/EvidenceDrawer.tsx`
  - `lightrag_webui/src/components/retrieval/ChatMessage.tsx`
- **预期结果：** 抽屉滑出后展示的是原始文档中的真实片段，不再出现 `7 Operations.md content`、`Relationships: 40...` 等大模型思考乱码。
- **验证项：** 打开抽屉，核对切片内容与知识库原始文档完全一致，无多余大模型 Thinking 文本。
- **状态：** `[x]` 已完成

---

### Task 1.4: 前端生产环境现场构建打包与静态资源发布
- **改动内容：**
  1. 在 `sshmy2` 宿主机上的 `lightrag_webui` 目录执行打包命令（`npm run build` 或 `bun run build`）；
  2. 确保构建产物正确输出到后端静态目录 `lightrag/api/webui/`；
  3. 重启生产 `rag-webui.service` 服务。
- **代码位置：**
  - `lightrag_webui/`
  - `lightrag/api/webui/`
- **预期结果：** 打包 0 错误 0 warning，静态资源指纹更新，WebUI 服务成功热重载。
- **验证项：** `curl -sI http://127.0.0.1:9621/webui/` 返回 200，浏览器加载最新静态 JS 资产。
- **状态：** `[x]` 已完成

---

### Task 1.5: 生产端到端回归验证与 4 级生产流水线签署
- **改动内容：**
  1. 执行 Level 1-4 生产验收流水线；
  2. 浏览器实际连入 `http://<sshmy2-ip>:9621/webui/` 发起多模态/文本检索，实际打开证据抽屉检查；
  3. 确认 FastMCP（8001）和平台端原有功能不受任何负面影响；
  4. 完善 `verification.md` 实测输出记录。
- **代码位置：**
  - `docs/projects/20261029-grounded-retrieval-evidence/verification.md`
- **预期结果：** 4 级全量流水线绿灯，证据溯源抽屉完全呈现真实切片。
- **验证项：** 实测截图/日志确认真实切片渲染无误。
- **状态：** `[x]` 已完成
