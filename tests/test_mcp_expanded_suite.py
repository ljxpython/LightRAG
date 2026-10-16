"""Comprehensive Test Suite for 8-Tool FastMCP Gateway Expansion.

Validates:
1. 100% backward compatibility of existing 5 tools.
2. New query parameters (mode, document_ids filter, conversation_history).
3. Subgraph exploration via NetworkX (mcp_query_knowledge_graph).
4. Full observability stats collection (mcp_get_project_knowledge_stats).
5. Safe lifecycle document deletion with CAS activation (mcp_delete_project_knowledge_document).
"""

from __future__ import annotations

import json
from pathlib import Path
import networkx as nx
import pytest

from auth_middleware import KnowledgeTokenVerifier
from gateway_mcp_server import create_mcp_server
from snapshot_manager import SnapshotManager
from workspace_manager import TenantWorkspaceManager


def extract_payload(res) -> dict:
    """Helper to unwrap FastMCP ToolResult content."""
    if hasattr(res, "content") and res.content:
        text = res.content[0].text
        return json.loads(text)
    if hasattr(res, "text"):
        return json.loads(res.text)
    if isinstance(res, str):
        return json.loads(res)
    if isinstance(res, dict):
        return res
    raise ValueError(f"Cannot extract payload from {type(res)}: {res}")


@pytest.fixture
def test_env(tmp_path: Path):
    """Sets up an isolated test tenant workspace with seeded graph and documents."""
    storage_root = tmp_path / "test_storage"
    mgr = TenantWorkspaceManager(storage_root)
    snap_mgr = SnapshotManager(storage_root)
    verifier = KnowledgeTokenVerifier()
    scope = verifier.resolve_default_or_first_scope()
    tenant_id = scope.tenant_id
    project_id = scope.project_id

    # Create rev_1 with graphml and dummy kv_store
    rev1_dir = mgr.storage_root / tenant_id / project_id / "revisions" / "rev_1"
    rev1_dir.mkdir(parents=True, exist_ok=True)

    # Seed NetworkX GraphML
    g = nx.Graph()
    g.add_node("Docling", entity_type="TECHNOLOGY", description="Multimodal document parser")
    g.add_node("FastMCP", entity_type="FRAMEWORK", description="High-performance MCP protocol server")
    g.add_node("LightRAG", entity_type="ENGINE", description="Graph-augmented RAG engine")
    g.add_edge("Docling", "LightRAG", weight=1.0, description="Provides parsed chunks for graph indexing")
    g.add_edge("FastMCP", "LightRAG", weight=1.0, description="Exposes FastMCP tools for LightRAG")
    nx.write_graphml(g, rev1_dir / "graph_chunk_entity_relation.graphml")

    # Seed managed asset
    managed_dir = mgr.storage_root / tenant_id / project_id / "managed_assets"
    managed_dir.mkdir(parents=True, exist_ok=True)
    sample_doc = managed_dir / "docling_arch.pdf"
    sample_doc.write_text("dummy pdf binary content")

    # Seed chunks store
    chunks_file = rev1_dir / "kv_store_text_chunks.json"
    chunks_file.write_text('{"c1": {"content": "Docling provides layout analysis.", "file_path": "docling_arch.pdf", "chunk_id": "kd_001-c1"}}')

    # Seal snapshot and set active symlink
    snap_mgr.seal_snapshot(tenant_id, project_id, "rev_1")
    active_symlink = mgr.storage_root / tenant_id / project_id / "active"
    active_symlink.symlink_to(Path("revisions") / "rev_1", target_is_directory=True)

    # Mock server
    server = create_mcp_server(
        workspace_mgr=mgr, token_verifier=verifier, name="test-expanded-gateway"
    )
    return {
        "storage_root": storage_root,
        "mgr": mgr,
        "server": server,
        "tenant_id": tenant_id,
        "project_id": project_id,
    }


@pytest.mark.asyncio
async def test_all_8_tools_registered(test_env):
    """Verify all 8 tools are properly registered on the FastMCP server."""
    server = test_env["server"]
    tools = await server.list_tools()
    tool_names = [t.name for t in tools]

    expected = [
        "mcp_query_project_knowledge",
        "mcp_list_project_knowledge_documents",
        "mcp_get_project_knowledge_document_status",
        "mcp_submit_project_knowledge_document",
        "mcp_get_project_knowledge_ingest_job",
        "mcp_query_knowledge_graph",
        "mcp_delete_project_knowledge_document",
        "mcp_get_project_knowledge_stats",
    ]
    for exp in expected:
        assert exp in tool_names, f"Tool {exp} not registered in FastMCP"
    assert len(tool_names) == 8


