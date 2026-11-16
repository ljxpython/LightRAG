#!/usr/bin/env python3
"""
Enterprise MLflow Adapter for LightRAG Evaluation Suite.
Connects evaluation runners to the remote MLflow evaluation platform (http://49.233.222.54:9128),
recording hyperparameters, metrics, explainability reasons, and full evaluation artifacts.
"""

import logging
import os
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("mlflow_adapter")

try:
    import mlflow
    import pandas as pd
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False


class MLflowEvaluationTracker:
    """
    Manages experiment runs, metrics logging, parameter tracking, and
    detailed reasoning table generation for MLflow.
    """

    DEFAULT_TRACKING_URI = "http://49.233.222.54:9128"
    DEFAULT_EXPERIMENT_NAME = "lightrag-benchmark-suite"

    def __init__(
        self,
        tracking_uri: Optional[str] = None,
        experiment_name: Optional[str] = None,
        enabled: bool = True,
    ):
        self.enabled = enabled and MLFLOW_AVAILABLE
        if not self.enabled:
            if not MLFLOW_AVAILABLE:
                logger.warning("⚠️ 未检测到 mlflow 依赖，MLflow 上报功能自动跳过。")
            return

        self.tracking_uri = tracking_uri or os.getenv("MLFLOW_TRACKING_URI") or self.DEFAULT_TRACKING_URI
        self.experiment_name = experiment_name or os.getenv("MLFLOW_EXPERIMENT_NAME") or self.DEFAULT_EXPERIMENT_NAME
        self.active_run = None

        try:
            mlflow.set_tracking_uri(self.tracking_uri)
            # Find or create experiment
            exp = mlflow.get_experiment_by_name(self.experiment_name)
            if exp is None:
                self.experiment_id = mlflow.create_experiment(
                    name=self.experiment_name,
                    artifact_location=f"mlflow-artifacts:/{self.experiment_name}",
                    tags={"system": "LightRAG", "tier": "production-eval"},
                )
                logger.info(f"✨ 成功在 MLflow 创建全新实验: {self.experiment_name} (ID: {self.experiment_id})")
            else:
                self.experiment_id = exp.experiment_id
            mlflow.set_experiment(experiment_id=self.experiment_id)
        except Exception as e:
            logger.warning(f"⚠️ 初始化 MLflow 连接失败 ({e})，将降级跳过上报。")
            self.enabled = False

    @property
    def run_id(self) -> Optional[str]:
        """Convenience property to access current run_id."""
        return self.active_run.info.run_id if self.active_run else None

    @contextmanager
    def start_run(self, run_name: Optional[str] = None, tags: Optional[Dict[str, str]] = None):
        """Context manager to scope an MLflow run."""
        if not self.enabled:
            yield None
            return

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name = run_name or f"eval_{timestamp}"
        run_tags = {"tool": "LightRAG-Eval", "timestamp": timestamp}
        if tags:
            run_tags.update(tags)

        try:
            with mlflow.start_run(
                experiment_id=self.experiment_id,
                run_name=name,
                tags=run_tags,
            ) as run:
                self.active_run = run
                run_url = f"{self.tracking_uri.rstrip('/')}/#/experiments/{self.experiment_id}/runs/{run.info.run_id}"
                print(f"[MLFLOW_RUN] run_id={run.info.run_id} experiment_id={self.experiment_id}", flush=True)
                print(f"📡 [MLflow] 成功建立上报链路，Run ID: {run.info.run_id}", flush=True)
                print(f"   🔗 平台大屏链接: {run_url}", flush=True)
                yield self
        except Exception as e:
            logger.warning(f"⚠️ MLflow 上报异常 ({e})，本地流程继续。")
            yield None
        finally:
            self.active_run = None

    def log_params(self, params: Dict[str, Any]):
        """Logs evaluation and retrieval hyperparameters."""
        if not self.enabled or not self.active_run:
            return
        sanitized = {}
        for k, v in params.items():
            if v is not None:
                sanitized[k] = str(v) if isinstance(v, (list, dict, Path)) else v
            else:
                sanitized[k] = "default"
        try:
            mlflow.log_params(sanitized)
        except Exception as e:
            logger.warning(f"⚠️ 记录参数失败: {e}")

    def log_metrics(self, metrics: Dict[str, float]):
        """Logs scalar evaluation metrics (Faithfulness, Recall, Precision, etc.)."""
        if not self.enabled or not self.active_run:
            return
        valid_metrics = {}
        for k, v in metrics.items():
            if isinstance(v, (int, float)) and v is not None:
                valid_metrics[k] = float(v)
        try:
            mlflow.log_metrics(valid_metrics)
        except Exception as e:
            logger.warning(f"⚠️ 记录指标失败: {e}")

    def log_results_table(
        self,
        results: List[Dict[str, Any]],
        framework: str = "deepeval",
        artifact_file: str = "evaluation_details.json",
    ):
        """
        Structures case-by-case questions, answers, and reasons into a DataFrame
        and logs it via mlflow.log_table for Web UI visualization.
        """
        if not self.enabled or not self.active_run or not results:
            return

        rows = []
        for r in results:
            scores = r.get("scores", {})
            reasons = r.get("reasons", {})
            passed = r.get("passed", {})

            row = {
                "test_id": r.get("test_number"),
                "question": r.get("question"),
                "faithfulness": scores.get("faithfulness", r.get("faithfulness")),
                "answer_relevancy": scores.get("answer_relevancy", r.get("answer_relevance")),
                "context_recall": scores.get("contextual_recall", r.get("context_recall")),
                "context_precision": scores.get("contextual_precision", r.get("context_precision")),
                "overall_score": r.get("overall_score", r.get("ragas_score")),
                "contexts_count": r.get("contexts_count", len(r.get("contexts", []))),
                "status": "PASS" if r.get("all_passed") else ("FAIL" if r.get("all_passed") is False else "N/A"),
                "answer": r.get("answer", "")[:300] + "..." if len(r.get("answer", "")) > 300 else r.get("answer", ""),
            }

            # If DeepEval, attach granular reasons
            if framework.lower() == "deepeval":
                row["reason_precision"] = reasons.get("contextual_precision", "N/A")
                row["reason_faithfulness"] = reasons.get("faithfulness", "N/A")
                row["reason_recall"] = reasons.get("contextual_recall", "N/A")

            rows.append(row)

        try:
            df = pd.DataFrame(rows)
            mlflow.log_table(data=df, artifact_file=artifact_file)
            print(f"📊 [MLflow] 成功同步用例详情大表 ({len(rows)} 题) 至平台！")
        except Exception as e:
            logger.warning(f"⚠️ 记录详情大表失败: {e}")

    def log_artifacts(self, artifact_paths: List[Path]):
        """Uploads report JSON and CSV files to MLflow Artifact store."""
        if not self.enabled or not self.active_run:
            return
        for p in artifact_paths:
            if p and p.exists():
                try:
                    mlflow.log_artifact(str(p))
                except Exception as e:
                    logger.warning(f"⚠️ 上报产物 {p.name} 失败: {e}")
