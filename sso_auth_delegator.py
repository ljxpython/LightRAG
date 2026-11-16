"""SSO ticket verification and Agent platform pass-through authentication for LightRAG.

Zero-invasive external authenticator supporting:
1. HMAC-SHA256 Presigned SSO Ticket verification for seamless redirect from AI Agent Platform.
2. Pass-through credential validation against AI Agent Platform (POST /api/identity/session).
3. Fallback to native static AUTH_ACCOUNTS dictionary for local admin emergency operations.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from typing import Any, Dict, Optional, Tuple

from dotenv import load_dotenv
import httpx

load_dotenv()

logger = logging.getLogger(__name__)


def get_sso_secret() -> str:
    """Resolve SSO secret key from environment."""
    return os.getenv("SSO_SECRET_KEY") or os.getenv("TOKEN_SECRET") or ""


def get_agent_platform_api_url() -> str:
    """Resolve AI Agent platform API base URL from environment."""
    return (os.getenv("AGENT_PLATFORM_API_URL") or "").rstrip("/")


def create_sso_ticket(
    username: str,
    secret: str,
    *,
    role: str = "user",
    is_admin: bool = False,
    tenant_id: Optional[str] = None,
    project_id: Optional[str] = None,
    ttl: int = 60,
) -> str:
    """Generate a presigned HMAC-SHA256 SSO ticket."""
    now = int(time.time())
    payload: Dict[str, Any] = {
        "username": username,
        "role": "admin" if is_admin else role,
        "is_admin": is_admin or (role.lower() in ("admin", "platform_admin")),
        "tenant_id": tenant_id,
        "project_id": project_id,
        "exp": now + ttl,
        "nbf": now - 10,
        "nonce": secrets.token_hex(8),
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    sig = hmac.new(
        secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{payload_b64}.{sig}"


def verify_sso_ticket(
    token: str, secret: str, allowed_clock_skew: int = 10
) -> Optional[Dict[str, Any]]:
    """Verify an HMAC-SHA256 SSO ticket and return its payload if valid."""
    if not token or "." not in token or not secret:
        return None
    try:
        payload_b64, sig = token.split(".", 1)
        expected_sig = hmac.new(
            secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            logger.warning("SSO ticket HMAC signature mismatch")
            return None

        padding = "=" * (-len(payload_b64) % 4)
        raw = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            return None

        username = payload.get("username")
        exp = payload.get("exp")
        nbf = payload.get("nbf", 0)

        if not username or not isinstance(exp, (int, float)):
            return None

        now = time.time()
        if exp + allowed_clock_skew < now:
            logger.warning("SSO ticket expired (exp=%s, now=%s)", exp, now)
            return None

        if nbf and nbf - allowed_clock_skew > now:
            logger.warning("SSO ticket not yet valid (nbf=%s, now=%s)", nbf, now)
            return None

        return payload
    except Exception as exc:
        logger.warning("SSO ticket verification failed with exception: %s", exc)
        return None


def authenticate_via_agent_platform(
    username: str,
    password: str,
    api_base_url: Optional[str] = None,
    timeout: float = 3.0,
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    """Verify credentials against Agent platform's POST /api/identity/session.

    Returns:
        (is_authenticated, user_dict, error_message)
    """
    base_url = (get_agent_platform_api_url() if api_base_url is None else api_base_url).rstrip("/")
    if not base_url:
        return False, None, "AGENT_PLATFORM_API_URL not configured"
    if not username or not password:
        return False, None, "Username and password required"

    url = f"{base_url}/api/identity/session"
    try:
        response = httpx.post(
            url,
            json={"username": username, "password": password},
            timeout=timeout,
            trust_env=False,
            follow_redirects=False,
            headers={"Content-Type": "application/json"},
        )
        if response.status_code in (200, 201):
            data = response.json()
            user_info = data.get("user") or {}
            roles = user_info.get("roles") or []
            role = user_info.get("role") or ""
            is_admin = (
                "admin" in roles
                or "platform_admin" in roles
                or str(role).lower() in ("admin", "platform_admin")
            )
            normalized_user = {
                "username": user_info.get("username") or username,
                "role": "admin" if is_admin else "user",
                "is_admin": is_admin,
                "tenant_id": user_info.get("tenant_id"),
                "display_name": user_info.get("display_name") or username,
                "user_raw": user_info,
            }
            return True, normalized_user, None

        if response.status_code == 401:
            return False, None, "Invalid username or password"

        return False, None, f"Agent platform returned status {response.status_code}"

    except httpx.TimeoutException:
        logger.warning("Agent platform authentication timed out: %s", url)
        return False, None, "Agent platform authentication timed out"
    except Exception as exc:
        logger.warning("Agent platform authentication request failed: %s", exc)
        return False, None, f"Agent platform connection error: {exc}"
