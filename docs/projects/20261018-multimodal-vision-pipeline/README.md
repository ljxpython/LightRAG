# 多模态图文解析与视觉流水线工程 (Multimodal Vision Pipeline)

- **时间：** 2026-10-18
- **目标：** 构建 LightRAG 生产底座的多模态知识摄入能力，全面支持单图片上传索引（JPG/PNG/WEBP/BMP）与文档内嵌图片（PDF/Word/PPTX）的版面切片、OCR 提取与 VLM 视觉语义入库。
- **影响模块：** `run_lightrag_webui_server.py`、`gateway_mcp_server.py`、`image_vlm_parser.py`、`locator_resolver.py`、`.env`、`systemd` 守护配置。
- **状态：** 已完成 (Completed & Production Ready)
- **配置与设计指南：** 详见 [`docs/MultimodalConfigurationGuide.md`](file:///Users/lijiaxin/PyCharmMiscProject/LightRAG/docs/MultimodalConfigurationGuide.md) 与模板 [`.env.multimodal.example`](file:///Users/lijiaxin/PyCharmMiscProject/LightRAG/.env.multimodal.example)

## 核心承诺
- **平台端改动：** 0 行代码修改（完全兼容 FastMCP 与 `_ResultV2` 契约，上层平台透明消费多模态知识）。
- **上游侵入度：** 0 行代码侵入（`lightrag/` 官方目录保持 0 修改，随时可升级上游港大官方分支）。
- **真实环境必须可复现：** 所有配置与多模态链路在 `sshmy2` 宿主机现场验证，禁止脑补。

## 方案概述

### 1. 现状痛点
1. **单图被拒**：前端与后端默认仅激活纯文本/本地轻量解析器（`legacy`），纯图片格式在 `GET /documents/supported_file_types` 中被熔断隐藏，上传被强行拦截；
2. **图文丢失**：PDF/Word 走 `pypdf` 与 `python-docx`，无法提取扫描件、流程图、架构图等图像信息，文档中的内嵌图表信息 100% 丢失；
3. **硬件制约**：黄金宿主机 `sshmy2` 仅有 3.6GB 内存且无独立 GPU，本地若强行跑重型版面深度学习模型（如本地 Docling/MinerU 容器）存在致命 OOM 隐患。

### 2. 双轨架构设计
本方案采用分层解耦架构：
```
[用户上传 / 平台知识库]
        │
        ├── ① 单图片文件 (JPG / PNG / WEBP / BMP)
        └── ② 复杂复合文档 (PDF / Word / PPTX / MD)
        │
        ▼
[第一层：版面结构解析与图文切片 (Parser Layer)]
  ├── 选型 A (轻量云端·推荐)：MinerU Official API (零显存消耗，免费额度充沛)
  └── 选型 B (私有化微服务)：独立/远端 Docling-Serve 容器微服务
        │  
        ├── 生成: .blocks.jsonl (结构化版块及页码)
        ├── 生成: .drawings.json (内嵌/独立插图裁切切片)
        └── 输出: 原生 OCR 识别文字 (Inner Text)
        │
        ▼
[第二层：视觉多模态认知与语义入库 (VLM Multimodal Layer)]
  ├── 启用开关: VLM_PROCESS_ENABLE=true
  ├── 视觉绑定: VLM_LLM_BINDING="openai" (兼容 Qwen-VL / GPT-4o 等视觉模型)
  ├── 图像描述生成: 将图片送入 VLM 大模型，生成精准的图意总结与关键实体
  └── 知识图谱融入: 图意描述与实体关系无缝并入 LightRAG Graph 与 Vector Storage
        │
        ▼
[第三层：上层精准检索与证据链溯源 (FastMCP & WebUI)]
  ├── LocatorResolver: 精准锁定所属页码 (Page N) 与插图引用
  └── FastMCP: 平台透明查询，答案附带多模态证据链
```
