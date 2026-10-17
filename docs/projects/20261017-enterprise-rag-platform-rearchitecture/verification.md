# 验证记录：企业级知识库运营平台重构

## Phase 验证标准

每个阶段（Phase 1 至 Phase 5）完成后，必须满足以下硬性验收条件：
1. 本地前端单元测试通过：`npm test` 0 fail；
2. 构建产物完整可运行：`npm run build` 打包无警告无报错；
3. 同步至 `sshmy2` 后重启 `rag-webui.service`，服务 active 且无报错日志；
4. 香港大学上游核心源码 `lightrag/` 保持 0 侵入（`git status --porcelain lightrag/` 为空）；
5. 现场真实接口端到端探活通过。

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [ ] WebUI 前端单元测试全量通过
- [ ] 后端核心测试 `pytest tests/test_*.py` 全部通过

### Level 2: 平台 FastMCP 契约兼容性
- [ ] FastMCP 8 大工具网关在端口 8001 正常运行，消费契约 100% 稳定兼容

### Level 3: 双轨服务健康度与端到端
- [ ] WebUI 首页与 AppShell 访问探活正常：`curl -sI http://127.0.0.1:9621/webui/` 返回 200
- [ ] 多工作区切换平滑无刷新，请求头隔离参数注入正常
- [ ] 双栏文档检视器、Playground 评测台、版本发布总线交互完整

### Level 4: 守护与进程稳定性
- [ ] `systemctl status rag-service` 状态为 active (running)
- [ ] `systemctl status rag-webui` 状态为 active (running)

---

## 阶段验收记录

### Phase 1 验收（Task 1.1 & Task 1.2）✅ 2026-10-17
- **测试环境：** 本地 Vitest + 黄金宿主机 `sshmy2` (Ubuntu 24.04)
- **前端单测实测：** `635 passed, 0 fail`（用时 4.70s）
- **构建打包实测：** `npm run build` 用时 2.23s 成功生成产物
- **宿主机端到端探活：**
  - 服务状态：`systemctl is-active rag-webui` 输出 `active`
  - WebUI 首页：`curl -sI http://127.0.0.1:9621/webui/` 返回 `HTTP/1.1 200 OK`
- **上游核心护栏：** `git status --porcelain lightrag/` 完全为空，上游源码保持 0 侵入。
- **验证成果：**
  - 成功落地方案 B 现代清爽企业级 App Shell 侧边栏（`AppSidebar`），支持 64px 紧凑折叠与 220px 展开；
  - 挂载 5 大业务板块（`Dashboard`、`Knowledge Hub`、`Graph Studio`、`Chat Studio`、`Release Control`）；
  - `useWorkspaceStore` 成功完成 `persist` 本地存储绑定，页面刷新不丢失选中项目；
  - 提供了 Phase 1 的 `DashboardOverview` 资产卡片与 `ReleaseConsole` 版本发布中控。

### Phase 2 验收（Task 2.1, 2.2, 2.3）✅ 2026-10-17
- **测试环境：** 本地 Vitest + 黄金宿主机 `sshmy2` (Ubuntu 24.04)
- **前端单测实测：** `640 passed, 0 fail`（含新增 5 个 `folderStore` 状态机单测全部绿灯）
- **构建打包实测：** `npm run build` 用时 1.77s 成功生成产物
- **宿主机现场端到端探活：**
  - 服务状态：`systemctl is-active rag-webui.service` 输出 `active`
  - WebUI 首页：`curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9621/webui/` 返回 `200`
  - 后端网关：`systemctl is-active rag-service.service` 输出 `active` (8001 端口契约保持 100% 兼容)
- **上游核心护栏：** `git status --porcelain lightrag/` 完全为空，上游源码保持 0 侵入。
- **验证成果：**
  - **Task 2.1 知识分类与文件夹导航树**（`FolderTree.tsx` & `folderStore.ts`）：支持业务分类管理、新建/重命名文件夹、按文件夹与状态快速筛选、批量移至文件夹；
  - **Task 2.2 沉浸式双栏文档检视器**（`DocumentInspector.tsx`）：全屏/宽屏双栏对照、正文行号与关键词高亮、切片流（Chunk 流、Tokens 消耗、实体 Badge、一键复制）；
  - **Task 2.3 后台流水线任务实时监控与错误重试**（`PipelineMonitor.tsx`）：结构化 4 阶段流水线步骤条（Parsing ➔ Extracting ➔ Embedding ➔ Ready）、实时进度指示、流水线实时控制台日志与一键中断。
### Phase 3 & Phase 4 及视觉对齐验收 ✅ 2026-10-17
- **测试环境：** 本地 Vitest/Bun + 黄金宿主机 `sshmy2` (Ubuntu 24.04 现场闭环)
- **前端单测实测：** `sshmy2` 宿主机现场实跑 `646 passed, 0 fail`（含新增 `chatSessionStore.test.ts` 与 `SnapshotHistory.test.tsx` 全部全绿）
- **构建打包实测：** `npm run build` 用时 1.76s 生成最新稳定优化产物
- **宿主机端到端探活：**
  - WebUI 服务：`systemctl is-active rag-webui.service` 输出 `active`
  - 探针检查：`curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9621/webui/` 返回 `200`
  - FastMCP 网关：8001 端口契约保持 100% 稳定兼容，零破坏性变更
- **上游核心护栏：** `git status --porcelain lightrag/` 完全为空，上游核心源码保持 0 侵入。
- **视觉深度优化与实机截图对齐（全面对标 Style B 现代卡片风）：**
  1. **顶栏去 Demo 化**：彻底移除了顶栏中间冗余单薄的【文档】【图谱】【检索】Tabs；替换为企业级全局知识检索条（`🔍 全局检索切片、实体或业务文档... ⌘K`）与模块面包屑路径；
  2. **替换企业专属标识**：设计并投产全新现代多维知识晶体与神经拓扑渐变 Logo（`EnterpriseLogo.tsx` 及 `assets/logo.svg`），彻底替换全站小黄猫与蓝星 Demo 标识；
  3. **知识资产大盘（Dashboard）**：大盘彻底解除居中留白，增加 4 大资产指标卡片、4 宫格快捷行动矩阵、最新知识文档入库流以及核心系统治理面板；
  4. **知识中心（Knowledge Hub）高保真重构**：
     - 顶部增加 4 大现代卡片（Documents、Knowledge Entities、Relationships、Avg Latency）；
     - 左侧 Folders 目录树增加搜索框 `Search folders...`、业务分类计数以及底部磨砂引导卡片；
     - 整合表格 Header：嵌入优雅的流水线阶段指示（Parse ➔ Extract ➔ Embedding ➔ Ready）与检视器入口；
  5. **智能工作台（Chat Studio & Playground）**：左侧折叠会话抽屉（支持新建、切换、重命名与持久化存储）、双栏并发 RAG 对比实验台（Playground）；
  6. **版本发布与快照治理总线（Release Control）**：当前活跃版本与物理路径状态、待发布候选沙箱一键 CAS 原子发布、历史版本 SHA-256 完整性封印时间轴与秒级原子回退二次确认面板。
