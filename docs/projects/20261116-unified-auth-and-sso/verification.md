# 知识库统一认证与单点登录验证规范 (verification.md)

- **项目名称：** 知识库统一认证与单点登录体系 (Unified Auth & Cross-System SSO)
- **基准环境：** `sshmy2` (Golden Host) & 本地工作区
- **验收目标：** 确保 Agent 平台账号无感免密进入 LightRAG，直接账密登录 LightRAG 穿透验证成功，上游官方库 0 侵入。

---

## 4 级生产验收流水线

### Level 1: 静态检查与防污染红线门禁 (Static & Upstream Guard)
- [ ] **上游 0 侵入红线校验：**
  ```bash
  git status --porcelain lightrag/
  ```
  **判定准则：** 输出必须**绝对为空**！严禁改动 `lightrag/` 官方核心代码的任何单字符。
- [ ] **Python 代码质量与类型规范：**
  ```bash
  uv run flake8 sso_auth_delegator.py run_lightrag_webui_server.py --count --select=E9,F63,F7,F82 --show-source --statistics
  ```
- [ ] **前端 TypeScript 静态检查：**
  ```bash
  cd lightrag_webui && npm run type-check (或 tsc --noEmit)
  ```
  **判定准则：** 0 errors，0 warnings。

---

## Level 2: 单元与契约测试套件 (Unit & Contract Tests)
- [ ] **外挂 SSO 票据验签单测：**
  - 测试用例 1：有效 Presigned Ticket 成功解析出 username/role/tenant_id。
  - 测试用例 2：过期 Ticket（超过 60 秒）被严格拒绝并返回 None。
  - 测试用例 3：伪造 HMAC 签名的非法 Ticket 被拦截防御。
- [ ] **Agent 平台穿透鉴权单测：**
  - 测试用例 4：Mock Agent Platform 返回 200 时，签发合法原生 LightRAG JWT。
  - 测试用例 5：Mock Agent Platform 返回 401 时，精准响应 401 Invalid Credentials。
  - 测试用例 6：Mock Agent Platform 超时或不可用时，优雅降级返回 503 Service Unavailable，无异常崩溃。
- [ ] **运行命令：**
  ```bash
  uv run --with pytest --with pytest-asyncio pytest tests/test_sso_auth_delegator.py -v
  ```
  **判定准则：** 所有用例 100% 通过（PASSED）。

---

## Level 3: 宿主机服务与端到端实测 (Golden Host Live Probe)
- [ ] **守护进程状态检查：**
  ```bash
  ssh sshmy2 "systemctl status rag-webui.service"
  ```
  **判定准则：** 状态必须为 `active (running)`，无重启抖动。
- [ ] **端口与健康探针：**
  ```bash
  ssh sshmy2 "curl -sI http://127.0.0.1:9621/auth-status"
  ```
  **判定准则：** HTTP 200 OK，返回 `auth_configured: true`。
- [ ] **未带 Token 访问防线检查：**
  ```bash
  ssh sshmy2 "curl -sI http://127.0.0.1:9621/webui"
  ```
  **判定准则：** 不再自动注入 `admin` Cookie，未登录状态返回正常 HTML，前端路由定向至登录页面。
- [ ] **账密直接登录接口实测：**
  ```bash
  ssh sshmy2 "curl -s -X POST http://127.0.0.1:9621/login -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin123456\"}'"
  ```
  **判定准则：** 返回 200 OK 且包含有效的 `access_token`。

---

## Level 4: 跨系统全链路集成验收 (Cross-System E2E)
- [ ] **场景 1 (免密直通)：**
  - 从 `ai-agent-platform` 界面点击“知识库”入口；
  - 观察浏览器跳转后无任何账密弹窗，秒级进入知识库主界面；
  - 顶栏右上角正确展示登录用户的用户名（如当前登录平台的张三、李四）；
  - 点击“退出登录”，安全回到登录页，历史会话安全清理。
- [ ] **场景 2 (独立直连登录)：**
  - 独立打开 `http://49.233.222.54:9621/webui/#/login`；
  - 输入 AI Agent 平台刚创建的测试账号及密码；
  - 点击登录，成功登入知识库，功能完整可用；
  - 输入错误密码，提示“账号或密码错误”。
- [ ] **场景 3 (密码联动验证)：**
  - 在 AI Agent 平台修改该用户密码；
  - 回到 LightRAG 知识库，使用新密码立即成功登录，旧密码即刻失效。

---

## 终态四态判定标准

| 判定状态 | 准入条件 | 后续动作 |
|---|---|---|
| **PASS (全部合规)** | Level 1~4 全绿，官方库 0 侵入，双场景端到端实测完全畅通 | 允许向用户提请部署合并与归档 |
| **CONDITIONAL PASS (带条件通过)** | 核心功能正常，个别边缘网络重试或日志格式微调待优化 | 补充针对性补丁后提请确认 |
| **BLOCKED (阻断性故障)** | 宿主机进程异常、Agent 平台穿透鉴权超时假死或官方源码被污染 | 立即熔断并触发回滚预案 |
| **FAILED (失败)** | 核心逻辑严重缺陷，无法兑换票据或账密鉴权错误 | 全量回退改动并重新设计 |

---

## 应急回滚预案 (Rollback Playbook)

若上线过程中出现未知阻塞性故障，立即执行以下三步快速恢复原生状态：
1. **代码回滚：**
   ```bash
   ssh sshmy2 "cd /home/ubuntu/lightrag-v2-exploration/LightRAG && git checkout run_lightrag_webui_server.py && rm -f sso_auth_delegator.py"
   ```
2. **配置恢复：**
   注释掉 `.env` 中的 `SSO_SECRET_KEY` 与 `AGENT_PLATFORM_API_URL`。
3. **服务重载：**
   ```bash
   ssh sshmy2 "sudo systemctl restart rag-webui.service"
   ```
   耗时小于 5 秒，系统无缝恢复为原静态 admin 模式。
