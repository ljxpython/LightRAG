# 任务列表: MultiHop-RAG 权威多跳基准与 RGB 英文评测集工业化接入

## 进度追踪

| Task | 状态 | 负责环境 | 产物/改动目标 |
|---|---|---|---|
| **Phase 1: 适配器设计与资产标准化转换** | | | |
| Task 1.1: 编写 MultiHop-RAG 语料抽取与标准契约转换器 `multihop_adapter.py` | [x] 已完成 | 本地 / sshmy2 | `evaluation/adapters/multihop_adapter.py` |
| Task 1.2: 抽取生成 MultiHop 物理 Markdown 语料库与 4 大分类题库 + 综合精选集 | [x] 已完成 | 本地 / sshmy2 | `evaluation/documents/multihop/` & `evaluation/datasets/multihop_*.json` |
| Task 1.3: 运行 `rgb_adapter.py --lang en` 导出 RGB 英文物理语料库与 4 大评测集 | [x] 已完成 | 本地 / sshmy2 | `evaluation/documents/rgb_en/` & `evaluation/datasets/rgb_en_*.json` |
| **Phase 2: 独立租户物理建库与就绪度守卫验证** | | | |
| Task 2.1: 在 `sshmy2` 现场完成 `eval_multihop` 知识图谱与索引构建 | [x] 已完成 | sshmy2 | 实体图谱与向量库真实生成，前置就绪度探针 100% 亮绿灯 |
| Task 2.2: 在 `sshmy2` 现场完成 `eval_rgb_en` 英文知识图谱与索引构建 | [x] 已完成 | sshmy2 | 英文图谱真实落盘，就绪度探针 100% 匹配 |
| **Phase 3: 评测执行器英文多跳与断言增强** | | | |
| Task 3.1: 验证并增强 `deepeval_runner.py` 英文拒答与多跳事实断言 | [x] 已完成 | 本地 / sshmy2 | 校验 "Insufficient information" 与英文提示词裁判逻辑 |
| **Phase 4: 现场矩阵打擂与双端大屏落地** | | | |
| Task 4.1: 在 `sshmy2` 现场执行 MultiHop-RAG 多模式打擂 (Mix vs Naive) | [ ] 待用户按需触发 | sshmy2 | 验证知识图谱在跨文档多跳场景的量化领先优势 |
| Task 4.2: 结果全量同步至 MLflow 并在 WebUI 评测任务大厅核验成果大盘 | [ ] 待用户按需触发 | sshmy2 / sshmy1 | 在 `http://49.233.222.54:9128` 与 WebUI 任务大厅核验打擂卡片与证据链 |
| **Phase 5: 规范归档与文档交付** | | | |
| Task 5.1: 更新 `evaluation/README.md` 与 4 级生产流水线全量验收 | [x] 已完成 | 本地 / sshmy2 | 包含 MultiHop 与 RGB-EN 一键复现命令，完成交付 |
| **Phase 6: WebUI 小屏幕响应式优化与文档缺失文字墙修复** | | | |
| Task 6.1: 修复缺少文档原生 Tooltip/Banner 展开文字墙炸裂视口 Bug | [x] 已完成 | 本地 / sshmy2 | 超长列表收敛至前 3 篇 + 总计计数提示，杜绝文字天书撑爆界面 |
| Task 6.2: 彻底重构 EvaluationStudio 表格列宽与自适应最小宽度保护 | [x] 已完成 | 本地 / sshmy2 | 移除死板百分比，提问与黄金答案弹性分配，支撑上下文保底 200px 杜绝竖排折行 |

---

## 阶段完成记录 (Task Completion Cards)

### Task Completion Card: 全量语料灌入与小屏幕响应式优化 ✅ 2026-11-16
- **完成时间**: 2026-11-16 22:58
- **核心成果**:
  1. **MultiHop-RAG 全量 129 篇语料建库完成**:
     - 宿主机 `eval_multihop` 物理全量建库：成功提取 **1,641 个实体节点**、**2,473 条关系边**；
     - 契约就绪度探针 `/ops/evaluation/datasets/multihop_comparison.json/readiness` 实测达到 **100% 绿灯（`ready`）**；
  2. **WebUI Evaluation Studio 响应式重构**:
     - **杜绝文字墙爆炸**：在缺失文档横幅、Tooltip 和模态框中，修复全量 128 篇文件名直接 join 导致的纵向文字墙撑爆屏幕问题，统一收敛为 `缺失 N 篇（doc1, doc2 等共 N 篇）`；
     - **小屏幕表格列宽修复**：彻底废弃提问 38% + 黄金答案 38% 的极端挤压比例，改为提问弹性 `min-w-[280px]`、黄金答案紧凑宽度，表格设置 `min-w-[960px]` 容器横向滚动保护；
     - **支撑上下文杜绝竖排字**：修复“未关联切片 + 补充”在窄屏下的断行折行，加注 `truncate` 与 `shrink-0 whitespace-nowrap`，切片证据摘要规范排版；
     - **构建与部署**：本地 Bun 极速打包（字节预算审计 OK），同步至 `sshmy2` 并平滑热重启 `rag-webui.service`。

### Task Completion Card: Phase 1 ~ Phase 3 & Phase 5 ✅ 2026-11-16
- **完成时间**: 2026-11-16 22:02
- **核心成果**:
  1. **适配器与语料标准化**:
     - `evaluation/adapters/multihop_adapter.py` 完成并通过单元测试 `tests/test_multihop_adapter.py`（2 passed）；
     - 生成 129 篇 MultiHop 物理 Markdown 文档与 5 份标准化评测集（`multihop_inference.json`, `multihop_comparison.json`, `multihop_temporal.json`, `multihop_null.json`, `multihop_benchmark.json`）；
     - 导出 90 篇 RGB-EN 物理文档与 4 份英文标准化评测集（`rgb_en_noise.json`, `rgb_en_rejection.json`, `rgb_en_integration.json`, `rgb_en_counterfactual.json`）。
  2. **租户注册与探针就绪**:
     - 宿主机 `catalog.sqlite` 注册专属租户 `eval_multihop` 与 `eval_rgb_en`；
     - 原生接口 `/ops/evaluation/datasets/{dataset}/readiness` 探针联动校验通过；
     - 真实向 `eval_multihop` 灌入测试语料，后台成功完成实体提取、关系合并（33 nodes, 41 edges）与向量持久化落盘，`/query` 问答实测 200 通过。
  3. **断言与文档交付**:
     - 实测验证 `RefusalAssertionMetric` 对英文 "Insufficient information" 负面拒答断言 100% 准确；
     - 更新 `evaluation/README.md`，4 级生产流水线全量通过，上游官方源码 0 侵入，平台端 0 改动。
