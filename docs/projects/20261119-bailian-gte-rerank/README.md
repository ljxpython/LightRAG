# 阿里百炼 gte-rerank-v2 重排模型双轨集成

- **时间：** 2026-11-19
- **目标：** 为 FastMCP 生产网关（8001）与官方 WebUI（9621）双轨接入阿里百炼 `gte-rerank-v2` 重排模型，对上游官方核心源码保持 0 侵入，实现配置化全链路精准召回。
- **影响模块：**
  - `llm_client.py` (新增 `create_lightrag_rerank_func()`)
  - `workspace_manager.py` (在 `LightRAG` 实例化中注入 `rerank_model_func`)
  - `.env` (配置 `RERANK_*` 相关环境变量)
  - `tests/test_rerank_integration.py` (新增单测)
- **状态：** 进行中

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 `_ResultV2` 契约）
- **上游侵入度：** 0 行代码侵入（`lightrag/` 保持官方纯净，随时可升级）

## 方案概述

1. **协议对齐与零入侵**：
   官方 LightRAG 1.5.8 在 `lightrag/rerank.py` 中已实现针对阿里云 DashScope 的 `ali_rerank`，其入参规范与响应格式完全适配阿里百炼 `gte-rerank-v2`。
2. **双轨闭环覆盖**：
   - **轨道 A（WebUI 9621）**：官方启动流已具备环境变量读取能力，配置 `.env` 即可自动生效。
   - **轨道 B（FastMCP 8001）**：在 `llm_client.py` 封装 `create_lightrag_rerank_func()`，在 `workspace_manager.py` 构造 `LightRAG` 时注入该函数，彻底补全二次开发多租户引擎的重排盲区。
3. **安全回退保护**：
   若未配置 `RERANK_BINDING` 或设为 `null`，自动优雅回退为 `None`，不影响既有系统零配置启动。
