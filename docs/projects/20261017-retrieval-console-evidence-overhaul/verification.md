# 验证记录

## Phase 验证（每个 Task 完成后）

### Task 1.1 - 1.4: 前端核心组件重构与单元测试验证
- **测试环境：** 本地 bun test (lightrag_webui)
- **实测结果：** 635 个测试全部通过（635 pass, 0 fail, 1882 expect() calls）
- **重点覆盖模块：**
  - `QuerySettings.test.tsx`: 6/6 全部通过（包括 scope notice、touch target、tap toggle、outside dismiss）
  - `QueryComposer.test.tsx`: 7/7 全部通过（包括 alert role、draft retention、editing persistence）
  - `RetrievalView.test.tsx`: 1/1 通过（包括 padding bottom clearance 严格匹配）
  - `streamedContentKey.test.tsx`: 8/8 通过（包括 follow-scroll 与 response timer）
  - `queryEntryAlignment.test.tsx`: 18/18 通过

### Task 1.5: 构建打包与生产部署
- **打包耗时：** `pnpm --dir lightrag_webui run build` 用时 1.53s 完成编译
- **产物同步：** rsync 增量同步 `lightrag/api/webui/` 至 `sshmy2:/home/ubuntu/lightrag-v2-exploration/LightRAG/lightrag/api/webui/`
- **上游零侵入护栏：** `git status --porcelain lightrag/` 始终保持为空，香港大学原生核心源码 0 侵入。

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] WebUI 前端单元测试：`bun test` 635/635 全部通过
- [x] 后端核心测试：`uv run --with pytest --with pytest-asyncio pytest tests/test_*.py -v` 全部通过

### Level 2: 平台 FastMCP 契约兼容性
- [x] FastMCP 8 大核心工具接口矩阵在端口 8001 正常注册并提供服务，与平台端契约零改动、100% 兼容。

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/` 返回 `HTTP/1.1 200 OK`
- [x] 静态打包文件探活：`curl -sI http://127.0.0.1:9621/webui/assets/index-CCXO2urF.js` 返回 `HTTP/1.1 200 OK`
- [x] 检索页面阅读行宽受控：对话流与输入框居中约束在 `max-w-4xl mx-auto w-full`（~896px），超宽屏不再有无限横向拉伸失控。
- [x] 侧边栏折叠展开交互：支持一键收起为 48px 竖向导轨，释放 95%+ 全屏视野；展开态分为「核心模式与预设」、「召回配额与 Token」、「调试与流式选项」三大卡片组。
- [x] 模式切换胶囊：输入框上方支持 `[Mix 融合] [Hybrid 混合] [Global 全局] [Local 局部] [Naive 切片] [Bypass 直通]` 极速切换。
- [x] 证据溯源抽屉 (EvidenceDrawer)：点击消息操作栏「证据溯源」按钮从右侧滑出抽屉，结构化展示命中切片、文件名、文件格式 Badge、上下文摘要与知识图谱实体。

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-service` 状态为 `active (running)`
- [x] `systemctl status rag-webui` 状态为 `active (running)`
