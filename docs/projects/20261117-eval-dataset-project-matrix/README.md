# 评测工坊：题库资产全景、知识库对照与智能切库闭环 (Eval Studio Asset Panorama & Matrix)

- **时间：** 2026-11-17
- **目标：** 在评测工坊打造开阔的「题库与资产全景」第一子页面，彻底理顺「评测集 - 知识库项目 - 评测原材料文档」三层物理拓扑关系，提供题库指标画像与用例抽样检视，并支持「一键前往打擂（自动对齐切换知识库 + 预选好评测集 + 契约 100% 就绪开跑）」的端到端闭环。
- **影响模块：**
  - `run_lightrag_webui_server.py`（优化 `/ops/evaluation/datasets` 与 `/ops/evaluation/datasets/{name}/readiness`，输出完整关联文档列表与母体知识库信息）
  - `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`（将首个 SubTab 升级为 `【📚 题库与资产全景】`，并保留 `【⚔️ 矩阵打擂台】`、`【📊 任务大厅】`、`【📈 MLflow 大屏】`）
  - `lightrag_webui/src/features/evaluation/DatasetPanoramaView.tsx`（全新独立子组件：呈现知识库、评测集、原材料文档拓扑、指标详情抽样、以及「🚀 前往评测打擂」直达动作）
- **状态：** 已完成

---

## 核心承诺 (Architecture Invariants)

- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 `_ResultV2` / 平台 JWT 鉴权契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 核心源码保持 100% 纯净，随时无冲突 `git merge upstream/main`）
- **真实生产闭环：** 所有修改与验证均在 `sshmy2`（Ubuntu 24.04）现场运行真实子进程、拉取真实切片与验证，杜绝一切脑补与伪造数据。

---

## 方案深度剖析与架构决策

### 1. 痛点与用户诉求
- 现状：评测工坊直接进入打擂界面，下拉框题库混杂，缺少宏观资产全景；跨项目选中题库时直接弹红色【契约拦截】告警条，提示用户去右上角手动切换知识库，但未提供对应知识库信息，更无直达通道，形成死胡同断崖体验。
- 用户诉求：希望有一个专门的界面，清晰展示：
  1. **评测集**（Dataset）
  2. **项目**（Project / 知识库）
  3. **评测原材料**（Source Documents / Raw Materials，哪些文档在库、哪些缺失、匹配率）
  4. **详细指标内容**（用例数、多跳/问答指标偏重、考题与答案抽样）
  5. **一键前往打擂**：点击评测集直接跳转至执行评测界面，若跨项目自动对齐切换知识库，原材料直接 100% 就绪开跑！

---

### 2. 页面与交互架构（方案 1：评测工坊第 1 核心 SubTab）

```
[评测工坊 (Evaluation Studio)]
  │
  ├── 顶部 SubTabs 导航：
  │   ├── 【📚 题库资产全景】(DatasetPanoramaView - 全新第一大屏)  <-- 默认落地页
  │   ├── 【⚔️ 矩阵打擂台】(EvaluationCasesView - 原有用例编辑与打擂)
  │   ├── 【📊 任务大厅】(EvaluationTaskCenter)
  │   └── 【📈 MLflow 大屏】(MLflowViewer)
  │
  └── 【📚 题库资产全景】页面内容：
      ├── 1. 顶部统计与筛选 Bar：
      │      - 知识库选择/筛选：[全部知识库 / 平台默认项目 / eval_multihop / 全局基准...]
      │      - 资产总览指标卡：评测集总数、关联知识库数、纳管考题总数、原材料文档数
      │
      ├── 2. 三层关系与资产卡片列表 (Project -> Dataset -> Documents)：
      │      - 归属项目徽标（如 [🏢 平台默认项目] 或 [🌐 全局通用基准]）
      │      - 评测集基础信息（文件名、用例数、文件大小、更新时间）
      │      - 原材料文档就绪度矩阵 (Raw Materials & Readiness)：
      │        * 展开展示依赖的 N 篇文档（如 api.md、旅行日记2.pdf...）
      │        * 文档在库状态（🟢 已在库 / 🔴 库内缺失）
      │      - 详细指标与考题抽样抽屉/预览：
      │        * 展开查看前 3~5 道考题用例、Question、Ground Truth、支撑上下文
      │
      └── 3. 终极操作：[ 🚀 前往评测打擂 ] 按钮：
             - 自动检测当前工作区：若当前项目不是该题库母体项目，原子调用 POST /ops/workspaces/select + setCurrentWorkspace 切换过去；
             - 自动切换 SubTab 到【⚔️ 矩阵打擂台】；
             - 自动预选该评测集，此时原材料 100% 具备，绿色就绪灯点亮，用户直接调参打擂！
```
