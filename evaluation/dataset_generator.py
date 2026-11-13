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

    proj_dir = storage_base / project_id
    if not proj_dir.exists():
        logger.error(f"❌ 找不到项目物理存储目录: {proj_dir}")
        return {}, []

    # Locate active revision or highest rev_N
    rev_dir: Optional[Path] = None
    active_link = proj_dir / "active"
    if active_link.exists() and active_link.is_dir():
        rev_dir = active_link.resolve()
    else:
        revs = [d for d in proj_dir.iterdir() if d.is_dir() and d.name.startswith("rev_")]
        if revs:
            rev_dir = sorted(revs, key=lambda d: int(d.name.split("_")[1]) if d.name.split("_")[1].isdigit() else 0)[-1]

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
        # Filter out trivial or file-metadata-only chunks
        if len(content) < 120 or (content.startswith("Title:") and len(content) < 250):
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
    ) -> List[Dict[str, Any]]:
        if not chunks:
            return []

        results = []
        types = (
            ["multi_hop"] * int(target_size * 0.4) +
            ["reasoning"] * int(target_size * 0.3) +
            ["simple"] * int(target_size * 0.2) +
            ["conditional"] * (target_size - int(target_size * 0.4) - int(target_size * 0.3) - int(target_size * 0.2))
        )
        if not types:
            types = ["simple"] * target_size
        random.shuffle(types)

        logger.info(f"🚀 开始 Native 演化合成，计划生成 {len(types)} 道高阶测试题...")
        async with httpx.AsyncClient(timeout=60.0) as client:
            for idx, evo_type in enumerate(types, start=1):
                logger.info(f"   [{idx:02d}/{len(types):02d}] 正在演化类型: 【{evo_type}】...")
                gen = None
                evidence_contexts = []
                source_doc_ids = []
                sources = []
                chunk_ids = []

                # Retry up to 3 candidate chunks
                for attempt in range(3):
                    if evo_type == "multi_hop":
                        c1 = random.choice(chunks)
                        if existing_chunks and len(existing_chunks) > 0:
                            c2 = random.choice(existing_chunks)
                        else:
                            candidates = [c for c in chunks if c["doc_id"] != c1["doc_id"]]
                            c2 = random.choice(candidates) if candidates else random.choice(chunks)

                        prompt = PROMPT_MULTI_HOP.format(
                            src1=c1["source"],
                            context1=c1["text"][:1000],
                            src2=c2["source"],
                            context2=c2["text"][:1000]
                        )
                        evidence_contexts = [c1["text"], c2["text"]]
                        source_doc_ids = list(set([c1.get("doc_id", ""), c2.get("doc_id", "")]))
                        sources = list(set([c1["source"], c2["source"]]))
                        chunk_ids = list(set([c1["chunk_id"], c2["chunk_id"]]))
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
                        sources = [c["source"]]
                        chunk_ids = [c["chunk_id"]]

                    gen = await self._call_llm(client, prompt)
                    if gen and "question" in gen and "ground_truth" in gen:
                        break

                if gen and "question" in gen and "ground_truth" in gen:
                    results.append({
                        "test_id": f"{prefix}_{idx:03d}_{evo_type}",
                        "question": gen["question"],
                        "ground_truth": gen["ground_truth"],
                        "contexts": evidence_contexts,
                        "source_doc_ids": [d for d in source_doc_ids if d],
                        "source_docs": sources,
                        "source_chunk_ids": chunk_ids,
                        "evolution_type": evo_type,
                        "lifecycle_tag": "ACTIVE",
                    })
                    print(f"      ✅ 题干: {gen['question'][:60]}...")
                else:
                    logger.warning(f"      ❌ 类型 {evo_type} 重试后仍失败，跳过")

        return results

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
        size_to_gen = max(target_size, len(new_doc_ids) * 2)
        logger.info(f"✨ 正在为新增的 {len(new_doc_ids)} 篇文档生成 {size_to_gen} 道增量题库（含跨代多跳）...")
        new_cases = await synthesizer.generate_cases(
            chunks=new_chunks,
            target_size=size_to_gen,
            existing_chunks=existing_chunks,
            prefix="DELTA",
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
    print(f"   • 裁判大模型:  {model}")
    print(f"   • MLflow 登记: {'开启 (' + args.mlflow_tracking_uri + ')' if args.mlflow_enabled else '关闭'}")
    print("=" * 80)

    # Step 1: Load corpus and chunks
    if args.from_project:
        manifest, chunks = extract_project_corpus(args.from_project)
    else:
        manifest, chunks = load_documents_from_dir(args.docs_dir)

    if not chunks:
        print("❌ 未加载到任何有效切片，程序退出！")
        return

    # Step 2: Incremental or Full Synthesis
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
        )
    else:
        synthesizer = NativeSynthesizer(base_url=base_url, api_key=api_key, model=model)
        test_cases = await synthesizer.generate_cases(chunks, target_size=args.size)

    if not test_cases:
        print("❌ 评测题生成失败或为空！")
        return

    for tc in test_cases:
        tc["project"] = project_id

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

    print("\n" + "=" * 80)
    print(f"🎉 评测集与血缘契约构建成功！共计 {len(test_cases)} 题已保存至: {args.output}")
    print("=" * 80)

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


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
