import pytest
from pathlib import Path
import tempfile
from workspace_manager import TenantWorkspaceManager


def test_workspace_meta_default_fallbacks():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = TenantWorkspaceManager(Path(tmpdir))
        
        # 1. Default project
        meta_def = mgr.get_project_meta("__default", "11111111-1111-4111-8111-111111111111")
        assert meta_def["name"] == "平台默认项目"
        assert meta_def["project_id"] == "11111111-1111-4111-8111-111111111111"

        # 2. Eval benchmark
        meta_eval = mgr.get_project_meta("__default", "eval_benchmark")
        assert meta_eval["name"] == "评测基准 (eval_benchmark)"

        # 3. Arbitrary UUID fallback
        custom_uuid = "5a5b7239-43e3-40e6-bba3-e64d96057607"
        meta_custom = mgr.get_project_meta("__default", custom_uuid)
        assert meta_custom["name"] == custom_uuid


def test_workspace_meta_atomic_save_and_load():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = TenantWorkspaceManager(Path(tmpdir))
        custom_uuid = "5a5b7239-43e3-40e6-bba3-e64d96057607"

        # Save metadata
        saved = mgr.save_project_meta(
            tenant_id="__default",
            project_id=custom_uuid,
            name="智能客服知识库",
            code="customer-service",
            description="客户服务核心问答图谱",
        )
        assert saved["name"] == "智能客服知识库"
        assert saved["code"] == "customer-service"
        assert saved["updated_at"] is not None

        # Load back
        loaded = mgr.get_project_meta("__default", custom_uuid)
        assert loaded["name"] == "智能客服知识库"
        assert loaded["code"] == "customer-service"
        assert loaded["description"] == "客户服务核心问答图谱"

        # Verify physical file
        meta_file = Path(tmpdir) / "__default" / custom_uuid / "meta.json"
        assert meta_file.exists()
