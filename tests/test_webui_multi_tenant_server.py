import os
import pytest
from pathlib import Path
from starlette.testclient import TestClient

# Ensure test uses correct working dir
repo_root = Path(__file__).resolve().parent.parent

from run_lightrag_webui_server import app, dynamic_rag_proxy


@pytest.fixture(scope="module")
def client():
    # Use TestClient with base app
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def auth_headers(client):
    """Logs in with configured admin account to obtain valid Bearer token."""
    res = client.post("/login", data={"username": "admin", "password": "admin123456"})
    if res.status_code == 200:
        token = res.json().get("access_token", "")
        return {"Authorization": f"Bearer {token}"}
    return {}


def test_ops_status_default(client):
    """Verifies /ops/status returns default workspace and active revision."""
    res = client.get("/ops/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert data["tenant_id"] == "__default"
    assert "active_version" in data


def test_ops_workspaces_list(client):
    """Verifies /ops/workspaces lists multi-tenant workspaces."""
    res = client.get("/ops/workspaces")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    project_ids = [w["project_id"] for w in data["workspaces"]]
    assert "11111111-1111-4111-8111-111111111111" in project_ids or "eval_benchmark" in project_ids


def test_dynamic_workspace_routing_by_header(client, auth_headers):
    """Verifies header X-Project-Id routes to eval_benchmark and returns its graph labels."""
    # 1. Access as eval_benchmark with authenticated bearer token
    res_eval = client.get("/graph/label/list", headers={"x-project-id": "eval_benchmark", **auth_headers})
    assert res_eval.status_code == 200
    labels_eval = res_eval.json()
    assert len(labels_eval) >= 47

    # 2. Access as default project with authenticated bearer token
    res_def = client.get(
        "/graph/label/list",
        headers={
            "x-tenant-id": "__default",
            "x-project-id": "11111111-1111-4111-8111-111111111111",
            **auth_headers,
        },
    )
    assert res_def.status_code == 200
    labels_def = res_def.json()
    assert len(labels_def) >= 7

    # 3. Confirms physical separation
    assert labels_eval != labels_def


def test_workspace_select_sets_cookies(client):
    """Verifies /ops/workspaces/select sets cookie and switches active project."""
    res = client.post(
        "/ops/workspaces/select",
        json={"tenant_id": "__default", "project_id": "eval_benchmark"},
    )
    assert res.status_code == 200
    assert "x_project_id" in res.cookies
    assert res.cookies["x_project_id"] == "eval_benchmark"


def test_ops_snapshots_list(client):
    """Verifies /ops/snapshots returns sealed snapshot status."""
    res = client.get(
        "/ops/snapshots",
        headers={"x-tenant-id": "__default", "x-project-id": "11111111-1111-4111-8111-111111111111"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "snapshots" in data
    assert len(data["snapshots"]) >= 1
    assert data["snapshots"][0]["is_sealed"] is True


def test_ops_workspace_metadata(client):
    """Verifies workspace metadata retrieval and mutation."""
    # 1. Verify list includes name field
    res = client.get("/ops/workspaces")
    assert res.status_code == 200
    workspaces = res.json()["workspaces"]
    for w in workspaces:
        assert "name" in w
        assert len(w["name"]) > 0

    # 2. Test updating metadata for a test workspace
    update_res = client.put(
        "/ops/workspaces/__default/test-meta-project/meta",
        json={"name": "测试项目别名", "code": "test-alias", "description": "用于单测的临时项目"},
    )
    assert update_res.status_code == 200
    meta_data = update_res.json()["metadata"]
    assert meta_data["name"] == "测试项目别名"

    # 3. Test reading it back
    get_res = client.get("/ops/workspaces/__default/test-meta-project/meta")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "测试项目别名"
