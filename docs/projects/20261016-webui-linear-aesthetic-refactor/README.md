# WebUI 极客硬核风视觉重构 (Linear / Raycast 风格)

- **时间：** 2026-10-16
- **目标：** 对齐顶级开发工具（Linear / Raycast）的极简硬核美学，彻底革新 LightRAG WebUI 的全局质感、Header 导航及问答检索门面
- **影响模块：**
  - `lightrag_webui/src/index.css` (全局 Design Tokens, 暗色深度层级, 边框系统)
  - `lightrag_webui/src/features/SiteHeader.tsx` (导航栏高度、Segmented Control 胶囊、品牌与状态区)
  - `lightrag_webui/src/features/RetrievalView.tsx` (检索主视图布局)
  - `lightrag_webui/src/features/retrieval/MessageList.tsx` (空状态 Starter Hub 引导卡片)
  - `lightrag_webui/src/features/retrieval/QueryComposer.tsx` (悬浮 Command Dock 输入坞)
  - `lightrag_webui/src/components/retrieval/ChatMessage.tsx` (思考折叠动效与溯源 Citation 徽章质感)
- **状态：** 进行中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 _ResultV2 契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 核心算法源码保持纯净零修改）
- **开发与验证基线：** 现场闭环在 `sshmy2`（Ubuntu 24.04），通过 `bun run build:bun` 与 `bun test` 全量验证

## 方案概述

对齐 Linear / Raycast 的极客硬核工业风（方案 A - 路径 1）：
1. **全局 Design Tokens 升级**：
   - 弃用死黑背景，引入 Zinc 950/900/850 三级深度空间层级体系与 1px 微边框（`border-white/[0.08]`）；
   - 弃用土味纯绿激活态，重构为微光与高精细度对比的主题强调色与阴影体系。
2. **SiteHeader 导航栏蜕变**：
   - 高度由 40px 扩展至 52px（`h-13`），消除局促感；
   - 导航 Tabs 升级为精致的 Segmented Control（内凹暗槽 + 浮雕微光激活态）；
   - 状态标签与工作区选择器收敛，形成清晰的视觉层级。
3. **RetrievalView 检索门面重塑**：
   - 空白页重塑为带引导卡片的 Starter Hub，支持一键填入典型检索 Prompt；
   - 思考过程引入呼吸流光与耗时标签；
   - 实体引用与 Docling 可信定位器以精致 Citation Hover Card 呈现；
   - 底部输入框升级为带有模式快速切换药丸的悬浮 Command Dock。
