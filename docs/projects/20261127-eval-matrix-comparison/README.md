# 多维打擂评测对比工坊 (Evaluation Matrix & Head-to-Head Comparison Studio)

- **时间：** 2026-11-27
- **目标：** 构建同场多模式（mix vs hybrid）横向 PK 与跨场次/跨版本（Run A vs Run B）纵向回溯对比分析系统，实现宏观指标雷达、微观 Case 级切片差异高亮、答案 Git-Diff 对照及耗时阶段解耦剖析。
- **影响模块：**
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx` (打擂主界面与勾选对比抽屉)
  - `lightrag_webui/src/features/evaluation/EvaluationComparisonModal.tsx` (新增：多维对比工作台弹窗)
  - `lightrag_webui/src/features/evaluation/CaseDiffViewer.tsx` (新增：单题切片与答案 Side-by-Side 溯源比对组件)
  - `run_lightrag_webui_server.py` (新增对比聚合 API `/evaluation/runs/compare`)
  - `evaluation/mlflow_adapter.py` (对比运行数据深层抽取与 Diff 分析器)
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 _ResultV2 契约，上层平台免测免感知）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 官方核心库保持纯净，可随时平滑升级香港大学官方最新代码）

## 方案概述

### 1. 业务痛点与两大核心对比场景
1. **组内模式横向 PK（Intra-Group Multi-Mode PK）：**
   - 在同一次评测打擂中，用户同时勾选了 `mix` 与 `hybrid`（甚至 `naive`、`local`、`global`）；
   - 用户需要一眼看穿：**为什么 `mix` 分数高？是切片召回更全，还是图谱关联补齐了实体？耗时多了多少秒？**
2. **跨组/跨场次纵向回溯对比（Cross-Run & Cross-Version Diff）：**
   - 知识库发布了新版本（`rev_1` 升级到 `rev_2`），或者切片策略调整、Top-K 从 10 调到 20；
   - 用户需要排查：**哪些题目得分上升了（改善题），哪些题目反而暴跌了（严重回归题 Regression）？**

### 2. 对比全景指标拓扑 (What to Compare)

| 层级 | 对比维度 | 具体指标与展示形式 | 业务价值 |
|---|---|---|---|
| **宏观全局层 (Macro)** | 五大核心质检维度 | 雷达图 (Radar Chart) + 柱状对比：Faithfulness, Answer Relevancy, Contextual Recall, Contextual Precision, Counterfactual | 一眼看穿不同模式在“防幻觉”与“召回深度”上的能力权衡 (Trade-off) |
| | 业务通过率与综合分 | 综合分 Δ（如 `+18.1分`）、通过率 Δ（如 `+20%`）、胜负平战报统计 (Win / Tie / Loss 胶囊) | 宏观决策采纳哪种检索配置作为生产基线 |
| | 全链路阶段性能吞吐 | P50/P90/P99 耗时对比柱状图、RAG 检索均耗 vs 裁判思考均耗占比堆叠图 | 评估图谱遍历带来的精度收益是否值得额外支付的时间成本 |
| **微观用例层 (Micro Case-Level)** | 答案并排对撞 (Side-by-Side Diff) | 类似 Git Diff 的双列对照视窗，绿色高亮独占关键论据，红色标出缺失或幻觉语句 | 直观定位 LLM 回答的论据丰富度与精准度 |
| | 召回切片源对比 (Sources Diff) | 切片重合度 (Jaccard 相似度)、共有切片标签、各自独占切片标签（标明 Doc ID、Chunk ID 及内容） | 彻底解密：到底是因为召回了哪一篇特定文档导致模式 A 答对了而模式 B 答错了 |
| | 裁判评语对撞 (Judgement Reason) | DeepEval 评语并排展示，突出扣分点分析 | 消除大模型评测黑盒感，直接查看裁判为何判定扣分 |
| | 单题阶段耗时对比 | 阶梯条形图对比单题中的 RAG 耗时与裁判打分耗时 | 快速揪出长尾慢查询瓶颈用例 |

### 3. 系统核心功能设计矩阵 (Key Features)

1. **历史打擂多选对比箱 (Multi-Run Selection Tray)**：
   - 在历史打擂记录列表中，支持复选框自由勾选 2~4 次打擂（支持跨评测集、跨时间、跨模式、跨 Top-K）；
   - 底部滑出常驻操作栏，显示已选打擂胶囊，点击【⚖️ 启动多维对比】；
2. **多维打擂对比工作台 (Comparison Studio Modal)**：
   - **Tab 1: 宏观概览对决 (Executive Summary)**：雷达图、核心指标差异矩阵表格、胜负平卡片；
   - **Tab 2: 用例胜负榜 (Case Win/Loss Matrix)**：按“胜负状态”过滤（A 胜、B 胜、打平、双翻车），优先展示差异最大的争议题；
   - **Tab 3: 性能剖析分布 (Performance & Cost)**：全链路各阶段耗时分布箱线图与均值比对；
3. **用例级溯源 Diff 穿梭机 (Case-Level Deep Diff Inspector)**：
   - 点击任意用例，弹出抽屉式双列比对面板；
   - 包含：Prompt 输入、各自召回切片列表（带共有/独占高亮标识）、各自生成答案（带文本差异 Diff）、各自裁判评语与指标雷达；
4. **一键生成决策建议 (AI Decision Recommendation)**：
   - 基于对比结果自动生成建议摘要：“模式 A 在忠实度上高 15%，但检索耗时高出 3.2 倍；若面向客服实时交互推荐模式 B，若面向严谨科研推荐模式 A”。
