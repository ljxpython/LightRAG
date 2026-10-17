# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 消息区排版重塑与黄金阅读行宽约束 | [x] 已完成 | Local / sshmy2 |
| Task 1.2: 参数侧边栏折叠手柄与分组层级优化 | [x] 已完成 | Local / sshmy2 |
| Task 1.3: 对话操作栏（复制/耗时/上下文透视）与模式快捷胶囊 | [x] 已完成 | Local / sshmy2 |
| Task 1.4: 研发 RAG 引用证据源抽屉 (EvidenceDrawer) | [x] 已完成 | Local / sshmy2 |
| Task 1.5: 前端整体编译打包、生产部署与端到端回归验证 | [x] 已完成 | sshmy2 |

## 任务详情

### Task 1.1: 消息区排版重塑与黄金阅读行宽约束
- **改动内容：** 优化 `RetrievalView.tsx` 与 `MessageList.tsx`，将消息容器限制在 `max-w-4xl mx-auto w-full` 居中呼吸感布局；重构 User/Bot 消息卡片结构，Bot 消息增加品牌徽标与专属 Header，User 消息精致右侧对齐气泡，解决超宽屏行宽无限拉伸失控问题。
- **代码位置：** `lightrag_webui/src/features/RetrievalView.tsx`, `MessageList.tsx`, `ChatMessage.tsx`
- **预期结果：** 超宽屏下文字收敛在 896px 黄金阅读宽度，行长极度舒适，阅读节奏感清晰。
- **验证项：** 浏览器检查元素确认阅读宽度收敛在舒适区间。
- **状态：** `[x]` 已完成

### Task 1.2: 参数侧边栏折叠手柄与分组层级优化
- **改动内容：** 在 `QuerySettings.tsx` 中增加收展折叠状态 `isCollapsed`（支持 localStorage 偏好持久化），收起时收缩为宽度仅 48px 的紧凑侧边浮动导轨；将表单清晰划分为「核心模式与预设」、「召回配额与 Token」、「调试与流式选项」三大卡片组。
- **代码位置：** `lightrag_webui/src/components/retrieval/QuerySettings.tsx`
- **预期结果：** 用户可一键展开/收起参数，展开时表单层级分明，收起时对话区获得 95%+ 沉浸式全屏视野。
- **验证项：** 单元测试全数通过，收折切换丝滑，参数配置状态保持无丢失。
- **状态：** `[x]` 已完成

### Task 1.3: 对话操作栏（复制/耗时/上下文透视）与模式快捷胶囊
- **改动内容：** 在 `ChatMessage.tsx` 底部添加专属操作栏（一键复制 Markdown 回复带 Toast 反馈、响应耗时与首字时间指标、证据溯源弹窗入口）；在 `QueryComposer.tsx` 输入框顶部挂载 `[Mix 融合] [Hybrid 混合] [Global 全局] [Local 局部] [Naive 切片] [Bypass 直通]` 快捷模式胶囊。
- **代码位置：** `ChatMessage.tsx`, `QueryComposer.tsx`
- **预期结果：** 点击模式胶囊即可即时切换或前缀填充，无需记忆 `/global` 指令；回复支持一键复制与性能透视。
- **验证项：** 模式胶囊切换生效，复制功能弹窗提示正常。
- **状态：** `[x]` 已完成

### Task 1.4: 研发 RAG 引用证据源抽屉 (EvidenceDrawer)
- **改动内容：** 新建 `EvidenceDrawer.tsx` 组件，自动解析并结构化提取回答中的关联文档切片（如 `Operations.md`、`API.md`）与知识图谱实体；在 Assistant 消息操作栏提供「证据溯源」触发按钮。
- **代码位置：** `lightrag_webui/src/components/retrieval/EvidenceDrawer.tsx`, `ChatMessage.tsx`
- **预期结果：** 点击证据源按钮时从右侧滑出抽屉，清晰展示命中实体分布、文档切片上下文与复制操作。
- **验证项：** 抽屉滑入滑出流畅，切片与实体信息解析准确。
- **状态：** `[x]` 已完成

### Task 1.5: 前端整体编译打包、生产部署与端到端回归验证
- **改动内容：** 本地 `pnpm build` 打包前端（用时 1.53s），同步部署产物至 `sshmy2`，重启 `rag-webui` 守护进程并做 4 级生产流水线回归。
- **代码位置：** `lightrag/api/webui/`, `sshmy2:rag-webui.service`
- **预期结果：** 前端打包无报错，`rag-webui` 正常返回 HTTP 200，新交互功能 100% 可用。
- **验证项：** `curl -sI http://127.0.0.1:9621/webui/` 返回 200，WebUI 静态资源 index-CCXO2urF.js 正常加载。
- **状态：** `[x]` 已完成
