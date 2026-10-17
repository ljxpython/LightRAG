# 任务列表：企业级知识库运营平台重构

## 进度追踪

| Phase | Task | 模块 | 状态 | 负责环境 |
|---|---|---|---|---|
| **Phase 1** | Task 1.1: 企业级 App Shell 侧边导航与全局布局 | 前端框架 | [x] 已完成 | local / sshmy2 |
| **Phase 1** | Task 1.2: 顶栏工作区/租户统一上下文与状态机持久化 | 前端框架 | [x] 已完成 | local / sshmy2 |
| **Phase 2** | Task 2.1: 知识资产中枢目录树与文档元数据增强 | 文档中心 | [x] 已完成 | local / sshmy2 |
| **Phase 2** | Task 2.2: 沉浸式双栏文档检视器 (原文 vs 切片对照) | 文档中心 | [x] 已完成 | local / sshmy2 |
| **Phase 2** | Task 2.3: 后台流水线任务实时监控与错误重试面板 | 文档中心 | [x] 已完成 | local / sshmy2 |
| **Phase 3** | Task 3.1: 检索控制台多会话管理与会话持久化 | 智能工作台 | [x] 已完成 | local / sshmy2 |
| **Phase 3** | Task 3.2: RAG 对比实验台 (Playground 双栏并排评测) | 智能工作台 | [x] 已完成 | local / sshmy2 |
| **Phase 4** | Task 4.1: 版本发布控制台 (CAS 发布 / 候选沙箱可视化) | 版本发布 | [x] 已完成 | local / sshmy2 |
| **Phase 4** | Task 4.2: 秒级快照回滚与签名完整性验证面板 | 版本发布 | [x] 已完成 | local / sshmy2 |
| **Phase 5** | Task 5.1: 实体驱动知识图谱局部探索器 2.0 | 图谱工坊 | [x] 已完成 | local / sshmy2 |
| **Phase 5** | Task 5.2: 知识库资产大盘与指标监控 Dashboard | 资产大盘 | [x] 已完成 | local / sshmy2 |

---

## 阶段详情

### Phase 1: 企业级 App Shell 骨架与工作区上下文
- **Task 1.1: 企业级 App Shell 侧边导航与全局布局**
  - **改动内容：** 替换当前顶栏单薄 Tab，构建支持一键收起/展开的现代企业级 Sidebar（包含 5 大板块入口、深浅色模式切换、工作区卡片、系统状态探针）。
  - **代码位置：** `lightrag_webui/src/components/layout/AppSidebar.tsx`, `App.tsx`
  - **预期结果：** 具备 Dify / Supabase 级的清爽中后台沉浸式侧边栏体验，响应式自适应。
  - **验证项：** 折叠展开动画流畅，当前激活路由状态高亮，单元测试 635 passed 全绿。
  - **状态：** `[x]` 已完成

- **Task 1.2: 顶栏工作区/租户统一上下文与状态机持久化**
  - **改动内容：** 将 `useWorkspaceStore` 与 `localStorage` 进行 `persist` 持久化，所有路由与网络请求统一自动携带工作区标头。
  - **代码位置：** `lightrag_webui/src/stores/workspace.ts`, `ProjectSelector.tsx`
  - **预期结果：** 页面硬刷新不再丢失选中的工作区，多租户多项目秒级平滑切换。
  - **验证项：** 刷新浏览器后状态保持不变，接口请求头带齐 `X-Project-Id`。
  - **状态：** `[x]` 已完成

### Phase 2: 知识资产中枢 (Knowledge Hub 2.0)
- **Task 2.1: 知识资产中枢目录树与文档元数据增强**
  - **改动内容：** 支持在文档管理左侧展现树形分类（文件夹/业务标签），支持批量移动与标签筛选。
  - **代码位置：** `lightrag_webui/src/features/documents/FolderTree.tsx`, `DocumentManager.tsx`, `folderStore.ts`
  - **预期结果：** 海量文档井井有条，支持按业务模块分类查看。
  - **验证项：** 分类树增删改查正常，文档筛选联动无延迟。
  - **状态：** `[x]` 已完成

