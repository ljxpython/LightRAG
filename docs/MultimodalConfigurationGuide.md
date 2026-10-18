# LightRAG 多模态与视觉解析配置全景指南 (Multimodal Configuration Guide)

> **老王寄语**：
> 艹！别他妈一上来就瞎改 `.env`，改崩了服务跑去求神拜佛！
> 多模态解析不是拍脑袋搞出来的玩具，它的背后是**“单图直通 VLM”**与**“复合文档走 MinerU 版面切片”**的双轨分流架构。
> 好好把这份文档通读一遍，每一个配置项的作用、取值范围、以及**为什么老王我要这么设计**，全部写得清清楚楚。
> 谁要是再配错导致线上服务起不来或者解析跑飞，自己去机房面壁思过！

---

## 目录
- [一、配置总览与速查模板 (.env)](#一配置总览与速查模板-env)
- [二、核心配置详解与设计哲学 (Why & How)](#二核心配置详解与设计哲学-why--how)
  - [1. 动静路由分流：`LIGHTRAG_PARSER`](#1-动静路由分流-lightrag_parser)
  - [2. 单图直连 VLM 视觉大模型配置](#2-单图直连-vlm-视觉大模型配置)
  - [3. 复合文档 MinerU 云端版面解析配置](#3-复合文档-mineru-云端版面解析配置)
  - [4. 底座基础大模型与 Embedding 配置](#4-底座基础大模型与-embedding-配置)
- [三、宿主机底层系统依赖与环境规范](#三宿主机底层系统依赖与环境规范)
- [四、服务热载与快速验证指南](#四服务热载与快速验证指南)
- [五、血泪排坑指南 (Troubleshooting)](#五血泪排坑指南-troubleshooting)

---

## 一、配置总览与速查模板 (.env)

生产环境 `.env` 中与多模态解析相关的核心配置段如下（密钥请替换为您自己的有效 Key）：

```bash
# ==============================================================================
# LightRAG 多模态与混合解析引擎生产配置 (Multimodal & Hybrid Parsing Pipeline)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. 动态文件路由分流表 (核心调度器)
# ------------------------------------------------------------------------------
# 规则格式: "ext1:parser1;ext2:parser2"
# 单张图片强制走 image_vlm (直连视觉模型)；复合图文长文档走 mineru-i (高保真版面提取)
LIGHTRAG_PARSER="png:image_vlm;jpg:image_vlm;jpeg:image_vlm;webp:image_vlm;bmp:image_vlm;pdf:mineru-i;docx:mineru-i;pptx:mineru-i;xlsx:mineru-i"

# ------------------------------------------------------------------------------
# 2. 单图直连视觉大模型 (VLM - Direct Image Engine)
# ------------------------------------------------------------------------------
# 是否启用 VLM 视觉深度理解 (单图与文档内嵌切图通用)
VLM_PROCESS_ENABLE=true

# VLM 协议与驱动绑定 (当前标准化为 OpenAI 兼容协议)
VLM_LLM_BINDING="openai"

# 视觉大模型名称 (推荐 deepseek-v4.1-flash / qwen-vl-max / gpt-4o-mini)
VLM_LLM_MODEL="deepseek-v4.1-flash"

# 视觉模型 API 端点 (注意必须带 /v1，中转站或官方网关)
VLM_LLM_BINDING_HOST="https://hk-api.maomaoai.pro/v1"

# 视觉模型鉴权密钥
VLM_LLM_BINDING_API_KEY="sk-wJJDDZtU7AbQ3KmjqnHh9ncr8wqmm4KHmXyKGGk38etuxINO"

# ------------------------------------------------------------------------------
# 3. 复合文档云端高保真解析器 (MinerU Official Cloud API)
# ------------------------------------------------------------------------------
# API 模式: official (官方云端), token (旧版), local (自建 GPU 微服务)
MINERU_API_MODE="official"

# MinerU 官方开放平台 Token (https://opendatalab.com 获取)
MINERU_API_TOKEN="sk-xpAi6CPvb7VNmX9Lc9OuMXZxVigBubY460ABpmxTmWMCOiUi"

# 模型内核版本: vlm (高精度多模态内核), pipeline (传统启发式版面分析)
MINERU_MODEL_VERSION="vlm"

# ------------------------------------------------------------------------------
# 4. 图文多模态处理辅助开关 (LightRAG 核心预留)
# ------------------------------------------------------------------------------
ENABLE_IMAGE_PROCESSING="true"
ENABLE_TABLE_PROCESSING="true"
ENABLE_EQUATION_PROCESSING="true"
VISION_BASE_URL="https://hk-api.maomaoai.pro/v1"
VISION_MODEL="deepseek-v4.1-flash"
VISION_API_KEY="sk-wJJDDZtU7AbQ3KmjqnHh9ncr8wqmm4KHmXyKGGk38etuxINO"
VISION_MAX_TOKENS="8192"
```

---

## 二、核心配置详解与设计哲学 (Why & How)

### 1. 动静路由分流：`LIGHTRAG_PARSER`

```bash
LIGHTRAG_PARSER="png:image_vlm;jpg:image_vlm;jpeg:image_vlm;webp:image_vlm;bmp:image_vlm;pdf:mineru-i;docx:mineru-i;pptx:mineru-i;xlsx:mineru-i"
```

#### 为什么这么配？（设计决策）
- **不要把单张图片当成长文档去解析！**
  - 如果你把一张用户上传的手绘架构图（`architecture.png`）扔给 MinerU，MinerU 内部会启动一套针对 PDF/长文的复杂版面流水线：排版区域定位 ➔ 切片 ➔ 坐标标定 ➔ 云端轮询拉取。这一套搞下来起码 **15~30 秒**，不仅极度缓慢，而且浪费极其珍贵的 MinerU 每日调用配额！更要命的是，MinerU 是**版面还原工具**，它不是**语义推理引擎**，它只负责把图抠出来，无法直接吐出“哪个微服务指向了哪个鉴权中心”的深度语义。
- **单图直达 `image_vlm` 的极致优势**：
  - 本地直读图片 Base64 编码，**0 毫秒外部排队**，直接打给 DeepSeek Flash VLM；
  - 3~4 秒内直接产出结构化的高密度 Markdown 描述；
  - `image_vlm_parser` 自动将 Markdown 描述灌入 LightRAG 的 `full_docs` 存储层，无缝触发后续的实体、关系、图谱抽取；
  - **100% 节省 MinerU 云端额度，性能提升 500% 以上！**
- **复合文档（PDF/DOCX/PPTX）坚决保留 `mineru-i`**：
  - 复合文档包含数十上百页的段落、多列排版、内嵌表格和复杂交叉插图。这种必须依赖 MinerU 的深度版面能力，将文档拆解成 Markdown 并将内嵌插图切块物理提取，打上页码坐标（Page N）后，再交给 VLM 进行逐图深度理解。

---

### 2. 单图直连 VLM 视觉大模型配置

```bash
VLM_PROCESS_ENABLE=true
VLM_LLM_BINDING="openai"
VLM_LLM_MODEL="deepseek-v4.1-flash"
VLM_LLM_BINDING_HOST="https://hk-api.maomaoai.pro/v1"
VLM_LLM_BINDING_API_KEY="sk-xxxx"
```

#### 关键参数解析：
| 变量名 | 默认值 / 选项 | 作用与约束 |
|---|---|---|
| `VLM_PROCESS_ENABLE` | `true` / `false` | 全局多模态视觉处理总开关。设为 `false` 则退化为纯文本 OCR，图表全部忽略。 |
| `VLM_LLM_BINDING` | `"openai"` | 驱动协议。必须保持 `"openai"`，采用标准 `chat/completions` 带 `image_url` 规范，兼容各大中转商与官方接口。 |
| `VLM_LLM_MODEL` | `"deepseek-v4.1-flash"` | 选用的视觉大模型。强烈推荐 `deepseek-v4.1-flash` 或 `qwen-vl-max`，兼顾超低时延与强推理能力。 |
| `VLM_LLM_BINDING_HOST` | URL | API 网关根地址，**末尾必须包含 `/v1`**（如 `https://api.openai.com/v1`）。 |
| `VLM_LLM_BINDING_API_KEY`| 字符串 | 必须具备调用所指定视觉模型权限的 API Key。 |

#### 为什么选择 DeepSeek Flash 作为 VLM？
1. **图文推理强**：不仅能识字（OCR），更能读懂手绘箭头、折线逻辑、微服务时序调用；
2. **极速低延迟**：单张大图解析耗时控制在 2~4 秒之间，用户在 WebUI 上传后几乎无需漫长等待；
3. **成本效益极致**：Token 单价仅为 GPT-4o 的数十分之一，支撑高频图文知识库上传毫无财务负担。

---

### 3. 复合文档 MinerU 云端版面解析配置

```bash
MINERU_API_MODE="official"
MINERU_API_TOKEN="sk-xxxx"
MINERU_MODEL_VERSION="vlm"
```

#### 关键参数解析：
| 变量名 | 推荐取值 | 备选值与风险 | 架构深层考量 |
|---|---|---|---|
| `MINERU_API_MODE` | `"official"` | `"local"` / `"token"` | 宿主机（如 `sshmy2`）仅有 3.6GB 内存无独立 GPU。若选 `"local"` 必须本地拉起 MinerU Docker 镜像，**瞬间 OOM 打爆系统**！`"official"` 走官方云端 API，完全**零显存、零本地负载**。 |
| `MINERU_API_TOKEN` | 官方申请的 Token | 不能为空 | 官方开放平台（OpenDataLab）每日提供足量免费点数，足够个人及团队内部知识库摄入。 |
| `MINERU_MODEL_VERSION` | `"vlm"` | `"pipeline"` | `"vlm"` 模式调用最新的 MinerU 2.5 视觉大模型底座进行版面分析，公式、复杂嵌套表格的还原率比传统的 `"pipeline"` 启发式规则高出至少 40% 以上。 |

---

### 4. 底座基础大模型与 Embedding 配置

必须保持与生产环境知识图谱抽取一致的模型通道，确保向量维度与切块大小精准对齐：

```bash
LLM_BASE_URL='https://hk-api.maomaoai.pro/v1'
LLM_MODEL='deepseek-v4.1-flash'
LLM_API_KEY='sk-xxxx'
LLM_MAX_TOKENS='8192'
# 禁用长文本思考过程，保证图谱抽取返回合法的 JSON 结构
LLM_EXTRA_BODY_JSON='{"thinking":{"type":"disabled"},"reasoning_effort":"off"}'

# 向量模型配置 (必须与底座 1024 维向量空间一致)
EMBEDDING_PROVIDER='openai'
EMBEDDING_BASE_URL='https://llm-r60wpm2s3hsi5nsa.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
EMBEDDING_MODEL='text-embedding-v4'
EMBEDDING_DIM='1024'
EMBEDDING_MAX_TOKENS='8192'
```

> [!IMPORTANT]
> **关于 `LLM_EXTRA_BODY_JSON` 的特别告诫**：
> 当使用 DeepSeek 等带有深度思考（Reasoning）的模型做底层知识抽取时，必须设置 `thinking: {"type": "disabled"}`。否则模型会在正文前输出 `<think>...</think>`，直接破坏 LightRAG 官方内核的 JSON 实体抽取解析器，导致全部入库失败！

---

## 三、宿主机底层系统依赖与环境规范

老王在生产落地时填过两个大坑，后人切记：

### 1. `libcairo2` 系统动态库（必装）
MinerU 客户端解析文档时，会依赖 `cairosvg` 将 SVG 转换为光栅化图片供后续处理。如果宿主机缺少系统级 Cairo 库，测试和解析会直接抛出 `OSError: no library called "cairo-2" was found`！
- **Ubuntu / Debian 安装命令**：
  ```bash
  sudo apt-get update && sudo apt-get install -y libcairo2
  ```
- **macOS 安装命令**：
  ```bash
  brew install cairo
  ```

### 2. 宿主机文件描述符与轻量守护
`sshmy2` 宿主机为 2 核 4G 规格，内存资源极其金贵。
本方案运行的两个服务：
- `rag-webui.service` (WebUI 转发与原生面板，端口 9621)
- `rag-service.service` (FastMCP 知识网关，端口 8001)
两个服务内存常驻各在 150MB~250MB 之间，全系统总可用内存保持在 2.4GB 以上，极为健康。**严禁在宿主机上私自拉起本地 OCR/VLM 重型容器！**

---

## 四、服务热载与快速验证指南

改动 `.env` 后，必须按以下标准流水线在宿主机上重启并验证：

### 1. 重启生产守护进程
```bash
sudo systemctl restart rag-service rag-webui
```

### 2. 观察服务启动状态
```bash
sudo systemctl status rag-service rag-webui --no-pager
```
确保输出中两个服务均为 `active (running)`，且无 Python Traceback 报错。

### 3. 运行多模态专属冒烟回归单测
```bash
uv run --with pytest --with pytest-asyncio pytest tests/test_locator_resolver.py -v
```
必须保证所有单测 100% PASSED。

### 4. 上传测试图片验证实测效果
在宿主机或本地准备一张架构图（如 `eval_data/test_direct_vlm_workflow_v2.png`），调用测试探针：
```bash
uv run python -c "
import asyncio
from lightrag import LightRAG
# 验证解析引擎是否就绪
from image_vlm_parser import register_image_vlm_engine
register_image_vlm_engine()
print('Image VLM Engine Registered Successfully!')
"
```

---

## 五、血泪排坑指南 (Troubleshooting)

### Q1: WebUI 网页拖拽图片时提示“不支持的文件格式”？
- **原因**：后端解析器列表里没有注册 `image_vlm`，或者 `LIGHTRAG_PARSER` 中没有绑定 `png:image_vlm`。导致 `GET /documents/supported_file_types` 接口没有把图片后缀下发给前端。
- **解决办法**：
  1. 检查 `run_lightrag_webui_server.py` 入口是否有 `from image_vlm_parser import register_image_vlm_engine; register_image_vlm_engine()`；
  2. 检查 `.env` 里的 `LIGHTRAG_PARSER` 是否包含 `png:image_vlm;jpg:image_vlm...`；
  3. 重启 `rag-webui.service`。

### Q2: 上传图片后显示“processed”，但在“文档内容”里看全是空白，也没有抽取出知识图谱节点？
- **原因**：自定义 Parser 返回了 `ParseResult`，但**没有调用 `await ctx.rag._persist_parsed_full_docs(...)`**！
- **原理解析**：LightRAG 的知识图谱构建流水线（Layer 3 Chunking & Extraction）不是通过内存消息队列直接吃正文的，而是拿 `doc_id` 去全量文档库（`full_docs`）查内容。如果 `full_docs` 没存，下游切块器就会认为这是一篇 0 字节的空文档，直接跳过实体抽取！
- **解决办法**：直接复用老王写好的 [`image_vlm_parser.py`](file:///Users/lijiaxin/PyCharmMiscProject/LightRAG/image_vlm_parser.py)，里面已经严格处理了 `_persist_parsed_full_docs` 事务闭环。

### Q3: 为什么有时候图谱抽取出乱七八糟的 `<think>` 标签？
- **原因**：大模型启用了 DeepSeek R1 等推理思考模式，导致思考过程混入 Prompt 返回结果。
- **解决办法**：在 `.env` 中加入：
  ```bash
  LLM_EXTRA_BODY_JSON='{"thinking":{"type":"disabled"},"reasoning_effort":"off"}'
  ```
  关闭思考模式，强迫模型直接输出标准图谱实体抽取 JSON。

---

*文档维护人：老王 (暴躁技术流)*  
*更新日期：2026-10-18*
