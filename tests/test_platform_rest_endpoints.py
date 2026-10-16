import pytest
from starlette.testclient import TestClient
from gateway_mcp_server import create_mcp_server


def test_rest_endpoints_contract():
    server = create_mcp_server()
    # FastMCP mounts HTTP routes under http_app(path="/mcp")
    client = TestClient(server.http_app(path="/mcp"))

    # 1. capabilities
    resp = client.get("/internal/knowledge/capabilities")
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"] == 1
    assert data["read_enabled"] is True
    assert data["upload_enabled"] is True
    assert "application/pdf" in data["supported_mime_types"]
    assert data["max_file_bytes"] == 20 * 1024 * 1024

    # 2. documents
    resp = client.get("/internal/knowledge/documents?limit=10&offset=0")
    assert resp.status_code == 200
    docs_data = resp.json()
    assert "items" in docs_data
    assert "total" in docs_data
    assert isinstance(docs_data["items"], list)
    assert isinstance(docs_data["total"], int)

    # 3. jobs
    resp = client.get("/internal/knowledge/jobs?limit=10&offset=0")
    assert resp.status_code == 200
    jobs_data = resp.json()
    assert "items" in jobs_data
    assert "total" in jobs_data
    assert isinstance(jobs_data["items"], list)
    assert isinstance(jobs_data["total"], int)

    # 4. stats
    resp = client.get("/internal/knowledge/stats")
    assert resp.status_code == 200
    stats_data = resp.json()
    assert isinstance(stats_data, dict)

    # 5. graph
    resp = client.get("/internal/knowledge/graph?entity_name=sample&depth=1")
    assert resp.status_code == 200
    graph_data = resp.json()
    assert "nodes" in graph_data
    assert "edges" in graph_data
