# 知识库双轨认证体系（平台 SSO 免密直通 + 独立账密直连登录）

- **时间：** 2026-10-16
- **目标：** 支持“平台统一 SSO 免密单点登录”与“知识库直连账号密码登录”双模共存，满足脱离平台直接输入账密访问知识库的需求。
- **影响模块：** `run_lightrag_webui_server.py`, `sshmy2: .env`, `lightrag_webui/src/components/UserAccountMenu.tsx`
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与已有平台契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 官方核心源码保持纯净）
- **多租户安全：** 本地管理员与平台租户身份严格隔离

## 方案概述

### 1. 业务场景与诉求
1. **场景一（平台用户无感访问）：** 用户在 `ai-agent-platform` 工作区，点击“知识库”入口，带参 `?token=<PLATFORM_JWT>&tenant_id=<TENANT>&project_id=<PROJ>`，知识库自动写入 Cookie / LocalStorage，跳过登录界面，无感直达，顶栏展示平台用户与租户身份。
2. **场景二（独立管理员/直连访问）：** 用户直接在浏览器打开 `http://152.136.27.196:9621/webui`，未带任何 Token。知识库弹出原生登录界面，支持输入管理员账号与密码登录（如 `admin:admin123456`），登录后顶栏展示 `[AD] admin ⌵`，身份为「平台管理员」，拥有完整管理权限。
3. **安全登出：** 无论哪种方式登录，点击顶栏 `退出登录` 均清空本地 Token 并安全回到登录卡片。

### 2. 技术架构与机制
- **服务端开启认证：** 在 `sshmy2` 的 `.env` 中配置 `AUTH_ACCOUNTS`（如 `admin:admin123456`）和 `TOKEN_SECRET`。此时 `auth_configured` 激活，彻底关闭匿名游客模式（Guest Mode）。
- **中间件智能双分流：** 
  - 若请求带 `?token=...`，中间件自动预埋 Cookie 与 LocalStorage 脚本，优先以平台 SSO Token 放行；
  - 若请求未带 Token 且无合法 Cookie，直接放行静态资源，前端路由守卫（`AppRouter.tsx`）将视图引导至 `#/login` 呈现官方登录卡片。
- **JWT 密钥体系对齐：**
  - 服务端 `TOKEN_SECRET` 支持解密验证平台 JWT（若平台签发）；
  - 本地直连登录由官方 `/login` 接口验证 `AUTH_ACCOUNTS` 并签发有效 Session JWT。
