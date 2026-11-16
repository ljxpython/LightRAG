# 任务列表 (Task Breakdown)

## 进度追踪

| Task | 状态 | 核心模块 | 负责环境 |
|---|---|---|---|
| Task 1.1: 终结子进程全缓冲与实时日志推流 | [x] 已完成 | `run_lightrag_webui_server.py` | sshmy2 |
| Task 1.2: 脚本层强制行缓冲与阶段进度打点 | [x] 已完成 | `dataset_generator.py` & `deepeval_runner.py` | sshmy2 |
| Task 2.1: 单用例 4 指标 `asyncio.gather` 并行与 45s 熔断保护 | [x] 已完成 | `evaluation/deepeval_runner.py` | sshmy2 |
| Task 2.2: 用例级协程并发池、429 指数退避与极速抽样模式 | [x] 已完成 | `evaluation/deepeval_runner.py` | sshmy2 |
| Task 3.1: 矩阵打擂动态 Run/Experiment ID 捕获与全量对比 URL 组装 | [x] 已完成 | `run_lightrag_webui_server.py` & `deepeval_runner.py` | sshmy2 |
| Task 4.1: 前端题库下拉 `<optgroup>` 智能血缘分类 | [x] 已完成 | `EvaluationStudio.tsx` | sshmy2 / Local |
| Task 4.2: 矩阵打擂模态框升级（极速/全量单选 + 流式日志抽屉） | [x] 已完成 | `EvaluationStudio.tsx` | sshmy2 / Local |
| Task 4.3: MLflow Compare-Runs 精准对比一键直达 | [x] 已完成 | `EvaluationStudio.tsx` | sshmy2 / Local |
| Task 4.4: 前端静态资产编译构建与生产 WebUI 同步 | [x] 已完成 | `lightrag_webui` & 生产静态目录 | sshmy2 |
| Task 5.1: 4 级生产流水线全量验收与真实打擂留痕 | [x] 已完成 | 全系统 | sshmy2 |

---

## 任务详情

### Task 1.1: 终结子进程全缓冲与实时日志推流
- **改动内容：** 
  1. 在 `run_lightrag_webui_server.py` 的 `_run_dataset_generate_bg` 与 `_run_matrix_evaluation_bg` 中注入 `-u` 与 `PYTHONUNBUFFERED="1"`；
  2. 增加流式 `readline()` 循环中对结构化进度标签 `[PROGRESS: <百分比>]` 的正则提取。
- **状态：** `[x]` 已完成

---

### Task 1.2: 脚本层强制行缓冲与阶段进度打点
- **改动内容：** 
  1. 在 `evaluation/dataset_generator.py` 与 `evaluation/deepeval_runner.py` 脚本最顶层加入 `sys.stdout.reconfigure(line_buffering=True)`；
  2. 所有对外输出显式使用 `flush=True` 并打印 `[PROGRESS: xx%]`。
- **状态：** `[x]` 已完成

---

### Task 2.1: 单用例 4 指标 `asyncio.gather` 并行与 45s 熔断保护
- **改动内容：** 
  1. 重构 `evaluation/deepeval_runner.py` 的 `evaluate_single_case_deepeval`；
  2. 4 指标通过 `asyncio.gather` 并行执行，单指标套上 `asyncio.wait_for(..., timeout=45.0)` 熔断保护。
- **状态：** `[x]` 已完成

---

### Task 2.2: 用例级协程并发池、429 指数退避与极速抽样模式
- **改动内容：** 
  1. 在 `CustomDeepEvalLLM.a_generate` 中添加遭遇 429 速率限制的指数退避抖动重试；
  2. `run_deepeval_suite` 使用 `asyncio.Semaphore(concurrency=2)` 协程池并发驱动；
  3. 支持 `--limit 5` 极速抽样打擂模式。
- **状态：** `[x]` 已完成

---

### Task 3.1: 矩阵打擂动态 Run/Experiment ID 捕获与全量对比 URL 组装
- **改动内容：** 
  1. `mlflow_adapter.py` 输出 `[MLFLOW_RUN] run_id=<id> experiment_id=<exp_id>`；
  2. 父进程动态提取所有参赛 Run ID 与真实 Experiment ID，组装完整 `compare-runs` 链接。
- **状态：** `[x]` 已完成

---

### Task 4.1: 前端题库下拉 `<optgroup>` 智能血缘分类
- **改动内容：** 
  在 `EvaluationStudio.tsx` 中使用 HTML `<optgroup>` 将题库原生智能归类为专属题库、平台基准与其他题库。
- **状态：** `[x]` 已完成

---

### Task 4.2: 矩阵打擂模态框升级（极速/全量单选 + 流式日志抽屉）
- **改动内容：** 
  在模态框增加单选模式卡片与运行中实时终端流式日志窗格。
- **状态：** `[x]` 已完成

---

### Task 4.3: MLflow Compare-Runs 精准对比一键直达
- **改动内容：** 
  打擂完成后渲染直达按钮 `🔥 查看本次打擂对比大屏 (Compare Runs)`，新窗口秒级直达。
- **状态：** `[x]` 已完成

---

### Task 4.4: 前端静态资产编译构建与生产 WebUI 同步
- **改动内容：** 
  在 `sshmy2` 上运行 `npm run build`，编译产物输出至 `lightrag/api/webui/`，重启守护进程即刻生效。
- **状态：** `[x]` 已完成

---

### Task 5.1: 4 级生产流水线全量验收与真实打擂留痕
- **改动内容：** 
  在 `sshmy2` 宿主机现场跑通 4 级流水线，真实矩阵打擂产生 2 组 Run 并在 MLflow 建立比对视图。
- **状态：** `[x]` 已完成
