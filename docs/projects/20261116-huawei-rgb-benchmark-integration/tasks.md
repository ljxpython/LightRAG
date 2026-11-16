# 任务列表: 华为诺亚方舟 RGB 评测基准端到端工业化接入

## 进度追踪

| Task | 状态 | 负责环境 | 产物/改动目标 |
|---|---|---|---|
| **Phase 1: 适配器设计与资产标准化转换** | | | |
| Task 1.1: 编写 RGB 语料抽取与标准契约转换器 `rgb_adapter.py` | [x] 已完成 | 本地 / sshmy2 | `evaluation/adapters/rgb_adapter.py` |
| Task 1.2: 抽取生成中文物理语料库与 4 大标准化评测集 | [x] 已完成 | 本地 / sshmy2 | `evaluation/documents/rgb_zh/` & `evaluation/datasets/rgb_zh_*.json` |
| **Phase 2: 独立租户物理建库与就绪度守卫验证** | | | |
| Task 2.1: 扩展 `ingest_samples.py` 支持自定义语料目录灌库 | [x] 已完成 | sshmy2 | 允许 `--docs-dir` 指定文档目录并自动建库 |
| Task 2.2: 在 `sshmy2` 现场完成 `eval_rgb_zh` 知识图谱与索引构建 | [x] 已完成 | sshmy2 | 实体图谱与向量库真实生成，前置就绪度探针 100% 亮绿灯 |
| **Phase 3: 评测执行器专项断言器增强 (Refusal & Fact)** | | | |
| Task 3.1: 在 `deepeval_runner.py` 中挂载负面拒答率专属断言 (`RefusalMetric`) | [x] 已完成 | 本地 / sshmy2 | 自动检测拒答判定，单测通过 |
| Task 3.2: 在 `deepeval_runner.py` 中挂载反事实错误识别断言 (`CounterfactualMetric`) | [x] 已完成 | 本地 / sshmy2 | 检验模型是否识别事实错误，单测通过 |
| **Phase 4: 现场矩阵打擂与 MLflow 对比大屏落地** | | | |
| Task 4.1: 在 `sshmy2` 现场执行 RGB 中文集多模式打擂 (Mix vs Naive) | [x] 已完成 | sshmy2 | 评测运行完成并导出 CSV/JSON 报表 |
| Task 4.2: 结果全量同步至 MLflow 平台并验证大屏与证据链直达 | [x] 已完成 | sshmy2 / sshmy1 | 在 `http://49.233.222.54:9128` 核验打擂对比图表 |
| **Phase 5: 规范归档与文档交付** | | | |
| Task 5.1: 更新 `evaluation/README.md` 与 4 级生产流水线验收 | [x] 已完成 | 本地 / sshmy2 | 包含 RGB 一键运行手册，完成交付 |

---

## 任务详情

### Phase 1: 适配器设计与资产标准化转换

#### Task 1.1: 编写 RGB 语料抽取与标准契约转换器 `rgb_adapter.py`
- **改动内容：**
  - 创建 `evaluation/adapters/rgb_adapter.py`；
  - 核心逻辑：读取 `temp/RGB/data/zh_refine.json`、`zh_int.json`、`zh_fact.json`（以及英文版）；
  - 将所有切片去重并合并整理为规范的 Markdown 物理文档集，存入 `evaluation/documents/rgb_zh/`；
  - 提取每道考题的 `query`, `ground_truth`, 关联的切片指纹，输出符合系统契约的标准 JSON（包含 `dataset_name`, `corpus_manifest`, `test_cases`）。
- **代码位置：** `evaluation/adapters/rgb_adapter.py`
- **预期结果：** 执行一键转换后，输出规范的物理语料文件夹与 4 份标准化评测集。
- **验证项：** `python3 evaluation/adapters/rgb_adapter.py --lang zh` 成功生成文档与 JSON。

#### Task 1.2: 抽取生成中文物理语料库与 4 大标准化评测集
- **改动内容：**
  - 运行转换器生成：
    1. `rgb_zh_noise.json`: 考察在大量无关切片干扰下的答案精准度与召回率；
    2. `rgb_zh_rejection.json`: 负面拒答考题（针对未灌库或全负例问题），断言模型拒答；
    3. `rgb_zh_integration.json`: 跨多文档信息整合（多跳推理）考题；
    4. `rgb_zh_counterfactual.json`: 反事实考题。
- **代码位置：** `evaluation/datasets/rgb_zh_*.json`
- **预期结果：** 所有数据集均携带精准的 `corpus_manifest`，文档 SHA-256 签名齐全。
- **验证项：** 校验生成的数据集 JSON 格式符合 Schema，无非法字段。

---

### Phase 2: 独立租户物理建库与就绪度守卫验证

