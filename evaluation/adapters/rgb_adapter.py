#!/usr/bin/env python3
"""
Huawei Noah RGB (Retrieval-Augmented Generation Benchmark) Adapter for LightRAG.

Transforms raw RGB benchmark JSONL assets (en/zh, int, fact, refine) into:
1. Physical structured Markdown documents in `evaluation/documents/rgb_{lang}/`
2. Standardized evaluation datasets in `evaluation/datasets/rgb_{lang}_*.json`
   equipped with precise `corpus_manifest` and SHA-256 signatures for zero-drift
   readiness validation in Eval Studio.

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
logger = logging.getLogger("rgb_adapter")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def _compute_sha256(content: str) -> str:
    """Computes SHA-256 hex digest for a string content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _sanitize_slug(text: str, max_len: int = 30) -> str:
    """Cleans a string for safe use in file names."""
    clean = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", text).strip("_")
    return clean[:max_len] if clean else "doc"


def _format_ground_truth(raw_answer: Any) -> str:
    """Formats raw answer (list or string) into a coherent ground truth string."""
    if isinstance(raw_answer, list):
        if not raw_answer:
            return ""
        # If list of single-word or short answers
        flat = []
        for a in raw_answer:
            if isinstance(a, list):
                flat.append("/".join(str(x) for x in a))
            else:
                flat.append(str(a))
        return "、".join(flat)
    return str(raw_answer)


