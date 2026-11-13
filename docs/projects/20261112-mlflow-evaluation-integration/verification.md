# 验证记录: LightRAG 与 MLflow 评测中台双轨闭环与全景基准集演化

## Phase 验证（每个 Task 完成后记录）

### Phase 1: 服务打通与适配层建设
- **Task 1.1 实测：** 在 `sshmy2` 上安装 `mlflow==3.18.0`，探针测试 `http://49.233.222.54:9128`，成功返回当前 Experiment 列表，REST API 双向畅通。
- **Task 1.2 实测：** 完成 `evaluation/mlflow_adapter.py`，封装 `MLflowEvaluationTracker`。处理了 MLflow 远程 Artifact 文件路径权限限制，使用 `artifact_location=f"mlflow-artifacts:/{self.experiment_name}"` 实现客户端代理上传，零入侵服务端。

### Phase 2: 评测框架适配与首轮现场上报
- **Task 2.1 实测：** `evaluation/runner.py` 参数解析与 MLflow 管道集成完毕，支持 `--mlflow`, `--no-mlflow`, `--experiment-name`。
- **Task 2.2 实测：** `evaluation/deepeval_runner.py` 成功注入 MLflow 上报管道，支持记录 4 项断言评分、超参数，并生成包含用例详情和扣分理由的大表。
- **Task 2.3 实测：** 在 `sshmy2` 宿主机现场运行 `evaluation/deepeval_runner.py --project eval_benchmark --limit 2 --mlflow` 跑通测试，耗时约 4 分钟。
  - MLflow 实验名：`lightrag-benchmark-suite` (ID: 11)
  - Run ID: `d8eb704ba1a646679e9a4cf7d7a982a2`
  - 访问链接: `http://49.233.222.54:9128/#/experiments/11/runs/d8eb704ba1a646679e9a4cf7d7a982a2`
  - 指标落库: `faithfulness: 1.0`, `answer_relevancy: 0.7722`, `contextual_recall: 1.0`, `contextual_precision: 0.2381`, `pass_rate: 0.0`
  - 工件落库: `deepeval_cases.json`, `deepeval_report_20261112_211716.csv`, `deepeval_report_20261112_211716.json`
  - **Browser-Skill 真实核验**: 通过 `bsk` 命令行工具控制真实浏览器，成功进入 EvalFlow Run 详情页，并打开 `deepeval_cases.json` 预览大表，现场查验了每一道题的扣分诊断理由（Reasoning），截图存证于 `mlflow_evalflow_run_evidence.png`。

### Phase 3: 全景评测集构建与基准演化
- **Task 3.1 实测：** <!-- 记录 dataset_generator.py 合成生成结果 -->
- **Task 3.2 实测：** <!-- 记录 comprehensive_benchmark.json 结构与用例统计 -->
- **Task 3.3 实测：** <!-- 记录 MLflow 平台上 mix vs naive 对比打擂结果 -->

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [ ] `git status --porcelain lightrag/` 完全为空，上游核心源码保持 0 侵入。
- [ ] 评测外挂包与依赖隔离良好，不影响主服务运行。

### Level 2: 平台端 0 破坏与契约兼容
- [ ] `mlflow-eval-platform` 宿主机 `sshmy1` 现有服务不受任何破坏，保持 HTTP 200。
- [ ] FastMCP 8 大工具网关契约 0 破坏。

### Level 3: 双轨服务健康度与端到端
- [ ] `sshmy2` 上 WebUI (9621) 与 FastMCP (8001) systemd 守护进程状态为 active (running)。
- [ ] `sshmy1` 上 `mlflow-eval` (5000/9128) 守护进程状态为 active (running)。

### Level 4: 跨网络真实全链路验收
- [ ] `sshmy2` 发起真实评测，数据成功写入 `sshmy1:9128`，前端 UI 可正常查看指标走势、评估参数与 Badcase 扣分详情。

### 最终结论
<!-- 待全量执行后给出 done / partial / blocked 结论 -->
