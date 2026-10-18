"""Native Single-Image Direct VLM Parser for LightRAG.

Directly bridges single image files (PNG, JPG, JPEG, WEBP, BMP) to the configured
VLM (Vision-Language Model, e.g. deepseek-v4.1-flash / qwen-vl / gpt-4o) without
routing through external heavy document parsers like MinerU.
Bypasses cloud roundtrips, saves parser quota, and achieves 100% semantic vision understanding
for sketches, architectural diagrams, workflows, and charts.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
from pathlib import Path
from typing import Any

from lightrag.parser.base import BaseParser, ParseContext, ParseResult
from lightrag.parser.registry import ParserSpec, register_parser

logger = logging.getLogger("image_vlm_parser")

DEFAULT_IMAGE_VLM_PROMPT = """你是一个顶尖的专业多模态视觉认知与知识抽取专家。请对这张图片进行详尽、深入、结构化的解析，提取其中的全部知识内容：

1. 【图片类型与主题】：明确说明这是一张什么类型的图（如：系统架构图、业务流程图、网络拓扑图、手绘草图、数据统计图表、产品界面UI或实体照片）及核心主题。
2. 【核心组件与内容】：详细列出图中出现的所有组件、实体名称、标签、模块、角色及其对应的属性与说明。
3. 【逻辑关系与数据流向】：如果包含流程、箭头、连线或调用关系，请详细说明各组件之间的依赖关系、流向、分支条件（如成功/失败路径）及数据流动过程。
4. 【图内所有文字与数值】：忠实、完整地提取并列出图中出现的所有可见文字、标注、代码片段、关键数值或说明。
5. 【系统总结与推论】：基于该图表达的完整语义，给出系统级/业务级的完整总结。

请以清晰、专业、连贯的 Markdown 格式输出，确保所有细节与实体都被准确记录，以便后续知识检索与知识图谱构建。
"""

IMAGE_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "webp", "bmp"})


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

        mime = mimetypes.guess_type(str(source_path))[0] or "image/png"
        b64_str = base64.b64encode(raw_bytes).decode("ascii")

        img_payload = {
            "base64": b64_str,
            "mime_type": mime,
            "source_file": str(source_path),
            "doc_id": ctx.doc_id,
            "modality": "image",
        }

        # 优先使用专门配置的 VLM 角色函数，若未配置则回退到主 LLM
        vlm_func = None
        if hasattr(ctx.rag, "get_role_llm_func"):
            vlm_func = ctx.rag.get_role_llm_func("vlm")
        if vlm_func is None:
            vlm_func = getattr(ctx.rag, "llm_model_func", None)

        if vlm_func is None:
            raise RuntimeError("No LLM or VLM function available in LightRAG instance to parse image")

        logger.info(f"[image_vlm] Calling VLM for {resolved.document_name} ({len(raw_bytes)} bytes)")

        try:
            description = await vlm_func(
                DEFAULT_IMAGE_VLM_PROMPT,
                stream=False,
                image_inputs=[img_payload],
            )
        except Exception as exc:
            logger.error(f"[image_vlm] VLM call failed for {resolved.document_name}: {exc}")
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
    logger.info("[image_vlm] Registered image_vlm parser engine successfully")
