# 评测打擂多模式横向对比与 EvalFlow (MLflow) 链路深度优化

- **时间：** 2026-11-27
- **目标：** 支持多检索模式（mix、hybrid等）独立子任务细分与横向 PK 对比大屏，打通 EvalFlow (MLflow) 鉴权与可视化链路，彻底解决多模式被单向覆盖与 MLflow 页面空白问题。
- **影响模块：**
  - `evaluation/mlflow_adapter.py`（EvalFlow 认证 Token 注入与网络诊断加固）
  - `evaluation/deepeval_runner.py`（多模式矩阵打擂汇总报告生成与 MLflow 独立 Runs 挂载）
  - `run_lightrag_webui_server.py`（任务管理器聚合多模式指标，杜绝最后单份报告覆盖历史）
  - `lightrag_webui/src/features/evaluation/EvaluationTaskCenter.tsx`（打擂任务大厅多模式横向对比卡片与子结果分栏查看）
- **状态：** 进行中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 _ResultV2 契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 核心算法源码保持官方纯净，随时无冲突更新）

## 方案概述

### 1. 痛点根因分析
1. **多模式覆盖问题**：当用户在矩阵打擂中勾选多种检索模式（如 `mix, hybrid`）时，后端实际上逐一执行了评测，但在任务收尾阶段仅抓取了最后生成的单一 json 报告，导致卡片上虽标有双模式标签，点开却只展示后者的得分，抹杀了横向对比价值。
2. **MLflow 平台空白问题**：远端 EvalFlow (49.233.222.54:9128) 启用了用户登录鉴权（Token 校验），打擂子进程在未挂载认证凭据时遭遇 `401 / 需要登录 EvalFlow`，降级跳过上报，导致用户在 MLflow 页面只能看到空白新手引导页。

### 2. 工业级改造设计
1. **打通 MLflow 认证闭环**：
   - 在 `mlflow_adapter.py` 中引入 `MLFLOW_TRACKING_TOKEN` 环境变量及自动鉴权头注入机制；
   - 增加链路自检探针与明细日志，如果未登录或 Token 失效，在任务卡片上精准提示原因与登录引导。
2. **多模式聚合报告 (Matrix Summary Protocol)**：
   - 多模式矩阵打擂完成后，生成统一汇总结构 `matrix_summary`，包含各模式独立的综合分、五大指标（忠实度、召回率、精确度等）及对应 Run ID；
   - 服务端任务元数据保留各模式独立成绩。
3. **前端多模式横向对比大屏**：
   - 在打擂记录卡片中，提供“模式横向对比”选项卡，直观展示各检索模式的优劣势雷达对比，并可下钻查看每个模式的具体答题情况。
