# 验证记录

## Phase 验证（每个 Task 完成后）

<!-- 每个 Task 完成时在这里追加一条，附带 sshmy2 实测输出 -->

## Final 验证（4 级生产流水线）

### Level 1: 基础单元与隔离测试
- [ ] `uv run --with pytest --with pytest-asyncio pytest tests/ -v` 全部通过
- [ ] `git status --porcelain lightrag/` 必须为空（严格 0 侵入）

### Level 2: 平台 FastMCP 契约兼容性
- [ ] 8 大核心 FastMCP 工具签名未受任何影响
- [ ] `uv run python verify_8_tools_live.py` 全绿通过

### Level 3: 出题引擎并发与 Checkpoint 实测
- [ ] 20 题合成实测，观察并发日志交替输出
- [ ] 进程人为中断后恢复实测，确认 checkpoint 生效

### Level 4: 守护与进程稳定性
- [ ] `systemctl status rag-webui.service` 状态为 active (running)，无崩溃报错
- [ ] WebUI 题库列表正常加载新合成题库

### 最终结论
<!-- 待全流程验证后给出 -->
