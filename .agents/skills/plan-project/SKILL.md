---
name: plan-project
description: 接口/架构改动时调用，在 docs/projects/{YYYYMMDD}-{slug}/ 下创建项目文档（README + tasks + verification）。必须坚守对上游 LightRAG 0 侵入和平台端 0 代码改动原则。
---

# Plan Project (LightRAG 生产底座专属)

## 触发条件

- 改动 FastMCP tool 签名或新增工具（如 `mcp_query_project_knowledge`, `mcp_submit_project_knowledge_document`）
- 改动平台数据契约（`_ResultV2`, `_Locator`, `_Source`, `_Reference`）
- 改动多租户物理存储隔离（`storage/<tenant>/<project>/...`）、版本发布协议或读租约机制
- 升级上游 LightRAG 版本或安装新的全局依赖
- 改动环境变量配置（`.env`）或监听端口（8001/9621）
- 改动 systemd 守护进程或生产部署拓扑

## 跳过条件

- 外挂网关内部实现优化（如调整重试指数退避参数、补日志）
- 单个测试用例补充或微调
- 纯讨论与技术可行性预研——直接对话，确认执行后再调本 Skill

## 核心架构原则（底线）

1. **平台端 0 代码改动**：`runtime-service` 和 `platform-api` 绝不动一行代码，网关必须 100% 模拟并兼容旧契约。
2. **LightRAG 核心 0 侵入**：严禁在 `lightrag/` 官方核心源码内修改或加私货，所有业务适配全部收敛在外挂网关（`src/` 或根目录外挂模块）中。
3. **真实环境必须可复现**：所有改动以 `sshmy2`（Ubuntu 24.04）宿主机执行为准，禁止在本机脑补或伪造结果。

## 工作流

1. 从对话上下文确认：slug（kebab-case）、目标（一句话）、影响模块。
2. 创建 `docs/projects/{YYYYMMDD}-{slug}/`，生成下面三个模板文件。

## 文档模板

### README.md

```markdown
# {项目标题}

- **时间：** {开始日期}
- **目标：** {一句话}
- **影响模块：** {列表}
- **状态：** 规划中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 _ResultV2 契约）
- **上游侵入度：** 0 行代码侵入（lightrag/ 保持官方纯净，可随时升级）

## 方案概述

{简要描述方案，重点说清楚接口变更、多租户隔离影响和并发读租约处理}
```

### tasks.md

```markdown
# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: {任务名} | [ ] 待开始 | sshmy2 |

## 任务详情

### Task 1.1: {任务名}
- **改动内容：** {具体改什么}
- **代码位置：** `{文件路径}` → `{函数/类名}`
- **预期结果：** {改完是什么状态}
- **验证项：** `{具体 sshmy2 上的验证命令或测试}`
- **状态：** `[ ]` 待开始
```

### verification.md

```markdown
# 验证记录

## Phase 验证（每个 Task 完成后）

<!-- 每个 Task 完成时在这里追加一条，附带 sshmy2 实测输出 -->

## Final 验证（4 级生产流水线）

<!-- 所有 Task 完成后执行 -->

### Level 1: 基础单元与隔离测试
- [ ] `pytest tests/ -v` 全部通过

### Level 2: 平台 FastMCP 契约兼容性
- [ ] `python test_contract_client.py` 实测通过，平台端 Pydantic 校验 0 报错

### Level 3: 双轨服务健康度与端到端
- [ ] WebUI 原生探活：`curl -sI http://127.0.0.1:9621/webui/ | head -n 1` 返回 200
- [ ] FastMCP 网关探活：端口 8001 正常提供服务

### Level 4: 守护与进程稳定性
- [ ] `systemctl status rag-service` 状态为 active (running)，无崩溃重启

### 最终结论
<!-- done / partial / blocked / deferred，说明原因 -->
```
