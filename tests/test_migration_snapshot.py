import json
import tempfile
from pathlib import Path
import pytest

from snapshot_manager import SnapshotManager
from workspace_manager import TenantWorkspaceManager


def test_snapshot_seal_and_verify_integrity():
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_root = Path(tmpdir)
        ws_mgr = TenantWorkspaceManager(storage_root)
        snap_mgr = SnapshotManager(storage_root)

        tenant = "test_tenant"
        proj = "test_project"

        # 1. Initialize rev_1 directory
        active_dir = ws_mgr.get_active_dir(tenant, proj)
        rev_1_dir = active_dir.resolve()
        orig_content = '{"nodes": [1, 2, 3]}'  # 20 bytes
        (rev_1_dir / "index_graph.json").write_text(orig_content)
        (rev_1_dir / "vectors.bin").write_bytes(b"\x00\x01\x02\x03\x04")

        # 2. Seal snapshot
        snap_file = snap_mgr.seal_snapshot(tenant, proj, "rev_1")
        assert snap_file.exists()

        manifest = json.loads(snap_file.read_text(encoding="utf-8"))
        assert manifest["revision"] == "rev_1"
        assert manifest["total_files"] == 2
        assert "index_graph.json" in manifest["files"]
        assert "vectors.bin" in manifest["files"]

        # 3. Verify intact snapshot
        valid, errs = snap_mgr.verify_snapshot(snap_file)
        assert valid
        assert len(errs) == 0

        # 4. Tamper file with size mismatch
        (rev_1_dir / "index_graph.json").write_text('{"tampered": true}')
        valid_tampered, errs_tampered = snap_mgr.verify_snapshot(snap_file)
        assert not valid_tampered
        assert any("Size mismatch" in e for e in errs_tampered)

        # 5. Tamper file with same size (20 bytes) to test checksum corruption
        same_size_tampered = '{"nodes": [9, 9, 9]}'  # 20 bytes
        (rev_1_dir / "index_graph.json").write_text(same_size_tampered)
        valid_checksum, errs_checksum = snap_mgr.verify_snapshot(snap_file)
        assert not valid_checksum
        assert any("Checksum corrupted" in e for e in errs_checksum)


def test_atomic_version_rollback():
    with tempfile.TemporaryDirectory() as tmpdir:
        storage_root = Path(tmpdir)
        ws_mgr = TenantWorkspaceManager(storage_root)
        snap_mgr = SnapshotManager(storage_root)

        tenant = "t_rollback"
        proj = "p_rollback"

        # 1. Start at rev_1
        active_dir = ws_mgr.get_active_dir(tenant, proj)
        rev_1_dir = active_dir.resolve()
        (rev_1_dir / "version.txt").write_text("v1_data")

        # 2. Publish rev_2
        cand_dir = ws_mgr.get_project_dir(tenant, proj) / "candidates" / "c_test"
        cand_dir.mkdir(parents=True, exist_ok=True)
        (cand_dir / "version.txt").write_text("v2_data")

        async def _pub():
            return await ws_mgr.atomic_publish_candidate(tenant, proj, cand_dir)

        import asyncio
        next_rev = asyncio.run(_pub())
        assert next_rev == 2
        assert active_dir.resolve().name == "rev_2"
        assert (active_dir / "version.txt").read_text() == "v2_data"

        # 3. Rollback to rev_1
        ok = snap_mgr.rollback_to_revision(tenant, proj, "rev_1")
        assert ok
        # active symlink must immediately point back to rev_1
        assert active_dir.resolve().name == "rev_1"
        assert (active_dir / "version.txt").read_text() == "v1_data"
