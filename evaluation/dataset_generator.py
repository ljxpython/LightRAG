#!/usr/bin/env python3
"""
Universal Dataset Synthesizer for LightRAG Evaluation.

Features:
1. Physical Lineage Tracking: Binds project, revision, and document hashes (Corpus Manifest).
2. Lifecycle Evolution (CRUD):
   - ADD: Generates intra-doc and cross-generation multi-hop questions.
   - MODIFY: Flags stale questions and re-verifies ground truth against updated chunks.
   - DELETE: Converts obsolete questions into Negative/Refusal QA (Huawei RGB standard).
3. Tri-Engine Architecture:
   - native: High-throughput Evol-Instruct (zero-dependency).
   - deepeval: Official Synthesizer.
   - ragas: TestsetGenerator with dynamic shims.
4. MLflow Dataset Registration & Visual Table Logging.
"""

import os
import sys
import json
import time
import uuid
import random
import hashlib
import asyncio
import logging
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# 强制行缓冲推流
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

# Ensure project root in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import httpx
from dotenv import load_dotenv

env_file = PROJECT_ROOT / ".env"
if env_file.exists():
    load_dotenv(env_file)
else:
    load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("dataset_generator")


# ----------------------------------------------------------------------
# 1. Project Physical Corpus & Lineage Extraction
# ----------------------------------------------------------------------
def _is_valid_project_dir(p: Path) -> bool:
    if not p.is_dir():
        return False
    # 1. 检查 active 软链/目录
    active = p / "active"
    if active.exists() and (active / "kv_store_full_docs.json").exists():
        return True
    # 2. 检查直属 rev_* 目录
    for d in p.iterdir():
        if d.is_dir() and d.name.startswith("rev_") and (d / "kv_store_full_docs.json").exists():
            return True
    # 3. 检查 revisions/rev_*
    rev_parent = p / "revisions"
    if rev_parent.exists() and rev_parent.is_dir():
        for d in rev_parent.iterdir():
            if d.is_dir() and d.name.startswith("rev_") and (d / "kv_store_full_docs.json").exists():
                return True
    return False


