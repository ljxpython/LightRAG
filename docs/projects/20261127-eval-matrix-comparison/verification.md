# 验证记录：多维打擂评测对比工坊 (Evaluation Matrix Comparison)

## Phase 验证

### Phase 1: 后端接口实测验证
- 执行探针脚本验证 `/ops/evaluation/runs/compare`：
  ```bash
  POST /ops/evaluation/runs/compare
  {"targets": [{"task_id": "task_9784995d78ca", "mode": "mix"}, {"task_id": "task_9784995d78ca", "mode": "hybrid"}]}
  ```
  输出：
  `STATUS: success`
  `MACRO DELTA: baseline: 0.976, comparison: 0.7947, delta: -0.1813`
  `WIN/TIE/LOSS: comparison_won: 0, baseline_won: 5, tie: 0, regressed: 1`
  `Jaccard: 1.0, 共有切片: 15个 / 16个`

### Phase 2: /browser 实机全链路巡检
- **截图 1（宏观概览对决）**：[查看宏观对决截图](file:///Users/lijiaxin/.gemini/antigravity/brain/e863a854-8023-4b08-81f4-ce9ffe58c978/evidence_comparison_macro.png)
  - 成功验证五维雷达图双色重叠多边形、4 个核心指标战况卡片、差分矩阵表、老王工程建议横幅。
- **截图 2（微观用例 Side-by-Side Diff 穿梭机）**：[查看用例 Diff 截图](file:///Users/lijiaxin/.gemini/antigravity/brain/e863a854-8023-4b08-81f4-ce9ffe58c978/evidence_comparison_cases_diff.png)
  - 成功验证单题展开：标杆答案、基准组 15 个切片 vs 对比组 16 个切片（共有/独占切片标签）、双列回答文本对撞、裁判扣分理由对比。
- **截图 3（性能与时延剖析）**：[查看性能剖析截图](file:///Users/lijiaxin/.gemini/antigravity/brain/e863a854-8023-4b08-81f4-ce9ffe58c978/evidence_comparison_performance.png)
  - 成功验证单题均耗、RAG 检索均耗与裁判思考均耗对比。
- **截图 4（历史打擂多选悬浮对比条）**：[查看悬浮操作条截图](file:///Users/lijiaxin/.gemini/antigravity/brain/e863a854-8023-4b08-81f4-ce9ffe58c978/evidence_comparison_floating_bar.png)
  - 成功验证勾选 2 个打擂卡片后，屏幕底部滑出暗色悬浮对比条与启动按钮。

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [x] 工作区与租约单测全部通过：`5 passed in 0.88s`

### Level 2: 平台 FastMCP 契约兼容性
- [x] FastMCP 8 大工具矩阵签名 100% 保持未改动，平台端 0 侵入，0 报错

### Level 3: 双轨服务健康度与端到端
- [x] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 `HTTP/1.1 200 OK`
- [x] 对比聚合接口：`POST /ops/evaluation/runs/compare` 正常响应聚合 JSON 数据
- [x] FastMCP 网关探活：端口 8001 正常提供服务

### Level 4: 守护与进程稳定性
- [x] `systemctl status rag-webui.service` 状态为 active (running)，无崩溃重启
- [x] 官方上游核心库 `git status --porcelain lightrag/` 为空，0 侵入

### 最终结论
全流程验收通过 (done)。
