#!/usr/bin/env python3
"""
MultiHop-RAG (Benchmarking Retrieval-Augmented Generation for Multi-Hop Queries, COLM 2024)
Adapter for LightRAG.

Transforms raw MultiHop-RAG assets (corpus.json + MultiHopRAG.json) into:
1. Physical structured Markdown documents in `evaluation/documents/multihop/`
2. Standardized evaluation datasets in `evaluation/datasets/multihop_*.json`
   equipped with precise `corpus_manifest` and SHA-256 signatures for zero-drift
   readiness validation in Eval Studio.

Supports 4 core query types:
- inference_query: multi-hop logical entity reasoning
- comparison_query: cross-document entity & attribute comparison
- temporal_query: temporal ordering & causal multi-hop reasoning
- null_query: insufficient information negative rejection ("must_refuse")
Plus a balanced comprehensive benchmark `multihop_benchmark.json`.

Completely decoupled from official LightRAG core code.
"""

import argparse
import hashlib
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Setup clean console logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("multihop_adapter")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _compute_sha256(content: str) -> str:
    """Computes SHA-256 hex digest for a string content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _sanitize_slug(text: str, max_len: int = 36) -> str:
    """Cleans a string for safe use in file names."""
    clean = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", text).strip("_")
    return clean[:max_len] if clean else "doc"


def _format_ground_truth(raw_answer: Any) -> str:
    """Formats raw answer (list or string) into a coherent ground truth string."""
    if isinstance(raw_answer, list):
        if not raw_answer:
            return ""
        return " / ".join(str(x) for x in raw_answer)
    return str(raw_answer or "").strip()


class MultiHopRAGAdapter:
    """Adapter to ingest, sanitize, and convert MultiHop-RAG benchmark assets."""

    def __init__(
        self,
        multihop_data_dir: Path,
        output_docs_dir: Path,
        output_datasets_dir: Path,
        subset_size: int = 25,
        is_full: bool = False,
    ):
        self.multihop_data_dir = multihop_data_dir
        self.output_docs_dir = output_docs_dir
        self.output_datasets_dir = output_datasets_dir
        self.subset_size = subset_size
        self.is_full = is_full

        self.output_docs_dir.mkdir(parents=True, exist_ok=True)
        self.output_datasets_dir.mkdir(parents=True, exist_ok=True)

    def _load_raw_assets(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Loads raw corpus.json and MultiHopRAG.json."""
        corpus_path = self.multihop_data_dir / "corpus.json"
        queries_path = self.multihop_data_dir / "MultiHopRAG.json"

        if not corpus_path.exists():
            raise FileNotFoundError(f"Corpus file not found: {corpus_path}")
        if not queries_path.exists():
            raise FileNotFoundError(f"Queries file not found: {queries_path}")

        logger.info(f"Loading corpus from {corpus_path.name}...")
        with open(corpus_path, "r", encoding="utf-8") as f:
            corpus = json.load(f)

        logger.info(f"Loading queries from {queries_path.name}...")
        with open(queries_path, "r", encoding="utf-8") as f:
            queries = json.load(f)

        logger.info(f"Loaded {len(corpus)} corpus articles and {len(queries)} benchmark queries.")
        return corpus, queries

    def process_and_export(self) -> Dict[str, Any]:
        """Main execution flow: partitions queries, extracts documents, exports datasets."""
        logger.info(f"🚀 Starting MultiHop-RAG conversion (full={self.is_full}, subset={self.subset_size})")

        corpus, all_queries = self._load_raw_assets()

        # Build URL lookup for corpus
        corpus_by_url: Dict[str, Dict[str, Any]] = {}
        for idx, doc in enumerate(corpus):
            url = doc.get("url")
            if url:
                doc_copy = dict(doc)
                doc_copy["_corpus_index"] = idx
                corpus_by_url[url] = doc_copy

        # Group queries by type
        grouped_queries: Dict[str, List[Dict[str, Any]]] = {
            "inference_query": [],
            "comparison_query": [],
            "temporal_query": [],
            "null_query": [],
        }
        for q in all_queries:
            q_type = q.get("question_type", "inference_query")
            if q_type in grouped_queries:
                grouped_queries[q_type].append(q)

        # Determine subset selection
        selected_by_type: Dict[str, List[Dict[str, Any]]] = {}
        target_urls: Set[str] = set()

        if self.is_full or self.subset_size <= 0:
            selected_by_type = grouped_queries
            # In full mode, all corpus articles are included
            target_urls = set(corpus_by_url.keys())
        else:
            for q_type, q_list in grouped_queries.items():
                chosen = q_list[: self.subset_size]
                selected_by_type[q_type] = chosen
                for q in chosen:
                    for ev in q.get("evidence_list", []):
                        u = ev.get("url")
                        if u and u in corpus_by_url:
                            target_urls.add(u)

            # In subset mode, add up to 10 background distractor articles for realistic noise
            distractor_count = 0
            for url in corpus_by_url:
                if url not in target_urls:
                    target_urls.add(url)
                    distractor_count += 1
                    if distractor_count >= 10:
                        break

        logger.info(f"Selected {len(target_urls)} articles for physical Markdown generation.")

        # 1. Generate Physical Markdown Documents
        doc_manifest, url_to_manifest = self._generate_markdown_documents(
            corpus_by_url, target_urls
        )

        # 2. Build datasets
        datasets: Dict[str, Dict[str, Any]] = {}

        # 2.1 Four specialized datasets
        type_mapping = {
            "inference_query": ("multihop_inference", "MultiHop-RAG 逻辑推断多跳基准 (Inference)"),
            "comparison_query": ("multihop_comparison", "MultiHop-RAG 跨文档实体比对基准 (Comparison)"),
            "temporal_query": ("multihop_temporal", "MultiHop-RAG 时序演进多跳基准 (Temporal)"),
            "null_query": ("multihop_null", "MultiHop-RAG 证据不足负面拒答基准 (Negative Rejection)"),
        }

        for q_type, (ds_id, ds_name) in type_mapping.items():
            ds_queries = selected_by_type.get(q_type, [])
            ds_json = self._build_single_dataset(
                dataset_id=ds_id,
                dataset_name=ds_name,
                queries=ds_queries,
                doc_manifest=doc_manifest,
                url_to_manifest=url_to_manifest,
                is_null=(q_type == "null_query"),
            )
            datasets[ds_id] = ds_json

        # 2.2 Comprehensive benchmark: balanced sample from all 4 types
        balanced_queries = []
        comp_sample_per_type = 10 if not self.is_full else 25
        for q_type in ["inference_query", "comparison_query", "temporal_query", "null_query"]:
            pool = selected_by_type.get(q_type, [])
            balanced_queries.extend(pool[:comp_sample_per_type])

        comprehensive_ds = self._build_single_dataset(
            dataset_id="multihop_benchmark",
            dataset_name="MultiHop-RAG 综合多跳权威打擂集 (Comprehensive)",
            queries=balanced_queries,
            doc_manifest=doc_manifest,
            url_to_manifest=url_to_manifest,
            is_null=False,
        )
        datasets["multihop_benchmark"] = comprehensive_ds

        # 3. Export all datasets to evaluation/datasets/
        exported_paths = {}
        for ds_id, ds_json in datasets.items():
            out_file = self.output_datasets_dir / f"{ds_id}.json"
            out_file.write_text(
                json.dumps(ds_json, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            exported_paths[ds_id] = out_file
            logger.info(f"✅ Exported dataset: {out_file.name} ({ds_json['total_cases']} cases)")

        summary = {
            "total_documents": len(doc_manifest["documents"]),
            "docs_dir": str(self.output_docs_dir),
            "datasets": {k: str(v) for k, v in exported_paths.items()},
        }
        return summary

    def _generate_markdown_documents(
        self,
        corpus_by_url: Dict[str, Dict[str, Any]],
        target_urls: Set[str],
    ) -> Tuple[Dict[str, Any], Dict[str, Dict[str, Any]]]:
        """Synthesizes target news articles into physical Markdown documents with full metadata."""
        documents_metadata = []
        url_to_manifest: Dict[str, Dict[str, Any]] = {}

        sorted_urls = sorted(target_urls, key=lambda u: corpus_by_url[u]["_corpus_index"])

        for doc_seq, url in enumerate(sorted_urls, start=1):
            raw_doc = corpus_by_url[url]
            corpus_idx = raw_doc["_corpus_index"]
            title = (raw_doc.get("title") or f"News Article {corpus_idx}").strip()
            author = (raw_doc.get("author") or "Staff / Wire Services").strip()
            source = (raw_doc.get("source") or "News Media").strip()
            published_at = (raw_doc.get("published_at") or "Unknown").strip()
            category = (raw_doc.get("category") or "general").strip()
            body = (raw_doc.get("body") or "").strip()

            slug = _sanitize_slug(title, max_len=30)
            file_name = f"multihop_doc_{doc_seq:03d}_{slug}.md"
            file_path = self.output_docs_dir / file_name

            md_lines = [
                f"# {title}",
                "",
                f"> **Source**: {source} | **Author**: {author} | **Category**: {category} | **Published**: {published_at}",
                f"> **Original URL**: {url}",
                "",
                "## Article Content",
                "",
                body,
                "",
            ]
            content = "\n".join(md_lines)
            file_path.write_text(content, encoding="utf-8")
            doc_sha = _compute_sha256(content)

            meta = {
                "file_name": file_name,
                "doc_id": f"multihop_doc_{doc_seq:03d}",
                "title": title,
                "url": url,
                "source": source,
                "author": author,
                "published_at": published_at,
                "category": category,
                "sha256": doc_sha,
                "char_count": len(content),
            }
            documents_metadata.append(meta)
            url_to_manifest[url] = meta

        logger.info(f"Created {len(documents_metadata)} physical documents in {self.output_docs_dir}")
        manifest_payload = {
            "documents": documents_metadata,
            "source_docs": [d["file_name"] for d in documents_metadata],
        }
        return manifest_payload, url_to_manifest

    def _build_single_dataset(
        self,
        dataset_id: str,
        dataset_name: str,
        queries: List[Dict[str, Any]],
        doc_manifest: Dict[str, Any],
        url_to_manifest: Dict[str, Dict[str, Any]],
        is_null: bool = False,
    ) -> Dict[str, Any]:
        """Builds standardized dataset dict with corpus_manifest."""
        test_cases = []

        for idx, item in enumerate(queries, start=1):
            q_text = item.get("query", "").strip()
            raw_answer = item.get("answer", "")
            gt = _format_ground_truth(raw_answer)
            q_type = item.get("question_type", "inference_query")

            source_docs = []
            evidence_facts = []

            for ev in item.get("evidence_list", []):
                u = ev.get("url")
                if u and u in url_to_manifest:
                    source_docs.append(url_to_manifest[u]["file_name"])
                fact = ev.get("fact")
                if fact:
                    evidence_facts.append(fact.strip())

            # De-duplicate docs while preserving order
            seen_docs = set()
            unique_source_docs = []
            for d in source_docs:
                if d not in seen_docs:
                    seen_docs.add(d)
                    unique_source_docs.append(d)

            # Determine assertion rule
            if is_null or q_type == "null_query" or gt.lower() in ["insufficient information.", "insufficient information"]:
                assertion_rule = "must_refuse"
                expected_output = "Insufficient information to answer this question based on the provided documents."
                gt_text = "Insufficient information."
            else:
                assertion_rule = "default"
                expected_output = gt
                gt_text = gt

            test_cases.append({
                "id": idx,
                "case_id": f"{dataset_id}_{idx:03d}",
                "question": q_text,
                "expected_output": expected_output,
                "ground_truth": gt_text,
                "challenge_type": q_type,
                "difficulty": "hard",
                "assertion_rule": assertion_rule,
                "source_docs": unique_source_docs,
                "evidence_facts": evidence_facts,
            })

        return {
            "dataset_id": dataset_id,
            "dataset_name": dataset_name,
            "benchmark_source": "MultiHop-RAG (COLM 2024)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_cases": len(test_cases),
            "corpus_manifest": doc_manifest,
            "test_cases": test_cases,
        }


def main():
    parser = argparse.ArgumentParser(description="MultiHop-RAG Benchmark Adapter for LightRAG")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=PROJECT_ROOT / "temp" / "MultiHop-RAG" / "dataset",
        help="Directory containing corpus.json and MultiHopRAG.json",
    )
    parser.add_argument(
        "--docs-dir",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "documents" / "multihop",
        help="Target output directory for physical Markdown documents",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "datasets",
        help="Target output directory for standardized evaluation datasets",
    )
    parser.add_argument(
        "--subset",
        type=int,
        default=25,
        help="Number of queries per type to sample in subset mode (default: 25)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Process all 609 corpus articles and all 2556 benchmark queries",
    )

    args = parser.parse_args()

    adapter = MultiHopRAGAdapter(
        multihop_data_dir=args.data_dir,
        output_docs_dir=args.docs_dir,
        output_datasets_dir=args.output_dir,
        subset_size=args.subset,
        is_full=args.full,
    )

    summary = adapter.process_and_export()

    print("\n" + "=" * 60)
    print("🎉 MultiHop-RAG 语料抽取与标准评测集转换完成！")
    print(f"物理文档生成总数: {summary['total_documents']} 篇")
    print(f"文档落盘目录: {summary['docs_dir']}")
    print("标准化评测集:")
    for ds_id, path in summary["datasets"].items():
        print(f"  • {ds_id:22s}: {path}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
