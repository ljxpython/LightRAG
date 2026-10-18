# 任务列表

## 进度追踪

| Task | 状态 | 负责环境 |
|---|---|---|
| Task 1.1: 宿主机解析引擎选型与环境配置注入（MinerU API） | [x] 已完成 | sshmy2 |
| Task 1.2: 启用 LIGHTRAG_PARSER 路由规则与图片格式放行验证 | [x] 已完成 | sshmy2 |
| Task 1.3: 配置 VLM 视觉大模型角色（VLM_LLM_*）打通图意理解链路 | [x] 已完成 | sshmy2 |
| Task 1.4: 验证复杂文档切片入库全流程（MinerU 云端高精度） | [x] 已完成 | sshmy2 |
| Task 1.5: 架构优化：单张图片直连 VLM 视觉大模型解析引擎（image_vlm） | [x] 已完成 | sshmy2 |
| Task 1.6: 联动 FastMCP 8 大工具与 WebUI 检索验证手绘拓扑多模态召回 | [x] 已完成 | sshmy2 |

## 任务详情

### Task 1.1 ~ 1.4: 多模态底层与 MinerU 复合文档链路
- 成功打通 MinerU 官方云端解析与 DeepSeek Flash 视觉模型角色挂载。
- 状态：`[x]` 已完成

### Task 1.5: 架构优化：单张图片直连 VLM 视觉解析器 (image_vlm)
- **改动内容：** 编写外挂解析器 `image_vlm_parser.py`（实现 `BaseParser`），单图片直接由 `deepseek-v4.1-flash` 就地解析生成 Markdown，绕过 MinerU 减少网络开销与额度损耗。在 WebUI 与 FastMCP 中动态注册 `image_vlm` 引擎。
- **路由规则更新：** `LIGHTRAG_PARSER="png:image_vlm;jpg:image_vlm;jpeg:image_vlm;webp:image_vlm;bmp:image_vlm;pdf:mineru-i;docx:mineru-i;pptx:mineru-i;xlsx:mineru-i"`
- **代码位置：** `image_vlm_parser.py`、`run_lightrag_webui_server.py`、`gateway_mcp_server.py`、`.env`
- **预期结果：** 单图上传时后台显示 `Deferred to image_vlm`，直调 VLM 提取图意与关系。
- **状态：** `[x]` 已完成

### Task 1.6: 联动 WebUI 检索验证手绘拓扑多模态召回
- **改动内容：** 针对带有手绘折线与多服务分支的架构图 `test_direct_vlm_workflow_v2.png` 提问，验证图意与实体召回。
- **预期结果：** 完美识别图中的方框与“折线箭头”走向，推导出 API Gateway 鉴权与知识库交互逻辑，附带 Reference。
- **状态：** `[x]` 已完成
