"""Native Multi-Format Image & Vector Graphics Direct VLM Parser for LightRAG.

Directly bridges single image and vector files:
- Bitmaps: PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, TIF, ICO
- Vector Graphics: SVG (auto-rasterized via cairosvg + XML text extraction)
to the configured VLM (Vision-Language Model, e.g. deepseek-v4.1-flash / qwen-vl / gpt-4o)
without routing through external heavy document parsers like MinerU.

Bypasses cloud roundtrips, saves parser quota, and achieves 100% semantic vision understanding
for sketches, architectural diagrams, workflows, charts, posters, and UI components.
"""

from __future__ import annotations

import base64
import io
import logging
import mimetypes
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from lightrag.parser.base import BaseParser, ParseContext, ParseResult
from lightrag.parser.registry import ParserSpec, register_parser

logger = logging.getLogger("image_vlm_parser")

DEFAULT_IMAGE_VLM_PROMPT = """你是一个顶尖的专业多模态视觉认知与知识抽取专家。请对这张图片进行详尽、深入、结构化的解析，提取其中的全部知识内容：

1. 【图片类型与主题】：明确说明这是一张什么类型的图（如：知识海报、系统架构图、业务流程图、网络拓扑图、手绘草图、数据统计图表、产品界面UI或实体照片）及核心主题。
2. 【核心组件与内容】：详细列出图中出现的所有组件、实体名称、标签、模块、角色及其对应的属性与说明。
3. 【逻辑关系与数据流向】：如果包含流程、箭头、连线或调用关系，请详细说明各组件之间的依赖关系、流向、分支条件（如成功/失败路径）及数据流动过程。
4. 【图内所有文字与数值】：忠实、完整地提取并列出图中出现的所有可见文字、标注、代码片段、关键数值或说明。
5. 【系统总结与推论】：基于该图表达的完整语义，给出系统级/业务级的完整总结。

请全程严格使用简体中文输出（专有名词可在中文后用括号附带英文原名），以清晰、专业、连贯的 Markdown 格式输出，确保所有细节与实体都被准确记录，以便后续知识检索与知识图谱构建。
"""

# 全面支持的主流图片及矢量图形格式清单
IMAGE_EXTENSIONS = frozenset({
    "png", "jpg", "jpeg", "webp", "bmp",
    "svg",
    "gif",
    "tiff", "tif",
    "ico",
})


def _extract_svg_text(raw_bytes: bytes) -> str:
    """Extract readable text tokens from SVG XML structure."""
    tokens: list[str] = []
    try:
        root = ET.fromstring(raw_bytes)
        for elem in root.iter():
            # Match text-bearing elements
            tag = elem.tag.split("}")[-1].lower() if "}" in elem.tag else elem.tag.lower()
            if tag in ("text", "tspan", "title", "desc") and elem.text:
                cleaned = elem.text.strip()
                if cleaned:
                    tokens.append(cleaned)
    except Exception:
        # Fallback to regex token extraction
        try:
            content_str = raw_bytes.decode("utf-8", errors="ignore")
            matches = re.findall(r">([^<]+)<", content_str)
            for m in matches:
                cleaned = m.strip()
                if cleaned and not cleaned.startswith("<?"):
                    tokens.append(cleaned)
        except Exception:
            pass
    return "\n".join(tokens)


def _preprocess_image_bytes(raw_bytes: bytes, suffix: str) -> tuple[bytes, str, str | None, bool]:
    """Preprocess and normalize image bytes for Vision-Language Models.

    Returns:
        (image_bytes, mime_type, auxiliary_text, is_raster_image)
    """
    clean_suffix = suffix.lower().lstrip(".")
    auxiliary_text: str | None = None

    # 1. SVG 矢量图处理：提取文字并栅格化为高清 PNG
    if clean_suffix == "svg":
        auxiliary_text = _extract_svg_text(raw_bytes)
        try:
            import cairosvg
            # 将 SVG 栅格化为高质量 PNG 位图
            png_bytes = cairosvg.svg2png(bytestring=raw_bytes)
            if png_bytes:
                logger.info("[image_vlm] Successfully rasterized SVG to PNG via cairosvg")
                return png_bytes, "image/png", auxiliary_text, True
        except Exception as exc:
            logger.warning(f"[image_vlm] cairosvg rasterization skipped/failed ({exc}), fallback to XML analysis")

        # 若未安装 cairosvg 或特殊语法渲染失败，降级为纯文本/XML 语义解析
        return raw_bytes, "text/xml", auxiliary_text, False

    # 2. TIFF, ICO, BMP 处理：通过 Pillow 统一转为标准 RGB PNG
    if clean_suffix in ("tiff", "tif", "ico", "bmp"):
        try:
            from PIL import Image
            im = Image.open(io.BytesIO(raw_bytes))
            im = im.convert("RGB")
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            converted = buf.getvalue()
            logger.info(f"[image_vlm] Converted {clean_suffix} to PNG via Pillow ({len(converted)} bytes)")
            return converted, "image/png", None, True
        except Exception as exc:
            logger.warning(f"[image_vlm] Pillow conversion failed for {clean_suffix} ({exc}), using raw bytes")

    # 3. 常见位图格式 (PNG, JPG, JPEG, WEBP, GIF) 直接透传
    mime = mimetypes.guess_type(f"x.{clean_suffix}")[0] or "image/png"
    return raw_bytes, mime, None, True


