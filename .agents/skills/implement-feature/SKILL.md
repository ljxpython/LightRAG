---
name: implement-feature
description: 接口/架构改动实现过程中调用，每完成一个 Task 输出 Task Completion Card，更新 tasks.md 状态，确保在 sshmy2 上完成真实执行。
---

# Implement Feature (LightRAG 生产底座专属)

## 每个 Task 完成时（必须顺序执行）

1. 在 `tasks.md` 把该 Task 状态改为 `[x] 已完成`
2. 在 `verification.md` 的「Phase 验证」区块追加一条真实执行记录
3. 在对话中输出标准 **Task Completion Card**

## Task Completion Card 格式

```markdown
### Task {编号}: {任务名} ✅ {日期}
- **改动内容：** {做了什么}
- **代码位置：** `{文件路径}` → `{函数/类}`
- **验证项（sshmy2 真实执行）：**
  - 命令：`{执行的具体命令}`
  - 结果：`{真实终端输出摘要，如 5 passed in 1.2s}`
- **合规检查：**
  - [x] 代码实现完成，无冗余 speculative 设计
  - [x] 验证项在 sshmy2 上真实执行（杜绝伪造）
  - [x] 未侵入 lightrag/ 官方核心代码（保持上游纯净）
  - [x] 平台端接口契约 0 破坏
  - [x] tasks.md 与 verification.md 状态已同步更新
```

**铁律：没有 Task Completion Card 或验证项未在 sshmy2 真实运行 = 任务未完成。**

## 注意事项

- Phase 验证只跑该 Task 最小关联测试，快速迭代。
- 绝不改动任务无关的死代码或格式。
