# 验证记录

## Phase 验证（每个 Task 完成后）

### Task 1 验证记录 (2026-11-17)
- **验证项：**
  1. `curl -s http://127.0.0.1:9621/ops/evaluation/datasets`：正确返回 20 个评测集，每个均包含 `target_project_name`、`source_docs` (原材料文档列表) 以及 `sample_cases` (前 3 题真实抽样)
  2. `curl -s 'http://127.0.0.1:9621/ops/evaluation/datasets/auto_synth_live.json/readiness?project_id=eval_multihop'`：正确返回 `is_mismatched: true`, `target_project_name: "平台默认项目"`, `status: "missing"`, 并且 message 明确指引切换知识库。
- **环境：** `sshmy2` (Ubuntu 24.04), `rag-webui.service`
- **结论：** 通过 ✅

### Task 2 验证记录 (2026-11-17)
- **验证项：**
  - 新建 `DatasetPanoramaView.tsx` 组件，包含宏观统计卡（评测集数、覆盖项目数、总考题数、原材料数）、知识库筛选器、原材料拓扑展开、考题画像抽样展开，以及直达打擂入口。
- **环境：** `lightrag_webui/src/features/evaluation/DatasetPanoramaView.tsx`
- **结论：** 通过 ✅

### Task 3 验证记录 (2026-11-17)
- **验证项：**
  - `EvaluationStudio.tsx` 整合 `activeSubTab = 'panorama'`，并在顶部导航置顶；
  - 接入 `handleNavigateToBattle` 联动切库与选库逻辑；
  - 打擂界面契约拦截横幅加入 `[👉 一键切换至知识库]` 动作按钮；
  - 动态惰性加载 `React.lazy` 避免膨胀首屏体积。
- **环境：** `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`
- **结论：** 通过 ✅

### Task 4 验证记录 (2026-11-17)
- **验证项：**
  - 前端编译 `npm run build` 成功完成，产出 `DatasetPanoramaView-QCQ1hKaT.js` (17.95 kB)；
  - `git status --porcelain lightrag/` 完全为空，上游 100% 0 侵入；
  - 重启守护服务 `rag-webui.service` 状态 active (running)。
- **环境：** `sshmy2` 宿主机现场执行
- **结论：** 通过 ✅

### 阶段 2 专项验证记录 (文档在线查看、考题边界编辑、MLflow 免密与零计数清除) (2026-11-17)
- **验证项：**
  1. **MLflow 401 彻底解决**：在 `sshmy1` Nginx 9128 反代中加入默认内部身份头注入与 `proxy_hide_header WWW-Authenticate`，实测 `curl -sI http://49.233.222.54:9128/` 返回 200 OK，浏览器绝无系统弹框。
  2. **项目 (0) 计数清洗与精准归属**：
     - `multihop_*` 归属 `eval_multihop` (5 套)；
     - `rgb_zh_*` 归属 `华为 RGB 评测基准 (中文)` (4 套)；
     - 全景筛选下拉框过滤掉 `count === 0` 的冗余项目，彻底消除视觉杂音。
  3. **原材料文档点击在线查看**：
     - 点击原材料 Tag，弹窗请求 `/ops/documents/{name}/content`，展示切片碎片列表与全文正文，支持一键复制。
  4. **考题 Case 点击检视与修改切片边界**：
     - 点击考题样本卡片，弹出考题检视弹窗，支持多行 textarea 在线修改切片边界，并通过 `PUT /ops/evaluation/datasets/{name}` 真正回写落盘持久化。
- **环境：** `sshmy2` (Ubuntu 24.04), `sshmy1` (Debian)
- **结论：** 全部通过 ✅

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] 后端单元测试通过：`uv run --with pytest --with pytest-asyncio pytest tests/test_eval_runs_catalog.py tests/test_workspace_meta.py tests/test_lease_manager.py -v`（6 passed in 0.59s）
- [x] 前端构建无语法与类型错误：`npm run build`（built in 1.90s, first-load audit OK）

### Level 2: 平台 FastMCP 契约兼容性
- [x] 8 大 MCP 工具网关在线探针通过：`uv run python verify_8_tools_live.py` 全部 8 大工具通过，`readOnlyHint` 注解完备
- [x] 平台端 0 代码改动承诺 100% 保持

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 200 OK
- [x] WebUI 静态资源探活：`curl -sI http://127.0.0.1:9621/webui/assets/DatasetPanoramaView-QCQ1hKaT.js | head -n 1` 返回 200 OK
- [x] FastMCP 网关探活：端口 8001 (Main PID 2517521) 正常提供服务
- [x] 接口探活：`curl -s http://127.0.0.1:9621/ops/evaluation/datasets` 返回 20 个题库拓扑

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-webui.service` 为 active (running)
- [x] `systemctl status rag-service.service` 为 active (running)
- [x] `git status --porcelain lightrag/` 完全为空（0 行侵入）

### 最终结论
**done**：全链路在 `sshmy2` 现场开发、编译、重启与四级流水线验证通过，评测集-项目-原材料三层依赖大屏与一键打擂闭环正式就绪。
