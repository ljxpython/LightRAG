# 专项规划：ai-agent-platform 与 LightRAG 生产底座全量端到端联合验收

- **时间：** 2026-10-16
- **目标：** 使用 `./scripts/local-stack.sh` 平台真实运行服务，跨网络贯通 `sshmy2:8001` LightRAG 8-Tool FastMCP 知识网关，完成从上层平台 API、Runtime Agent 到网关的真实全量端到端验收。
- **影响模块：**
  - `ai-agent-platform/scripts/local-stack.sh` (平台栈生命周期)
  - `ai-agent-platform/.local-stack/runtime.env` (MCP连接配置)
  - `ai-agent-platform/.local-stack/platform.env` (平台知识库绑定)
  - `apps/runtime-service/src/runtime_service/tools/mcp.py` (工具适配与只读安全断言)
  - `LightRAG/gateway_mcp_server.py` (sshmy2 8001 FastMCP 注解与契约实现)
- **状态：** 实施中

---

## 方案概述

本专项旨在彻底消除“单元测试全通但真实系统脱节”的隐患，将 `ai-agent-platform` 本地多进程常驻栈（`runtime-api`, `runtime-worker`, `platform-api`, `platform-web`）与腾讯云 `sshmy2`（Ubuntu 24.04）上运行的 LightRAG 1.5.8 FastMCP 生产网关进行真实跨网络贯通。

### 核心验收链路

```
[Platform Web / API]
        │ (1. 平台发起会话/测试)
        ▼
[Runtime Service (LangGraph Worker)]
        │ (2. load_mcp_tools 解析 8 大工具，校验 readOnlyHint & schema)
        ▼
[Streamable HTTP / 端口 8001] (外网直连/反向隧道)
        │ (3. POST /mcp 握手与工具调用)
        ▼
[LightRAG FastMCP Gateway (sshmy2)]
        │ (4. TenantWorkspaceManager 租约获取与 LightRAG 1.5.8 hybrid 检索)
        ▼
[NetworkX 图谱 + Docling 真实 Locator 反查]
        │ (5. 返回 sources_version=2, preview, structured_content)
        ▼
[Runtime Middleware] ──> [Platform Agent 组织回答并给出可信引用]
```

### 关键约束与安全规范
1. **老平台 0 代码修改**：平台端核心代码保持原样，严格遵守平台的只读安全断言（`readOnlyHint is True`）。
2. **官方核心 0 行侵入**：LightRAG 官方开源核心目录 `lightrag/` 严禁改动。
3. **真实端到端**：执行真实平台栈 API、通过真实 Agent 发起知识检索、提取真实图谱子图与真实文档列表。
