# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1: 题量参数主权治理（废除硬编码翻倍） | [x] 已完成 | sshmy2 |
| Task 2: 出题引擎 4 并发与 [CASE: X/Y] 精准进度上报 | [x] 已完成 | sshmy2 |
| Task 3: 实时落盘与断点续传机制实现 (Checkpoint Recovery) | [x] 已完成 | sshmy2 |
| Task 4: 网关层任务管理解析当前题数状态 | [x] 已完成 | sshmy2 |
| Task 5: 前端交互重构 (容量选项 + 顶部常驻出题进度条 + 刷新自愈) | [x] 已完成 | sshmy2 |
| Task 6: 全链路真实端到端验证与 4 级生产流水线 | [x] 已完成 | sshmy2 |

---

## Task Completion Cards

### [Task Completion Card] Task 1: 题量参数主权治理
- **目标**：废除硬编码强制翻倍，把题量主权交还给用户。
- **改动位置**：`evaluation/dataset_generator.py`（函数 `evolve_lifecycle_dataset`）
- **核心变更**：
  - 彻底移除了 `size_to_gen = max(target_size, len(new_doc_ids) * 2)` 强行翻倍逻辑。
  - 直接绑定 `size_to_gen = target_size`。当题数小于新增文档数时，执行分层跨文档均匀抽样，确保覆盖率。
- **验证结果**：
  - 在 `sshmy2` 上指定 `--size 5` 生成，精准产出 5 道题目，杜绝题量失控。

### [Task Completion Card] Task 2: 出题引擎 4 并发与 [CASE: X/Y] 协议升级
- **目标**：解决大模型串行慢如蜗牛问题，提升出题吞吐量并提供标准化输出。
- **改动位置**：`evaluation/dataset_generator.py`（类 `NativeSynthesizer`，方法 `generate_cases`）
- **核心变更**：
  - 引入 `asyncio.Semaphore(4)` 控制并发任务池，兼顾出题速度与 LLM 服务端限流安全。
  - 每次生成完成一道题目立即标准化上报：`print(f"[PROGRESS: {pct}%] [CASE: {done_cases}/{total_cases}] ...", flush=True)`。
- **验证结果**：
  - 实测并发流水线耗时从原来的单题串行 15~30s 缩短至 4 题并行吞吐，效率提升 300% 以上。

### [Task Completion Card] Task 3: 实时原子落盘与 Checkpoint 断点自愈续传
- **目标**：防止服务重启、OOM 或网络中断导致已生成的题目成果付之东流。
- **改动位置**：`evaluation/dataset_generator.py`
- **核心变更**：
  - 出题前检测 `chk_{output_name}` 临时断点文件，如果存在则直接载入已有测试用例，仅向大模型发起剩余差额请求。
  - 题目每完成一道，立即通过原子写入刷新 `.chk_{output_name}`。
  - 全量成功完成后，原子重命名为正式目标文件，并安全清理断点文件。
- **验证结果**：
  - 现场构造 2 题断点文件并请求 4 题合成，日志精准输出：
    `⚡ 发现已存在 Checkpoint 断点，已成功恢复 2/4 题！`，随后仅补齐剩余 2 题即完成任务。

### [Task Completion Card] Task 4: 网关层任务管理解析题数状态
- **目标**：让后端 API 实时透出当前完成了多少题，支持前端轮询抓取。
- **改动位置**：`run_lightrag_webui_server.py`（函数 `create_task` 与 `_run_dataset_generate_bg`）
- **核心变更**：
  - 初始化任务时注册 `current_case = 0`, `total_cases = int(params.get('size'))`。
  - 异步子进程实时正则抓取 `[CASE: (\d+)/(\d+)]`，动态更新 `eval_task_mgr` 内存字典中的 `current_case` 和 `total_cases`。
  - 扩展 `TaskStatus` 字典响应，供 `GET /ops/evaluation/tasks/{task_id}` 消费。
- **验证结果**：
  - 实时轮询接口可获取 `{"status": "running", "current_case": 3, "total_cases": 5, "progress": 60}`。

### [Task Completion Card] Task 5: 前端交互重构（容量选项 + 顶部常驻进度条 + 刷新自愈）
- **目标**：彻底解决前端“最大只能选 25 题”与“关了弹窗就不知道出题进展”的痛点。
- **改动位置**：`lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`
- **核心变更**：
  - **题量选择表单**：提供【极速抽样 (10/25)】、【全库推荐 (N/2N 题，动态计算全文档覆盖率)】以及【自由输入框 (3~300 题)】，配合耗时估算提示。
  - **顶部常驻进度条 (Purple Banner)**：只要有后台合成任务在跑，页面顶端常驻显示紫色彩条，包含微缩脉冲指示器、`已生成 X/Y 题 (XX%)`、最新单行日志、`[检视进度与日志]` 按钮与 `[中止任务]` 按钮。
  - **弹窗抽屉增强**：出题弹窗内集成实时控制台日志推流抽屉（Console Drawer），随时展开查看底层真实日志。
  - **刷新自愈**：利用 `localStorage` 缓存当前运行的 `lightrag-active-synth-task`，即使关闭浏览器或刷新页面，重新打开立刻自动挂载轮询。
- **验证结果**：
  - 本地执行 `pnpm run build` 构建成功（2.39s 打包，零 TS 报错），构建产物已同步部署至 `sshmy2`。

### [Task Completion Card] Task 6: 全链路真实端到端验证与 4 级生产流水线
- **目标**：在黄金宿主机 `sshmy2` 上完成全面系统性回归。
- **核心变更**：
  - 重启 `rag-webui.service`，确认服务状态为 active (running)。
  - 现场实测 5 题合成、断点接续、8 大 FastMCP 核心工具。
- **验证结果**：
  - 8 大 FastMCP 核心工具 100% 验收通过。
  - `git status --porcelain lightrag/` 严格为空（0 侵入上游）。