class HuaweiRGBAdapter:
    """Adapter to ingest, sanitize, and convert Huawei Noah RGB benchmark assets."""

    def __init__(
        self,
        rgb_data_dir: Path,
        output_docs_dir: Path,
        output_datasets_dir: Path,
        lang: str = "zh",
        subset_size: int = 30,
    ):
        self.rgb_data_dir = rgb_data_dir
        self.output_docs_dir = output_docs_dir
        self.output_datasets_dir = output_datasets_dir
        self.lang = lang
        self.subset_size = subset_size

        self.output_docs_dir.mkdir(parents=True, exist_ok=True)
        self.output_datasets_dir.mkdir(parents=True, exist_ok=True)

    def _read_jsonl(self, filename: str) -> List[Dict[str, Any]]:
        """Reads JSONL file from RGB data directory."""
        filepath = self.rgb_data_dir / filename
        if not filepath.exists():
            raise FileNotFoundError(f"RGB data file not found: {filepath}")
        records = []
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        records.append(json.loads(line))
                    except Exception as e:
                        logger.warning(f"Failed to parse line in {filename}: {e}")
        logger.info(f"Loaded {len(records)} records from {filepath.name}")
        return records

    def process_and_export(self) -> Dict[str, Any]:
        """Main execution flow: generates documents and standardized dataset JSONs."""
        logger.info(f"🚀 Starting Huawei RGB conversion: lang={self.lang}, subset={self.subset_size}")

        refine_file = f"{self.lang}_refine.json" if (self.rgb_data_dir / f"{self.lang}_refine.json").exists() else f"{self.lang}.json"
        int_file = f"{self.lang}_int.json"
        fact_file = f"{self.lang}_fact.json"

        raw_refine = self._read_jsonl(refine_file)
        raw_int = self._read_jsonl(int_file)
        raw_fact = self._read_jsonl(fact_file)

        # Slice subset if requested
        if self.subset_size > 0:
            sub_refine = raw_refine[: self.subset_size]
            sub_int = raw_int[: min(len(raw_int), self.subset_size)]
            sub_fact = raw_fact[: min(len(raw_fact), self.subset_size)]
        else:
            sub_refine = raw_refine
            sub_int = raw_int
            sub_fact = raw_fact

        # 1. Extract and write physical Markdown documents
        doc_manifest = self._generate_markdown_documents(sub_refine, sub_int)

        # 2. Generate the 4 standardized evaluation datasets
        noise_dataset = self._build_noise_dataset(sub_refine, doc_manifest)
        rejection_dataset = self._build_rejection_dataset(sub_refine, doc_manifest)
        integration_dataset = self._build_integration_dataset(sub_int, doc_manifest)
        counterfactual_dataset = self._build_counterfactual_dataset(sub_fact, doc_manifest)

        # 3. Export datasets to evaluation/datasets/
        paths = {
            "noise": self.output_datasets_dir / f"rgb_{self.lang}_noise.json",
            "rejection": self.output_datasets_dir / f"rgb_{self.lang}_rejection.json",
            "integration": self.output_datasets_dir / f"rgb_{self.lang}_integration.json",
            "counterfactual": self.output_datasets_dir / f"rgb_{self.lang}_counterfactual.json",
        }

        for key, p in paths.items():
            ds_data = {
                "noise": noise_dataset,
                "rejection": rejection_dataset,
                "integration": integration_dataset,
                "counterfactual": counterfactual_dataset,
            }[key]
            with open(p, "w", encoding="utf-8") as f:
                json.dump(ds_data, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Exported {key} benchmark: {p.name} ({len(ds_data['test_cases'])} cases)")

        summary = {
            "lang": self.lang,
            "total_documents_generated": len(doc_manifest["documents"]),
            "docs_dir": str(self.output_docs_dir),
            "datasets": {k: str(v) for k, v in paths.items()},
        }
        return summary

    def _generate_markdown_documents(
        self,
        refine_samples: List[Dict[str, Any]],
        int_samples: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Synthesizes individual positive & background negative passages into
        structured, thematic Markdown documents with full metadata.
        """
        documents_metadata = []

        # A. Positive & Noise Documents from Refine Set
        for item in refine_samples:
            item_id = item.get("id", 0)
            query = item.get("query", "doc")
            slug = _sanitize_slug(query, max_len=24)
            positives = item.get("positive", [])
            negatives = item.get("negative", [])

            # Write Positive Material Document
            if positives:
                file_name = f"rgb_pos_{item_id:03d}_{slug}.md"
                file_path = self.output_docs_dir / file_name

                md_lines = [
                    f"# 主题报道：{query}",
                    f"",
                    f"> 来源：华为诺亚方舟 RGB 官方基准正向语料（ID: {item_id}）",
                    f"",
                ]
                for p_idx, p_text in enumerate(positives, start=1):
                    md_lines.append(f"## 关键证据节选 {p_idx}")
                    md_lines.append("")
                    md_lines.append(p_text.strip())
                    md_lines.append("")

                content = "\n".join(md_lines)
                file_path.write_text(content, encoding="utf-8")
                doc_sha = _compute_sha256(content)

                documents_metadata.append({
                    "file_name": file_name,
                    "doc_id": f"rgb_pos_{item_id:03d}",
                    "title": f"主题报道：{query}",
                    "type": "positive",
                    "sample_id": item_id,
                    "sha256": doc_sha,
                    "char_count": len(content),
                })

            # Write Accompanying Background Noise Document (up to 4 chosen negatives)
            if negatives:
                noise_slice = negatives[:4]
                file_name = f"rgb_noise_{item_id:03d}_{slug}.md"
                file_path = self.output_docs_dir / file_name

                md_lines = [
                    f"# 背景参考资讯（干扰噪声）：{query}",
                    f"",
                    f"> 来源：华为诺亚方舟 RGB 官方基准对照背景切片",
                    f"",
                ]
                for n_idx, n_text in enumerate(noise_slice, start=1):
                    md_lines.append(f"## 相关资讯参考 {n_idx}")
                    md_lines.append("")
                    md_lines.append(n_text.strip())
                    md_lines.append("")

                content = "\n".join(md_lines)
                file_path.write_text(content, encoding="utf-8")
                doc_sha = _compute_sha256(content)

                documents_metadata.append({
                    "file_name": file_name,
                    "doc_id": f"rgb_noise_{item_id:03d}",
                    "title": f"背景参考资讯：{query}",
                    "type": "noise",
                    "sample_id": item_id,
                    "sha256": doc_sha,
                    "char_count": len(content),
                })

        # B. Multi-hop Integration Documents from Int Set
        for item in int_samples:
            item_id = item.get("id", 0)
            query = item.get("query", "multi_hop")
            slug = _sanitize_slug(query, max_len=24)
            pos_groups = item.get("positive", [])

            if pos_groups:
                file_name = f"rgb_int_{item_id:03d}_{slug}.md"
                file_path = self.output_docs_dir / file_name

                md_lines = [
                    f"# 跨事件综合分析档案：{query}",
                    f"",
                    f"> 来源：华为诺亚方舟 RGB 多跳信息整合语料",
                    f"",
                ]
                # In RGB int.json, positive is a list of sub-fact lists
                for g_idx, group in enumerate(pos_groups, start=1):
                    md_lines.append(f"## 维度 {g_idx} 事实材料")
                    md_lines.append("")
                    if isinstance(group, list):
                        for p_text in group:
                            md_lines.append(str(p_text).strip())
                            md_lines.append("")
                    else:
                        md_lines.append(str(group).strip())
                        md_lines.append("")

                content = "\n".join(md_lines)
                file_path.write_text(content, encoding="utf-8")
                doc_sha = _compute_sha256(content)

                documents_metadata.append({
                    "file_name": file_name,
                    "doc_id": f"rgb_int_{item_id:03d}",
                    "title": f"跨事件综合分析档案：{query}",
                    "type": "integration",
                    "sample_id": item_id,
                    "sha256": doc_sha,
                    "char_count": len(content),
                })

        logger.info(f"Created {len(documents_metadata)} physical documents in {self.output_docs_dir}")
        return {
            "documents": documents_metadata,
            "source_docs": [d["file_name"] for d in documents_metadata],
        }

    def _build_noise_dataset(
        self,
        samples: List[Dict[str, Any]],
        doc_manifest: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Builds Noise Robustness Dataset."""
        test_cases = []
        for item in samples:
            item_id = item.get("id", 0)
            query = item.get("query", "")
            raw_answer = item.get("answer", "")
            gt = _format_ground_truth(raw_answer)
            pos_contexts = [p.strip() for p in item.get("positive", []) if p and p.strip()]

            pos_file = next(
                (d["file_name"] for d in doc_manifest["documents"] if d["type"] == "positive" and d["sample_id"] == item_id),
                None,
            )

            test_cases.append({
                "id": len(test_cases) + 1,
                "rgb_source_id": item_id,
                "question": query,
                "expected_output": gt,
                "ground_truth": gt,
                "contexts": pos_contexts,
                "challenge_type": "noise_robustness",
                "difficulty": "medium",
                "source_docs": [pos_file] if pos_file else [],
            })

        return {
            "dataset_id": f"rgb_{self.lang}_noise",
            "dataset_name": f"华为 RGB 噪声鲁棒性基准 ({self.lang.upper()})",
            "benchmark_source": "Huawei Noah RGB Benchmark (AAAI 2024)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_cases": len(test_cases),
            "corpus_manifest": doc_manifest,
            "test_cases": test_cases,
        }

    def _build_rejection_dataset(
        self,
        samples: List[Dict[str, Any]],
        doc_manifest: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Builds Negative Rejection Dataset.
        Questions are valid but target facts are NOT present in the workspace,
        asserting that LightRAG must abstain rather than hallucinate.
        """
        test_cases = []
        # Use a deterministic pseudo-absent set of questions (e.g. unindexed events or counter queries)
        for item in samples:
            item_id = item.get("id", 0)
            query = item.get("query", "")
            # Construct deliberate negative query or pick from un-ingested noise
            rejection_query = f"根据现有资料，请说明有关‘{query}’未公开的机密细节或未发生事项？"

            test_cases.append({
                "id": len(test_cases) + 1,
                "rgb_source_id": item_id,
                "question": rejection_query,
                "expected_output": "根据已知资料，未提及相关未公开机密或相关细节，无法回答该问题。",
                "ground_truth": "资料中无相关信息，系统应当明确表示无法回答或未提及。",
                "challenge_type": "negative_rejection",
                "difficulty": "hard",
                "assertion_rule": "must_refuse",
                "source_docs": [],  # explicitly no target docs
            })

        return {
            "dataset_id": f"rgb_{self.lang}_rejection",
            "dataset_name": f"华为 RGB 负面拒答基准 ({self.lang.upper()})",
            "benchmark_source": "Huawei Noah RGB Benchmark (AAAI 2024)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_cases": len(test_cases),
            "corpus_manifest": doc_manifest,
            "test_cases": test_cases,
        }

    def _build_integration_dataset(
        self,
        samples: List[Dict[str, Any]],
        doc_manifest: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Builds Multi-hop Information Integration Dataset."""
        test_cases = []
        for item in samples:
            item_id = item.get("id", 0)
            query = item.get("query", "")
            raw_answer = item.get("answer", "")
            ans1 = item.get("asnwer1", "")
            ans2 = item.get("answer2", "")

            gt_combined = _format_ground_truth(raw_answer)
            ans1_fmt = _format_ground_truth(ans1)
            ans2_fmt = _format_ground_truth(ans2)

            pos_groups = item.get("positive", [])
            int_contexts = []
            for g in pos_groups:
                if isinstance(g, list):
                    int_contexts.extend([str(x).strip() for x in g if str(x).strip()])
                elif str(g).strip():
                    int_contexts.append(str(g).strip())

            int_file = next(
                (d["file_name"] for d in doc_manifest["documents"] if d["type"] == "integration" and d["sample_id"] == item_id),
                None,
            )

            test_cases.append({
                "id": len(test_cases) + 1,
                "rgb_source_id": item_id,
                "question": query,
                "expected_output": gt_combined,
                "ground_truth": gt_combined,
                "sub_answers": [ans1_fmt, ans2_fmt] if (ans1_fmt and ans2_fmt) else [],
                "contexts": int_contexts,
                "challenge_type": "information_integration",
                "difficulty": "hard",
                "source_docs": [int_file] if int_file else [],
            })

        return {
            "dataset_id": f"rgb_{self.lang}_integration",
            "dataset_name": f"华为 RGB 跨文档信息整合基准 ({self.lang.upper()})",
            "benchmark_source": "Huawei Noah RGB Benchmark (AAAI 2024)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_cases": len(test_cases),
            "corpus_manifest": doc_manifest,
            "test_cases": test_cases,
        }

    def _build_counterfactual_dataset(
        self,
        samples: List[Dict[str, Any]],
        doc_manifest: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Builds Counterfactual Robustness Dataset."""
        test_cases = []
        for item in samples:
            item_id = item.get("id", 0)
            query = item.get("query", "")
            true_ans = _format_ground_truth(item.get("answer", ""))
            fake_ans = _format_ground_truth(item.get("fakeanswer", ""))
            pos_contexts = [p.strip() for p in item.get("positive", []) if p and p.strip()]

            test_cases.append({
                "id": len(test_cases) + 1,
                "rgb_source_id": item_id,
                "question": query,
                "expected_output": true_ans,
                "ground_truth": true_ans,
                "counterfactual_fake_answer": fake_ans,
                "contexts": pos_contexts,
                "challenge_type": "counterfactual_robustness",
                "difficulty": "extreme",
                "assertion_rule": "detect_error_or_resist_counterfactual",
                "source_docs": [],
            })

        return {
            "dataset_id": f"rgb_{self.lang}_counterfactual",
            "dataset_name": f"华为 RGB 反事实抗扰基准 ({self.lang.upper()})",
            "benchmark_source": "Huawei Noah RGB Benchmark (AAAI 2024)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_cases": len(test_cases),
            "corpus_manifest": doc_manifest,
            "test_cases": test_cases,
        }


def main():
    parser = argparse.ArgumentParser(description="Huawei Noah RGB Benchmark Adapter for LightRAG")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=PROJECT_ROOT / "temp" / "RGB" / "data",
        help="Path to raw RGB data folder",
    )
    parser.add_argument(
        "--docs-dir",
        type=Path,
        default=None,
        help="Target folder for physical Markdown corpus",
    )
    parser.add_argument(
        "--datasets-dir",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "datasets",
        help="Target folder for standardized dataset JSON files",
    )
    parser.add_argument(
        "--lang",
        type=str,
        default="zh",
        choices=["zh", "en"],
        help="Language of the benchmark (zh or en)",
    )
    parser.add_argument(
        "--subset",
        type=int,
        default=30,
        help="Subset size per category (default: 30 for agile benchmarking; <=0 for full)",
    )

    args = parser.parse_args()

    target_docs_dir = args.docs_dir or (PROJECT_ROOT / "evaluation" / "documents" / f"rgb_{args.lang}")

    adapter = HuaweiRGBAdapter(
        rgb_data_dir=args.source_dir,
        output_docs_dir=target_docs_dir,
        output_datasets_dir=args.datasets_dir,
        lang=args.lang,
        subset_size=args.subset,
    )

    summary = adapter.process_and_export()
    print("\n" + "=" * 60)
    print("🎉 RGB 语料抽取与标准评测集转换完成！")
    print(f"语言版本: {summary['lang']}")
    print(f"物理文档生成总数: {summary['total_documents_generated']} 篇")
    print(f"文档落盘目录: {summary['docs_dir']}")
    print("标准化评测集:")
    for k, v in summary["datasets"].items():
        print(f"  • {k.ljust(14)}: {v}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
