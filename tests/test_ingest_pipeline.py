import asyncio
import json
import tempfile
from pathlib import Path
import pytest

from gateway_mcp_server import create_mcp_server
from ingest_service import IngestJobTracker, KnowledgeIngestService, validate_file_ref
from workspace_manager import TenantWorkspaceManager


def test_validate_file_ref_rules():
    # 1. Valid PDF file_ref
    valid_pdf = {
        "version": 1,
        "path": "/workspace/uploads/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2.pdf",
        "file_name": "quarterly_report.pdf",
        "mime_type": "application/pdf",
        "size_bytes": 1024 * 1024,
        "sha256": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    }
    assert validate_file_ref(valid_pdf) == valid_pdf

    # 2. Invalid version
    with pytest.raises(ValueError, match="invalid_file_ref"):
        validate_file_ref({**valid_pdf, "version": 2})

    # 3. Path injection / illegal path
    with pytest.raises(ValueError, match="invalid_file_ref"):
        validate_file_ref({**valid_pdf, "file_name": "../../../etc/passwd"})

    # 4. Oversized file
    with pytest.raises(ValueError, match="knowledge_file_too_large"):
        validate_file_ref({**valid_pdf, "size_bytes": 100 * 1024 * 1024})

    # 5. Unsupported format
    with pytest.raises(ValueError, match="knowledge_unsupported_format"):
        validate_file_ref({**valid_pdf, "mime_type": "application/x-executable"})


def test_job_tracker_lifecycle_and_idempotency():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "jobs.sqlite"
        tracker = IngestJobTracker(db_path)

        tenant = "tenant_1"
        proj = "proj_1"
        file_ref = {
            "version": 1,
            "path": "/workspace/uploads/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.docx",
            "file_name": "contract.docx",
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "size_bytes": 45000,
            "sha256": "f" * 64,
        }

        # First submit
        receipt1, reused1 = tracker.create_or_reuse_job(tenant, proj, file_ref)
        assert not reused1
        assert receipt1["status"] == "queued"
        assert receipt1["document_id"] == f"kd_{'f' * 32}"
        job_id = receipt1["job_id"]

        # Duplicate submit with same sha256 -> must return existing job (idempotent / anti-lost ACK)
        receipt2, reused2 = tracker.create_or_reuse_job(tenant, proj, file_ref)
        assert reused2
        assert receipt2["job_id"] == job_id
        assert receipt2["reused"] is True

        # Query job status
        job_data = tracker.get_job(job_id)
        assert job_data is not None
        assert job_data["job_id"] == job_id
        assert "reused" not in job_data

        # Update status
        tracker.update_job_status(job_id, status="ready", searchable=True)
        job_updated = tracker.get_job(job_id)
        assert job_updated["status"] == "ready"
        assert job_updated["searchable"] is True


def test_mcp_gateway_ingest_tools_contract():
    async def _run():
        with tempfile.TemporaryDirectory() as tmpdir:
            ws_mgr = TenantWorkspaceManager(Path(tmpdir))
            server = create_mcp_server(workspace_mgr=ws_mgr)

            file_ref = {
                "version": 1,
                "path": "/workspace/uploads/1122334455667788990011223344556677889900112233445566778899001122.pptx",
                "file_name": "presentation.pptx",
                "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "size_bytes": 85000,
                "sha256": "1122334455667788990011223344556677889900112233445566778899001122",
            }

            # 1. Submit tool call
            res = await server.call_tool(
                "mcp_submit_project_knowledge_document",
                {"file_ref": file_ref},
            )
            # Extract structured response
            receipt = (
                res.structured_content
                if hasattr(res, "structured_content") and res.structured_content
                else json.loads(res.content[0].text)
            )

            assert receipt["version"] == 1
            assert receipt["status"] == "queued"
            assert receipt["document_id"] == f"kd_{file_ref['sha256'][:32]}"
            assert not receipt["reused"]
            job_id = receipt["job_id"]

            # 2. Duplicate submit -> reused should be True
            res_dup = await server.call_tool(
                "mcp_submit_project_knowledge_document",
                {"file_ref": file_ref},
            )
            receipt_dup = (
                res_dup.structured_content
                if hasattr(res_dup, "structured_content") and res_dup.structured_content
                else json.loads(res_dup.content[0].text)
            )
            assert receipt_dup["reused"] is True
            assert receipt_dup["job_id"] == job_id

            # 3. Query job tool call
            job_res = await server.call_tool(
                "mcp_get_project_knowledge_ingest_job",
                {"job_id": job_id},
            )
            job_payload = (
                job_res.structured_content
                if hasattr(job_res, "structured_content") and job_res.structured_content
                else json.loads(job_res.content[0].text)
            )
            assert job_payload["job_id"] == job_id
            assert "reused" not in job_payload

            # 4. Query non-existent job
            bad_job = await server.call_tool(
                "mcp_get_project_knowledge_ingest_job",
                {"job_id": "job_nonexistent"},
            )
            bad_payload = (
                bad_job.structured_content
                if hasattr(bad_job, "structured_content") and bad_job.structured_content
                else json.loads(bad_job.content[0].text)
            )
            assert bad_payload["status"] == "failed"

    asyncio.run(_run())
