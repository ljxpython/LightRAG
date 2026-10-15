---
name: upstream-guard
description: 核心护栏技能。用于检查并拦截对上游 LightRAG 核心算法代码（lightrag/）的任何侵入性修改，守住可维护性与随时升级底线。
---

# Upstream Guard (上游核心防污染护栏)

## 核心使命

**绝不容忍在 `lightrag/` 官方核心代码中拉屎！**
所有的多租户隔离、FastMCP 封装、Docling 页码反查、HMAC 授权、平台契约适配，必须 100% 收敛在外挂网关和适配层中。

## 触发时机

- 任何功能开发完成准备输出 Task Completion Card 时
- 执行 `verify-change` 终态验证前
- 怀疑有不规范改动侵入核心引擎时

## 检查命令

在 `sshmy2` 上执行：
```bash
git status --porcelain lightrag/
```

## 判定规则

1. **若输出为空**：
   - ✅ 检查通过！核心代码保持官方纯净，允许后续通过 pip/git 平滑升级。
2. **若输出非空（检测到改动）**：
   - 🚨 **立案严查**！严禁任何理由侵入 `lightrag/`！
   - 立即执行 `git diff lightrag/` 查看污染的代码。
   - 将业务改动剥离并重构到外挂模块（如 `gateway_mcp_server.py`、`locator_resolver.py` 或 `src/` 下）。
   - 执行 `git checkout -- lightrag/` 恢复上游纯净！
