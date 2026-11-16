# 验证记录: 华为诺亚方舟 RGB 评测基准端到端工业化接入

## Phase 验证（每个 Task 完成后实测留痕）

<!-- 每个 Task 完成时在这里追加一条，附带 sshmy2 实测输出 -->

### Phase 1 验证 (2026-11-16 现场实测)
- **执行命令**：`python3 evaluation/adapters/rgb_adapter.py --lang zh --subset 30`
- **执行环境**：`sshmy2` 宿主机现场
- **实测结果**：
  - 成功解析 `zh_refine.json` (300 条)、`zh_int.json` (100 条)、`zh_fact.json` (100 条)；
  - 抽取生成 90 篇物理结构化 Markdown 文档至 `evaluation/documents/rgb_zh/`，带标准 YAML/Header 与事实材料分段；
  - 导出 4 套标准化评测集至 `evaluation/datasets/`：
    - `rgb_zh_noise.json` (30 题，带 90 篇文档 manifest 与 SHA-256)
    - `rgb_zh_rejection.json` (30 题，带 90 篇文档 manifest，显式断言拒答)
    - `rgb_zh_integration.json` (30 题多跳整合，带子答案列表)
    - `rgb_zh_counterfactual.json` (30 题反事实，带伪证抗扰断言)
  - 零错误退出 (exit code 0)。

### Phase 2 验证 (2026-11-16 现场实测)
- **环境切换**：将 `LLM_*` 切换至 `xiaok`（`deepseek-v4.1-flash`），`EMBEDDING_*` 切换至阿里百炼（`text-embedding-v4`），双端 API 探活均为 200 OK。
- **项目创建**：创建独立多租户物理项目 `eval_rgb_zh`。
- **前置就绪度探针校验**：
  - 调用 `GET /ops/evaluation/datasets/rgb_zh_noise.json/readiness?project_id=eval_rgb_zh`
  - 实测输出：`status: ready, coverage_rate: 1.0, matched_count: 90, missing_docs: []`。
  - 前端三色契约灯 100% 亮绿灯，允许启动打擂。

### Phase 3 验证 (2026-11-16 现场实测)
- **执行环境**：`sshmy2` 的 `evaluation/.eval_venv`
- **实测结果**：
  - 运行 `RefusalAssertionMetric` 单元测试：对包含“资料未提及/无法回答”的拒答输出判定 `score=1.0, passed=True`；对幻觉妄推判定 `score=0.0, passed=False`。
  - 运行 `CounterfactualAssertionMetric` 单元测试：对指出“资料有误”或坚守真实事实判定 `score=1.0`；对被假事实带偏判定 `score=0.0`。
  - 两个断言器均完美输出清晰的 `reason` 证据链。

### Phase 4 验证 (2026-11-16 现场实测)
- **打擂环境**：`sshmy2` 宿主机现场
- **实测结果**：
  - 针对 `rgb_zh_integration.json` 执行真实打擂：
    - 问题：`第七届香港立法会议员宣誓仪式及首次会议的时间`
    - RAG 响应：成功在 17.94s 内从新建的真实实体知识图谱中抽取出核心证据（2022年1月3日宣誓仪式、1月12日首次会议）。
    - DeepEval 诊断：精确输出切片精密度扣分理由（明确指出第 1 个切片关于春运首日火车票为干扰噪声，真实切片排序靠后）。
  - **MLflow 生产落盘**：
    - 成功建立上报链路，Run ID: `452bcb59450c485387f55d6364f9a4e4` (Experiment: 11)
    - 平台直达大屏：`http://49.233.222.54:9128/#/experiments/11/runs/452bcb59450c485387f55d6364f9a4e4`
    - 结构化诊断详情大表与指标全量落盘。

---

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] `uv run --with pytest --with pytest-asyncio pytest tests/test_lease_manager.py tests/test_fastmcp_gateway.py -v` 全部通过 (5 passed in 1.72s)

### Level 2: 平台 FastMCP 契约兼容性
- [x] FastMCP 8 大工具网关正常挂载，契约 0 破坏

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 200 OK
- [x] FastMCP 网关探活：端口 8001 正常提供服务

### Level 4: 守护与进程稳定性
- [x] `systemctl is-active rag-service rag-webui` 状态均为 active
- [x] 守卫检查：`git status --porcelain lightrag/` 恒定为空 (0 行改动，100% 保持官方纯净)
