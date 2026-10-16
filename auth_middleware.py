"""Platform Bearer Token authentication & scope resolution for FastMCP Gateway.

Fully compatible with ai-agent-platform (runtime-service / platform-api).
Supports both static token scope mapping (KNOWLEDGE_MCP_TOKEN_SCOPES_JSON)
and dynamic signed JWT tokens (KNOWLEDGE_AUTHORIZATION_SECRET).
"""

from __future__ import annotations

import hmac
import json
import logging
import os
from typing import Any, Dict, Optional, Tuple
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

logger = logging.getLogger(__name__)


class KnowledgeScope(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)
    tenant_id: str
    project_id: str
    knowledge_base_id: Optional[str] = None
    namespace: Optional[str] = None

    @field_validator("tenant_id", "project_id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if value in ("__default", "default"):
            return "__default"
        # Verify valid UUID format if not default
        try:
            UUID(value)
            return value
        except ValueError:
            return value


class KnowledgeTokenVerifier:
    """Verifies Bearer tokens and extracts tenant/project scope."""

    def __init__(self):
        self.dynamic_secret = os.getenv("KNOWLEDGE_AUTHORIZATION_SECRET", "").strip()
        self.static_scopes: Dict[str, KnowledgeScope] = {}
        raw = os.getenv("KNOWLEDGE_MCP_TOKEN_SCOPES_JSON", "{}").strip()
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    for token, data in parsed.items():
                        if isinstance(data, dict):
                            self.static_scopes[token] = KnowledgeScope.model_validate(data)
            except Exception as e:
                logger.warning(f"Failed to parse KNOWLEDGE_MCP_TOKEN_SCOPES_JSON: {e}")

    def verify_token(self, token: str) -> Optional[KnowledgeScope]:
        if not token:
            return None

        # 1. Match static configured scopes with constant-time comparison
        for configured_token, scope in self.static_scopes.items():
            if hmac.compare_digest(configured_token.encode("utf-8"), token.encode("utf-8")):
                return scope

        # 2. Match dynamic signed JWT if secret is configured
        if self.dynamic_secret:
            try:
                import jwt
                payload = jwt.decode(
                    token,
                    self.dynamic_secret,
                    algorithms=["HS256"],
                    audience="rag-service",
                    options={"require": ["tenant_id", "project_id", "exp"]},
                )
                return KnowledgeScope(
                    tenant_id=payload["tenant_id"],
                    project_id=payload["project_id"],
                    knowledge_base_id=payload.get("knowledge_base_id"),
                )
            except Exception as e:
                logger.debug(f"JWT verification failed: {e}")

        return None

    def resolve_default_or_first_scope(self) -> KnowledgeScope:
        """Fallback for development/test mode when no token is passed."""
        if self.static_scopes:
            return next(iter(self.static_scopes.values()))
        default_tenant = os.getenv("DEFAULT_TENANT_ID", "__default")
        default_project = os.getenv("DEFAULT_PROJECT_ID", "11111111-1111-4111-8111-111111111111")
        return KnowledgeScope(tenant_id=default_tenant, project_id=default_project)
