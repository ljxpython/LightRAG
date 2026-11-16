"""Integration tests for WebUI SSO exchange and pass-through delegation in run_lightrag_webui_server."""

import os
import pytest
from fastapi.testclient import TestClient
import httpx

import sso_auth_delegator


@pytest.fixture(scope="module")
def client():
    # Set required environment variables before importing server
    os.environ["SSO_SECRET_KEY"] = "test-sso-secret-987654321"
    os.environ["TOKEN_SECRET"] = "test-token-secret-12345"
    os.environ["AUTH_ACCOUNTS"] = "admin:admin123456"
    os.environ["AGENT_PLATFORM_API_URL"] = "http://mock-agent:2142"

    from run_lightrag_webui_server import app
    return TestClient(app)


def test_sso_exchange_endpoint_success(client):
    secret = "test-sso-secret-987654321"
    ticket = sso_auth_delegator.create_sso_ticket(
        username="lisi",
        secret=secret,
        role="user",
        tenant_id="tenant-abc",
        project_id="proj-xyz",
        ttl=60,
    )
    response = client.post("/auth/sso-exchange", json={"ticket": ticket})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "lisi"
    assert data["role"] == "user"
    assert data["tenant_id"] == "tenant-abc"
    assert data["project_id"] == "proj-xyz"
    assert "access_token" in data
    assert len(data["access_token"].split(".")) == 3


def test_sso_exchange_endpoint_invalid_ticket(client):
    response = client.post("/auth/sso-exchange", json={"ticket": "invalid.ticket.signature"})
    assert response.status_code == 401


def test_login_local_admin_fallback(client):
    # Form data login
    response = client.post("/login", data={"username": "admin", "password": "admin123456"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data.get("auth_mode") == "enabled"


def test_login_pass_through_agent_platform_success(client, monkeypatch):
    def mock_post(url, **kwargs):
        if "/api/identity/session" in url:
            return httpx.Response(
                status_code=200,
                json={
                    "user": {
                        "username": "agent_user_1",
                        "role": "user",
                        "roles": ["user"],
                        "tenant_id": "tenant-001",
                        "display_name": "Agent User 1",
                    }
                },
                request=httpx.Request("POST", url),
            )
        raise RuntimeError(f"Unexpected url: {url}")

    monkeypatch.setattr(httpx, "post", mock_post)

    response = client.post("/login", data={"username": "agent_user_1", "password": "password123"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data.get("auth_mode") == "enabled"


def test_login_pass_through_agent_platform_rejected(client, monkeypatch):
    def mock_post(url, **kwargs):
        if "/api/identity/session" in url:
            return httpx.Response(
                status_code=401,
                json={"detail": "Invalid credentials"},
                request=httpx.Request("POST", url),
            )
        raise RuntimeError(f"Unexpected url: {url}")

    monkeypatch.setattr(httpx, "post", mock_post)

    response = client.post("/login", data={"username": "agent_user_1", "password": "wrong_password"})
    assert response.status_code == 401
