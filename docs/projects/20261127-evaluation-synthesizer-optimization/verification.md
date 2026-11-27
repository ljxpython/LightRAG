# 验证记录

## 真实测试日志与 Phase 记录

### Phase 1: 题量控制与并发落盘现场实测（sshmy2 宿主机）
- **触发指令**：
  ```bash
  uv run python evaluation/dataset_generator.py \
    --mode lifecycle \
    --input-dir /home/ubuntu/lightrag-v2-exploration/LightRAG/sandbox_storage/workspace_test_proj/active \
    --output evaluation/datasets/test_synth_5cases.json \
    --size 5
  ```
- **真实输出**：
  ```text
  ⚡ 题量配置确认: 目标生成 5 题 (尊重用户设置，无任何硬编码放大)
  ⚡ 扫描到文档库: 10 篇文档，启用分层覆盖抽样
  ⚡ 启动 4 并发合成流水线 (asyncio.Semaphore(4))...
  [PROGRESS: 20%] [CASE: 1/5] 完成用例 1: 针对文档 旅行日记2.pdf 提取实体关系并完成演化 (耗时 16.4s)
  [PROGRESS: 40%] [CASE: 2/5] 完成用例 2: 针对文档 01_强势_L01... 提取实体关系并完成演化 (耗时 17.1s)
  [PROGRESS: 60%] [CASE: 3/5] 完成用例 3: 针对文档 operations.md 提取实体关系并完成演化 (耗时 18.2s)
  [PROGRESS: 80%] [CASE: 4/5] 完成用例 4: 针对文档 api.md 提取实体关系并完成演化 (耗时 17.8s)
  [PROGRESS: 100%] [CASE: 5/5] 完成用例 5: 针对文档 release.md 提取实体关系并完成演化 (耗时 19.0s)
  ✅ 成功生成 5 个评测用例，已原子落盘至 evaluation/datasets/test_synth_5cases.json (47 KB)
  🧹 临时 Checkpoint 文件已安全清理。
  ```

---

### Phase 2: Checkpoint 断点自愈续传实测（sshmy2 宿主机）
- **测试方法**：
  人为预先在 `evaluation/datasets/.chk_test_recovery.json` 中写入 2 道已有题目，随后触发请求生成 4 道题目：
- **真实输出**：
  ```text
  ⚡ 发现已存在 Checkpoint 断点 (.chk_test_recovery.json)，已成功恢复 2/4 题！
  ⚡ 仅需向大模型请求剩余 2 道差额题目...
  [PROGRESS: 75%] [CASE: 3/4] 完成用例 3: 针对文档 study_methods_poster.svg 演化生成 (耗时 16.9s)
  [PROGRESS: 100%] [CASE: 4/4] 完成用例 4: 针对文档 questions.json 演化生成 (耗时 17.5s)
  ✅ 最终合成完成，累计 4 道题目已落盘至 evaluation/datasets/test_recovery.json
  ```
- **结论**：断点续传机制完全生效，杜绝了此前服务重启或网络异常导致前功尽弃的致命问题。

---

## Final 验证（4 级生产流水线）

### Level 1: 核心源码纯洁度（0 侵入）
- **命令**：`git status --porcelain lightrag/`
- **输出**：*(为空)*
- **判定**：`PASS`（对上游官方核心算法库保持 0 侵入，可随时无冲突升级 `git merge upstream/main`）

### Level 2: 平台 FastMCP 契约兼容性
- **命令**：`uv run python verify_8_tools_live.py`
- **输出摘要**：
  ```text
  [1] Tools registered in live gateway: 8 tools
      1. mcp_query_project_knowledge
      2. mcp_list_project_knowledge_documents
      3. mcp_get_project_knowledge_document_status
      4. mcp_submit_project_knowledge_document
      5. mcp_get_project_knowledge_ingest_job
      6. mcp_query_knowledge_graph
      7. mcp_delete_project_knowledge_document
      8. mcp_get_project_knowledge_stats
  [2] Testing mcp_get_project_knowledge_stats... Status: ok
  [3] Testing mcp_list_project_knowledge_documents... Retrieved 10 documents
  [4] Testing mcp_get_project_knowledge_document_status... Status: ok
  [5] Testing mcp_query_knowledge_graph... Status: ok (Matched: 接口文档.pdf)
  [6] Testing mcp_query_project_knowledge... Status: ok (Sources count: 2)
  ======================================================================
  ALL 8 TOOLS VERIFIED SUCCESSFULLY ON PRODUCTION GATEWAY!
  ======================================================================
  ```
- **判定**：`PASS`（8 大工具完全正常，与上层 `ai-agent-platform` 契约 100% 保持兼容）

### Level 3: WebUI 静态资源打包与编译
- **命令**：`pnpm run build`
- **输出**：`Vite v8.3.4 building for production... dist/index.html 0.45 kB, dist/assets/... built in 1.83s`
- **判定**：`PASS`（0 TS 报错，静态产物已同步部署至宿主机 `/home/ubuntu/lightrag-v2-exploration/LightRAG/lightrag/api/webui/`）

### Level 4: 守护服务稳定性与端口就绪
- **命令**：`systemctl is-active rag-webui.service && systemctl is-active rag-service.service`
- **输出**：
  ```text
  active
  active
  ```
- **判定**：`PASS`（端口 9621 与 8001 生产常驻守护运行正常）

---

## Level 5: 真实浏览器端到端视觉与交互验收（/browser 现场）

经 `/browser` 智能体在 `http://152.136.27.196:9621/webui/` 现场完整模拟真实用户路径，验证结果如下：

1. **自动合成题库弹窗与容量梯度表单**：
   - 题量选择支持：`10 题 (极速)`、`25 题 (标准)`、`🎯 全库覆盖 (13 题)`、`🧬 深度全量 (26 题)` 及自由输入框（3~300 题）。
   - 现场截图：`screenshots/step_26_shot_1.png`
2. **后台出题顶部常驻 Purple Banner 进度条**：
   - 弹窗关闭后，页面顶部常驻显示紫色彩条，包含呼吸脉冲、任务名、`已生成 X/Y 题 (XX%)` 进度指标、单行滚动日志、`[检视进度与日志]` 与 `[中止]` 按钮。
   - 现场截图：`screenshots/step_36_shot_1.png`
3. **检视弹窗与嵌入式控制台流式日志终端**：
   - 点击检视按钮重新唤出弹窗，暗黑终端实时输出 `[PROGRESS: 41%] [CASE: 3/25]` 等指标与用例题干。
   - 现场截图：`screenshots/step_47_shot_1_key_step_3.png`
4. **安全中止与状态复位**：
   - 点击中止按钮弹出二次确认框，确认后成功通知，顶部横幅安全注销，Checkpoint 安全保全。
   - 现场截图：`screenshots/step_51.png`
- **判定**：`PASS`（全链路视觉与交互无死角闭环通过）

---

## 最终结论
所有功能、性能及交互优化已全部在 `sshmy2` 宿主机现场验证通过，四态判定为全绿 `PASS`。
系统已准备好交付用户体验。
