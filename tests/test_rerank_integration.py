import asyncio
import os
import pytest
from dotenv import load_dotenv

from llm_client import create_lightrag_rerank_func
from workspace_manager import TenantWorkspaceManager

load_dotenv()


def test_create_lightrag_rerank_func_null(monkeypatch):
    """Test that null/none bindings safely return None without throwing."""
    monkeypatch.setenv("RERANK_BINDING", "null")
    assert create_lightrag_rerank_func() is None

    monkeypatch.setenv("RERANK_BINDING", "none")
    assert create_lightrag_rerank_func() is None

    monkeypatch.setenv("RERANK_BINDING", "")
    assert create_lightrag_rerank_func() is None


def test_create_lightrag_rerank_func_aliyun(monkeypatch):
    """Test that aliyun binding returns a valid async callable."""
    monkeypatch.setenv("RERANK_BINDING", "aliyun")
    monkeypatch.setenv("RERANK_MODEL", "gte-rerank-v2")
    func = create_lightrag_rerank_func()
    assert func is not None
    assert callable(func)
    assert asyncio.iscoroutinefunction(func)


@pytest.mark.asyncio
async def test_bailian_gte_rerank_live_call():
    """Real live verification calling Alibaba Bailian gte-rerank-v2 API."""
    rerank_func = create_lightrag_rerank_func()
    if rerank_func is None:
        pytest.skip("RERANK_BINDING is not configured or disabled.")

    query = "什么是量子纠缠？"
    documents = [
        "量子纠缠是量子力学中的一种现象，两个或多个粒子在空间上相距遥远但其状态紧密相关。",
        "今天北京的天气晴朗，微风徐徐，适合外出郊游踏青。",
        "牛顿第二运动定律表明物体的加速度与合外力成正比，与质量成反比。",
    ]

    results = await rerank_func(query=query, documents=documents, top_n=2)

    assert isinstance(results, list)
    assert len(results) <= 2
    assert len(results) > 0

    first_item = results[0]
    assert "index" in first_item
    assert "relevance_score" in first_item
    # Document 0 (quantum entanglement) should have the highest relevance score
    assert first_item["index"] == 0
    assert first_item["relevance_score"] > 0.8
    print(f"\n[Live Rerank Result] {results}")


@pytest.mark.asyncio
async def test_workspace_manager_rerank_injection(tmp_path):
    """Test that TenantWorkspaceManager successfully injects rerank_model_func into LightRAG."""
    mgr = TenantWorkspaceManager(storage_root=tmp_path)
    tenant_id = "test_tenant"
    project_id = "test_project"

    rag, version = await mgr.get_rag_engine(tenant_id, project_id)
    try:
        assert rag is not None
        # LightRAG should have rerank_model_func configured
        assert rag.rerank_model_func is not None
        # Check global_config has rerank_model_func
        assert "rerank_model_func" in rag.key_string_value_json_storage_cls.keywords["global_config"]
    finally:
        await rag.finalize_storages()
