# LightRAG WebUI 顶栏平台化对齐与免遮挡改造专项

- **时间：** 2026-10-16
- **目标：** 将 LightRAG WebUI (9621) 顶栏重构为对齐消费平台风格的项目选择器与账户状态菜单，根治语言切换白屏 Bug，彻底消除悬浮遮挡。
- **影响模块：**
  - `lightrag_webui/src/features/SiteHeader.tsx` (顶栏布局与组件编排)
  - `lightrag_webui/src/components/ProjectSelector.tsx` (平台对齐的项目下拉选择器)
  - `lightrag_webui/src/components/UserAccountMenu.tsx` (平台对齐的头像与用户菜单)
  - `lightrag_webui/src/components/AppSettings.tsx` (修复 Radix Popover 嵌套 Focus Trap 导致的语言白屏)
  - `lightrag_webui/src/components/ErrorBoundary.tsx` (增加顶栏与全局异常兜底)
  - `run_lightrag_webui_server.py` (移除临时悬浮球注入，保留 /ops 接口与多租户中继)
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行破坏性代码修改（保持平台 API 与 JWT 契约 100% 兼容）。
- **上游核心侵入度：** 0 行侵入（`lightrag/` 核心算法库保持纯净，可随时 git merge upstream）。
- **真实环境闭环：** 在 `sshmy2` 宿主机现场验证，全量通过 4 级生产流水线。

## 方案概述

### 1. 痛点与架构演进
之前为了在官方 SPA 前端上快速实现工作区切换，采用在返回的 HTML 中通过中间件注入浮动小胶囊（Overlay Widget）。但这带来两大致命痛点：
1. 浮动球即使支持拖拽，在某些分辨率或操作时依然会不可避免地压住底部“● 已连接”状态或边缘按钮；
2. 视觉风格与平台（`ai-agent-platform`）割裂，用户体验不统一。

### 2. 顶栏一体化设计（对齐平台规范）
彻底淘汰外挂浮动挂件，将核心控制能力原生收敛至顶栏（SiteHeader）：
- **项目选择器 (`ProjectSelector`)**：在顶栏右侧展示 `📁 test ⌵`。点击下拉展开项目列表，当前选中的项目高亮并带绿色 `✓`，一键切换租户与项目，无刷新写 Cookie 并动态热重载当前图谱与文档。
- **账号登录状态 (`UserAccountMenu`)**：在顶栏右侧展示绿色头像胶囊 `[AD] admin ⌵`。展示当前登录用户名、角色（管理员/普通用户），下拉支持查看资料、切换工作区与安全退出。
- **CAS 与版本发布入口整合**：在项目选择器下拉面板或二级菜单中内嵌当前版本标签（如 `rev_1`）以及候选版本一键 CAS 激活，运维能力无缝隐形化。

### 3. 语言切换白屏 Bug 根治
Radix UI `Popover`（AppSettings）内部嵌套带有 `Portal` 的 `Select`，触发了 Radix 的 Focus Trap（焦点死锁拦截），导致 React 树崩溃并在缺乏全局 ErrorBoundary 的顶层引发全屏白屏。
- 修复方案：
  1. 在 `AppSettings` 中优化 Select 的挂载容器（避免与 Popover 的 Focus Trap 冲突），或者在打开 Select 时禁止 Popover 抢占焦点；
  2. 在 `App.tsx` 顶层与 `SiteHeader.tsx` 关键子树增加弹性 `ErrorBoundary`，即使个别子组件抛错也绝不全页白屏，具备优雅降级与即时重试能力。