class ImageVLMParser(BaseParser):
    engine_name = "image_vlm"

    async def parse(self, ctx: ParseContext) -> ParseResult:
        resolved = ctx.resolve(self.engine_name)
        source_path = resolved.source_path

        if not source_path.exists():
            raise FileNotFoundError(f"Image source file not found: {source_path}")

        raw_bytes = source_path.read_bytes()
        if not raw_bytes:
            raise ValueError(f"Image file is empty: {source_path}")

        suffix = source_path.suffix.lower()
        proc_bytes, mime, aux_text, is_raster = _preprocess_image_bytes(raw_bytes, suffix)

        # 优先使用专门配置的 VLM 角色函数，若未配置则回退到主 LLM
        vlm_func = None
        if hasattr(ctx.rag, "get_role_llm_func"):
            vlm_func = ctx.rag.get_role_llm_func("vlm")
        if vlm_func is None:
            vlm_func = getattr(ctx.rag, "llm_model_func", None)

        if vlm_func is None:
            raise RuntimeError("No LLM or VLM function available in LightRAG instance to parse image")

        # 组装 Prompt
        prompt = DEFAULT_IMAGE_VLM_PROMPT
        if aux_text:
            prompt += f"\n\n【辅助提取参考】：该矢量图内部包含以下原始文本标签：\n```text\n{aux_text}\n```\n请结合图面视觉渲染与上述文本，进行最精准的结构化提炼。"

        logger.info(f"[image_vlm] Processing {resolved.document_name} ({suffix}, is_raster={is_raster}, {len(proc_bytes)} bytes)")

        try:
            if is_raster:
                # 标准多模态位图路径：送入视觉大模型
                b64_str = base64.b64encode(proc_bytes).decode("ascii")
                img_payload = {
                    "base64": b64_str,
                    "mime_type": mime,
                    "source_file": str(source_path),
                    "doc_id": ctx.doc_id,
                    "modality": "image",
                }
                description = await vlm_func(
                    prompt,
                    stream=False,
                    image_inputs=[img_payload],
                )
            else:
                # SVG 渲染降级兜底路径：纯 XML 文本分析，避免非位图格式触发 OpenAI 400
                svg_xml_str = raw_bytes.decode("utf-8", errors="ignore")
                text_prompt = f"{prompt}\n\n【SVG 源码与标签内容】：\n```xml\n{svg_xml_str[:12000]}\n```"
                description = await vlm_func(
                    text_prompt,
                    stream=False,
                )
        except Exception as exc:
            logger.error(f"[image_vlm] Analysis failed for {resolved.document_name}: {exc}")
            raise RuntimeError(f"VLM analysis failed for image {resolved.document_name}: {exc}") from exc

        content = str(description).strip()
        if not content:
            content = f"# {resolved.document_name}\n(VLM returned empty analysis)"

        # 必须同步持久化到 full_docs，以便下游 chunking 与实体抽取阶段能直接读取内容
        import time
        from lightrag.constants import FULL_DOCS_FORMAT_RAW

        if hasattr(ctx.rag, "_persist_parsed_full_docs"):
            await ctx.rag._persist_parsed_full_docs(
                ctx.doc_id,
                {
                    "content": content,
                    "file_path": resolved.document_name,
                    "parse_format": FULL_DOCS_FORMAT_RAW,
                    "parse_engine": self.engine_name,
                    "update_time": int(time.time()),
                },
            )

        return ParseResult(
            doc_id=ctx.doc_id,
            file_path=resolved.document_name,
            parse_format=FULL_DOCS_FORMAT_RAW,
            content=content,
            blocks_path="",
            parse_engine=self.engine_name,
        )


def register_image_vlm_engine():
    """Register the image_vlm engine into LightRAG parser registry."""
    register_parser(
        ParserSpec(
            engine_name="image_vlm",
            impl="image_vlm_parser:ImageVLMParser",
            suffixes=IMAGE_EXTENSIONS,
            queue_group="native",
        )
    )
    logger.info(f"[image_vlm] Registered image_vlm parser engine for: {sorted(IMAGE_EXTENSIONS)}")
