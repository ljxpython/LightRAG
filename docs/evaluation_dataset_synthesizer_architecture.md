# LightRAG 自动化评测题库逆向合成系统架构设计与实现剖析 (DeepEval Synthesizer)

> **文档状态**：生产设计归档  
> **所属模块**：`evaluation / dataset_generator.py` & `run_lightrag_webui_server.py`  
> **交互式架构图**：[evaluation_synthesizer_architecture.html](file:///Users/lijiaxin/PyCharmMiscProject/LightRAG/docs/artifacts/evaluation_synthesizer_architecture.html)  
> **架构模型规范**：Archify v2.17 Showcase Standard

---

## 1. 架构定位与业务背景

在面向企业级知识库与 RAG 系统的工程落地中，**“如何低成本构建高质量的黄金评测题库（Ground Truth Dataset）”** 是评测体系的核心痛点。

传统人工标注存在耗时巨大、覆盖面窄、跨文档逻辑链条缺失等缺陷；而简单的随机提问则难以考查复杂推理场景。本系统作为外挂式知识系统的基准生产引擎，采用 **“逆向语料提取 + Evol-Instruct 进化演化 + 全生命周期血缘绑定”** 架构，实现全自动的高难度考题合成与差量版本演进。

```
┌────────────────────────────────────────────────────────────────────────┐
│                        持续评测飞轮 (Evaluation Flywheel)              │
│                                                                        │
│   ┌────────────────┐      ┌─────────────────┐      ┌───────────────┐   │
│   │ 物理文档入库    │ ───► │ 逆向自动出题     │ ───► │ 矩阵打擂比对  │   │
│   │ (Ingest Sandbox│      │ (Synthesizer)   │      │ (Multi-mode)  │   │
│   └────────────────┘      └─────────────────┘      └───────────────┘   │
│           ▲                                                │           │
│           └─────────────── 结果诊断与索引优化 ──────────────┘           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 系统整体架构与组件矩阵

系统通过 **FastAPI 生产网关**、**常驻内存任务池** 与 **隔离式 Python 子进程** 组成三层解耦架构，保证前端交互流畅度与出题进程的高隔离性。

### 2.1 架构拓扑 (Interactive Topology)
> 完整交互拓扑已交付至：[docs/artifacts/evaluation_synthesizer_architecture.html](file:///Users/lijiaxin/PyCharmMiscProject/LightRAG/docs/artifacts/evaluation_synthesizer_architecture.html)，支持暗色/亮色切换、链路高亮追踪与视口缩放。

```
                    【生产宿主机运行域 (Golden Host: sshmy2)】
 ┌──────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
 │   EvaluationStudio   │ ------►│  WebUI API Gateway   │ ------►│   EvalTaskManager    │
 │ (React 前端 / 轮询)  │◄- - - -│    (FastAPI :9621)   │        │ (常驻内存池/进程守护)│
 └──────────────────────┘        └──────────────────────┘        └──────────┬───────────┘
                                                                            │ exec proc
                                 ┌──────────────────────┐        ┌──────────▼───────────┐
                                 │   物理语料切片库     │◄───────│  Dataset Generator   │
                                 │ (sandbox_storage/KV) │        │ (dataset_generator)  │
                                 └──────────────────────┘        └────┬────────────┬────┘
                                                                      │            │
                                 ┌──────────────────────┐             │            │
                                 │   题库资产持久化目录 │◄────────────┘            │
                                 │ (datasets/*.json)    │                          ▼
                                 └──────────────────────┘               ┌──────────────────────┐
                                                                        │   大模型推理网关     │
                                 ┌──────────────────────┐               │ (OpenAI 协议 :443)   │
                                 │   MLflow 评测中台    │◄- - - - - - - └──────────────────────┘
                                 │ (:9128 Tracking Svr) │
                                 └──────────────────────┘
```

### 2.2 核心组件职责边界

| 组件名称 | 物理承载 | 职责边界 | 崩溃隔离边界 |
| :--- | :--- | :--- | :--- |
| **EvaluationStudio** | 前端 React WebUI | 提供题库维护策略选择（覆盖更新 vs 新建版本）、题数配置；异步发起任务并以 1.5s 周期轮询进度与日志。 | 浏览器端关闭不影响服务端运行 |
| **WebUI API Gateway** | `run_lightrag_webui_server.py` | 暴露 `/ops/evaluation/datasets/generate` 与 `/ops/evaluation/tasks/{id}` 接口；解析出题参数，向任务管理器派发工作。 | 主 HTTP 服务常驻 |
| **EvalTaskManager** | `run_lightrag_webui_server.py` | 单例内存任务调度池；维护任务状态字典 `_tasks`，注册进程对象 `_processes`，通过异步管道重定向捕获标准输出日志。 | 内存集中维护，支持主动中止 (`abort`) |
| **Dataset Generator** | `evaluation/dataset_generator.py` | 独立的 Python 异步 CLI 引擎；执行语料加载、CRUD 差量分析、大模型多题型合成、Manifest 契约签名封印与文件落盘。 | 独立子进程运行，异常退出不影响主网关 |
| **物理语料切片库** | `sandbox_storage/` | 存储项目的文档原文、分块切片（Chunks）、实体关系与内容哈希指纹。 | 底层只读消费 |
| **大模型推理网关** | 外部 LLM API (`xiaok.lol` 等) | 提供问答对提炼、跨文档关联推理、条件演化以及标准答案校对生成。 | 网络超时自动重试（45s 超时，3 次重试） |
| **题库持久化目录** | `evaluation/datasets/*.json` | 承载落盘题库数据；包含完整 Metadata、Corpus Manifest v2 以及标准 QA 考题对。 | 磁盘持久化资产 |
| **MLflow 评测中台** | 远端 MLflow Server (`:9128`) | 接收生成的题库元数据指纹，完成评测集版本在实验平台中的登记与全生命周期归档。 | 旁路异步同步，失败不阻塞本地流程 |

---

## 3. 端到端流程剖析：出题系统到底干了什么？

系统端到端执行可精细划分为 **4 个关键阶段**：

### 阶段 1：异步派发与子进程守护 (Dispatch & Sandbox)
1. **用户触发**：前端调用 `POST /ops/evaluation/datasets/generate`，携带参数：
   ```json
   {
     "project_id": "proj_1ld3edpo",
     "output_name": "ai_agent.json",
     "size": 25,
     "incremental": true,
     "base_dataset": "business_qa.json"
   }
   ```
2. **快速响应**：网关调用 `eval_task_mgr.create_task` 分配唯一 `task_id`（如 `task_295d4243e9b2`），并在后台通过 `asyncio.create_task` 拉起子进程，立即向前端返回 `200 Accepted`，彻底解耦 HTTP 连接。
3. **隔离执行与日志捕获**：
   - 后台通过 `asyncio.create_subprocess_exec` 启动子进程；
   - 子进程环境注入 `PYTHONUNBUFFERED=1`；
   - 网关采用非阻塞 `proc.stdout.readline()` 流式读取子进程输出；
   - 正则探测 `[PROGRESS: XX%]` 动态更新前台进度条，将输出日志追加至内存循环队列（保留最新 120 条）。

---

### 阶段 2：语料抽取与全生命周期 CRUD 差量演化 (Corpus & Lineage Diff)
当开启 `incremental` 模式且指定了 `base_dataset` 时，引擎启动**生命周期血缘比对**：

```
                ┌──────────────────────────────┐
                │ 历史基准题库 (Base Dataset)   │
                │ 附带 Corpus Manifest v1      │
                └──────────────┬───────────────┘
                               │
                               ▼ 对比文档 content_hash
                ┌──────────────────────────────┐
                │ 当前物理语料库 (Current Docs) │
                └──────────────┬───────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   【新增文档 ADD】      【变更文档 MODIFIED】   【删除文档 DELETED】
   多跳跨代扩题          重新校对黄金答案        转化为负面拒答考题
   (Cross-Gen Multi-Hop) (Re-verify Truth)       (Refusal Negative QA)
```

1. **差量识别**：
   - 比对基准题库中的 `corpus_manifest.docs` 与当前知识库的 `current_manifest.docs`；
   - 提取三类差异集合：`new_doc_ids`、`modified_doc_ids`、`deleted_doc_ids`。
2. **删除文档 ➔ 自动转化为负面拒答考题（Huawei RGB 规范）**：
   - 若题目依赖的源文档已被删除，该题目不被丢弃，而是自动降级进化为**拒答防幻觉用例**；
   - 黄金答案设定为：*“知识库中已不存在该文档或规范信息，系统应当明确表示未找到相关内容或拒答，严禁编造幻觉。”*
3. **变更文档 ➔ 重新校对（Re-verify）**：
   - 针对源文档内容哈希发生变更的题目，大模型基于新版切片重新生成黄金标准答案，并打上 `reverified_note` 标记。
4. **新增文档 ➔ 跨代多跳出题（Cross-Generation Multi-Hop）**：
   - 针对新增文档，提取其物理切片，与知识库已有历史切片联合进行两两配对，生成跨文档多跳考题。

---

### 阶段 3：Evol-Instruct 算法多题型演化生成
针对待出题切片，引擎按照难度配比生成 4 种类型考题：

| 题型标识 | 预设占比 | 核心考察目标 | 提示词构造机理 |
| :--- | :--- | :--- | :--- |
| **`multi_hop`** | 40% | 跨文档/跨切片关联推理与拓扑跳跃 | 抽取两个不同源文档切片 $C_1, C_2$，要求 LLM 必须且仅能结合两处论据方可回答，严禁单切片可解。 |
| **`reasoning`** | 30% | 归纳总结、根因分析与深度论证 | 基于复杂切片提问因果机理、对比差异与深度分析，答案要求逻辑闭环。 |
| **`conditional`** | 10% | 边界条件、生效范围与前提约束 | 聚焦“在什么情况下”、“满足什么限制时才生效”等边界规则提问。 |
| **`simple`** | 20% | 核心实体属性与事实提取 | 针对切片中的关键定义、参数指标进行事实级提问。 |

出题执行逻辑具备容错重试机制：
- 每个题型轮换最多重试 3 个候选切片；
- 大模型请求超时阈值设定为 45.0s；
- 严格解析并校验 LLM 返回内容，必须提取到有效的 `question` 与 `ground_truth` 方可收录入库。

---

### 阶段 4：题库资产落盘与元数据治理
1. **Manifest 契约封印**：
   题库文件落盘前，封装结构化元数据：
   ```json
   {
     "dataset_id": "ds_proj_1ld3edpo_1764213499",
     "project_id": "proj_1ld3edpo",
     "engine": "native",
     "model": "deepseek-v4.1-flash",
     "timestamp": "2026-11-27T11:18:19",
     "total_cases": 25,
     "corpus_manifest": {
       "docs": [ ... ],
       "manifest_version": "v2"
     },
     "test_cases": [ ... ]
   }
   ```
2. **Catalog 注册**：落盘后由 `catalog_mgr` 写入数据库，更新该题库包含的用例总数，并通知 WebUI 刷新题库列表。
3. **MLflow 登记**：调用 `MLflowEvaluationTracker` 在远端 Tracking Server（端口 9128）登记题库 Run，记录 `total_cases`、`engine`、`dataset_name` 等实验参数。

---

## 4. 生产排查复盘：为什么上次出题长时间未生成？

在本次排查中，老王通过 `sshmy2` 宿主机的真实运行指标与系统日志，定位到了导致上次出题中断的直接原因与底层缺陷：

### 4.1 现象与事件时间线
- **11:18:18**：用户在前端触发了基于 `business_qa.json` 的增量演化出题任务（PID: `3602816`）。
- **11:18 ~ 11:52**：任务在后台持续运行 34 分钟，正常向外部大模型发起了多次出题交互，成功推进至 `[22/140]` 题。
- **11:52:26**：宿主机执行了 `sudo systemctl restart rag-webui.service`。
- **11:52:27**：systemd 触发 CGroup 清理，直接向子进程发送 `SIGKILL` 强杀退出：
  ```text
  Nov 27 11:52:27 VM-0-6-ubuntu systemd[1]: rag-webui.service: Killing process 3602816 (python) with signal SIGKILL.
  ```
- **11:52:31**：服务重启完毕，内存任务池被清空，未落盘的题目随进程丢失。

### 4.2 暴露出的两大工程缺陷

#### 缺陷 1：题目数量被“自作主张”翻倍膨胀
在 `dataset_generator.py` 第 549 行代码中：
```python
# 源码原实现：
size_to_gen = max(target_size, len(new_doc_ids) * 2)
```
- 用户在前端明明只选择了 **25 题**；
- 但由于知识库相比基准存在 **70 篇** 新增文档，该公式强行将题数放大为 $\max(25, 70 \times 2) = \mathbf{140 \text{ 题}}$！
- 题目数量扩充了近 6 倍，直接导致预估耗时从 10 分钟飙升至 1.5 小时。

#### 缺陷 2：串行同步大模型调用 + 缺乏流式 Checkpoint
- 引擎采用 `for idx, evo_type in enumerate(types):` **单任务串行**调大模型。每道题经过提示词构造、大模型推理与 JSON 重试，耗时 15~35 秒；
- 且系统仅在全部 140 题生成完毕的最后一步（`Step 3`）才打开文件写盘。中途一旦遭遇断网、重启或 OOM，前功尽弃。

---

## 5. 架构演进与优化实施方案

为保证系统的工业级高可用性，老王建议针对出题模块落地以下三项改进：

1. **参数主权回归（移除强制膨胀系数）**：
   尊重用户前端传入的 `target_size`，仅将 `len(new_doc_ids)` 作为切片采样的权重池，绝不擅自扩大最终题量。
2. **并发流水线改造（Async Semaphore 并发控制）**：
   引入 `asyncio.Semaphore(concurrency=3)`，在避免触发大模型 Rate Limit 的前提下，将 140 题生成耗时压缩 3 倍以上。
3. **流式落盘与断点续传（Checkpoint Recovery）**：
   每生成成功一道考题，即向磁盘临时文件追加写入；若中途意外崩溃重启，重新拉起时直接加载已生成题目并接着继续出题。

---
*文档编制完成：2026-11-27 | 架构交付人：老王*
