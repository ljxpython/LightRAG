# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 修复现有单测 TooltipWidth 基线断言 | [x] 已完成 | sshmy2 |
| Task 1.2: 全局 Design Tokens 与硬核黑灰层级重构 | [x] 已完成 | sshmy2 |
| Task 1.3: SiteHeader 导航栏 52px 升级与 Segmented Tabs 改造 | [x] 已完成 | sshmy2 |
| Task 1.4: RetrievalView 检索空状态 Starter Hub 引导化 | [x] 已完成 | sshmy2 |
| Task 1.5: 问答流消息气泡、思考微光与 Citation 徽章美化 | [x] 已完成 | sshmy2 |
| Task 1.6: 底部 QueryComposer 悬浮 Command Dock 重塑 | [x] 已完成 | sshmy2 |
| Task 1.7: 全量编译构建与前端回归测试 | [x] 已完成 | sshmy2 |

---

## 任务详情

### Task 1.1: 修复现有单测 TooltipWidth 基线断言
- **改动内容：** 修复因历史代码合并导致 `TooltipWidth.test.tsx` 中 `DocumentManager.tsx` 预期 tooltip 数量从 3 降为 2 的测试断言，恢复绿色基线。
- **代码位置：** `lightrag_webui/src/components/ui/TooltipWidth.test.tsx`
- **预期结果：** `bun test TooltipWidth.test.tsx` 100% 通过。
- **验证项：** `~/.bun/bin/bun test src/components/ui/TooltipWidth.test.tsx`
- **状态：** `[ ]` 待开始

### Task 1.2: 全局 Design Tokens 与硬核黑灰层级重构
- **改动内容：** 升级 `index.css`，配置 Linear 极客暗黑层级（Background `#09090b`、Card `#121215`、Muted `#222226`、Border 微光），优化代码与排版字体间距与多层软阴影。
- **代码位置：** `lightrag_webui/src/index.css`
- **预期结果：** 全局具有清晰的立体景深与微光边缘，消除生硬死黑。
- **验证项：** `bun run build:bun` 编译无样式错误。
- **状态：** `[ ]` 待开始

### Task 1.3: SiteHeader 导航栏 52px 升级与 Segmented Tabs 改造
- **改动内容：** 将 Header 高度从 `h-10` 扩展为 `h-13`，重写 Tab 为 Segmented Control，彻底去除土味纯绿高亮；优化 Guest 模式标签与操作按钮间距。
- **代码位置：** `lightrag_webui/src/features/SiteHeader.tsx`
- **预期结果：** 顶部导航呼吸感良好，Tab 具备高质感内凹凹槽与浮雕激活态。
- **验证项：** `bun test src/features/SiteHeader.test.tsx`
- **状态：** `[ ]` 待开始

### Task 1.4: RetrievalView 检索空状态 Starter Hub 引导化
- **改动内容：** 将简单的文本提示升级为带有科技感品牌 Logo、说明与 4 个典型检索 Prompt 快捷芯片的引导卡片区。
- **代码位置：** `lightrag_webui/src/features/RetrievalView.tsx`, `lightrag_webui/src/features/retrieval/MessageList.tsx`
- **预期结果：** 空白页具备丰富且实用的开箱即用引导体验。
- **验证项：** `bun run build:bun`
- **状态：** `[ ]` 待开始

### Task 1.5: 问答流消息气泡、思考微光与 Citation 徽章美化
- **改动内容：** 优化 `ChatMessage.tsx` 消息气泡边框、代码块 Header；优化 Thinking 折叠面板，加入微光流动与耗时标签；将 Reference/Citation 渲染为现代 Hover Card 风格。
- **代码位置：** `lightrag_webui/src/components/retrieval/ChatMessage.tsx`
- **预期结果：** 实体引用清晰美观，思考状态具备现代 AI 产品的微动效。
- **验证项：** `bun test src/features/retrieval/`
- **状态：** `[ ]` 待开始

### Task 1.6: 底部 QueryComposer 悬浮 Command Dock 重塑
- **改动内容：** 将输入框改造为悬浮磨砂 Command Dock，内嵌当前检索模式指示胶囊与快捷键提示。
- **代码位置：** `lightrag_webui/src/features/retrieval/QueryComposer.tsx`
- **预期结果：** 输入体验平滑自然，视觉上富有浮动层次感。
- **验证项：** `bun test src/features/retrieval/QueryComposer.test.tsx`
- **状态：** `[ ]` 待开始

### Task 1.7: 全量编译构建与前端回归测试
- **改动内容：** 执行 `bun run build:bun` 并运行全量 `bun test`。
- **代码位置：** `lightrag_webui/`
- **预期结果：** 全量 68 个测试文件、635+ 个测试全部 PASS，构建体积在预算内。
- **验证项：** `sshmy2` 现场全绿通过。
- **状态：** `[ ]` 待开始
