"""Snapshot and Rollback Manager for LightRAG Revisions.

Provides SHA-256 integrity seal and instant atomic rollback for production versions.
Excludes transient runtime caches (e.g. kv_store_llm_response_cache.json) from checksums.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("snapshot_manager")

TRANSIENT_FILES = {
    "snapshot.json",
    "kv_store_llm_response_cache.json",
}


def compute_file_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


class SnapshotManager:
    def __init__(self, storage_root: Path):
        self.storage_root = Path(storage_root)

    def seal_snapshot(
        self, tenant_id: str, project_id: str, revision_name: str
    ) -> Path:
        """Computes SHA-256 for all core artifacts in a revision and seals snapshot.json."""
        rev_dir = (
            self.storage_root / tenant_id / project_id / "revisions" / revision_name
        )
        if not rev_dir.exists() or not rev_dir.is_dir():
            raise FileNotFoundError(f"Revision directory not found: {rev_dir}")

        files_meta: Dict[str, Dict[str, Any]] = {}
        for root, _, files in os.walk(rev_dir):
            for fname in sorted(files):
                if fname in TRANSIENT_FILES or fname.endswith(".tmp") or fname.startswith("."):
                    continue
                fpath = Path(root) / fname
                rel_path = str(fpath.relative_to(rev_dir))
                files_meta[rel_path] = {
                    "size_bytes": fpath.stat().st_size,
                    "sha256": compute_file_sha256(fpath),
                }

        manifest = {
            "version": 1,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "revision": revision_name,
            "sealed_at": datetime.now(timezone.utc).isoformat(),
            "total_files": len(files_meta),
            "files": files_meta,
        }

        snapshot_file = rev_dir / "snapshot.json"
        snapshot_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        logger.info(f"Sealed snapshot for {tenant_id}:{project_id}:{revision_name}")
        return snapshot_file

    def verify_snapshot(self, snapshot_file: Path) -> Tuple[bool, List[str]]:
        """Verifies integrity of all core files against sealed snapshot.json."""
        if not snapshot_file.exists():
            return False, ["snapshot.json not found"]

        manifest = json.loads(snapshot_file.read_text(encoding="utf-8"))
        rev_dir = snapshot_file.parent
        errors = []

        for rel_path, expected in manifest.get("files", {}).items():
            if Path(rel_path).name in TRANSIENT_FILES:
                continue
            fpath = rev_dir / rel_path
            if not fpath.exists():
                errors.append(f"Missing file: {rel_path}")
                continue
            if fpath.stat().st_size != expected["size_bytes"]:
                errors.append(f"Size mismatch on {rel_path}")
                continue
            current_sha = compute_file_sha256(fpath)
            if current_sha != expected["sha256"]:
                errors.append(f"Checksum corrupted on {rel_path}")

        return (len(errors) == 0), errors

    def rollback_to_revision(
        self, tenant_id: str, project_id: str, target_revision: str
    ) -> bool:
        """Atomically switches active symlink to target historical revision."""
        p_dir = self.storage_root / tenant_id / project_id
        target_dir = p_dir / "revisions" / target_revision
        if not target_dir.exists() or not target_dir.is_dir():
            raise FileNotFoundError(f"Target revision {target_revision} does not exist")

        active_symlink = p_dir / "active"
        tmp_symlink = p_dir / "active.tmp"
        rel_target = Path("revisions") / target_revision

        if tmp_symlink.is_symlink() or tmp_symlink.exists():
            tmp_symlink.unlink()
        tmp_symlink.symlink_to(rel_target, target_is_directory=True)

        os.replace(str(tmp_symlink), str(active_symlink))
        logger.info(f"Successfully rolled back {tenant_id}:{project_id} to {target_revision}")
        return True