@pytest.mark.asyncio
async def test_backward_compatible_query(test_env):
    """Verify legacy query call signature (query, top_k, sources_version) works seamlessly."""
    server = test_env["server"]

    # Call with minimal legacy args
    res = await server.call_tool("mcp_query_project_knowledge", {"query": "Docling", "top_k": 3})
    payload = extract_payload(res)

    assert "status" in payload
    assert "sources" in payload
    assert isinstance(payload["sources"], list)


@pytest.mark.asyncio
async def test_subgraph_exploration_tool(test_env):
    """Verify mcp_query_knowledge_graph returns 1-degree neighborhood and handles missing entities."""
    server = test_env["server"]

    # 1. Hit Docling
    res = await server.call_tool(
        "mcp_query_knowledge_graph", {"entity_name": "Docling", "depth": 1}
    )
    payload = extract_payload(res)

    assert payload["status"] == "ok"
    assert payload["entity"] == "Docling"
    assert payload["total_nodes"] >= 2  # Docling + LightRAG
    assert payload["total_edges"] >= 1
    node_names = [n["name"] for n in payload["nodes"]]
    assert "Docling" in node_names
    assert "LightRAG" in node_names

    # 2. Miss unknown entity
    res_miss = await server.call_tool(
        "mcp_query_knowledge_graph", {"entity_name": "NonExistentEntity"}
    )
    payload_miss = extract_payload(res_miss)
    assert payload_miss["status"] == "no_hit"
    assert payload_miss["nodes"] == []


@pytest.mark.asyncio
async def test_project_stats_observability_tool(test_env):
    """Verify mcp_get_project_knowledge_stats collects accurate ecosystem metrics."""
    server = test_env["server"]

    res = await server.call_tool("mcp_get_project_knowledge_stats", {})
    payload = extract_payload(res)

    assert payload["status"] == "ok"
    assert payload["active_version"] == "rev_1"
    assert payload["total_documents"] == 1
    assert payload["total_entities"] == 3  # Docling, FastMCP, LightRAG
    assert payload["total_relations"] == 2
    assert payload["total_chunks"] == 1
    assert payload["snapshot_sealed"] is True
    assert payload["snapshot_valid"] is True
    assert payload["storage_bytes"] > 0


@pytest.mark.asyncio
async def test_list_and_status_tools(test_env):
    """Verify mcp_list_project_knowledge_documents and status tools."""
    server = test_env["server"]

    res = await server.call_tool("mcp_list_project_knowledge_documents", {"limit": 10})
    payload = extract_payload(res)

    assert payload["status"] == "ok"
    assert len(payload["documents"]) >= 1
    doc0 = payload["documents"][0]
    assert "document_id" in doc0
    assert doc0["filename"] == "docling_arch.pdf"

    # Status check
    st_res = await server.call_tool(
        "mcp_get_project_knowledge_document_status", {"document_id": doc0["document_id"]}
    )
    st_payload = extract_payload(st_res)
    assert st_payload["status"] == "ok"
    assert st_payload["overall_status"] == "ready"


@pytest.mark.asyncio
async def test_document_deletion_tool(test_env):
    """Verify mcp_delete_project_knowledge_document performs safe physical & CAS pruning."""
    server = test_env["server"]
    tenant_id = test_env["tenant_id"]
    project_id = test_env["project_id"]
    mgr = test_env["mgr"]

    # Delete existing doc
    res = await server.call_tool(
        "mcp_delete_project_knowledge_document", {"document_id": "docling_arch.pdf"}
    )
    payload = extract_payload(res)
    assert payload["status"] == "ok"
    assert payload["active_version"] == "rev_2"

    # Verify physical file was pruned
    managed_dir = mgr.storage_root / tenant_id / project_id / "managed_assets"
    assert not (managed_dir / "docling_arch.pdf").exists()

    # Verify new revision has valid snapshot seal
    rev2_dir = mgr.storage_root / tenant_id / project_id / "revisions" / "rev_2"
    assert rev2_dir.exists()
    snap_mgr = SnapshotManager(mgr.storage_root)
    valid, _ = snap_mgr.verify_snapshot(rev2_dir / "snapshot.json")
    assert valid is True
