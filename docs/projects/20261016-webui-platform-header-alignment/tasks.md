# WebUI 顶栏平台化对齐与免遮挡改造任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 修复语言选择点击白屏 Bug 与全局 ErrorBoundary 兜底 | [x] 已完成 | 本地/sshmy2 |
| Task 1.2: 开发顶栏平台对齐的项目选择器组件 (`ProjectSelector.tsx`) | [x] 已完成 | 本地/sshmy2 |
| Task 1.3: 开发顶栏用户账号头像与身份菜单组件 (`UserAccountMenu.tsx`) | [x] 已完成 | 本地/sshmy2 |
| Task 1.4: 顶栏集成编排与移除服务端浮动 Overlay 注入 | [x] 已完成 | 本地/sshmy2 |
| Task 1.5: 前端工程打包编译与生产宿主机 4 级流水线验证 | [x] 已完成 | 本地/sshmy2 |

---

## 任务详情

### Task 1.1: 修复语言选择点击白屏 Bug 与全局 ErrorBoundary 兜底
- **改动内容：** 
  1. 重构 `AppSettings.tsx`，使用原生美化暗黑 `<select>` 替换 Radix `Select`，彻底根除 Popover 嵌套 Focus-Trap 造成的焦点死锁与白屏崩溃；
  2. 在 `App.tsx` 为 `<SiteHeader />` 包裹 `<ErrorBoundary>`，杜绝任何设置或顶栏异常扩散至全局引起白屏。
- **代码位置：** `lightrag_webui/src/components/AppSettings.tsx` & `lightrag_webui/src/App.tsx`
- **预期结果：** 点击语言下拉框、选择切换中文/English 时顺畅响应，控制台 0 报错，页面绝对不出现空白。
- **验证项：** 浏览器打开 WebUI，切换语言顺畅响应，控制台 0 报错。
- **状态：** `[x]` 已完成

### Task 1.2: 开发顶栏平台对齐的项目选择器组件 (`ProjectSelector.tsx`)
- **改动内容：** 
  实现与消费平台一致的 `📁 {项目名称} ⌵` 顶栏下拉组件：
  1. 调用 `/ops/workspaces` 获取所有可用项目；
  2. 下拉菜单展示所有项目名称、版本号，当前激活项目右侧标记高亮绿色 `✓`；
  3. 点击切换时调用 `/ops/workspaces/select`，设置 Cookie 并热刷新当前图谱；
  4. 支持折叠展示多租户空间与版本标签。
- **代码位置：** `lightrag_webui/src/components/ProjectSelector.tsx`
- **预期结果：** 顶栏优雅呈现项目选择器，完全避开主视图，无遮挡。
- **验证项：** 下拉切换项目顺畅响应，带绿色 `✓` 高亮当前工作区，零遮挡。
- **状态：** `[x]` 已完成

### Task 1.3: 开发顶栏用户账号头像与身份菜单组件 (`UserAccountMenu.tsx`)
- **改动内容：** 
  实现与消费平台一致的 `[AD] admin ⌵` 顶栏用户组件：
  1. 采用绿色圆形头像徽章（首字母缩写，如 `AD` / `GU`）；
  2. 右侧显示用户名 `admin` 与下拉箭头；
  3. 下拉菜单展示用户信息、当前角色（Administrator/访客模式）与退出登录按钮。
- **代码位置：** `lightrag_webui/src/components/UserAccountMenu.tsx`
- **预期结果：** 顶栏呈现平台风格的用户身份信息，支持登出。
- **验证项：** 正确展示用户首字母圆形徽章，点击展开卡片并可安全登出。
- **状态：** `[x]` 已完成

### Task 1.4: 顶栏集成编排与移除服务端浮动 Overlay 注入
- **改动内容：** 
  1. 在 `SiteHeader.tsx` 整合 `ProjectSelector` 和 `UserAccountMenu`，精简多余孤立变量；
  2. 从 `run_lightrag_webui_server.py` 中彻底移除 400+ 行的 `OVERLAY_SNIPPET` HTML 注入，保持服务端与 HTML 纯净无遮挡。
- **代码位置：** `lightrag_webui/src/features/SiteHeader.tsx` & `run_lightrag_webui_server.py`
- **预期结果：** 页面不再有任何浮动球或遮挡物，所有控制能力原生融入顶栏。
- **验证项：** 访问页面，右下角已无浮动球，底部“● 已连接”完全露出，顶栏功能完备。
- **状态：** `[x]` 已完成

### Task 1.5: 前端工程打包编译与生产宿主机 4 级流水线验证
- **改动内容：** 
  执行 WebUI 生产打包编译（`bun run build`，耗时 2.19s），产出部署至生产目录，现场重启 `rag-webui.service` 并执行 4 级全量验收。
- **代码位置：** `lightrag/api/webui/` 构建产物 & `sshmy2` 守护进程
- **预期结果：** 构建成功 0 报错，服务稳定运行，Live 探针全绿。
- **验证项：** `pytest tests/ -v` 自动化测试全过（6/6 PASSED），`systemctl status rag-webui.service` active (running)。
- **状态：** `[x]` 已完成
