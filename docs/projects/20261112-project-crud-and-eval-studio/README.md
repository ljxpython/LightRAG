# 项目与评测全链路工坊 (Project Management & DeepEval Studio)

- **时间：** 2026-11-12
- **目标：** 补齐多租户项目生命周期管理（显式新建与安全归档删除），打造基于 DeepEval 的全生命周期评测工坊（CRUD 题库自动合成、前端在线可视化编辑、多参数矩阵打擂一键触发与 MLflow 联动）。
- **影响模块：** 
  - `workspace_manager.py` (项目物理创建、软删除与租约安全排空)
  - `run_lightrag_webui_server.py` (新增 `/ops` API 与 `/eval-studio` 交互工作台)
  - `evaluation/dataset_generator.py` (暴露评测集 CRUD 合成接口与编辑持久化)
  - `evaluation/deepeval_runner.py` (暴露矩阵打擂异步执行器)
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行代码修改（不破坏既有 FastMCP 8 大生产工具签名与契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 保持官方纯净，随时支持无缝升级）
- **高危操作防线：** 删除项目实行“租约排空校验 + 冷归档（Soft-Delete）”两道防线，杜绝粗暴 `rm -rf` 导致读死锁或误删知识库。

---

## 方案架构设计

```
[WebUI 导航 / EvalFlow 顶部控制台]
                │
                ▼
       [/eval-studio 评测工坊]
   ┌────────────┴─────────────┬──────────────────────────┐
   ▼                          ▼                          ▼
【1. 项目生命周期】       【2. 评测集可视化编辑工坊】    【3. 矩阵打擂触发器】
 • 显式新建项目           • 题库列表与详情浏览          • 多模式勾选 (mix vs naive)
 • 优雅归档删除           • 在线修改 Question/GT        • 异步执行与日志轮询
   │                          • 增删改差量自动合成          • 结果直通 MLflow 对比大屏
   ▼                          │                          │
[workspace_manager.py]        ▼                          ▼
 • CAS 初始软链           [dataset_generator.py]     [deepeval_runner.py]
 • ReaderLeaseManager      • 全生命周期 CRUD 探测     • 多参数 Parent-Child Runs
 • .trash/ 冷归档          • 华为 RGB 拒答负样本      • MLflow 实验 11 自动上报
```

### 1. 项目生命周期管理 (Project CRUD)
- **显式新建 (`POST /ops/workspaces`)**：
  接收 `{ tenant_id, project_id, name, description }`。在 `sandbox_storage/<tenant_id>/<project_id>/` 下创建标准物理骨架，生成默认 `project_meta.json`，原子建立 `active -> revisions/rev_1` 初始结构，并热加载至 `DynamicTenantRagProxy`。
- **安全删除 (`DELETE /ops/workspaces/{tenant_id}/{project_id}`)**：
  1. 调用 `ReaderLeaseManager` 检查该项目当前是否有在读查询，必须等待租约归零；
  2. 清理内存中该项目的 LightRAG 引擎缓存，释放底层存储句柄；
  3. 执行冷归档：将物理目录原子移动至 `sandbox_storage/.trash/{tenant_id}_{project_id}_{timestamp}`，提供可恢复后悔药，杜绝物理灾难。

### 2. 评测集全生命周期合成与在线编辑 (DeepEval Testset Studio)
- **异步合成任务调度 (`POST /ops/evaluation/datasets/generate`)**：
  - 接收 `{ project_id, size, incremental: bool, base_dataset: str }`；
  - 启动后台任务（FastAPI BackgroundTasks），避免同步调用耗时过长导致网关 504 超时；
  - 客户端通过 `GET /ops/evaluation/tasks/{task_id}` 轮询进度百分比与日志；
  - 严格保持已实现的 CRUD 差量规则：新增切片出多跳题，变更切片重审答案，删除文档自动转为华为 RGB 负样本拒答题。
- **评测集在线可视化编辑 (`GET / PUT /ops/evaluation/datasets/{dataset_name}`)**：
  - 前端以卡片/表格方式呈现考题列表；
  - 支持直接编辑 Question、Ground Truth、Evolution Type；
  - 支持删除无效考题、新增自定义边界考题；
  - 保存时自动重新计算题目指纹并持久化回写至 `evaluation/datasets/`，同步保持 `corpus_manifest` 血缘契约。

### 3. 多参数矩阵打擂一键触发器 (Matrix Battle Runner)
- **异步打擂调度 (`POST /ops/evaluation/matrix-run`)**：
  - 接收 `{ project_id, dataset, matrix_mode: ["mix", "naive"], top_k: [40], limit: int }`；
  - 后台拉起 `deepeval_runner.py`，实时记录执行日志；
  - 打擂完成自动返回 MLflow 平台直达链接：
    `http://49.233.222.54:9128/#/compare-runs?runs=[run_mix,run_naive]&experiments=[11]`。

### 4. 前端交互与页面承载 (`/eval-studio`)
- 在 `run_lightrag_webui_server.py` 注册 `/eval-studio` 页面：
  - 现代响应式深色/浅色沉浸式设计（原生 Vue3 + TailwindCSS CDN，无额外前端打包构建复杂性，热重载）；
  - 顶部导航无缝打通：`[LightRAG 控制台]` ⇋ `[评测工坊 Eval Studio]` ⇋ `[MLflow 生产大盘]`；
  - 涵盖三合一控制台：项目管理面板、评测集可视化编辑工坊、矩阵打擂运行器。