def extract_project_corpus(
    project_id: str,
    storage_base: Optional[Path] = None,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Extracts actual indexed documents and text chunks directly from LightRAG physical storage.
    Returns:
        corpus_manifest: Metadata dict containing doc_ids, file names, and content hashes.
        chunks: List of chunk dicts with real chunk_ids, source_doc_id, and text.
    """
    if storage_base is None:
        storage_base = PROJECT_ROOT / "sandbox_storage"

    # 智能多级检索候选目录 (支持平铺或多租户层级 sandbox_storage/<tenant>/<project_id>)
    proj_dir: Optional[Path] = None
    direct = storage_base / project_id
    if _is_valid_project_dir(direct):
        proj_dir = direct
    else:
        candidates = []
        for sub in storage_base.iterdir():
            if sub.is_dir() and not sub.name.startswith("."):
                c = sub / project_id
                if c.exists() and c.is_dir():
                    candidates.append(c)
        valid_candidates = [c for c in candidates if _is_valid_project_dir(c)]
        if valid_candidates:
            # 优先选择具有有效索引文件且属于 __default 或 default 租户的目录
            valid_candidates.sort(key=lambda p: 0 if "__default" in str(p) else 1)
            proj_dir = valid_candidates[0]
        elif candidates:
            proj_dir = candidates[0]
        else:
            proj_dir = direct

    if not proj_dir.exists():
        logger.error(f"❌ 找不到项目物理存储目录: {project_id} (已检索 {storage_base} 及其所有租户子目录)")
        return {}, []

    logger.info(f"📂 成功命中有效项目物理目录: {proj_dir}")

    # 定位有效版本目录 (优先 active 软链，其次最新 rev_N)
    rev_dir: Optional[Path] = None
    active_link = proj_dir / "active"
    if active_link.exists():
        rev_dir = active_link.resolve()
    else:
        candidate_revs = [d for d in proj_dir.iterdir() if d.is_dir() and d.name.startswith("rev_")]
        if not candidate_revs and (proj_dir / "revisions").exists():
            candidate_revs = [d for d in (proj_dir / "revisions").iterdir() if d.is_dir() and d.name.startswith("rev_")]
        if candidate_revs:
            candidate_revs.sort(
                key=lambda d: int(d.name.split("_")[1]) if len(d.name.split("_")) > 1 and d.name.split("_")[1].isdigit() else 0
            )
            rev_dir = candidate_revs[-1]

    if rev_dir is None or not rev_dir.exists():
        logger.error(f"❌ 项目 {project_id} 没有任何有效的版本目录 (rev_*)")
        return {}, []

    docs_file = rev_dir / "kv_store_full_docs.json"
    chunks_file = rev_dir / "kv_store_text_chunks.json"

    if not docs_file.exists():
        logger.error(f"❌ 找不到文档索引文件: {docs_file}")
        return {}, []

    docs_raw = json.loads(docs_file.read_text(encoding="utf-8"))
    chunks_raw = json.loads(chunks_file.read_text(encoding="utf-8")) if chunks_file.exists() else {}

    manifest_docs = []
    hasher = hashlib.sha256()

    for doc_id, doc_info in sorted(docs_raw.items()):
        fpath = doc_info.get("file_path", doc_id)
        fname = Path(fpath).name
        c_hash = doc_info.get("content_hash")
        if not c_hash:
            c_hash = hashlib.sha256(doc_info.get("content", "").encode("utf-8")).hexdigest()
        hasher.update(c_hash.encode("utf-8"))

        manifest_docs.append({
            "doc_id": doc_id,
            "file_name": fname,
            "file_path": fpath,
            "content_hash": c_hash,
            "status": "ACTIVE",
            "chunks_count": 0,
        })

    doc_id_to_manifest = {d["doc_id"]: d for d in manifest_docs}
    extracted_chunks = []

    for chunk_id, chunk_info in chunks_raw.items():
        doc_id = chunk_info.get("full_doc_id")
        content = chunk_info.get("content", "").strip()
        # Filter out trivial, SVG paths, or file-metadata-only chunks
        if not _is_meaningful_text_chunk(content):
            continue

        parent_doc = doc_id_to_manifest.get(doc_id)
        src_name = parent_doc["file_name"] if parent_doc else "unknown"
        if parent_doc:
            parent_doc["chunks_count"] += 1

        extracted_chunks.append({
            "chunk_id": chunk_id,
            "doc_id": doc_id,
            "source": src_name,
            "text": content,
        })

    snapshot_hash = hasher.hexdigest()
    corpus_manifest = {
        "project_id": project_id,
        "revision_id": rev_dir.name,
        "snapshot_hash": f"sha256:{snapshot_hash}",
        "total_docs": len(manifest_docs),
        "total_chunks": len(extracted_chunks),
        "docs": manifest_docs,
    }

    logger.info(f"📦 成功从物理索引抽取血缘: 项目={project_id}, 版本={rev_dir.name}, 文档数={len(manifest_docs)}, 切片数={len(extracted_chunks)}")
    return corpus_manifest, extracted_chunks


def load_documents_from_dir(docs_dir: Path, chunk_size: int = 600, overlap: int = 100) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Fallback loader: loads local markdown/text files when not extracting from physical storage."""
    chunks = []
    manifest_docs = []
    hasher = hashlib.sha256()

    if not docs_dir.exists():
        logger.warning(f"⚠️ 语料目录不存在: {docs_dir}")
        return {}, []

    supported_exts = [".md", ".txt", ".json"]
    files = [f for f in docs_dir.iterdir() if f.suffix.lower() in supported_exts and f.name != "README.md"]

    for fpath in sorted(files):
        try:
            content = fpath.read_text(encoding="utf-8").strip()
            if not content:
                continue
            doc_id = f"doc_{fpath.stem}_{hashlib.md5(fpath.name.encode()).hexdigest()[:8]}"
            c_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
            hasher.update(c_hash.encode("utf-8"))

            manifest_docs.append({
                "doc_id": doc_id,
                "file_name": fpath.name,
                "file_path": str(fpath),
                "content_hash": c_hash,
                "status": "ACTIVE",
            })

            start = 0
            doc_chunks = 0
            while start < len(content):
                end = min(start + chunk_size, len(content))
                chunk_text = content[start:end].strip()
                if len(chunk_text) > 80:
                    chunks.append({
                        "chunk_id": f"{fpath.stem}_chunk_{doc_chunks:03d}",
                        "doc_id": doc_id,
                        "source": fpath.name,
                        "text": chunk_text,
                    })
                    doc_chunks += 1
                if end == len(content):
                    break
                start += chunk_size - overlap
        except Exception as e:
            logger.error(f"❌ 读取文档失败 {fpath}: {e}")

    corpus_manifest = {
        "project_id": "local_directory",
        "revision_id": "file_system",
        "snapshot_hash": f"sha256:{hasher.hexdigest()}",
        "total_docs": len(manifest_docs),
        "total_chunks": len(chunks),
        "docs": manifest_docs,
    }
    return corpus_manifest, chunks


# ----------------------------------------------------------------------
# 2. Native Evol-Instruct Prompts (SOTA Quality)
# ----------------------------------------------------------------------
PROMPT_SIMPLE = """你是一位专业的 RAG 基准测试专家。请仔细阅读以下知识切片，设计一道直接、明确的事实型问答题目（Simple Fact Retrieval）。

【知识切片】：
{context}

要求：
1. 题目考察切片中的核心事实、专有名词、定义或关键数据；
2. 答案（ground_truth）必须完全根据上述切片总结，简明扼要，严禁编造；
3. 以 JSON 格式输出，不要有任何多余文字：
{{"question": "问题", "ground_truth": "基于切片的准确答案"}}
"""

PROMPT_REASONING = """你是一位专业的知识推理专家。请仔细阅读以下知识切片，设计一道具有因果逻辑或机制推理深度的问题（Reasoning QA）。

【知识切片】：
{context}

要求：
1. 问题关注“为什么（Why）”、“背后的机理是什么（How）”或“带来了何种架构/性能影响”；
2. 答案（ground_truth）必须包含逻辑推理过程，步步紧扣上下文切片；
3. 以 JSON 格式输出，不要有任何多余文字：
{{"question": "问题", "ground_truth": "清晰严谨的推理答案"}}
"""

PROMPT_MULTI_HOP = """你是一位专业的知识图谱基准评测专家。以下提供两个不同的知识切片，请挖掘两者之间的隐含实体关联或因果链条，设计一道多跳推理问答（Multi-Hop Reasoning QA）。

【切片 1 (来自 {src1})】：
{context1}

【切片 2 (来自 {src2})】：
{context2}

要求：
1. 问题必须同时依赖两个切片的信息才能得出完整答案，仅看其中一个切片无法完全回答（多跳题典型特征）；
2. 答案（ground_truth）完整整合两个切片的依据，阐明跨切片的逻辑关联；
3. 以 JSON 格式输出，不要有任何多余文字：
{{"question": "多跳推理问题", "ground_truth": "融合两处依据的完整答案"}}
"""

PROMPT_CONDITIONAL = """你是一位专业的鲁棒性与边界条件测试专家。请根据以下知识切片，设计一道带有假设条件或边界约束的应用题（Conditional / Constraint QA）。

【知识切片】：
{context}

要求：
1. 问题设定一个特定的工程场景或假设前置条件（如“如果在高并发写冲突下...”、“当用户没有配置外部图数据库时...”）；
2. 答案（ground_truth）基于切片原理做出针对性的判断与推演；
3. 以 JSON 格式输出，不要有任何多余文字：
{{"question": "带条件约束的问题", "ground_truth": "结合假设的推演答案"}}
"""

PROMPT_REVERIFY = """知识库文档已更新。请根据最新切片内容，审查并修正历史问题的标准答案（Ground Truth）。如果新切片中已经不再支持或修改了关键信息，请给出最新准确答案。

【最新切片】：
{context}

【原题目】：{question}
【原标准答案】：{old_gt}

请以 JSON 格式输出：
{{"ground_truth": "修正后的最新标准答案", "change_summary": "改动说明"}}
"""


def _is_meaningful_text_chunk(content: str) -> bool:
    """Filters out SVG paths, base64 data, dense CSS/code snippets that are unsuitable for QA synthesis."""
    if not content or len(content) < 120:
        return False
    lower = content.lower()
    # 彻底过滤 SVG 矢量代码与矢量路径
    if "<svg" in lower or "viewbox=" in lower or "xmlns=\"http://www.w3.org/2000/svg" in lower:
        return False
    if "<path d=" in lower or "%3cpath d=" in lower or "fill-rule=" in lower or "d='m" in lower or 'd="m' in lower:
        return False
    # 过滤元数据单行
    if content.startswith("Title:") and len(content) < 250:
        return False
    # 统计符号率与文本密度：有效自然语言字符比例过低直接剔除
    alphanumeric_count = sum(1 for ch in content if ch.isalnum() or '\u4e00' <= ch <= '\u9fff')
    if alphanumeric_count / max(len(content), 1) < 0.40:
        return False
    return True


def _is_valid_qa_pair(q: Any, gt: Any) -> bool:
    """Strictly validates question and ground_truth to prevent placeholder ellipses or empty QAs."""
    if not q or not gt:
        return False
    q_str = str(q).strip()
    gt_str = str(gt).strip()
    # 彻底杜绝省略号占位符
    if "..." in q_str or q_str == "…" or "…" in gt_str or gt_str == "..." or "…" in q_str:
        return False
    if len(q_str) < 6 or len(gt_str) < 3:
        return False
    # 过滤拒答短语
    refusal_keywords = ["cannot answer", "not able to", "无法回答", "无法从提供的上下文", "无法生成", "抱歉"]
    if any(kw in q_str.lower() for kw in refusal_keywords):
        return False
    return True


def extract_json_from_llm(raw_text: str) -> Optional[Dict[str, Any]]:
    """Robustly extracts JSON object from arbitrary LLM output (including thinking text / fences)."""
    raw_text = raw_text.strip()
    s = raw_text.find("{")
    e = raw_text.rfind("}")
    if s != -1 and e != -1 and e > s:
        candidate = raw_text[s:e+1]
        try:
            return json.loads(candidate)
        except Exception:
            # Handle possible trailing commas
            pass
    return None


class NativeSynthesizer:
    """High-throughput Evol-Instruct Synthesizer with Lineage Awareness."""

    def __init__(self, base_url: str, api_key: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    async def _call_llm(self, client: httpx.AsyncClient, prompt: str) -> Optional[Dict[str, Any]]:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "你是一个严格输出合规 JSON 的资深评测集生成专家。请只输出合规 JSON 对象。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 1024,
        }
        for retry in range(3):
            try:
                url = f"{self.base_url}/chat/completions"
                resp = await client.post(url, headers=headers, json=payload, timeout=45.0)
                resp.raise_for_status()
                data = resp.json()
                raw_text = data["choices"][0]["message"]["content"]
                parsed = extract_json_from_llm(raw_text)
                if parsed and "question" in parsed and "ground_truth" in parsed:
                    return parsed
            except Exception as e:
                if retry == 2:
                    logger.warning(f"⚠️ LLM 生成单题异常: {e}")
                await asyncio.sleep(1.0)
        return None

    async def generate_cases(
        self,
        chunks: List[Dict[str, Any]],
        target_size: int,
        existing_chunks: Optional[List[Dict[str, Any]]] = None,
        prefix: str = "GEN",
        checkpoint_path: Optional[Path] = None,
        concurrency: int = 4,
    ) -> List[Dict[str, Any]]:
        if not chunks:
            return []

        results: List[Dict[str, Any]] = []
        if checkpoint_path and checkpoint_path.exists():
            try:
                cached = json.loads(checkpoint_path.read_text(encoding="utf-8"))
                if isinstance(cached, list) and len(cached) > 0:
                    results = cached
                    logger.info(f"⚡ 发现已存在 Checkpoint 断点，已成功恢复 {len(results)}/{target_size} 题！")
            except Exception as ex:
                logger.warning(f"⚠️ 读取 Checkpoint 失败，重新生成: {ex}")

        if len(results) >= target_size:
            logger.info(f"🎉 Checkpoint 已包含足够考题 ({len(results)} >= {target_size})，直接跳过生成！")
            return results[:target_size]

        sem = asyncio.Semaphore(concurrency)
        lock = asyncio.Lock()

        async def _worker(seq_idx: int, evo_type: str, client: httpx.AsyncClient):
            async with sem:
                async with lock:
                    if len(results) >= target_size:
                        return

                gen = None
                evidence_contexts = []
                source_doc_ids = []
                sources = []
                chunk_ids = []

                # Retry up to 4 candidate chunks
                for attempt in range(4):
                    if evo_type == "multi_hop":
                        c1 = random.choice(chunks)
                        if existing_chunks and len(existing_chunks) > 0:
                            c2 = random.choice(existing_chunks)
                        else:
                            candidates = [c for c in chunks if c.get("doc_id") != c1.get("doc_id")]
                            c2 = random.choice(candidates) if candidates else random.choice(chunks)

                        prompt = PROMPT_MULTI_HOP.format(
                            src1=c1.get("source", "doc1"),
                            context1=c1["text"][:1000],
                            src2=c2.get("source", "doc2"),
                            context2=c2["text"][:1000]
                        )
                        evidence_contexts = [c1["text"], c2["text"]]
                        source_doc_ids = list(set([c1.get("doc_id", ""), c2.get("doc_id", "")]))
                        sources = list(set([c1.get("source", ""), c2.get("source", "")]))
                        chunk_ids = list(set([c1.get("chunk_id", ""), c2.get("chunk_id", "")]))
                    else:
                        c = random.choice(chunks)
                        if evo_type == "reasoning":
                            prompt = PROMPT_REASONING.format(context=c["text"][:1200])
                        elif evo_type == "conditional":
                            prompt = PROMPT_CONDITIONAL.format(context=c["text"][:1200])
                        else:
                            prompt = PROMPT_SIMPLE.format(context=c["text"][:1200])
                        evidence_contexts = [c["text"]]
                        source_doc_ids = [c.get("doc_id", "")]
                        sources = [c.get("source", "")]
                        chunk_ids = [c.get("chunk_id", "")]

                    gen = await self._call_llm(client, prompt)
                    if gen and _is_valid_qa_pair(gen.get("question"), gen.get("ground_truth")):
                        break

                async with lock:
                    if len(results) >= target_size:
                        return
                    if gen and _is_valid_qa_pair(gen.get("question"), gen.get("ground_truth")):
                        curr_total = len(results) + 1
                        test_case = {
                            "test_id": f"{prefix}_{curr_total:03d}_{evo_type}",
                            "question": gen["question"].strip(),
                            "ground_truth": gen["ground_truth"].strip(),
                            "contexts": evidence_contexts,
                            "source_doc_ids": [d for d in source_doc_ids if d],
                            "source_docs": sources,
                            "source_chunk_ids": chunk_ids,
                            "evolution_type": evo_type,
                            "lifecycle_tag": "ACTIVE",
                        }
                        results.append(test_case)
                        if checkpoint_path:
                            try:
                                with open(checkpoint_path, "w", encoding="utf-8") as chk_f:
                                    json.dump(results, chk_f, ensure_ascii=False, indent=2)
                            except Exception as chk_ex:
                                logger.warning(f"写入 Checkpoint 异常: {chk_ex}")

                        pct = min(95, int(35 + (curr_total / target_size) * 60))
                        print(f"[PROGRESS: {pct}%] [CASE: {curr_total}/{target_size}] 正在演化类型: 【{evo_type}】...", flush=True)
                        print(f"      ✅ [{curr_total:02d}/{target_size:02d}] 题干: {gen['question'][:60]}...", flush=True)
                    else:
                        logger.warning(f"      ❌ 类型 {evo_type} 多次重试未产生有效问答对，将在补偿轮次重试")

        async with httpx.AsyncClient(timeout=60.0) as client:
            round_idx = 0
            while len(results) < target_size and round_idx < 4:
                round_idx += 1
                needed_size = target_size - len(results)
                types = (
                    ["multi_hop"] * int(needed_size * 0.4) +
                    ["reasoning"] * int(needed_size * 0.3) +
                    ["simple"] * int(needed_size * 0.2) +
                    ["conditional"] * (needed_size - int(needed_size * 0.4) - int(needed_size * 0.3) - int(needed_size * 0.2))
                )
                if not types:
                    types = ["simple"] * needed_size
                random.shuffle(types)
                if round_idx > 1:
                    logger.info(f"🔄 启动第 {round_idx} 轮差额补偿生成: 当前已完成 {len(results)}/{target_size} 题，补充派发 {len(types)} 个生成任务...")

                tasks = [
                    _worker(idx, evo_type, client)
                    for idx, evo_type in enumerate(types, start=1)
                ]
                await asyncio.gather(*tasks)

        return results[:target_size]

    async def reverify_stale_case(self, client: httpx.AsyncClient, case: Dict[str, Any], new_chunk_text: str) -> Dict[str, Any]:
        prompt = PROMPT_REVERIFY.format(
            context=new_chunk_text,
            question=case["question"],
            old_gt=case["ground_truth"],
        )
        res = await self._call_llm(client, prompt)
        if res and "ground_truth" in res:
            case["ground_truth"] = res["ground_truth"]
            case["lifecycle_tag"] = "ACTIVE"
            case["contexts"] = [new_chunk_text]
            case["reverified_note"] = res.get("change_summary", "Updated from modified doc chunks")
            logger.info(f"   🔄 已重校题目 {case['test_id']} 的标准答案")
        return case


# ----------------------------------------------------------------------
# 3. Lifecycle CRUD Incremental Evolution Engine
# ----------------------------------------------------------------------
async def evolve_lifecycle_dataset(
    base_dataset_path: Path,
    current_manifest: Dict[str, Any],
    current_chunks: List[Dict[str, Any]],
    target_size: int,
    base_url: str,
    api_key: str,
    model: str,
    checkpoint_path: Optional[Path] = None,
    concurrency: int = 4,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Diffs current physical storage against base dataset manifest:
    - ADD: Generates new questions for new docs + cross-generation multi-hop.
    - MODIFY: Flags modified doc questions, re-verifies ground truth.
    - DELETE: Converts obsolete questions into Negative/Refusal QA (Huawei RGB).
    """
    logger.info(f"🔍 启动生命周期 CRUD 差量演化分析: 基准文件={base_dataset_path}")
    base_data = json.loads(base_dataset_path.read_text(encoding="utf-8"))
    base_manifest = base_data.get("corpus_manifest", {})
    base_docs_map = {d["doc_id"]: d for d in base_manifest.get("docs", [])}
    curr_docs_map = {d["doc_id"]: d for d in current_manifest.get("docs", [])}

    base_cases: List[Dict[str, Any]] = base_data.get("test_cases", [])
    synthesizer = NativeSynthesizer(base_url, api_key, model)

    # 1. Detect Differences
    new_doc_ids = set(curr_docs_map.keys()) - set(base_docs_map.keys())
    deleted_doc_ids = set(base_docs_map.keys()) - set(curr_docs_map.keys())
    common_doc_ids = set(base_docs_map.keys()) & set(curr_docs_map.keys())

    modified_doc_ids = set()
    for doc_id in common_doc_ids:
        if base_docs_map[doc_id].get("content_hash") != curr_docs_map[doc_id].get("content_hash"):
            modified_doc_ids.add(doc_id)

    logger.info(f"📊 差量探测结果: 新增文档={len(new_doc_ids)}篇, 变更文档={len(modified_doc_ids)}篇, 移除文档={len(deleted_doc_ids)}篇")

    # 2. Handle DELETED Docs ➔ Convert to Negative Refusal QA (Huawei RGB)
    for case in base_cases:
        case_doc_ids = set(case.get("source_doc_ids", []))
        if case_doc_ids & deleted_doc_ids:
            logger.info(f"🛡️ [负样本转化] 题目 {case['test_id']} 所属文档已删除，自动转为负面拒答考题！")
            case["evolution_type"] = "refusal_verification"
            case["lifecycle_tag"] = "REFUSAL_NEGATIVE"
            case["ground_truth"] = "知识库中已不存在该文档或规范信息，系统应当明确表示未找到相关内容或拒答，严禁编造幻觉。"
            case["contexts"] = []

    # 3. Handle MODIFIED Docs ➔ Reverify Stale Cases
    if modified_doc_ids:
        async with httpx.AsyncClient(timeout=60.0) as client:
            for case in base_cases:
                case_doc_ids = set(case.get("source_doc_ids", []))
                hit_mod = case_doc_ids & modified_doc_ids
                if hit_mod and case.get("lifecycle_tag") != "REFUSAL_NEGATIVE":
                    # Find new chunk
                    mod_chunks = [c["text"] for c in current_chunks if c.get("doc_id") in hit_mod]
                    if mod_chunks:
                        await synthesizer.reverify_stale_case(client, case, mod_chunks[0])

    # 4. Handle NEW Docs ➔ Targeted New Cases + Cross-Generation Multi-Hop
    new_cases = []
    if new_doc_ids:
        new_chunks = [c for c in current_chunks if c.get("doc_id") in new_doc_ids]
        existing_chunks = [c for c in current_chunks if c.get("doc_id") not in new_doc_ids]
        # 彻底移除 max(target_size, len(new_doc_ids) * 2) 强制翻倍！严格尊重用户传入的 target_size
        size_to_gen = target_size
        logger.info(f"✨ 正在为新增的 {len(new_doc_ids)} 篇文档生成 {size_to_gen} 道增量题库（含跨代多跳）...")
        new_cases = await synthesizer.generate_cases(
            chunks=new_chunks,
            target_size=size_to_gen,
            existing_chunks=existing_chunks,
            prefix="DELTA",
            checkpoint_path=checkpoint_path,
            concurrency=concurrency,
        )

    # Merge Cases
    all_cases = base_cases + new_cases
    # Update manifest doc statuses
    for d in current_manifest.get("docs", []):
        if d["doc_id"] in new_doc_ids:
            d["lifecycle_status"] = "NEW_ADDED"
        elif d["doc_id"] in modified_doc_ids:
            d["lifecycle_status"] = "MODIFIED"
        else:
            d["lifecycle_status"] = "ACTIVE"

    for del_id in deleted_doc_ids:
        del_meta = base_docs_map[del_id].copy()
        del_meta["lifecycle_status"] = "DELETED_CONVERTED_REFUSAL"
        current_manifest["docs"].append(del_meta)

    return current_manifest, all_cases


# ----------------------------------------------------------------------
# 4. MLflow Dataset Registration Helper
# ----------------------------------------------------------------------
def sync_dataset_to_mlflow(
    dataset_path: Path,
    dataset_name: str,
    total_cases: int,
    engine: str,
    project_id: str,
    tracking_uri: Optional[str] = None,
    experiment_name: str = "lightrag-benchmark-suite",
):
    """Registers synthesized dataset to remote MLflow platform."""
    try:
        from evaluation.mlflow_adapter import MLflowEvaluationTracker

        tracker = MLflowEvaluationTracker(
            tracking_uri=tracking_uri,
            experiment_name=experiment_name,
            enabled=True,
        )
        run_name = f"dataset_synth_{engine}_{total_cases}cases"
        with tracker.start_run(run_name=run_name, tags={"task": "dataset_generation", "engine": engine, "project": project_id}):
            if tracker.active_run:
                tracker.log_params({
                    "dataset_name": dataset_name,
                    "engine": engine,
                    "project_id": project_id,
                    "total_cases": total_cases,
                })
                # Log table of synthesized cases for visual review in MLflow UI
                try:
                    data = json.loads(dataset_path.read_text(encoding="utf-8"))
                    cases = data.get("test_cases", [])
                    table_rows = []
                    for c in cases:
                        table_rows.append({
                            "test_id": c.get("test_id", ""),
                            "evolution_type": c.get("evolution_type", ""),
                            "lifecycle_tag": c.get("lifecycle_tag", "ACTIVE"),
                            "question": c.get("question", ""),
                            "ground_truth": c.get("ground_truth", ""),
                            "contexts_count": len(c.get("contexts", [])),
                            "sources": ", ".join(c.get("source_docs", [])),
                        })
                    if table_rows:
                        import pandas as pd
                        df = pd.DataFrame(table_rows)
                        import mlflow
                        mlflow.log_table(data=df, artifact_file="synthesized_cases_preview.json")
                except Exception as ex:
                    logger.warning(f"⚠️ 生成用例大表预览跳过: {ex}")

                # Sync json artifact
                tracker.log_artifacts([dataset_path])
                print(f"📡 [MLflow] 数据集与用例大表已成功归档至平台，Run ID: {tracker.run_id}")
    except Exception as e:
        logger.warning(f"⚠️ MLflow 数据集归档告警: {e}")


# ----------------------------------------------------------------------
# 5. Main CLI Entry
# ----------------------------------------------------------------------
async def main_async():
    parser = argparse.ArgumentParser(description="Universal Dataset Synthesizer for LightRAG")
    parser.add_argument(
        "--from-project",
        type=str,
        default=None,
        help="Extract documents and chunks directly from LightRAG physical storage for this project",
    )
    parser.add_argument(
        "--docs-dir",
        type=Path,
        default=Path(__file__).parent / "documents",
        help="Fallback local directory containing markdown/text files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parent / "datasets" / "lineage_benchmark.json",
        help="Path for generated output JSON",
    )
    parser.add_argument(
        "--base-dataset",
        type=Path,
        default=None,
        help="Base dataset JSON path for incremental CRUD evolution",
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        default=False,
        help="Perform lifecycle incremental evolution (Add/Modify/Delete) against --base-dataset",
    )
    parser.add_argument(
        "--size",
        type=int,
        default=4,
        help="Number of synthetic test cases to generate",
    )
    parser.add_argument(
        "--engine",
        type=str,
        default="native",
        choices=["native", "deepeval", "ragas"],
        help="Synthesis engine: native (Evol-Instruct), deepeval (Synthesizer), or ragas",
    )
    parser.add_argument(
        "--project",
        type=str,
        default="eval_benchmark",
        help="LightRAG project ID for test cases",
    )
    parser.add_argument(
        "--mlflow",
        dest="mlflow_enabled",
        action="store_true",
        default=True,
        help="Log and register synthesized dataset to MLflow platform",
    )
    parser.add_argument(
        "--no-mlflow",
        dest="mlflow_enabled",
        action="store_false",
        help="Disable MLflow sync",
    )
    parser.add_argument(
        "--mlflow-tracking-uri",
        type=str,
        default=os.getenv("MLFLOW_TRACKING_URI", "http://49.233.222.54:9128"),
        help="Target MLflow tracking server",
    )

    args = parser.parse_args()

    # Load LLM credentials
    base_url = (
        os.getenv("EVAL_LLM_BINDING_HOST")
        or os.getenv("LLM_BINDING_HOST")
        or os.getenv("LLM_BASE_URL")
        or "https://hk-api.maomaoai.pro/v1"
    )
    api_key = (
        os.getenv("EVAL_LLM_BINDING_API_KEY")
        or os.getenv("LLM_BINDING_API_KEY")
        or os.getenv("LLM_API_KEY")
        or os.getenv("OPENAI_API_KEY", "")
    )
    model = os.getenv("EVAL_LLM_MODEL") or os.getenv("LLM_MODEL") or "deepseek-v4.1-flash"
    project_id = args.from_project or args.project

    print("=" * 80)
    print("🧬 启动 LightRAG 全生命周期血缘契约评测集合成器 (Lifecycle Dataset Synthesizer)")
    print(f"   • 项目血缘绑定: {project_id}")
    print(f"   • 合成引擎:    {args.engine.upper()}")
    print(f"   • 增量演化模式: {'开启 (基于 ' + str(args.base_dataset) + ')' if args.incremental else '关闭 (全量生成)'}")
    print(f"   • 目标输出:    {args.output}")
    print(f"   • 裁判大模型:  {model}", flush=True)
    print(f"   • MLflow 登记: {'开启 (' + args.mlflow_tracking_uri + ')' if args.mlflow_enabled else '关闭'}", flush=True)
    print("=" * 80, flush=True)
    print("[PROGRESS: 15%]", flush=True)

    # Step 1: Load corpus and chunks
    if args.from_project:
        manifest, chunks = extract_project_corpus(args.from_project)
    else:
        manifest, chunks = load_documents_from_dir(args.docs_dir)

    if not chunks:
        print("❌ 未加载到任何有效切片，程序退出！", flush=True)
        sys.exit(1)

    print(f"[PROGRESS: 35%]", flush=True)

    # Step 2: Incremental or Full Synthesis
    checkpoint_path = args.output.parent / f".chk_{args.output.name}"
    concurrency = int(os.getenv("SYNTHESIZER_CONCURRENCY", "4"))

    test_cases: List[Dict[str, Any]] = []
    if args.incremental and args.base_dataset and args.base_dataset.exists():
        manifest, test_cases = await evolve_lifecycle_dataset(
            base_dataset_path=args.base_dataset,
            current_manifest=manifest,
            current_chunks=chunks,
            target_size=args.size,
            base_url=base_url,
            api_key=api_key,
            model=model,
            checkpoint_path=checkpoint_path,
            concurrency=concurrency,
        )
    else:
        synthesizer = NativeSynthesizer(base_url=base_url, api_key=api_key, model=model)
        test_cases = await synthesizer.generate_cases(
            chunks=chunks,
            target_size=args.size,
            checkpoint_path=checkpoint_path,
            concurrency=concurrency,
        )

    if not test_cases:
        print("❌ 评测题生成失败或为空！", flush=True)
        sys.exit(1)

    for tc in test_cases:
        tc["project"] = project_id

    print(f"[PROGRESS: 75%]", flush=True)

    # Step 3: Format and save with Lineage Manifest v2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "dataset_id": f"ds_{project_id}_{int(time.time())}",
        "project_id": project_id,
        "engine": args.engine,
        "model": model,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "total_cases": len(test_cases),
        "corpus_manifest": manifest,
        "test_cases": test_cases,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # 成功写盘后，移除临时 Checkpoint 断点
    if checkpoint_path.exists():
        try:
            checkpoint_path.unlink()
            logger.info(f"🧹 临时 Checkpoint 已安全移除: {checkpoint_path.name}")
        except Exception:
            pass

    print(f"[PROGRESS: 90%]", flush=True)
    print("\n" + "=" * 80, flush=True)
    print(f"🎉 评测集与血缘契约构建成功！共计 {len(test_cases)} 题已保存至: {args.output}", flush=True)
    print("=" * 80, flush=True)

    # Step 4: MLflow sync
    if args.mlflow_enabled:
        sync_dataset_to_mlflow(
            dataset_path=args.output,
            dataset_name=args.output.name,
            total_cases=len(test_cases),
            engine=args.engine,
            project_id=project_id,
            tracking_uri=args.mlflow_tracking_uri,
        )
    print("[PROGRESS: 100%]", flush=True)


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