#### Task 2.1: 扩展 `ingest_samples.py` 支持自定义语料目录灌库
- **改动内容：**
  - 在 `evaluation/ingest_samples.py` 中新增 `--docs-dir`（默认 `evaluation/documents/`），允许指定任意子目录（如 `evaluation/documents/rgb_zh`）；
  - 保持原有的自动登录 JWT 交换、批量上传与切片图谱抽取轮询逻辑。
- **代码位置：** `evaluation/ingest_samples.py`
- **预期结果：** 支持一条命令向指定 Project 灌入任意语料集。
- **验证项：** `python evaluation/ingest_samples.py --help` 显示 `--docs-dir` 参数。

#### Task 2.2: 在 `sshmy2` 现场完成 `eval_rgb_zh` 知识图谱与索引构建
- **改动内容：**
  - 在 `sshmy2` 宿主机创建 `eval_rgb_zh` 专属工作区；
  - 运行 `ingest_samples.py --project eval_rgb_zh --docs-dir evaluation/documents/rgb_zh`；
  - 等待切片向量化与 LightRAG 实体/关系抽取完成；
  - 验证 WebUI 评测工坊三色契约灯对 `rgb_zh_*.json` 显式呈现绿色“契约就绪 (100%)”。
- **预期结果：** 图谱和向量底座真实落盘，就绪度探针 100% 匹配。
- **验证项：** `curl -s -H "X-Project-Id: eval_rgb_zh" http://127.0.0.1:9621/ops/evaluation/datasets/rgb_zh_noise/readiness` 返回 `status: ready`。

---

### Phase 3: 评测执行器专项断言器增强 (Refusal & Fact)

#### Task 3.1: 在 `deepeval_runner.py` 中挂载负面拒答率专属断言 (`RefusalMetric`)
- **改动内容：**
  - 针对 `rgb_zh_rejection.json`，在 `deepeval_runner.py` 中注入拒答断言。
  - 采用轻量二分类裁判或正则规则（检测包含“无法回答/未提及/未收录/资料不足/无相关记载”等），当模型明确承认信息不足时判 PASS (1.0)，出现幻觉肯定回答时判 FAIL (0.0)；
  - 自动上报至 MLflow 的 `rejection_rate` 标量指标。
- **代码位置：** `evaluation/deepeval_runner.py`
- **预期结果：** 完美支持 RGB 负样本拒答率科学度量。
- **验证项：** 单元测试拒答判定逻辑准确率 100%。

#### Task 3.2: 在 `deepeval_runner.py` 中挂载反事实错误识别断言 (`CounterfactualMetric`)
- **改动内容：**
  - 针对 `rgb_zh_counterfactual.json`，挂载事实错误识别检测；
  - 考察模型回答中是否指出输入资料存在事实错误（Error Detection）。
- **代码位置：** `evaluation/deepeval_runner.py`
- **预期结果：** 具备检出材料错误能力的量化指标。
- **验证项：** 跑通反事实样本用例。

---

### Phase 4: 现场矩阵打擂与 MLflow 对比大屏落地

#### Task 4.1: 在 `sshmy2` 现场执行 RGB 中文集多模式打擂 (Mix vs Naive)
- **改动内容：**
  - 使用全新就绪的 `rgb_zh_integration.json` 和 `rgb_zh_noise.json`，在 `sshmy2` 现场启动矩阵打擂：
    - Run A: `mode="mix"` (LightRAG 双级图谱 + 文本块 + 重排)
    - Run B: `mode="naive"` (传统纯切片向量检索)
  - 观察并记录两组在信息整合多跳和高噪声干扰下的召回率与准确率差异。
- **代码位置：** `evaluation/results/deepeval_report_rgb_*.csv`
- **预期结果：** 两种模式的对比数据完整生成并留存证据链。
- **验证项：** 生成带时间戳的报表文件。

#### Task 4.2: 结果全量同步至 MLflow 平台并验证大屏与证据链直达
- **改动内容：**
  - 自动将打擂的两次 Runs 落库到 `http://49.233.222.54:9128` 实验 `lightrag-benchmark-suite`；
  - 生成直达 Compare Runs URL；
  - 验证多维指标对比柱状图、逐字扣分理由大表真实呈现。
- **代码位置：** MLflow Platform UI
- **预期结果：** 能够直观看到 LightRAG 相比 Naive RAG 在复杂多跳上的性能飞跃。
- **验证项：** 浏览器审查直达 URL，截图留痕。

---

### Phase 5: 规范归档与文档交付

#### Task 5.1: 更新 `evaluation/README.md` 与 4 级生产流水线验收
- **改动内容：**
  - 更新 `evaluation/README.md`，增加“华为 RGB 权威基准评测指南”章节与一键复现命令；
  - 执行 4 级生产流水线全量验收，清理临时中间文件。
- **预期结果：** 文档齐全，上游核心 0 侵入，平台端 0 改动。
- **验证项：** `git status --porcelain lightrag/` 恒定为空。
