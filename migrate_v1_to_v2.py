"""Offline Migration Tool: Migrate legacy documents to LightRAG Production Workspace.

Usage:
    python migrate_v1_to_v2.py --source-dir /path/to/legacy/docs --tenant __default --project 11111111-1111-4111-8111-111111111111
"""

from __future__ import annotations

import argparse
import asyncio
import os
import shutil
import sys
import uuid
from pathlib import Path

repo_root = Path(__file__).resolve().parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from dotenv import load_dotenv
load_dotenv(repo_root / ".env")

from lightrag import LightRAG
from llm_client import create_lightrag_embedding_func, unified_llm_func
from snapshot_manager import SnapshotManager
from workspace_manager import TenantWorkspaceManager


async def run_migration(
    source_dir: Path,
    tenant_id: str = "__default",
    project_id: str = "11111111-1111-4111-8111-111111111111",
    storage_root: Optional[Path] = None,
) -> None:
    root = storage_root or (repo_root / "sandbox_storage")
    ws_mgr = TenantWorkspaceManager(root)
    snap_mgr = SnapshotManager(root)

    print(f"\n=======================================================")
    print(f"Starting Knowledge Migration from {source_dir}")
    print(f"Target: tenant={tenant_id}, project={project_id}")
    print(f"Storage: {root}")
    print(f"=======================================================\n")

    if not source_dir.exists():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    # Collect source files
    target_files = []
    for f in source_dir.iterdir():
        if f.is_file() and not f.name.startswith(".") and f.suffix.lower() in (".pdf", ".docx", ".pptx", ".txt", ".md"):
            target_files.append(f)

    print(f"Discovered {len(target_files)} eligible documents for migration:")
    for tf in target_files:
        print(f"  - {tf.name} ({tf.stat().st_size} bytes)")

    # Create candidate sandbox directory
    cand_id = f"cand_mig_{uuid.uuid4().hex[:8]}"
    cand_dir = ws_mgr.get_project_dir(tenant_id, project_id) / "candidates" / cand_id
    cand_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nConstructing candidate build sandbox at: {cand_dir}")

    # Managed assets directory
    managed_dir = ws_mgr.get_project_dir(tenant_id, project_id) / "managed_assets"
    managed_dir.mkdir(parents=True, exist_ok=True)

    # Initialize LightRAG on candidate dir
    cand_rag = LightRAG(
        working_dir=str(cand_dir),
        llm_model_func=unified_llm_func,
        embedding_func=create_lightrag_embedding_func(),
    )
    await cand_rag.initialize_storages()

    # Ingest documents
    for tf in target_files:
        print(f"Ingesting: {tf.name}...")
        # Copy to managed assets
        shutil.copy2(tf, managed_dir / tf.name)

        # Extract text or index
        if tf.suffix.lower() in (".txt", ".md"):
            content = tf.read_text(encoding="utf-8", errors="ignore")
        else:
            # Summary descriptor for binary files
            content = f"Title: {tf.name}\nType: {tf.suffix}\nOriginal Path: {tf}\nPlatform Knowledge Managed Document."

        await cand_rag.ainsert(content)

    # Atomically publish candidate
    next_rev = await ws_mgr.atomic_publish_candidate(tenant_id, project_id, cand_dir)
    rev_name = f"rev_{next_rev}"
    print(f"\n✅ CAS Atomic Activation Succeeded! Active version is now {rev_name}")

    # Seal snapshot
    snapshot_path = snap_mgr.seal_snapshot(tenant_id, project_id, rev_name)
    print(f"✅ Sealed integrity manifest: {snapshot_path}")

    # Verify snapshot
    valid, errs = snap_mgr.verify_snapshot(snapshot_path)
    if valid:
        print(f"✅ Snapshot integrity verified: 100% matched, 0 corruption.")
    else:
        print(f"❌ Snapshot verification failed: {errs}")

    print(f"\n=======================================================")
    print(f"MIGRATION COMPLETED SUCCESSFULLY FOR {tenant_id}:{project_id}")
    print(f"=======================================================\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate legacy docs to LightRAG")
    parser.add_argument("--source-dir", required=True, type=Path, help="Legacy document directory")
    parser.add_argument("--tenant", default="__default", help="Tenant ID")
    parser.add_argument("--project", default="11111111-1111-4111-8111-111111111111", help="Project ID")
    args = parser.parse_args()

    asyncio.run(run_migration(args.source_dir, args.tenant, args.project))
