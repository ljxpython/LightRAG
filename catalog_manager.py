#!/usr/bin/env python3
"""
Lightweight Catalog & Metadata Lineage Manager for LightRAG.
Uses local SQLite3 (sandbox_storage/catalog.sqlite) in WAL mode to provide
zero-dependency relational metadata querying for projects, datasets, and eval runs.
Completely decoupled from official LightRAG core.
"""

import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("catalog_manager")


class CatalogManager:
    """Manages local relational metadata catalog using SQLite in WAL mode."""

    def __init__(self, db_path: Optional[Path] = None):
        if db_path is None:
            db_path = Path(__file__).resolve().parent / "sandbox_storage" / "catalog.sqlite"
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    tenant_id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    name TEXT,
                    code TEXT,
                    description TEXT,
                    active_version TEXT DEFAULT 'rev_1',
                    docs_count INTEGER DEFAULT 0,
                    updated_at TEXT,
                    PRIMARY KEY (tenant_id, project_id)
                );
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS datasets (
                    name TEXT PRIMARY KEY,
                    project_id TEXT,
                    revision_id TEXT DEFAULT 'rev_1',
                    cases_count INTEGER DEFAULT 0,
                    source_docs_json TEXT,
                    is_benchmark INTEGER DEFAULT 0,
                    is_archived INTEGER DEFAULT 0,
                    created_at TEXT,
                    updated_at TEXT
                );
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS eval_runs (
                    task_id TEXT PRIMARY KEY,
                    project_id TEXT,
                    dataset_name TEXT,
                    modes_json TEXT,
                    top_k INTEGER DEFAULT 40,
                    limit_count INTEGER,
                    status TEXT,
                    progress INTEGER DEFAULT 0,
                    runs_json TEXT,
                    result_url TEXT,
                    overall_score REAL,
                    pass_rate REAL,
                    metrics_summary_json TEXT,
                    report_file TEXT,
                    created_at TEXT,
                    completed_at TEXT
                );
            """)
            # Auto-migrate existing eval_runs columns
            cursor = conn.execute("PRAGMA table_info(eval_runs)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            for col, col_type in [
                ("overall_score", "REAL"),
                ("pass_rate", "REAL"),
                ("metrics_summary_json", "TEXT"),
                ("report_file", "TEXT"),
            ]:
                if col not in existing_cols:
                    try:
                        conn.execute(f"ALTER TABLE eval_runs ADD COLUMN {col} {col_type};")
                    except Exception:
                        pass
            conn.commit()

    def upsert_project(
        self,
        tenant_id: str,
        project_id: str,
        name: Optional[str] = None,
        code: Optional[str] = None,
        description: str = "",
        active_version: str = "rev_1",
        docs_count: int = 0,
    ):
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO projects (tenant_id, project_id, name, code, description, active_version, docs_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id, project_id) DO UPDATE SET
                    name = COALESCE(excluded.name, projects.name),
                    code = COALESCE(excluded.code, projects.code),
                    description = excluded.description,
                    active_version = excluded.active_version,
                    docs_count = excluded.docs_count,
                    updated_at = excluded.updated_at;
            """, (tenant_id, project_id, name, code, description, active_version, docs_count, now))
            conn.commit()

    def list_projects(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
            return [dict(r) for r in rows]

    def remove_project(self, tenant_id: str, project_id: str):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM projects WHERE tenant_id = ? AND project_id = ?;", (tenant_id, project_id))
            conn.commit()

    def upsert_dataset(
        self,
        name: str,
        project_id: Optional[str],
        revision_id: str = "rev_1",
        cases_count: int = 0,
        source_docs: Optional[List[str]] = None,
        is_benchmark: bool = False,
    ):
        now = datetime.now(timezone.utc).isoformat()
        docs_json = json.dumps(source_docs or [])
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO datasets (name, project_id, revision_id, cases_count, source_docs_json, is_benchmark, is_archived, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    project_id = excluded.project_id,
                    revision_id = excluded.revision_id,
                    cases_count = excluded.cases_count,
                    source_docs_json = excluded.source_docs_json,
                    is_benchmark = excluded.is_benchmark,
                    is_archived = 0,
                    updated_at = excluded.updated_at;
            """, (name, project_id, revision_id, cases_count, docs_json, 1 if is_benchmark else 0, now, now))
            conn.commit()

    def archive_dataset(self, name: str):
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute("UPDATE datasets SET is_archived = 1, updated_at = ? WHERE name = ?;", (now, name))
            conn.commit()

    def list_datasets(self, include_archived: bool = False) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            query = "SELECT * FROM datasets WHERE is_archived = 0 ORDER BY updated_at DESC;" if not include_archived else "SELECT * FROM datasets ORDER BY updated_at DESC;"
            rows = conn.execute(query).fetchall()
            results = []
            for r in rows:
                item = dict(r)
                item["source_docs"] = json.loads(item.get("source_docs_json") or "[]")
                item["is_benchmark"] = bool(item.get("is_benchmark"))
                results.append(item)
            return results

    def record_eval_run(
        self,
        task_id: str,
        project_id: str,
        dataset_name: str,
        modes: List[str],
        top_k: int = 40,
        limit_count: Optional[int] = None,
        status: str = "running",
    ):
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO eval_runs (task_id, project_id, dataset_name, modes_json, top_k, limit_count, status, progress, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 10, ?)
                ON CONFLICT(task_id) DO UPDATE SET
                    status = excluded.status,
                    progress = excluded.progress;
            """, (task_id, project_id, dataset_name, json.dumps(modes), top_k, limit_count, status, now))
            conn.commit()

    def update_eval_run(
        self,
        task_id: str,
        status: str,
        progress: int,
        runs: Optional[List[str]] = None,
        result_url: Optional[str] = None,
        overall_score: Optional[float] = None,
        pass_rate: Optional[float] = None,
        metrics_summary: Optional[Dict[str, Any]] = None,
        report_file: Optional[str] = None,
    ):
        now = datetime.now(timezone.utc).isoformat() if status in ("completed", "failed") else None
        runs_json = json.dumps(runs) if runs else None
        metrics_json = json.dumps(metrics_summary) if metrics_summary is not None else None
        with self._get_conn() as conn:
            conn.execute("""
                UPDATE eval_runs SET
                    status = ?,
                    progress = ?,
                    runs_json = COALESCE(?, runs_json),
                    result_url = COALESCE(?, result_url),
                    overall_score = COALESCE(?, overall_score),
                    pass_rate = COALESCE(?, pass_rate),
                    metrics_summary_json = COALESCE(?, metrics_summary_json),
                    report_file = COALESCE(?, report_file),
                    completed_at = COALESCE(?, completed_at)
                WHERE task_id = ?;
            """, (status, progress, runs_json, result_url, overall_score, pass_rate, metrics_json, report_file, now, task_id))
            conn.commit()

    def list_eval_runs(self, project_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            if project_id and project_id != "all":
                cursor = conn.execute("""
                    SELECT task_id, project_id, dataset_name, modes_json, top_k, limit_count,
                           status, progress, runs_json, result_url, overall_score, pass_rate,
                           metrics_summary_json, report_file, created_at, completed_at
                    FROM eval_runs
                    WHERE project_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?;
                """, (project_id, limit))
            else:
                cursor = conn.execute("""
                    SELECT task_id, project_id, dataset_name, modes_json, top_k, limit_count,
                           status, progress, runs_json, result_url, overall_score, pass_rate,
                           metrics_summary_json, report_file, created_at, completed_at
                    FROM eval_runs
                    ORDER BY created_at DESC
                    LIMIT ?;
                """, (limit,))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                results.append({
                    "task_id": r[0],
                    "project_id": r[1],
                    "dataset_name": r[2],
                    "modes": json.loads(r[3]) if r[3] else [],
                    "top_k": r[4],
                    "limit_count": r[5],
                    "status": r[6],
                    "progress": r[7],
                    "runs": json.loads(r[8]) if r[8] else [],
                    "result_url": r[9],
                    "overall_score": r[10],
                    "pass_rate": r[11],
                    "metrics_summary": json.loads(r[12]) if r[12] else {},
                    "report_file": r[13],
                    "created_at": r[14],
                    "completed_at": r[15],
                })
            return results

    def get_eval_run(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.execute("""
                SELECT task_id, project_id, dataset_name, modes_json, top_k, limit_count,
                       status, progress, runs_json, result_url, overall_score, pass_rate,
                       metrics_summary_json, report_file, created_at, completed_at
                FROM eval_runs
                WHERE task_id = ?;
            """, (task_id,))
            r = cursor.fetchone()
            if not r:
                return None
            return {
                "task_id": r[0],
                "project_id": r[1],
                "dataset_name": r[2],
                "modes": json.loads(r[3]) if r[3] else [],
                "top_k": r[4],
                "limit_count": r[5],
                "status": r[6],
                "progress": r[7],
                "runs": json.loads(r[8]) if r[8] else [],
                "result_url": r[9],
                "overall_score": r[10],
                "pass_rate": r[11],
                "metrics_summary": json.loads(r[12]) if r[12] else {},
                "report_file": r[13],
                "created_at": r[14],
                "completed_at": r[15],
            }

    def sync_from_filesystem(self, storage_root: Path, datasets_dir: Path):
        """Self-healing scan: populates catalog.sqlite from existing physical files."""
        try:
            # 1. Sync projects
            if storage_root.exists():
                for tenant in storage_root.iterdir():
                    if not tenant.is_dir() or tenant.name.startswith("."):
                        continue
                    if tenant.name == "eval_benchmark":
                        rev = tenant / "rev_1"
                        docs_f = rev / "kv_store_full_docs.json"
                        cnt = len(json.loads(docs_f.read_text())) if docs_f.exists() else 0
                        self.upsert_project(
                            tenant_id="__default",
                            project_id="eval_benchmark",
                            name="评测基准 (eval_benchmark)",
                            code="eval_benchmark",
                            active_version="rev_1",
                            docs_count=cnt,
                        )
                        continue
                    for p in tenant.iterdir():
                        if not p.is_dir() or p.name.startswith("."):
                            continue
                        meta_f = p / "meta.json"
                        meta = json.loads(meta_f.read_text()) if meta_f.exists() else {}
                        active = p / "active"
                        docs_f = active / "kv_store_full_docs.json"
                        cnt = len(json.loads(docs_f.read_text())) if docs_f.exists() else 0
                        self.upsert_project(
                            tenant_id=tenant.name,
                            project_id=p.name,
                            name=meta.get("name") or p.name,
                            code=meta.get("code") or p.name[:8],
                            active_version=meta.get("active_version", "rev_1"),
                            docs_count=cnt,
                        )

            # 2. Sync datasets
            if datasets_dir.exists():
                for f in datasets_dir.glob("*.json"):
                    if f.name.startswith("."):
                        continue
                    try:
                        data = json.loads(f.read_text(encoding="utf-8"))
                        manifest = data.get("corpus_manifest", {})
                        cases = data.get("cases") or data.get("test_cases") or []
                        p_id = manifest.get("project_id", data.get("project_id", "unknown"))
                        is_bench = (
                            f.name == "business_qa.json"
                            or "benchmark" in f.name.lower()
                            or p_id == "eval_benchmark"
                        )
                        docs = manifest.get("source_docs", [])
                        if not docs:
                            # Extract unique source_docs from cases
                            docs_set = set()
                            for c in cases:
                                for d in c.get("source_docs", []):
                                    docs_set.add(d)
                            docs = list(docs_set)
                        self.upsert_dataset(
                            name=f.name,
                            project_id=p_id,
                            revision_id=manifest.get("revision_id", "rev_1"),
                            cases_count=len(cases),
                            source_docs=docs,
                            is_benchmark=is_bench,
                        )
                    except Exception as ex:
                        logger.warning(f"Failed to index dataset {f.name}: {ex}")

            # 3. Clean up orphaned running eval runs from prior crashes/restarts
            with self._get_conn() as conn:
                conn.execute("UPDATE eval_runs SET status = 'aborted', progress = 0 WHERE status = 'running';")
                conn.commit()
        except Exception as e:
            logger.error(f"Catalog sync from filesystem encountered error: {e}", exc_info=True)


catalog_mgr = CatalogManager()
