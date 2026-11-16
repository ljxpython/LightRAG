# 评测工坊前置就绪检测、题库版本治理与 MLflow 对比大屏攻坚 (Eval Studio Readiness & Lifecycle)

- **时间：** 2026-11-14
- **目标：** 打造打擂前置就绪度智能检测（拒绝无语料盲跑）、重构专属题库生命周期与版本治理机制（拒绝题库文件无序泛滥）、彻底修复 MLflow Compare-Runs 页面直达路由规范。
- **影响模块：**
  - `run_lightrag_webui_server.py`（新增 `/ops/evaluation/datasets/{name}/readiness` 就绪度探测端点、优化题库删除/覆盖保存契约、修复 MLflow URL 拼装格式）
  - `lightrag_webui/src/features/evaluation/EvaluationStudio.tsx`（题库就绪度三色灯指示卡片、打擂按钮条件拦截保护、题库删除与版本覆盖选项、MLflow 直达修复）
  - `evaluation/dataset_generator.py`（支持同名专属题库原地覆盖与版本迭代标记）
- **状态：** 规划中

---

## 核心承诺 (Architecture Invariants)

- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 `_ResultV2` / 平台 JWT 鉴权契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 核心源码保持 100% 纯净，随时无冲突 `git merge upstream/main`）
- **真实生产闭环：** 所有修改与验证均在 `sshmy2`（Ubuntu 24.04）现场运行真实子进程、拉取真实切片与上报真实 MLflow，杜绝一切脑补与伪造数据。

---

## 方案深度剖析与架构决策

### 1. 痛点一：通用基准盲目打擂（无语料必挂）与前置检测缺失 (P0)
- **底层原理**：评测执行器是严格只读探针。当用户在空知识库或无关知识库上选择通用基准（如 `business_qa.json`）启动打擂时，检索阶段 0 切片召回，大模型无法回答或出现幻觉，导致评测指标全为 0。目前前端缺乏前置状态感知，用户打擂失败后一头雾水。
- **治理策略**：
  1. 后端新增 `/ops/evaluation/datasets/{dataset_name}/readiness` 探针接口：
     - 输入当前激活知识库 `project_id`；
     - 校验题库 `corpus_manifest` 或题目中声明的 `source_docs` / 文档指纹与目标库内物理文档的重合度；
     - 输出量化就绪度报告：`status: "ready" | "partial" | "missing"`，并附带缺失文档列表与切片匹配率。
  2. 前端题库栏呈现**三态就绪指示卡片**：
     - 🟢 **契约就绪 (100% 覆盖)**：绿色 Badge，提示“原料全部就绪，推荐打擂”；
     - 🟡 **部分覆盖 (xx%)**：黄色 Badge，提示缺失原料，提示打擂可能失分；
     - 🔴 **材料缺失 (0% 覆盖)**：红色 Badge，明确提示“当前知识库缺少评测所需原材料”，禁用打擂按钮，并给出“一键切换至评测基准库”或“原料灌库”引导！

### 2. 痛点二：专属题库列表无序膨胀与版本生命周期缺失 (P1)
- **底层原理**：目前每次点击【⚡ 自动合成题库】都会新建一个带时间戳的独立 JSON 文件，长期使用会导致下拉框堆积大量历史废弃题库；同时缺少直接删除题库的操作入口。
- **治理策略**：
  1. 题库合成弹窗增加**版本落盘策略**：
     - 单选 A：`✨ 覆盖并升级当前专属题库 (推荐，保持题库精炼)`
     - 单选 B：`📁 新建独立题库 (保留历史基准)`
  2. 评测集管理栏增加 **“🗑️ 删除当前题库”** 确认弹窗（底层移入 `evaluation/datasets/.trash/`）；
  3. 后端提供标准 `DELETE /ops/evaluation/datasets/{dataset_name}` 端点。

### 3. 痛点三：MLflow Compare-Runs 页面无法直达本次打擂比对 (P0)
- **底层原理**：
  - 经老王反编译 MLflow 3.18.0 前端 JS bundle，MLflow 的 `compare-runs` 路由通过 `window.location.search` 解析 `?runs=["..."]&experiments=["..."]`；
  - 旧版代码拼装为 `http://host/#/compare-runs?...`，将参数放在 Hash (`#`) 之后，导致 MLflow 前端 `location.search` 读到空串发生语法错误，页面 fallback 回落到了主页或上一次浏览的缓存页面！
- **治理策略**：
  - 去除错误的 Hash 前缀，严格对齐 MLflow 标准 URL 格式：
    `{mlflow_host}/compare-runs?runs={quote(runs_json)}&experiments={quote(exp_json)}`
  - 打擂完成直接点击跳转，100% 精准打开本次打擂的并排雷达图比对视图！
