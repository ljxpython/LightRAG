---
name: verify-change
description: 所有 Task 完成后调用，在 sshmy2 上执行 4 级生产流水线验证，输出四态判定，完成状态一致性与守护状态收尾。
---

# Verify Change (LightRAG 生产底座专属)

## 触发时机

所有 `tasks.md` 中的 Task 标为 `[x]` 后。

## Final 验证步骤（在 sshmy2 上依次执行）

### 1. Level 1: 基础单测与隔离性验证
```bash
# 激活虚拟环境运行网关、读租约、多模态定位器测试
.venv/bin/pytest tests/ -v
```

### 2. Level 2: 平台 FastMCP 契约端到端检验
```bash
# 运行平台契约客户端，严格校验 _ResultV2/_Locator 数据模型反序列化
.venv/bin/python test_contract_client.py
```

### 3. Level 3: 双轨服务端口探活与功能检查
```bash
# 验证原生 WebUI 存活
curl -sI http://127.0.0.1:9621/webui/ | head -n 1
# 验证 FastMCP 网关存活
curl -sI http://127.0.0.1:8001/sse || curl -sI http://127.0.0.1:8001/
```

### 4. Level 4: 状态一致性检查
- `tasks.md` 所有任务均标记为完成
- `verification.md` 中 Phase 验证记录条数 == 已完成 Task 数
- `README.md` 的核心承诺（平台 0 改动、上游 0 侵入）得到守住
- `docs/CONTEXT.md` 同步最新系统状态与服务端口

## 四态判定

在 `verification.md` 的「最终结论」中记录：

| 状态 | 含义 |
|---|---|
| `done` | 全部 4 级流水线在 sshmy2 实测通过 |
| `partial` | 部分完成，明确列出未完成模块及原因 |
| `blocked` | 被外部依赖或凭据卡住，明确所缺条件 |
| `deferred` | 明确推迟，说明业务或技术理由 |

## 项目收尾

Final 验证全部为 `done` 后：
1. 将 `README.md` 的状态更新为 `已完成`
2. 更新项目主文档 `docs/CONTEXT.md`
3. 主动审视架构：本次改动是否产生重大教训？若有，沉淀至 `docs/lessons/`。
