# 知识库统一认证与单点登录实施任务列表 (tasks.md)

## 进度总览

| Task | 描述 | 负责环境 | 状态 | 交付产物 |
|---|---|---|---|---|
| **Task 1** | 设计外挂 SSO 票据验签与穿透委托鉴权核心模块 | 本地 / sshmy2 | [x] 已完成 | `sso_auth_delegator.py`, 单测套件 (9 passed) |
| **Task 2** | 改造 `run_lightrag_webui_server.py` 服务端入口与中间件 | sshmy2 | [x] 已完成 | 改造外挂 server 入口，废除伪 admin 注入，集成测试 (5 passed) |
| **Task 3** | 前端 WebUI 登录交互与 SSO 票据自动兑换闭环 | 本地 / sshmy2 | [x] 已完成 | `LoginPage.tsx` 票据自动消费与无感重定向，TypeScript 0 报错 |
| **Task 4** | 宿主机环境配置固化、服务重启与 4 级生产流水线全量验收 | sshmy2 | [x] 已完成 | `.env` 配置、systemd 守护探活通过、全量单测 14/14 绿灯通过 |

---

## 阶段一：核心鉴权模块设计 (Task 1)

### Task 1: 设计外挂 SSO 票据验签与穿透委托鉴权核心模块
- **目标：** 创建独立外挂鉴权工具类，保持官方源码 0 侵入，实现短期票据验签与 Agent 平台鉴权穿透。
- **改动文件：** 
  - `sso_auth_delegator.py` (新建外挂模块)
  - `tests/test_sso_auth_delegator.py` (新建单元测试)
- **核心实现要点：**
  1. `verify_sso_ticket(ticket: str, secret: str, ttl: int = 60) -> Optional[Dict[str, Any]]`:
     - 解析 base64url/json 格式票据；
     - 校验 HMAC-SHA256 签名，防御时序攻击 (`hmac.compare_digest`)；
     - 校验时间戳与有效期（当前时间在 `[nbf - drift, exp + drift]` 之间）；
     - 验签成功返回解密用户信息，否则返回 None。
  2. `authenticate_via_agent_platform(username: str, password: str, api_base_url: str, timeout: float = 3.0) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]`:
     - 使用 `httpx` 发送 `POST {api_base_url}/api/identity/session`；
     - 严格设置 3 秒超时，避免阻塞 ASGI 事件循环；
     - 返回三元组：`(is_authenticated, user_payload, error_msg)`。
- **验证项：**
  - 单测覆盖：正常票据通过、过期票据拦截、篡改签名拦截、穿透鉴权成功/失败/超时降级。

---

## 阶段二：服务端外挂路由与中间件拦截 (Task 2)

### Task 2: 改造 `run_lightrag_webui_server.py` 服务端入口与中间件
- **目标：** 彻底拔除自动签发 admin 的高危漏洞，无缝挂载 SSO 票据兑换逻辑与 `/login` 委托穿透拦截。
- **改动文件：**
  - `run_lightrag_webui_server.py`
- **核心实现要点：**
  1. **清除伪 SSO 隐患：** 彻底删除第 1332-1340 行无条件签发 1 年期 `admin` Token 的代码，恢复未认证状态的安全防线。
  2. **拦截 `/login` 路由：**
     - 包装原生 FastAPI `/login` 端点；
     - 优先核对本地 `AUTH_ACCOUNTS`（静态紧急运维通道）；
     - 未命中时，调用 `sso_auth_delegator.authenticate_via_agent_platform` 委托 Agent 平台核验；
     - 核验通过直接调用官方 `auth_handler.create_token(username=username)` 签发原生合法的 LightRAG JWT。
  3. **挂载 `/auth/sso-exchange` 端点或 WebUI 初始中间件：**
     - 当用户带着 `?sso_ticket=...` 访问 WebUI HTML 时，中间件验签通过直接生成原生 Token，安全写入响应 Cookie 和存储注入脚本；
     - 增加 REST 接口 `POST /auth/sso-exchange` 支持前端异步兑换。
- **验证项：**
  - 不带参数访问 `/webui` 不再自动变 admin，能正确展示登录界面；
  - 携带有效 `sso_ticket` 访问直接自动登录并保留真实用户名。

---

## 阶段三：前端 WebUI 体验升级与会话治理 (Task 3)

### Task 3: 前端 WebUI 登录交互与 SSO 票据自动兑换闭环
- **目标：** 用户在浏览器使用体验平滑顺畅，支持 URL 票据自动兑换，提供友好的错误提示。
- **改动文件：**
  - `lightrag_webui/src/features/LoginPage.tsx`
  - `lightrag_webui/src/lib/loginIdentity.ts`
- **核心实现要点：**
  1. **SSO 票据探测与兑换：**
     - 在 `LoginPage` 挂载时，解析 URL Search Params 中的 `sso_ticket`；
     - 若存在，自动发起兑换请求，成功后调用 `activateLoginIdentityFromToken` 并直接重定向至目标页面；
     - 兑换失败展示清晰的 Toast 提示（如“免密登录票据已过期，请重新从主平台进入”），清除 URL 脏参数。
  2. **登录错误提示优化：**
     - 区分 401（账号或密码错误）与 503（主平台身份中心不可用），避免误导用户。
  3. **退出登录清理：**
     - 点击登出时，彻底清除 Cookie 与 LocalStorage 中的残留 Ticket 与 Token，防止返回按钮产生缓存问题。
- **验证项：**
  - 前端静态类型检查 (`npm run type-check` 或 `yarn build:check`) 0 报错；
  - 前端单元测试回归通过。

---

## 阶段四：生产宿主机部署与 4 级全量流水线闭环 (Task 4)

### Task 4: 宿主机环境配置固化、服务重启与 4 级生产流水线全量验收
- **目标：** 在 `sshmy2` 生产宿主机上固化环境变量、重启守护服务、运行端到端探针。
- **执行环境：** `sshmy2` (Golden Host)
- **核心实施步骤：**
  1. 更新 `/home/ubuntu/lightrag-v2-exploration/LightRAG/.env` 配置；
  2. 重启生产守护进程：`sudo systemctl restart rag-webui.service`；
  3. 运行 Level 1 ~ 4 生产验收流水线（详见 `verification.md`）；
  4. 验证与 `ai-agent-platform` 和 `mlflow-eval-platform` 的端到端多系统联调。
- **交付验收标准：**
  - `git status --porcelain lightrag/` 严格为空（0 侵入）；
  - `systemctl status rag-webui.service` 处于 active (running)；
  - 跨系统实测通过并生成完整验收记录。
