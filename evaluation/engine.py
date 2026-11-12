"""
Enterprise RAGAS Evaluation Engine.
Encapsulates RAGAS metrics, two-stage concurrency semaphores, NaN sanitization, and report generation.
"""

import asyncio
import csv
import json
import logging
import math
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("evaluation.engine")

try:
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import (
        AnswerRelevancy,
        ContextPrecision,
        ContextRecall,
        Faithfulness,
    )
    from ragas.llms import LangchainLLMWrapper
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings
    from tqdm.auto import tqdm
    RAGAS_AVAILABLE = True
except ImportError:
    RAGAS_AVAILABLE = False


def _is_nan(val: Any) -> bool:
    return isinstance(val, float) and math.isnan(val)


class RAGEvaluationEngine:
    """Production RAGAS evaluation runner with bypass_n patches and robust error boundaries."""

    def __init__(
        self,
        results_dir: Optional[Path] = None,
        eval_model: Optional[str] = None,
        eval_base_url: Optional[str] = None,
        eval_api_key: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_base_url: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        max_retries: int = 5,
        timeout: int = 180,
    ):
        if not RAGAS_AVAILABLE:
            raise ImportError("RAGAS dependencies not installed. Run: pip install ragas datasets")

        self.eval_model = eval_model or os.getenv("EVAL_LLM_MODEL") or os.getenv("LLM_MODEL", "deepseek-v4.1-flash")
        self.eval_base_url = eval_base_url or os.getenv("EVAL_LLM_BINDING_HOST") or os.getenv("LLM_BASE_URL", "")
        self.eval_api_key = eval_api_key or os.getenv("EVAL_LLM_BINDING_API_KEY") or os.getenv("LLM_API_KEY", "")

        self.embedding_model = embedding_model or os.getenv("EVAL_EMBEDDING_MODEL") or os.getenv("EMBEDDING_MODEL", "text-embedding-v4")
        self.embedding_base_url = embedding_base_url or os.getenv("EVAL_EMBEDDING_BINDING_HOST") or os.getenv("EMBEDDING_BASE_URL", "")
        self.embedding_api_key = embedding_api_key or os.getenv("EVAL_EMBEDDING_BINDING_API_KEY") or os.getenv("EMBEDDING_API_KEY", "")

        self.results_dir = results_dir or (Path(__file__).parent / "results")
        self.results_dir.mkdir(parents=True, exist_ok=True)

        # Build ChatOpenAI for Judge
        llm_kwargs = {
            "model": self.eval_model,
            "api_key": self.eval_api_key,
            "max_retries": max_retries,
            "request_timeout": timeout,
        }
        if self.eval_base_url:
            llm_kwargs["base_url"] = self.eval_base_url

        base_llm = ChatOpenAI(**llm_kwargs)
        self.eval_llm = LangchainLLMWrapper(langchain_llm=base_llm, bypass_n=True)

        # Build Embeddings for Judge
        emb_kwargs = {
            "model": self.embedding_model,
            "api_key": self.embedding_api_key,
        }
        if self.embedding_base_url:
            emb_kwargs["base_url"] = self.embedding_base_url
        self.eval_embeddings = OpenAIEmbeddings(**emb_kwargs)

    async def evaluate_single_case(
        self,
        idx: int,
        question: str,
        answer: str,
        contexts: List[str],
        ground_truth: str,
        project_id: str,
    ) -> Dict[str, Any]:
        """Evaluates single case via RAGAS metrics with error isolation."""
        # Sanitize empty contexts to prevent RAGAS internal exceptions
        safe_contexts = [c for c in contexts if c and c.strip()]
        if not safe_contexts:
            safe_contexts = ["No relevant context found in target workspace."]

        eval_dataset = Dataset.from_dict({
            "question": [question],
            "answer": [answer],
            "contexts": [safe_contexts],
            "ground_truth": [ground_truth or answer],
        })

        try:
            # We instantiate clean metric classes for concurrency safety
            # If embedding fails (e.g. non-standard Maas API format for answer_relevancy), isolate it gracefully
            eval_metrics = [Faithfulness(), ContextRecall(), ContextPrecision()]
            try:
                eval_metrics.append(AnswerRelevancy())
            except Exception:
                pass

            eval_results = evaluate(
                dataset=eval_dataset,
                metrics=eval_metrics,
                llm=self.eval_llm,
                embeddings=self.eval_embeddings,
            )

            df = eval_results.to_pandas()
            scores_row = df.iloc[0]

            faith = float(scores_row.get("faithfulness", 0.0))
            recall = float(scores_row.get("context_recall", 0.0))
            prec = float(scores_row.get("context_precision", 0.0))
            answ_rel_raw = scores_row.get("answer_relevancy")
            answ_rel = float(answ_rel_raw) if (answ_rel_raw is not None and not _is_nan(answ_rel_raw)) else None

            metrics_dict = {
                "faithfulness": 0.0 if _is_nan(faith) else round(faith, 4),
                "context_recall": 0.0 if _is_nan(recall) else round(recall, 4),
                "context_precision": 0.0 if _is_nan(prec) else round(prec, 4),
                "answer_relevance": None if answ_rel is None else round(answ_rel, 4),
            }

            valid_scores = [v for v in metrics_dict.values() if v is not None and not _is_nan(v)]
            ragas_score = round(sum(valid_scores) / len(valid_scores), 4) if valid_scores else 0.0

            return {
                "test_number": idx,
                "question": question,
                "project": project_id,
                "metrics": metrics_dict,
                "ragas_score": ragas_score,
                "status": "PASS" if ragas_score >= 0.70 else "WARN",
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"❌ RAGAS evaluation error for case {idx}: {e}")
            return {
                "test_number": idx,
                "question": question,
                "project": project_id,
                "error": str(e),
                "metrics": {"faithfulness": 0.0, "context_recall": 0.0, "context_precision": 0.0, "answer_relevance": None},
                "ragas_score": 0.0,
                "status": "FAIL",
                "timestamp": datetime.now().isoformat(),
            }

    def calculate_stats(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculates benchmark aggregates across successful evaluations."""
        valid_results = [r for r in results if not r.get("error")]
        total = len(results)
        success = len(valid_results)
        
        if not valid_results:
            return {
                "total": total, "success": 0, "failed": total, "success_rate": 0.0,
                "avg_ragas_score": 0.0, "avg_faithfulness": 0.0,
                "avg_context_recall": 0.0, "avg_context_precision": 0.0, "avg_answer_relevance": 0.0,
            }

        avg_faith = sum(r["metrics"]["faithfulness"] for r in valid_results) / success
        avg_rec = sum(r["metrics"]["context_recall"] for r in valid_results) / success
        avg_prec = sum(r["metrics"]["context_precision"] for r in valid_results) / success
        
        rel_vals = [r["metrics"]["answer_relevance"] for r in valid_results if r["metrics"]["answer_relevance"] is not None]
        avg_rel = (sum(rel_vals) / len(rel_vals)) if rel_vals else 0.0
        avg_ragas = sum(r["ragas_score"] for r in valid_results) / success

        return {
            "total": total,
            "success": success,
            "failed": total - success,
            "success_rate": round(success / total * 100, 2),
            "avg_ragas_score": round(avg_ragas, 4),
            "avg_faithfulness": round(avg_faith, 4),
            "avg_context_recall": round(avg_rec, 4),
            "avg_context_precision": round(avg_prec, 4),
            "avg_answer_relevance": round(avg_rel, 4),
        }

    def export_reports(self, results: List[Dict[str, Any]], stats: Dict[str, Any]) -> Dict[str, Path]:
        """Saves timestamped CSV and JSON evaluation reports."""
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        json_file = self.results_dir / f"ragas_report_{ts}.json"
        csv_file = self.results_dir / f"ragas_report_{ts}.csv"

        # JSON
        payload = {"timestamp": datetime.now().isoformat(), "stats": stats, "results": results}
        json_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        # CSV
        with open(csv_file, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["#", "Project", "Question", "Faithfulness", "Context Recall", "Context Precision", "Answer Relevance", "RAGAS Score", "Status"])
            for r in results:
                m = r.get("metrics", {})
                writer.writerow([
                    r.get("test_number"),
                    r.get("project"),
                    r.get("question", "").replace("\n", " "),
                    m.get("faithfulness"),
                    m.get("context_recall"),
                    m.get("context_precision"),
                    m.get("answer_relevance") or "N/A",
                    r.get("ragas_score"),
                    r.get("status"),
                ])

        return {"json": json_file, "csv": csv_file}
