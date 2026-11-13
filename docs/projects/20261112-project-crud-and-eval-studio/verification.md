# 验证记录: 项目管理闭环与 DeepEval 评测全链路工坊

## Phase 验证（每个 Task 完成后记录）

### Phase 1: 后端核心能力与异步调度引擎
- **Task 1.1 实测：**
  - 在 `sshmy2` 上测试新建项目：
    ```bash
    curl -s -X POST http://127.0.0.1:9621/ops/workspaces -H 'Content-Type: application/json' \
      -d '{"tenant_id": "__default", "project_id": "test_auto_crud", "name": "自动测试项目"}'
    ```
    输出返回 HTTP 200，物理目录生成 `active -> revisions/rev_1` 相对软链与 `meta.json`。
  - 在 `sshmy2` 上测试归档删除：
    ```bash
    curl -s -X DELETE http://127.0.0.1:9621/ops/workspaces/__default/test_auto_crud
    ```
    输出返回 HTTP 200，目录原子移动至 `sandbox_storage/.trash/__default_test_auto_crud_20261112_153623`，内存引擎缓存同步驱逐。
- **Task 1.2 实测：**
  - `GET /ops/evaluation/datasets` 成功返回 5 个题库列表，包含题量、签约项目与更新时间；
  - `GET /ops/evaluation/datasets/lineage_benchmark_v1.json` 正确解析并展示 2 道高阶考题与 `corpus_manifest`。
- **Task 1.3 实测：**
  - `POST /ops/evaluation/datasets/generate` 成功创建后台任务 `task_6a0a731992dc`，非阻塞异步执行，进度由 5% 稳步提升至 100%，落盘生成 `test_async_synth.json`。

### Phase 2: 评测工坊前端交互页面落地 (`/eval-studio`)
- **Task 2.1 实测：**
  - 访问 `http://152.136.27.196:9621/eval-studio` 返回 HTTP 200，Vue 3 单页应用秒级挂载；
  - 项目卡片正确显示所有已注册租户工作区与当前活动标识。
- **Task 2.2 实测：**
  - 评测集工坊选项卡展示签约项目、修订号与 SHA-256 文档指纹；
  - 卡片式考题在线编辑 Question 与 Ground Truth 正常响应，修改后支持一键写回磁盘。
- **Task 2.3 实测：**
  - 矩阵打擂控制台支持多选打擂模式（mix, naive, hybrid, local），支持实时日志流与 MLflow Compare 视图直达链接。

### Phase 3: WebUI 导航与端到端闭环验收
- **Task 3.1 实测：**
  - `/evalflow` 顶部控制台注入指向 `/eval-studio` 的直达按钮；
  - `/eval-studio` 顶部导航栏打通三端互通（LightRAG 控制台 ⇋ Eval Studio ⇋ EvalFlow 生产大盘）。
- **Task 3.2 实测：**
  - 调用 `/browser-skill` (`bsk`) 在真实浏览器中自动化执行各步骤并截取 5 张核心证据图：
    - `eval_studio_project_management.png`
    - `eval_studio_create_project_modal.png`
    - `eval_studio_testset_editor.png`
    - `eval_studio_synthesize_modal.png`
    - `eval_studio_matrix_battle.png`

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `git status --porcelain lightrag/` 完全为空，上游核心源码保持 0 侵入。
- [x] Python 编译与类型检查全部 PASS，无任何语法错误。

### Level 2: 平台 FastMCP 契约兼容性
- [x] 现有 8 大生产 FastMCP 工具签名保持不变，上层消费平台 0 影响。

### Level 3: 双轨服务健康度与端到端
- [x] `sshmy2` 上 WebUI (9621) 与 FastMCP (8001) 状态为 active (running)。
- [x] `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9621/eval-studio` 返回 200 OK。

### Level 4: 跨网络真实全链路验收与 UI 存证
- [x] 真实浏览器完成项目新建弹窗、评测集在线编辑、全生命周期 CRUD 增量探测弹窗与矩阵打擂控制台全量实测。
- [x] 产出 5 张关键证据截图存入项目 artifacts。

### 最终结论
**DONE (全量达成并通过全部验收标准)**

