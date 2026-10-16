# 平台级 LightRAG 前端适配实施任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 平台端前端契约梳理与 OpenAPI/REST 网关补全 | [x] 已完成 | sshmy2 |
| Task 1.2: 平台端 `platform-web` 原生知识库管理页面开发 | [x] 已完成 | 本地/sshmy2 |
| Task 1.3: 检索调试沙盒与 Docling 可信页码定位器组件集成 | [x] 已完成 | 本地/sshmy2 |
| Task 2.1: LightRAG WebUI (9621) 多租户动态工作区中继服务 | [x] 已完成 | sshmy2 |
| Task 2.2: 原生 WebUI 生产控制台增强（CAS 发布与快照回退） | [x] 已完成 | sshmy2 |
| Task 3.1: 平台与 LightRAG 前端双向鉴权与 SSO 免登联调 | [x] 已完成 | 本地/sshmy2 |


---

## 任务详情

### Task 1.1: 平台端前端契约梳理与 OpenAPI/REST 网关补全
- **改动内容：** 确保 FastMCP 网关（端口 8001）对外暴露规范标准的 REST 代理端点（兼容 `platform-api` 中定义的 `documents`, `jobs`, `capabilities`, `stats`, `graph`），以便前端直接或通过 API 转发调用。
- **代码位置：** `gateway_mcp_server.py` → 扩展 HTTP Endpoint
- **预期结果：** 前端可通过 HTTP 标准 GET/POST 访问文档列表、提交任务、查询状态和图谱子图。
- **验证项：** `curl -H "Authorization: Bearer <token>" http://127.0.0.1:8001/api/documents` 返回合法 JSON。
- **状态：** `[x]` 已完成

### Task 1.2: 平台端 `platform-web` 原生知识库管理页面开发
- **改动内容：** 在 `apps/platform-web` 建立 `modules/knowledge` 模块，新增项目知识库管理入口，实现文档上传、列表展示、解析状态轮询与删除。
- **代码位置：** `apps/platform-web/src/modules/knowledge/pages/ProjectKnowledgePage.vue`
- **预期结果：** 用户在平台左侧导航点击“项目知识库”，能够清晰浏览已入库文档，并支持直接拖拽上传。
- **验证项：** `pnpm --filter platform-web build` 编译 0 报错，页面渲染正常。
- **状态：** `[x]` 已完成

### Task 1.3: 检索调试沙盒与 Docling 可信页码定位器组件集成
- **改动内容：** 开发检索问答 Playground 组件，支持输入 Query，选择 hybrid/local/global/naive 模式并调节 Top-K；展示命中切片，并高亮渲染 Docling Locator（第 X 页 / 第 X 页幻灯片）。
- **代码位置：** `apps/platform-web/src/modules/knowledge/components/KnowledgePlayground.vue`
- **预期结果：** 即时返回召回 chunks 与大模型生成回答，点击切片可直达对应文档页码。
- **验证项：** 平台前端 E2E 检索联调通过，切片定位准确无误。
- **状态：** `[x]` 已完成

### Task 2.1: LightRAG WebUI (9621) 多租户动态工作区中继服务
- **改动内容：** 改造 `run_lightrag_webui_server.py`，摆脱单目录写死限制，引入动态 Tenant/Project 路由与工作区解析中间件。
- **代码位置：** `run_lightrag_webui_server.py` → 动态工作区注入
- **预期结果：** 9621 端口可通过 URL 参数或 Header 动态切换访问指定租户和项目的 `active` 知识库。
- **验证项：** 切换项目 ID 后，WebUI 能够动态加载对应项目的实体与图谱数据。
- **状态：** `[x]` 已完成

### Task 2.2: 原生 WebUI 生产控制台增强（CAS 发布与快照回退）
- **改动内容：** 在原生 WebUI 中增加对候选版本（Candidate）的监控卡片与 CAS 激活按钮，以及快照管理与一键恢复功能。
- **代码位置：** `run_lightrag_webui_server.py` → 运维路由 `/ops` 与前端悬浮 Overlay 控制中心
- **预期结果：** 运维管理员可在 Web 界面直观看到新版本构建状态，并执行零停机切换或异常秒级回滚。
- **验证项：** 在 Web 控制台触发回滚，底层软链原子切换至前一版本。
- **状态：** `[x]` 已完成

### Task 3.1: 平台与 LightRAG 前端双向鉴权与 SSO 免登联调
- **改动内容：** 实现从平台端“控制面 / 高级知识工程”一键携带 JWT Token 安全免登跳转至 LightRAG 控制台。
- **代码位置：** `run_lightrag_webui_server.py` 鉴权中间件 & `ProjectKnowledgePage.vue` 图谱控制台入口
- **预期结果：** 身份无缝流转，免去二次登录，非授权用户被拦截拒绝。
- **验证项：** 平台知识库页面点击“图谱控制台 (9621)”一键在新标签页安全免密开启指定项目的图谱。
- **状态：** `[x]` 已完成

