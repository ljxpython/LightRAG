# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1: 后端评测集元数据与原材料关系接口增强 | [x] 已完成 | sshmy2 |
| Task 2: 独立全景组件 `DatasetPanoramaView.tsx`（项目-评测集-材料三层关系与指标） | [x] 已完成 | sshmy2 |
| Task 3: 评测工坊 SubTab 整合与一键前往打擂联动 | [x] 已完成 | sshmy2 |
| Task 4: 4 级生产流水线验证与系统收尾（含 Upstream Guard） | [x] 已完成 | sshmy2 |

---

## 任务详情

### Task 1: 后端评测集元数据与原材料关系接口增强
- **改动内容：**
  - 在 `run_lightrag_webui_server.py` 的 `list_evaluation_datasets` 增强返回元数据：
    - `target_project_id`, `target_project_name`, `is_benchmark`
    - `source_docs`: 列出该题库依赖的原材料文档清单
    - `sample_cases`: 抽取前 3 题用于画像抽样检视
  - 在 `check_evaluation_readiness` 探针中返回 `target_project_id`, `target_project_name`, `is_mismatched: bool`。
- **代码位置：** `run_lightrag_webui_server.py` → `list_evaluation_datasets`, `check_evaluation_readiness`
- **预期结果：** 请求 `/ops/evaluation/datasets` 时返回完整的题库-知识库-原材料映射，且 readiness 包含母体知识库信息。
- **验证项：** 在 `sshmy2` 上运行 `curl -s http://127.0.0.1:9621/ops/evaluation/datasets | jq .datasets[0]` 检查输出。
- **状态：** `[x]` 已完成 (2026-11-17)

---

### Task 2: 独立全景组件 `DatasetPanoramaView.tsx`（项目-评测集-材料三层关系与指标）
- **改动内容：**
  - 在 `lightrag_webui/src/features/evaluation/` 新建 `DatasetPanoramaView.tsx`；
  - 顶部指标总览卡片：统计评测集总数、关联知识库数、考题总数、原材料文档总数；
  - 知识库筛选器：支持按项目筛选（全部、各个具体知识库、全局通用基准）；
  - 评测集卡片/矩阵视图：
    - 展示三层关系：`知识库项目 -> 评测集名称 -> 原材料文档列表`；
    - 原材料就绪度：实时探测在当前知识库或母体知识库的存在性（🟢 在库 / 🔴 缺失）；
    - 指标与考题抽样：折叠抽屉检视考题、标准答案 Ground Truth、支撑上下文；
  - 动作入口：`[🚀 前往评测打擂]` 按钮，触发回调 `onSelectForBattle(datasetName, targetProjectId)`。
- **代码位置：** `lightrag_webui/src/features/evaluation/DatasetPanoramaView.tsx`
- **预期结果：** 独立渲染完整的资产全景大屏，数据三层关系清晰透彻。
- **验证项：** 前端构建无语法与类型错误。
- **状态：** `[x]` 已完成 (2026-11-17)

---

### Task 3: 评测工坊 SubTab 整合与一键前往打擂联动
- **改动内容：**
  - 在 `EvaluationStudio.tsx` 中升级 `activeSubTab`，新增 `'panorama'` 并作为首个 Tab；
  - 实现 `handleNavigateToBattle(datasetName, targetProjectId)`：
    - 若 `targetProjectId` 与当前知识库不一致，自动调用 `POST /ops/workspaces/select` + `setCurrentWorkspace` 切换知识库；
    - 切换 SubTab 到 `'cases'`（矩阵打擂台）；
    - 预选中该评测集，自动触发就绪检测（原材料 100% 具备，绿色指示灯点亮）；
  - 在现有的打擂界面红色拦截条中，同步补齐 `[👉 一键切换至知识库: {target_project_name}]` 快速脱困动作。
- **代码位置：** `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`
- **预期结果：** 在全景页面点击【前往打擂】，页面自动完成切库、切 Tab、选好题库，直接就绪开跑！
- **验证项：** 全链路点击交互测试正常，就绪状态直接转绿。
- **状态：** `[x]` 已完成 (2026-11-17)

---

### Task 4: 4 级生产流水线验证与系统收尾（含 Upstream Guard）
- **改动内容：**
  - 编译前端 `npm run build` 并同步静态资产至 `lightrag/api/webui/`；
  - 执行 `git status --porcelain lightrag/` 坚守 0 侵入底线；
  - 重启守护服务 `sudo systemctl restart rag-webui.service`；
  - 执行 4 级生产流水线验证并输出四态判定。
- **代码位置：** `lightrag_webui/`, `run_lightrag_webui_server.py`
- **预期结果：** 生产服务 active (running)，全部测试与接口探针通过。
- **验证项：** `verify-change` 4 级流水线全部通过。
- **状态：** `[x]` 已完成 (2026-11-17)