- **Task 2.2: 沉浸式双栏文档检视器 (Document Inspector)**
  - **改动内容：** 对接 `/ops/documents/{doc_id}/content`，左侧全尺寸展示文档渲染内容，右侧展示解析切片、Token 计数与提取实体。
  - **代码位置：** `lightrag_webui/src/components/documents/DocumentInspector.tsx`
  - **预期结果：** 管理员能够一眼看出“原文是哪一段” ➔ “切成了哪几个切片” ➔ “提取了什么实体”。
  - **验证项：** 双栏同步滚动联动高亮，切片快速复制可用。
  - **状态：** `[x]` 已完成

- **Task 2.3: 后台流水线任务实时监控与错误重试面板**
  - **改动内容：** 将文档抽取流水线进度结构化展示（Parsing ➔ Extracting ➔ Embedding ➔ Merging），展示失败文档堆栈与一键重试。
  - **代码位置：** `lightrag_webui/src/features/documents/PipelineMonitor.tsx`
  - **预期结果：** 任务状态透明化，再也不会有“不知道后台在干什么”的焦虑。
  - **验证项：** 批量入库时步骤状态实时驱动更新。
  - **状态：** `[x]` 已完成

### Phase 3: 智能工作台与 RAG 对比实验台
- **Task 3.1: 检索控制台多会话管理与会话持久化**
  - **改动内容：** 在检索对话页面增加左侧历史会话抽屉（Session Drawer），支持新建对话、历史会话切换、重命名与持久化存储。
  - **代码位置：** `lightrag_webui/src/features/retrieval/SessionManager.tsx`, `useQuerySession.ts`
  - **预期结果：** 具备 ChatGPT / Claude 一致的多会话管理体验。
  - **验证项：** 历史会话切换秒级还原上下文，单测覆盖。

- **Task 3.2: RAG 对比实验台 (Playground 双栏并排评测)**
  - **改动内容：** 专为企业管理员研发的 Playground 分屏模式。支持输入同一个 Query，双栏并排运行不同模式（如 Hybrid vs Mix）并对比回答差异与召回证据。
  - **代码位置：** `lightrag_webui/src/features/retrieval/RagPlayground.tsx`
  - **预期结果：** 管理员无需人工肉眼反复切换参数测试，并排即可直观得出最佳检索参数配置。
  - **验证项：** 并发发出两次查询，双栏独立渲染且互不影响。

### Phase 4: 版本发布总线与快照管理
- **Task 4.1: 版本发布控制台 (CAS 发布 / 候选沙箱可视化)**
  - **改动内容：** 对接 `/ops/candidates` 与 `/ops/candidates/activate`，可视化展示候选沙箱待发布内容，提供一键原子切换生产。
  - **代码位置：** `lightrag_webui/src/features/release/ReleaseConsole.tsx`
  - **预期结果：** 知识更新发布具有严肃的审批发布仪式感。
  - **验证项：** 点击发布调用 CAS 原子切换，线上无缝切换无停机。

- **Task 4.2: 秒级快照回滚与签名完整性验证面板**
  - **改动内容：** 对接 `/ops/snapshots` 与 `/ops/snapshots/rollback`，展示历史版本时间轴、SHA-256 签名封印状态与一键原子回滚按钮。
  - **代码位置：** `lightrag_webui/src/features/release/SnapshotHistory.tsx`
  - **预期结果：** 误操作或脏知识入库时，管理员可在 10 毫秒内回滚至任意历史安全快照。
  - **验证项：** 回滚后动态代理即刻加载对应版本，图谱与检索同步回退。

### Phase 5: 知识图谱工坊 2.0 与资产看板
- **Task 5.1: 实体驱动知识图谱局部探索器 2.0**
  - **改动内容：** 改造当前全量毛线球渲染，改为“实体中心化搜索 ➔ 局部 N 度拓展 ➔ 类型分色高亮 ➔ 关联文档反向追踪”。
  - **代码位置：** `lightrag_webui/src/features/graph/GraphStudio.tsx`
  - **预期结果：** 极大降低图谱渲染压力，图谱成为真正可业务下钻的知识网络。
  - **验证项：** 搜索实体平滑缩放聚焦，关联切片展示无误。

- **Task 5.2: 知识库资产大盘与指标监控 Dashboard**
  - **改动内容：** 对接 `/ops/metrics/overview`，以可视化卡片展示全库实体、关系、切片总量与系统健康度。
  - **代码位置：** `lightrag_webui/src/features/dashboard/DashboardOverview.tsx`
  - **预期结果：** 首页即呈现高大上的企业级数据中台大盘。
  - **验证项：** 资产数据统计准确，图表渲染正常。
