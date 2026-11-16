"""Unit tests for sso_auth_delegator."""

import time
import httpx
import pytest

from sso_auth_delegator import (
    create_sso_ticket,
    verify_sso_ticket,
    authenticate_via_agent_platform,
)


def test_sso_ticket_create_and_verify_success():
    secret = "test-secret-key-1234567890"
    ticket = create_sso_ticket(
        username="zhangsan",
        secret=secret,
        role="admin",
        is_admin=True,
        tenant_id="tenant-1",
        project_id="proj-1",
        ttl=60,
    )
    assert ticket and "." in ticket

    payload = verify_sso_ticket(ticket, secret)
    assert payload is not None
    assert payload["username"] == "zhangsan"
    assert payload["role"] == "admin"
    assert payload["is_admin"] is True
    assert payload["tenant_id"] == "tenant-1"
    assert payload["project_id"] == "proj-1"


def test_sso_ticket_tampered_signature_rejected():
    secret = "test-secret-key-1234567890"
    ticket = create_sso_ticket(username="zhangsan", secret=secret, ttl=60)
    payload_b64, sig = ticket.split(".", 1)
    tampered_sig = "a" + sig[1:]
    assert verify_sso_ticket(f"{payload_b64}.{tampered_sig}", secret) is None


def test_sso_ticket_expired_rejected():
    secret = "test-secret-key-1234567890"
    ticket = create_sso_ticket(username="zhangsan", secret=secret, ttl=-20)
    assert verify_sso_ticket(ticket, secret) is None


def test_sso_ticket_wrong_secret_rejected():
    secret1 = "secret-1"
    secret2 = "secret-2"
    ticket = create_sso_ticket(username="zhangsan", secret=secret1, ttl=60)
    assert verify_sso_ticket(ticket, secret2) is None


def test_sso_ticket_malformed_rejected():
    secret = "test-secret"
    assert verify_sso_ticket("", secret) is None
    assert verify_sso_ticket("invalid_token_no_dot", secret) is None
    assert verify_sso_ticket("abc.def.ghi", secret) is None


def test_authenticate_via_agent_platform_success(monkeypatch):
    def mock_post(url, **kwargs):
        assert "/api/identity/session" in url
        data = kwargs.get("json", {})
        assert data.get("username") == "zhangsan"
        assert data.get("password") == "secret123"
        return httpx.Response(
            status_code=200,
            json={
                "user": {
                    "username": "zhangsan",
                    "role": "admin",
                    "roles": ["admin"],
                    "tenant_id": "t-100",
                    "display_name": "张三",
                }
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", mock_post)

    ok, user, err = authenticate_via_agent_platform(
        username="zhangsan",
        password="secret123",
        api_base_url="http://mock-agent:2142",
    )
    assert ok is True
    assert err is None
    assert user is not None
    assert user["username"] == "zhangsan"
    assert user["role"] == "admin"
    assert user["is_admin"] is True
    assert user["tenant_id"] == "t-100"


def test_authenticate_via_agent_platform_401_invalid_credentials(monkeypatch):
    def mock_post(url, **kwargs):
        return httpx.Response(
            status_code=401,
            json={"detail": "Invalid credentials"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", mock_post)

    ok, user, err = authenticate_via_agent_platform(
        username="zhangsan",
        password="wrong_password",
        api_base_url="http://mock-agent:2142",
    )
    assert ok is False
    assert user is None
    assert err == "Invalid username or password"


def test_authenticate_via_agent_platform_timeout(monkeypatch):
    def mock_post(url, **kwargs):
        raise httpx.TimeoutException("Connection timed out")

    monkeypatch.setattr(httpx, "post", mock_post)

    ok, user, err = authenticate_via_agent_platform(
        username="zhangsan",
        password="secret",
        api_base_url="http://mock-agent:2142",
    )
    assert ok is False
    assert user is None
    assert "timed out" in (err or "").lower()


def test_authenticate_via_agent_platform_no_base_url():
    ok, user, err = authenticate_via_agent_platform(
        username="zhangsan",
        password="secret",
        api_base_url="",
    )
    assert ok is False
    assert user is None
    assert "AGENT_PLATFORM_API_URL not configured" in (err or "")
