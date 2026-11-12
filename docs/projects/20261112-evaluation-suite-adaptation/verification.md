# 验证记录: 独立外挂式多租户 RAGAS 评测套件

## Phase 验证（每个 Task 完成后）

### Task 1 验证通过: 外挂目录骨架与语料迁移就绪
- **实测结果：** `sshmy2` 上 `evaluation/documents/` 成功托管 5 篇 Markdown，`evaluation/datasets/` 成功建立 `sample_lightrag.json` 与 `business_qa.json`。

### Task 2 验证通过: 评测文档原料一键灌库完成
- **实测结果：** `sshmy2` 上运行 `evaluation/ingest_samples.py --project eval_benchmark` 成功注入 5 篇语料，`eval_benchmark` 库内 12 篇文档全部处于 `processed` 状态，知识图谱与向量索引就绪。

### Task 3 验证通过: 外挂评测引擎与 CLI 调度器重构就绪
- **实测结果：** `sshmy2` 上运行 `evaluation/runner.py --help` 成功输出原生 `--project`, `--dataset`, `--concurrency` 参数，多租户隔离与自动 JWT 鉴权就绪，Bypass-N 补丁与 NaN 容错装配完毕。

### Task 4 验证通过: RAGAS 全量 6 题评测现场跑通
- **实测结果：**
  - 测试用例：6/6 全部成功执行 (100% 成功率)
  - 平均 Context Recall: **1.0000** (满分全量召回)
  - 平均 Faithfulness: **0.9729** (高保真无幻觉)
  - 平均 RAGAS Score: **0.7417**
  - 产出报表：`evaluation/results/ragas_report_20261112_181649.csv` 与 `.json`

### Task 5 验证通过: DeepEval 工业级断言与扣分诊断评测就绪
- **实测结果：**
  - 在 `evaluation/.eval_venv` 独立沙箱成功部署 `deepeval==4.3.4` 与 `langchain-openai`；
  - 全量 6 题评测流水线 100% 跑通无中断，平均 Faithfulness 达 **1.0000**（满分高保真），平均 Contextual Recall 达 **1.0000**（满分覆盖召回），平均 Answer Relevancy 达 **0.8929**；
  - 成功输出深层扣分诊断原因（Reason），手术刀式精准指出了切片排序（Contextual Precision = 0.2794）被无关 API 切片阻断的排序问题，为系统调优提供了无可替代的排查线索；
  - 完整结果落地为 `deepeval_report_20261112_183739.csv` 与 `.json`。

### Task 6 验证通过: 评测执行器高级参数全量暴露与现场实测
- **实测结果：**
  - `evaluation/runner.py` 与 `evaluation/deepeval_runner.py` 全量扩展 CLI 参数：`--mode`, `--top-k`, `--chunk-top-k`, `--enable-rerank`, `--no-rerank`, `--user-prompt`, `--max-total-tokens`；
  - 经用户授权安全清理根目录下残留的历史脚本 `run_ragas_evaluation.py`；
  - 在 `sshmy2` 宿主机现场以 `--mode naive --chunk-top-k 10 --no-rerank --limit 1` 实测通过，完整验证超参数控制流水线；
  - 产出完整使用说明与打擂实战手册至 `evaluation/README.md`。




## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [ ] `pytest tests/ -v` 全部通过，现有单测 0 破坏，`git status --porcelain lightrag/` 保持完全为空。

### Level 2: 平台 FastMCP 契约兼容性
- [ ] 8 大 MCP 工具签名与平台调用契约 0 破坏，`verify_8_tools_live.py` 探针全绿。

### Level 3: 双轨服务健康度与端到端
- [ ] WebUI 原生探活：`curl -s http://127.0.0.1:9621/health` 返回 healthy
- [ ] FastMCP 网关探活：端口 8001 正常通信

### Level 4: 独立外挂评测全流水线验收 (sshmy2 现场)
- [ ] 原料灌入：`python evaluation/ingest_samples.py --project eval_benchmark` 成功入库 5 篇文档
- [ ] 评测出分：`python evaluation/runner.py --project eval_benchmark --dataset evaluation/datasets/sample_lightrag.json`
- [ ] 结果输出：`evaluation/results/` 目录下生成合规的 CSV 与 JSON 报告，各维度平均分达到标准 (Faithfulness > 0.80, Context Recall > 0.80)

### 最终结论
<!-- 待全量执行后给出 done / partial / blocked 结论 -->
