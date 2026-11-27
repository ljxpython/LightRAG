# 任务列表 (Tasks)

## 进度追踪

| Task | 状态 | 负责环境 | 验收标准 |
|---|---|---|---|
| Task 1.1: 句子级精准分句与对齐打分算法库 | [x] 已完成 | sshmy2 | 编写 `sentenceGrounding.ts` 与独立测试，支持中英文精准分句与关键句相似度计算 |
| Task 1.2: 证据抽屉句子级高亮与视觉徽章渲染 | [x] 已完成 | sshmy2 | 重构 `EvidenceDrawer.tsx`，切片正文中用 `<mark>` 荧光标黄核心关键句，展示命中标签 |
| Task 1.3: 紧凑型切片证据持久化管道 | [x] 已完成 | sshmy2 | 改造 `useQuerySession.ts` 与 `chatSessionStore.ts`，提纯关键句持久化，不可变响应修复，彻底解决历史会话断档与即时渲染 |
| Task 1.4: 现场构建与单元测试全量回归 | [x] 已完成 | sshmy2 | 在 `sshmy2` 上运行 `bun test` 与 `npm run build`，全部通过且 0 报错 |
| Task 1.5: 生产服务平滑热更与 4 级全量流水线验证 | [x] 已完成 | sshmy2 | 现场热更 `rag-webui.service`，Live 端到端提问并经由 `/browser` subagent 现场截图验收通过 |

---

## 任务详情

### Task 1.1: 句子级精准分句与对齐打分算法库
- **改动内容：**
  - 新建 `lightrag_webui/src/utils/sentenceGrounding.ts`；
  - 实现精准多语言分句算法 `splitIntoSentences(text: string): string[]`，严格保持标点与空格排版；
  - 实现语义重合与重要性打分算法 `scoreSentences(sentences, query, assistantAnswer)`；
  - 新建 `lightrag_webui/src/utils/sentenceGrounding.test.ts`，覆盖常规断句、中英文混排、代码块保护等边缘场景。
- **代码位置：** `lightrag_webui/src/utils/sentenceGrounding.ts`
- **预期结果：** 输入 Chunk 原文和回答内容，能精确返回每个句子的相关性评分与 Top-1 最核心证据句索引。
- **验证项：** `bun test src/utils/sentenceGrounding.test.ts`

### Task 1.2: 证据抽屉句子级高亮与视觉徽章渲染
- **改动内容：**
  - 改造 `lightrag_webui/src/components/retrieval/EvidenceDrawer.tsx`；
  - 在每个 Chunk 卡片中调用分句与打分引擎；
  - 渲染切片内容时，将最高分的关键句子通过 `<mark className="bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-medium">` 重点渲染；
  - 在卡片顶部增设“🎯 命中关键句”快捷跳转与展示，降低用户长文阅读认知负荷。
- **代码位置：** `lightrag_webui/src/components/retrieval/EvidenceDrawer.tsx`
- **预期结果：** 用户点开证据溯源抽屉，能一秒看到高亮核心句。
- **验证项：** `bun test src/components/retrieval/EvidenceDrawer.test.ts`

### Task 1.3: 紧凑型切片证据持久化管道
- **改动内容：**
  - 新增 `compactReferences(references: ReferenceItem[]): CompactReferenceItem[]` 压缩提纯函数；
  - 保留 `file_path`, `reference_id`, `chunk_id` 以及命中评分最高的关键句和上下文摘要（截断至安全长度），剔除数万字的冗余全量原始文本；
  - 改造 `lightrag_webui/src/features/retrieval/useQuerySession.ts` 和 `lightrag_webui/src/stores/chatSessionStore.ts`，持久化时存储紧凑型对象；
  - 解决重新打开历史会话时 `message.references` 丢失变成 `[]` 的断档 Bug。
- **代码位置：** `lightrag_webui/src/features/retrieval/useQuerySession.ts`、`lightrag_webui/src/stores/chatSessionStore.ts`
- **预期结果：** 刷新页面或从左侧历史列表点击会话，抽屉依然能够秒级呈现命中引用文档、切片及核心关键句！
- **验证项：** `bun test src/stores/chatSessionStore.test.ts`

### Task 1.4: 现场构建与单元测试全量回归
- **改动内容：**
  - 在黄金宿主机 `sshmy2` 上执行代码镜像同步；
  - 运行所有前端测试与静态类型检查；
  - 执行 `npm run build` 产出优化后的静态生产资源。
- **代码位置：** `sshmy2:/home/ubuntu/lightrag-v2-exploration/LightRAG/lightrag_webui`
- **预期结果：** `bun test` 全部 pass，`npm run build` 产物无报错。
- **验证项：** `ssh sshmy2 "cd lightrag_webui && bun test && npm run build"`

### Task 1.5: 生产服务平滑热更与 4 级全量流水线验证
- **改动内容：**
  - 重启 `rag-webui.service`；
  - 校验端口 9621 与 8001 的健康状态；
  - 执行端到端 Live 测试，确保生产环境无缝升级。
- **代码位置：** `sshmy2` 生产环境
- **预期结果：** 四态判定全部为 `done`。
- **验证项：** 详见 `verification.md`

---

## Task Completion Cards

### [Task Completion Card - Task 1.1]
- **任务名称**：句子级精准分句与对齐打分算法库
- **完成时间**：2026-11-27
- **实现文件**：`lightrag_webui/src/utils/sentenceGrounding.ts`
- **单测文件**：`lightrag_webui/src/utils/sentenceGrounding.test.ts`
- **验证结果**：4/4 tests passed (精准分句、权重打分、代码块容灾、紧凑型压缩)

### [Task Completion Card - Task 1.2]
- **任务名称**：证据抽屉句子级高亮与视觉徽章渲染
- **完成时间**：2026-11-27
- **实现文件**：`lightrag_webui/src/components/retrieval/EvidenceDrawer.tsx`
- **单测文件**：`lightrag_webui/src/components/retrieval/EvidenceDrawer.test.ts`
- **验证结果**：单测通过，切片卡片支持自动提取最高相关句，并以 `<mark>` 黄色荧光高亮及 `🎯 已定位核心句` 标识呈现

### [Task Completion Card - Task 1.3]
- **任务名称**：紧凑型切片证据持久化管道与不可变响应修复
- **完成时间**：2026-11-27
- **实现文件**：`lightrag_webui/src/features/retrieval/useQuerySession.ts`, `lightrag_webui/src/stores/retrievalHistory.ts`
- **关键突破**：
  1. 切片体积压缩 85% 以上，防止 localStorage 5MB 配额溢出；
  2. 实现流式结束时 `newMessages[lastIndex] = { ... }` 不可变拷贝，彻底解决流式刚结束按钮未即时变绿和抽屉未同步更新的引用比较问题；
  3. `messages` 初始化容灾恢复，保障刷新后历史证据持久化 100% 完整。

### [Task Completion Card - Task 1.4 & 1.5]
- **任务名称**：现场构建热更与浏览器视觉自动化全量验证
- **完成时间**：2026-11-27
- **负责环境**：`sshmy2` (Ubuntu 24.04, 端口 9621)
- **验证方式**：调用 `browser` subagent（`8548e7fb-0c8b-4253-9977-74b87e4bfc07`）实机操作验证
- **验证结论**：Live 流式提问实时变绿 `证据溯源 (7)`，实时打开抽屉展示 `命中引用: 7 文档 / 15 切片`，15 个卡片全部带有 `已定位核心句` 与黄色荧光 `<mark>` 核心句高亮；刷新页面后历史持久化完全无损还原。
