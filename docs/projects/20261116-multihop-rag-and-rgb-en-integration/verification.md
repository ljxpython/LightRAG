# 验证记录: MultiHop-RAG 权威多跳基准与 RGB 英文评测集工业化接入

## Phase 验证（每个 Task 完成后）

### Task 1.1 ~ Task 1.3 验证 (Phase 1 资产标准化与适配器构建) ✅ 2026-11-16
- **执行环境**：`sshmy2` (Ubuntu 24.04)
- **命令与实测输出**：
  1. `uv run python evaluation/adapters/multihop_adapter.py --subset 25`
     - 输出：`Created 129 physical documents in evaluation/documents/multihop`
     - 产物：`multihop_inference.json` (25 cases), `multihop_comparison.json` (25 cases), `multihop_temporal.json` (25 cases), `multihop_null.json` (25 cases), `multihop_benchmark.json` (40 cases)
  2. `uv run python evaluation/adapters/rgb_adapter.py --lang en --subset 30`
     - 输出：`Created 90 physical documents in evaluation/documents/rgb_en`
     - 产物：`rgb_en_noise.json` (30 cases), `rgb_en_rejection.json` (30 cases), `rgb_en_integration.json` (30 cases), `rgb_en_counterfactual.json` (30 cases)
  3. `PYTHONPATH=. uv run --with pytest pytest tests/test_multihop_adapter.py tests/test_eval_runs_catalog.py -v`
     - 输出：`3 passed in 0.09s`
- **合规核验**：
  - [x] 未侵入 `lightrag/` 官方核心代码（`git status --porcelain lightrag/` 恒定为空）
  - [x] 平台端契约保持 100% 兼容
  - [x] 所有产物在 `sshmy2` 宿主机现场真实生成并校验 SHA-256 签名齐全

### Task 2.1 ~ Task 3.1 验证 (租户注册、真实物理切片构建与断言器测试) ✅ 2026-11-16
- **执行环境**：`sshmy2` (Ubuntu 24.04)
- **命令与实测输出**：
  1. 租户注册：`CatalogManager().upsert_project(...)` 成功注册 `eval_multihop` 与 `eval_rgb_en`。
  2. 真实物理建库与大图谱生成：全量 129 篇 MultiHop 语料注入 `eval_multihop` 完成后台图谱构建，产物统计：
     - **实体节点 (Nodes)**: 1,641 个
     - **关系边 (Edges)**: 2,473 条
     - **切片向量 (Chunks)**: 全量 129 篇落盘
     - **探针就绪度**: `coverage_rate: 1.0` (100% 契约完美就绪，missing_docs 为空)。
  3. 真实查询探活：以 `mode="mix"` 向 `/query` 发送真实检索请求，返回 200，成功合成回答。
  4. 负面拒答断言器：`RefusalAssertionMetric` 针对英文 `"Insufficient information to answer this question based on the provided documents."` 判定通过（score=1.0），对妄断推测断言失败（score=0.0）。

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `pytest tests/test_multihop_adapter.py tests/test_eval_runs_catalog.py -v` 全部通过 (3 passed in 0.09s)
- [x] `git status --porcelain lightrag/` 恒定为空（严守港大上游 0 侵入）

### Level 2: 平台 FastMCP 契约兼容性
- [x] FastMCP 8 大工具签名无破坏，`_ResultV2` / 平台 JWT 鉴权契约 100% 保持兼容

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 200 OK
- [x] FastMCP 网关探活：端口 8001 正常提供服务
- [x] 评测就绪度探针：`/ops/evaluation/datasets/multihop_benchmark.json/readiness` 探活无缝识别落盘物理文档

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-service` 状态为 active (running)，无崩溃重启
- [x] `systemctl status rag-webui` 状态为 active (running)，无崩溃重启

### 最终结论
Done（已完成）。MultiHop-RAG 与 Huawei RGB (EN) 已完成工业级接入，适配器、测试集、物理语料与专属租户均在 `sshmy2` 生产环境现场完成闭环交付。
