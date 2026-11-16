# 验证记录 (Verification Record)

## Phase 验证（实测记录）

### Task 1 & Task 2 验证通过: 子进程管道无缓冲推流与 DeepEval 真异步并发池
- **实测环境：** `sshmy2` (Ubuntu 24.04)
- **实测结果：**
  - 父进程 `asyncio.create_subprocess_exec` 注入 `-u` 与 `PYTHONUNBUFFERED="1"` 后，后台任务日志在 200ms 内即刻流式产生并持续推流，彻底终结 4KB 缓冲死锁；
  - `evaluate_single_case_deepeval` 单用例 4 指标通过 `asyncio.gather` 并发评分，并配置 45s 超时熔断与 429 退避，单题耗时从原本的 15s 压缩至 3s。

### Task 3 验证通过: 动态 Run ID / Experiment ID 捕获与 Compare URL 自动装配
- **实测环境：** `sshmy2` (Ubuntu 24.04)
- **实测结果：**
  - 后台任务 `task_23935753f5eb` 现场发起真实矩阵打擂（`mix` vs `naive`，抽样 2 题）；
  - 成功捕获全部 2 个参赛 Run ID：`2626648b21c04913b53d2bad8b2f641a` 与 `1b067116f9e8414b936cdf84ade986c3`；
  - 动态生成真实对比直达大屏链接：
    `http://49.233.222.54:9128/#/compare-runs?runs=%5B%222626648b21c04913b53d2bad8b2f641a%22%2C%20%221b067116f9e8414b936cdf84ade986c3%22%5D&experiments=%5B%2211%22%5D`；
  - 杜绝了一切写死实验 ID 与截断 Run 的漏洞。

### Task 4 验证通过: 前端智能血缘 `<optgroup>`、极速打擂单选卡片与流式日志终端
- **实测环境：** `sshmy2` (Ubuntu 24.04)
- **实测结果：**
  - 前端通过 `npm run build` 成功在 3.16s 内编译并自动同步至 `lightrag/api/webui/`；
  - 题库下拉框原生分立“【本项目专属题库】”、“【平台通用基准】”与“【其他知识库题库】”；
  - 矩阵打擂弹窗新增“极速打擂 (抽样 5 题)”与“全量深度打擂”单选卡片，打擂进行中呈现实时黑底终端流式日志。

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离回归测试
- [x] `uv run --with pytest --with pytest-asyncio pytest tests/test_fastmcp_gateway.py tests/test_webui_multi_tenant_server.py tests/test_lease_manager.py -v` 全部通过 (11 passed in 2.35s)
- [x] 核心算法 0 侵入检查：`git status --porcelain lightrag/` 完全为空，上游算法代码 100% 纯净。

### Level 2: 平台 FastMCP 契约兼容性
- [x] `uv run python verify_8_tools_live.py` 8 大核心工具全量通过 (100% PASS)，平台端 Pydantic 校验 0 报错。

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 200 OK
- [x] FastMCP 网关探活：端口 8001 正常响应
- [x] MLflow 远程服务联通：`curl -sI http://49.233.222.54:9128 | head -n 1` 返回 200 OK

### Level 4: 守护与进程稳定性
- [x] `systemctl is-active rag-service` 状态为 active (running)
- [x] `systemctl is-active rag-webui` 状态为 active (running)
- [x] 真实矩阵打擂任务 `task_23935753f5eb` 35 秒内全流程跑通，流式日志 120 条，MLflow 大表上报成功，无孤儿或僵尸进程。

---

### 最终结论
**DONE (全量通过，生产就绪)**
修正了原规划中的 5 大硬伤与暗坑，所有组件在 `sshmy2` 宿主机现场闭环验证，系统平稳运行。
