# 任务列表: 独立外挂式多租户 RAGAS 评测套件重构

## 进度追踪

| Task | 状态 | 负责环境 | 代码/文件产物 |
|---|---|---|---|
| Task 1: 建立独立外挂评测包骨架与原始文档迁移 | [x] 已完成 | 本地 / sshmy2 | `evaluation/documents/`, `evaluation/datasets/` |
| Task 2: 实现原料一键灌入工具 `ingest_samples.py` | [x] 已完成 | sshmy2 | `evaluation/ingest_samples.py` |
| Task 3: 重构 RAGAS 评测引擎 `engine.py` 与 `runner.py`（多租户/JWT/Verbose） | [x] 已完成 | sshmy2 | `evaluation/engine.py`, `evaluation/runner.py` |
| Task 4: 在 `sshmy2` 宿主机现场端到端灌库与全量 6 题 RAGAS 评测验证 | [x] 已完成 | sshmy2 | `evaluation/results/ragas_report_*.csv` |
| Task 5: 落地独立外挂式 DeepEval 工业级断言与扣分诊断评测套件 (`deepeval_runner.py`) | [x] 已完成 | 本地 / sshmy2 | `evaluation/deepeval_runner.py`, `evaluation/results/deepeval_report_*.csv` |
| Task 6: 评测执行器高级参数全量暴露（模式打擂/重排/配额）与规范归档 | [x] 已完成 | 本地 / sshmy2 | `runner.py`, `deepeval_runner.py`, `evaluation/README.md` |

## 任务详情

### Task 1: 建立独立外挂评测包骨架与原始文档迁移
- **改动内容：** 在根目录下创建 `evaluation/` 目录结构，将港大官方自带的 `sample_documents/` 复制迁移为 `evaluation/documents/`，将评测数据集迁移规范化为 `evaluation/datasets/sample_lightrag.json`。
- **代码位置：** `evaluation/documents/*`, `evaluation/datasets/*`
- **预期结果：** 拥有独立的语料底料库与问答数据集，港大官方原版 `lightrag/` 源码 0 侵入、0 篡改。
- **验证项：** `ls -la evaluation/documents/ && ls -la evaluation/datasets/`

### Task 2: 实现原料一键灌入工具 `ingest_samples.py`
- **改动内容：** 编写能够与当前多租户服务（9621 端口或 SDK）交互的批量入库工具。支持指定 `--project` 参数（默认 `eval_benchmark` 或新建测试库），自动登录获取 Bearer Token 并上传 `evaluation/documents/` 下的全部 Markdown 文档，等待切片与图谱抽取完成。
- **代码位置：** `evaluation/ingest_samples.py`
- **预期结果：** 执行后在目标工作区完成 5 篇文档的 LightRAG 图谱抽取与索引，形成完整的待测知识库。
- **验证项：** `python evaluation/ingest_samples.py --project eval_benchmark` 打印全部 Processed。

### Task 3: 重构 RAGAS 评测引擎 `engine.py` 与 `runner.py`
- **改动内容：**
  1. `engine.py`：封装 RAGAS 评估逻辑，包含 `LangchainLLMWrapper(bypass_n=True)` 兼容性补丁、两阶段信号量（RAG 查询并发 + 裁判评测并发）、NaN 异常熔断、四大黄金指标（Faithfulness, Answer Relevance, Context Recall, Context Precision）计算。
  2. `runner.py`：CLI 启动器，接管 `--project`, `--dataset`, `--verbose` 参数，自动读取 `.env` 执行 OAuth2 表单登录换取 JWT 并在所有请求头注入 `X-Project-Id` 与 `Authorization: Bearer <token>`，输出每一步的可视化高密追踪日志。
- **代码位置：** `evaluation/engine.py`, `evaluation/runner.py`
- **预期结果：** 完美适配二开多租户路由，日志详细透明，支持任意指定项目与题库。
- **验证项：** 运行 `python evaluation/runner.py --help` 正常显示多租户参数。

### Task 4: 在 `sshmy2` 宿主机现场端到端灌库与全量 6 题 RAGAS 评测验证
- **改动内容：** 将完整套件同步至 `sshmy2`，先执行 `ingest_samples.py` 将文档灌入 `eval_benchmark` 项目，再执行 `runner.py --project eval_benchmark --dataset evaluation/datasets/sample_lightrag.json` 跑完全部 6 道题。
- **代码位置：** `sshmy2:/home/ubuntu/lightrag-v2-exploration/LightRAG/evaluation/`
- **预期结果：** 6 题全部通过，Faithfulness > 0.85，Context Recall > 0.85，自动导出带有时间戳的 `.csv` 和 `.json` 报告。
- **验证项：** 检查 `evaluation/results/` 下的新生成报告，终端打印 100% PASS。实际取得 Faithfulness 0.9729, Context Recall 1.0000 满分召回。

### Task 5: 落地独立外挂式 DeepEval 工业级断言与扣分诊断评测套件 (`deepeval_runner.py`)
- **改动内容：** 响应用户关于 DeepEval 评测落地需求，创建完全解耦的独立评测运行器 `evaluation/deepeval_runner.py`。
  1. 继承 `DeepEvalBaseLLM` 封装 `CustomDeepEvalLLM`，打通 DeepSeek 裁判大模型与 LangChain 结构化输出；
  2. 构造 `LLMTestCase` 封装实际问答与切片上下文；
  3. 挂载四大断言指标（Faithfulness, AnswerRelevancy, ContextualRecall, ContextualPrecision），启用 `include_reason=True` 提取逐字扣分证据链；
  4. 支持 `--project`, `--dataset`, `--limit`, `--threshold`, `--concurrency` 参数，自动导出带有原因的 CSV 和 JSON 诊断报告。
- **代码位置：** `evaluation/deepeval_runner.py`, `evaluation/.eval_venv/`
- **预期结果：** 独立虚拟环境秒级就绪，全量跑通测试集，精确输出每道题的 Reason 诊断详情。
- **验证项：** `evaluation/.eval_venv/bin/python evaluation/deepeval_runner.py --project eval_benchmark` 成功生成报表。

### Task 6: 规范归档、编写 README 并清理根目录临时文件
- **改动内容：** 编写 `evaluation/README.md`，将之前在根目录创建的临时验证脚本（如 `run_ragas_evaluation.py`、`quick_eval_test.json`）清理或归档，保持项目根目录整洁规范。
- **代码位置：** `evaluation/README.md`
- **预期结果：** 根目录清爽，外挂评测包独立自洽，文档齐全。
- **验证项：** `git status -s` 检查干净整洁，仅包含 `evaluation/` 新增和规范清理。
