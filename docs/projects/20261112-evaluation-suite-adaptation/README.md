# 独立外挂式多租户 RAGAS 评测套件重构与二开适配

- **时间：** 2026-11-12
- **目标：** 将 RAGAS 评测体系从上游源码中完全抽离，在根目录建立独立的 `evaluation/` 套件，全面适配多租户物理隔离、JWT 鉴权、Project 路由与样本原料自动入库，坚守港大上游 0 侵入底线。
- **影响模块：** `evaluation/` (新), `deploy/`, `docs/`
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与已有平台契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 核心源码目录保持绝对纯净，随时无冲突 `git merge upstream/main`）
- **环境闭环：** 全部功能在 `sshmy2` 宿主机现场验证，测试报告全量落盘。

## 方案概述

### 1. 痛点与背景
港大官方原版评测脚本 (`lightrag/evaluation/eval_rag_quality.py`) 存在三个与我们生产底座脱节的硬伤：
1. **源码耦合**：原版评测代码内嵌在 `lightrag/evaluation/`，修改任何适配逻辑都会破坏 `lightrag/` 0 侵入原则；
2. **多租户断层**：原版为单体单库设计，请求不带任何 Project 路由，全部被硬兜底到平台默认项目，无法针对特定业务项目（如 `eval_benchmark`、`17bc3aa1-...`）做定向质检；
3. **数据与鉴权孤岛**：原版仅支持简单 `X-API-Key`，不支持我们生产开启的 `AUTH_ACCOUNTS` JWT 认证；且官方 6 题数据集所需的 5 篇 `sample_documents/` 未嵌入任何工作区，导致首次跑评测召回率为 0。

### 2. 架构设计与目录拓扑
在项目根目录新建一等公民外挂评测包 `evaluation/`：
```text
evaluation/
├── __init__.py
├── runner.py                 # 核心评测调度器（支持 --project, --dataset, --verbose, 自动 JWT 鉴权）
├── engine.py                 # RAGAS 评估引擎（基于 LangchainLLMWrapper, 兼容 bypass_n, 过滤 NaN）
├── ingest_samples.py         # 原料灌入工具（支持一键将 sample_documents 嵌入指定 Project）
├── datasets/                 # 评测用例集 (QA 对)
│   ├── sample_lightrag.json  # 港大官方 6 题
│   └── business_qa.json      # 业务事实 19 题
├── documents/                # 原始语料底料 (Markdown/PDF)
│   ├── 01_lightrag_overview.md
│   ├── 02_rag_architecture.md
│   ├── 03_lightrag_improvements.md
│   ├── 04_supported_databases.md
│   └── 05_evaluation_and_deployment.md
├── results/                  # 评测报表产物 (.csv / .json)
└── README.md                 # 完整使用说明与 CLI 范例
```

### 3. 多租户与鉴权无缝桥接
- 通过 `runner.py` 自动读取 `.env` 中 `AUTH_ACCOUNTS` 向 `/login` 交换 JWT Token，在每次请求注入 `Authorization: Bearer <token>` 与 `X-Project-Id: <target_project>`；
- 环境变量自动桥接：自动把 `LLM_*`、`EMBEDDING_*` 无缝注入到 RAGAS 裁判大模型。
