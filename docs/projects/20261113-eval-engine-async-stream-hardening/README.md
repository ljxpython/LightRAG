# 评测引擎真异步高并发与流式推流攻坚 (Eval Engine Async & Stream Hardening)

- **时间：** 2026-11-13
- **目标：** 彻底终结后台出题与打擂进程管道全缓冲假死陷阱，重构 DeepEval Runner 为真异步高并发与极速抽样打擂池，打通 MLflow 精确 Compare Runs 看板与题库分组交互闭环。
- **影响模块：**
  - `run_lightrag_webui_server.py`（子进程无缓冲推流机制、任务进度精准状态机、MLflow 对比链接自动装配）
  - `evaluation/deepeval_runner.py`（单题多指标 `asyncio.gather` 并行评测、用例级协程并发池、极速抽样打擂）
  - `evaluation/dataset_generator.py`（控制台实时刷新与阶段步长精准打点）
  - `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`（题库 `<optgroup>` 智能血缘分组、极速抽样/全量打擂选项、打擂实时流式控制台、Compare-Runs 直达）
- **状态：** 规划中

---

## 核心承诺 (Architecture Invariants)

- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 `_ResultV2` / 平台 JWT 鉴权契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 核心源码保持 100% 纯净，随时无冲突 `git merge upstream/main`）
- **真实生产闭环：** 所有修改与验证均在 `sshmy2`（Ubuntu 24.04）现场运行真实子进程、拉取真实切片与上报真实 MLflow，杜绝一切脑补与伪造数据。

---

## 方案深度剖析与架构决策

### 1. 痛点一：Python 子进程管道全缓冲假死陷阱 (P0)
- **底层原理**：Python 在标准输出重定向到 PIPE 时，`sys.stdout` 会由默认行缓冲（Line-buffered）切换为系统级 4KB/8KB 全缓冲（Block-buffered）。除非输出堆积满 4096 字节或子进程正常关闭，否则外部父进程的 `readline()` 会一直挂起阻塞。前端轮询拉取日志时呈现“死机”、“卡死在 25%”的糟糕体验。
- **治理策略**：
  1. 在父进程 `create_subprocess_exec` 时，强制在命令头注入 `-u` 选项（强制 stdin/stdout/stderr 均不缓冲），并在 `env` 中显式设置 `PYTHONUNBUFFERED="1"`。
  2. 在子进程核心输出位置（`print`）显式添加 `flush=True`，并设置 `sys.stdout.reconfigure(line_buffering=True)` 作为双重保底。

### 2. 痛点二：DeepEval 单线程伪异步与超长耗时瓶颈 (P0)
- **底层原理**：旧版 `deepeval_runner.py` 存在两处严重串行：
  1. 用例遍历虽套了 `async with semaphore:`，但外部是单线程 `for` 循环遍历，无法形成并行网络请求池；
  2. 单个测试用例内的 4 个独立指标（Faithfulness、AnswerRelevancy、ContextualRecall、ContextualPrecision）是逐个串行 `await`，单题需要串行等待 4 次大模型调用（约 12~15s）。31 题矩阵打擂需消耗 15~20 分钟！
- **治理策略**：
  1. **指标级并行**：单用例内的 4 个指标互无依赖，全部通过 `asyncio.gather` 并行执行，单用例评分耗时从 15s 骤降至 3s。
  2. **用例级并发池**：通过 `asyncio.Semaphore(concurrency=3~5)` 结合 `asyncio.gather(*[_eval_worker(idx, case) ...])` 构建真实协程并发池。
  3. **极速抽样选项**：提供 `--limit` 快速抽样参数，打擂弹窗默认提供“极速验证 (抽样 5 题，约 30s 出分)”与“全量深度打擂 (全部考题)”，极大提升日常交互调试效率。

### 3. 痛点三：评测工坊前端交互与 MLflow 横向对比闭环 (P1)
- **底层原理**：
  - 题库平铺下拉无法一眼识别当前项目专属题库；
  - 打擂完成后用户无法一键进入精准对比的 MLflow 视图；
  - 旧版设计存在硬编码实验 ID (`"11"`)、暴力截断对比 Run 数量 (`[:2]`)、以及写死公网 IP 的暗坑；
  - 缺少大模型 429 速率限制退避与单指标 45s 超时熔断防护；
  - 前端修改缺少静态资源构建同步环节。
- **治理策略**：
  1. 题库选择下拉框重构为 `<optgroup>`，智能分为“【本项目专属题库】”、“【平台通用基准】”与“【其他知识库题库】”；
  2. 矩阵打擂模态框升级为带流式日志窗口与极速/全量模式切换，打擂完成后一键跳转至携带动态捕获真实 `compare-runs?runs=[run1, run2, ...]&experiments=[exp_id]` 的专用对比大屏；
  3. 单用例 4 指标 `asyncio.gather` 增加 45s 超时熔断防护；`CustomDeepEvalLLM` 增加 429 指数退避重试；
  4. 增加前端编译构建流程，确保静态资源在 WebUI 容器中实时生效。
