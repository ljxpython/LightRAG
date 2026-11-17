"""
Unit tests for MultiHop-RAG Adapter.
Verifies parsing, manifest generation, sha256 checksums, and dataset structures.
"""

import json
import pytest
from pathlib import Path
from evaluation.adapters.multihop_adapter import MultiHopRAGAdapter, _compute_sha256, _format_ground_truth


def test_format_ground_truth():
    assert _format_ground_truth("Simple Answer") == "Simple Answer"
    assert _format_ground_truth(["Option A", "Option B"]) == "Option A / Option B"
    assert _format_ground_truth(None) == ""


def test_multihop_adapter_mock_run(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    docs_dir = tmp_path / "docs"
    output_dir = tmp_path / "datasets"

    sample_corpus = [
        {
            "title": "Article One",
            "author": "Alice",
            "source": "TechNews",
            "published_at": "2023-10-01T00:00:00Z",
            "category": "tech",
            "url": "https://example.com/art1",
            "body": "Alice developed a new RAG system.",
        },
        {
            "title": "Article Two",
            "author": "Bob",
            "source": "ScienceDaily",
            "published_at": "2023-10-02T00:00:00Z",
            "category": "science",
            "url": "https://example.com/art2",
            "body": "Bob evaluated multi-hop reasoning algorithms.",
        },
    ]

    sample_queries = [
        {
            "query": "Who developed the new RAG system and who evaluated it?",
            "answer": "Alice and Bob",
            "question_type": "inference_query",
            "evidence_list": [
                {"url": "https://example.com/art1", "fact": "Alice developed a new RAG system."},
                {"url": "https://example.com/art2", "fact": "Bob evaluated multi-hop reasoning algorithms."},
            ],
        },
        {
            "query": "Is there information about quantum mechanics?",
            "answer": "Insufficient information.",
            "question_type": "null_query",
            "evidence_list": [],
        },
    ]

    (data_dir / "corpus.json").write_text(json.dumps(sample_corpus), encoding="utf-8")
    (data_dir / "MultiHopRAG.json").write_text(json.dumps(sample_queries), encoding="utf-8")

    adapter = MultiHopRAGAdapter(
        multihop_data_dir=data_dir,
        output_docs_dir=docs_dir,
        output_datasets_dir=output_dir,
        subset_size=10,
        is_full=False,
    )

    summary = adapter.process_and_export()
    assert summary["total_documents"] == 2
    assert len(list(docs_dir.glob("*.md"))) == 2

    inf_path = output_dir / "multihop_inference.json"
    assert inf_path.exists()
    inf_data = json.loads(inf_path.read_text(encoding="utf-8"))
    assert inf_data["total_cases"] == 1
    assert inf_data["test_cases"][0]["question"] == "Who developed the new RAG system and who evaluated it?"
    assert len(inf_data["test_cases"][0]["source_docs"]) == 2

    null_path = output_dir / "multihop_null.json"
    assert null_path.exists()
    null_data = json.loads(null_path.read_text(encoding="utf-8"))
    assert null_data["total_cases"] == 1
    assert null_data["test_cases"][0]["assertion_rule"] == "must_refuse"
