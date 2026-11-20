import asyncio
import html
import json
import logging
import os
import re
import shutil
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

repo_root = Path(__file__).resolve().parent
sys.path.insert(0, str(repo_root))
load_dotenv(repo_root / ".env")

# 1. Map environment variables expected by LightRAG official server
os.environ["HOST"] = "0.0.0.0"
os.environ["PORT"] = "9621"
os.environ["DEFAULT_UI"] = "webui"
# Default fallback working directory (eval_benchmark or __default active)
default_working_dir = repo_root / "sandbox_storage" / "__default" / "11111111-1111-4111-8111-111111111111" / "active"
if not default_working_dir.exists():
    default_working_dir = repo_root / "sandbox_storage" / "eval_benchmark" / "rev_1"

os.environ["WORKING_DIR"] = str(default_working_dir)
os.environ["INPUT_DIR"] = str(repo_root / "eval_data")

os.environ["LLM_BINDING"] = "openai"
os.environ["LLM_BINDING_HOST"] = os.environ.get("LLM_BASE_URL", "")
os.environ["LLM_BINDING_API_KEY"] = os.environ.get("LLM_API_KEY", "")
os.environ["LLM_MODEL"] = os.environ.get("LLM_MODEL", "deepseek-v4.1-flash")

os.environ["EMBEDDING_BINDING"] = "openai"
os.environ["EMBEDDING_BINDING_HOST"] = os.environ.get("EMBEDDING_BASE_URL", "")
os.environ["EMBEDDING_BINDING_API_KEY"] = os.environ.get("EMBEDDING_API_KEY", "")
os.environ["EMBEDDING_MODEL"] = os.environ.get("EMBEDDING_MODEL", "text-embedding-v4")
os.environ["EMBEDDING_DIM"] = os.environ.get("EMBEDDING_DIM", "1024")
os.environ["SUMMARY_LANGUAGE"] = os.environ.get("SUMMARY_LANGUAGE", "Chinese")

if "TOKEN_SECRET" not in os.environ:
    os.environ["TOKEN_SECRET"] = "secret-token-for-lightrag-webui-testing-123456"

# Sanitize sys.argv during initial import to prevent pytest flags from breaking LightRAG argparse
_saved_argv = list(sys.argv)
sys.argv = [sys.argv[0]]
try:
    from lightrag.api.config import initialize_config, global_args, update_uvicorn_mode_config
    initialize_config(force=True)
finally:
    sys.argv = _saved_argv


from lease_manager import ReaderLeaseManager
from snapshot_manager import SnapshotManager
from workspace_manager import TenantWorkspaceManager, apply_workspace_namespace_patch
apply_workspace_namespace_patch()
from image_vlm_parser import register_image_vlm_engine

register_image_vlm_engine()

logger = logging.getLogger("webui_relay")

# 2. ContextVar for request-scoped tenant & project isolation
current_workspace_ctx: ContextVar[Tuple[str, str]] = ContextVar(
    "current_workspace_ctx",
    default=("__default", "11111111-1111-4111-8111-111111111111"),
)

storage_root = repo_root / "sandbox_storage"
lease_mgr = ReaderLeaseManager()
workspace_mgr = TenantWorkspaceManager(storage_root=storage_root, lease_manager=lease_mgr)
snapshot_mgr = SnapshotManager(storage_root=storage_root)


def resolve_project_working_dir(tenant_id: str, project_id: str) -> Path:
    """Resolves physical storage path for a given tenant and project."""
    # 1. Standard production structure: sandbox_storage/<tenant_id>/<project_id>/active
    p_active = storage_root / tenant_id / project_id / "active"
    if p_active.exists():
        return p_active

    # 2. Benchmark/legacy direct structure: sandbox_storage/<project_id>/rev_1
    p_legacy = storage_root / project_id / "rev_1"
    if p_legacy.exists():
        return p_legacy

    # 3. If revisions/rev_1 exists, create active symlink
    p_rev1 = storage_root / tenant_id / project_id / "revisions" / "rev_1"
    if p_rev1.exists():
        p_active.symlink_to(Path("revisions") / "rev_1", target_is_directory=True)
        return p_active

    # 4. Fallback to workspace_mgr initialize
    return workspace_mgr.get_active_dir(tenant_id, project_id)


def _get_current_project_id(fallback: str = "11111111-1111-4111-8111-111111111111") -> str:
    try:
        ws = current_workspace_ctx.get()
        if ws and isinstance(ws, tuple) and len(ws) > 1 and ws[1]:
            return str(ws[1])
    except Exception:
        pass
    return fallback


class DynamicTenantRagProxy:
    """Dynamic RAG Proxy that intercepts LightRAG calls and routes them to the tenant-specific LightRAG instance."""

    def __init__(self, workspace_manager: TenantWorkspaceManager):
        self.workspace_mgr = workspace_manager
        self._rag_cache: Dict[str, Any] = {}
        self._cached_revisions: Dict[str, str] = {}
        self._init_lock = asyncio.Lock()
        self._default_rag: Optional[Any] = None
        self._base_kwargs: Dict[str, Any] = {}

    def factory(self, *args, **kwargs) -> "DynamicTenantRagProxy":
        """Factory method to replace LightRAG constructor in official server."""
        from lightrag import LightRAG as RealLightRAG

        self._base_kwargs = dict(kwargs)
        # Create default instance synchronously for boot-time checks
        self._default_rag = RealLightRAG(*args, **kwargs)
        default_key = "__default:11111111-1111-4111-8111-111111111111"
        self._rag_cache[default_key] = self._default_rag
        self._cached_revisions[default_key] = "rev_1"
        return self

    async def ensure_instance(self, tenant_id: str, project_id: str) -> Any:
        """Asynchronously warms up and returns the LightRAG instance for the tenant/project."""
        key = f"{tenant_id}:{project_id}"
        target_dir = resolve_project_working_dir(tenant_id, project_id)

        # Resolve active version
        active_rev = "rev_1"
        if target_dir.name == "rev_1":
            active_rev = "rev_1"
        elif target_dir.is_symlink():
            try:
                active_rev = target_dir.resolve().name
            except Exception:
                active_rev = "rev_1"

        if key in self._rag_cache and self._cached_revisions.get(key) == active_rev:
            return self._rag_cache[key]

        async with self._init_lock:
            if key in self._rag_cache and self._cached_revisions.get(key) == active_rev:
                return self._rag_cache[key]

            from lightrag import LightRAG as RealLightRAG

            kwargs = dict(self._base_kwargs)
            kwargs["working_dir"] = str(target_dir.resolve() if target_dir.is_symlink() else target_dir)
            logger.info(f"Initializing dynamic LightRAG engine for {key} at {kwargs['working_dir']}")
            rag = RealLightRAG(**kwargs)
            await rag.initialize_storages()
            self._rag_cache[key] = rag
            self._cached_revisions[key] = active_rev
            return rag

    def invalidate_cache(self, tenant_id: str, project_id: str):
        """Invalidates instance cache upon CAS activation or rollback."""
        key = f"{tenant_id}:{project_id}"
        if key in self._rag_cache:
            del self._rag_cache[key]
        if key in self._cached_revisions:
            del self._cached_revisions[key]

    def get_current_instance(self) -> Any:
        tenant_id, project_id = current_workspace_ctx.get()
        key = f"{tenant_id}:{project_id}"
        return self._rag_cache.get(key, self._default_rag)

    async def initialize_storages(self):
        if self._default_rag:
            await self._default_rag.initialize_storages()

    async def check_and_migrate_data(self):
        if self._default_rag and hasattr(self._default_rag, "check_and_migrate_data"):
            await self._default_rag.check_and_migrate_data()

    async def finalize_storages(self):
        for rag in list(self._rag_cache.values()):
            try:
                await rag.finalize_storages()
            except Exception:
                pass
        if self._default_rag:
            try:
                await self._default_rag.finalize_storages()
            except Exception:
                pass

    def __getattr__(self, name: str):
        target = self.get_current_instance()
        return getattr(target, name)


dynamic_rag_proxy = DynamicTenantRagProxy(workspace_mgr)

# 3. Monkey-patch LightRAG in official server module before app creation (Zero upstream code touch)
import lightrag.api.lightrag_server as official_server
official_server.LightRAG = dynamic_rag_proxy.factory

# 4. Build official app instance
from lightrag.api.config import global_args, initialize_config, update_uvicorn_mode_config

initialize_config()
update_uvicorn_mode_config()
app: FastAPI = official_server.create_app(global_args)

# 4.1 Plug in Pass-Through Authentication and SSO Delegator (Zero upstream touch)
import sso_auth_delegator
from lightrag.api.auth import auth_handler

_orig_verify_password = auth_handler.verify_password

def _delegated_verify_password(username: str, plain_password: str) -> bool:
    # 1. Check local static accounts first (admin fallback)
    if username in auth_handler.accounts:
        return _orig_verify_password(username, plain_password)
    # 2. Pass-through credential validation against AI Agent Platform
    ok, user_info, err = sso_auth_delegator.authenticate_via_agent_platform(
        username=username,
        password=plain_password,
    )
    if ok and user_info:
        role = user_info.get("role", "user")
        if hasattr(auth_handler, "roles"):
            auth_handler.roles[username] = role
        logger.info(f"Pass-through authentication successful for user: {username} (role: {role})")
        return True
    logger.warning(f"Pass-through authentication failed for user: {username}, reason: {err}")
    # 3. Dummy check to prevent timing attacks
    return _orig_verify_password(username, plain_password)

auth_handler.verify_password = _delegated_verify_password


@app.post("/auth/sso-exchange")
async def sso_exchange(request: Request):
    """Exchange a short-lived presigned SSO ticket for a native LightRAG session token."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    ticket = body.get("ticket") or body.get("sso_ticket")
    if not ticket:
        raise HTTPException(status_code=400, detail="Missing SSO ticket")
    secret = sso_auth_delegator.get_sso_secret()
    payload = sso_auth_delegator.verify_sso_ticket(ticket, secret)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired SSO ticket")
    username = payload.get("username", "user")
    role = payload.get("role", "user")
    if hasattr(auth_handler, "roles"):
        auth_handler.roles[username] = role
    token = auth_handler.create_token(username=username, role=role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": username,
        "role": role,
        "tenant_id": payload.get("tenant_id"),
        "project_id": payload.get("project_id"),
    }


from evaluation.eval_studio_template import render_eval_studio_html


@app.get("/eval-studio", response_class=HTMLResponse)
async def eval_studio_console():
    """Interactive Evaluation & Project Studio (Eval Studio)."""
    return HTMLResponse(render_eval_studio_html())


@app.get("/evalflow", response_class=HTMLResponse)
async def evalflow_embedded_console():
    """Embedded EvalFlow MLflow Evaluation Platform Dashboard."""
    mlflow_url = os.getenv("MLFLOW_TRACKING_URI", "http://49.233.222.54:9128/#/experiments/11")
    return HTMLResponse(f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>EvalFlow 评测中台 - LightRAG</title>
    <style>
        body, html {{ margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
        .header {{ height: 44px; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; font-size: 13px; border-bottom: 1px solid #1e293b; box-sizing: border-box; }}
        .header .title {{ display: flex; align-items: center; gap: 8px; font-weight: 600; letter-spacing: 0.3px; }}
        .header .badge {{ background: #0284c7; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }}
        .header a {{ color: #38bdf8; text-decoration: none; margin-left: 16px; font-size: 12px; transition: color 0.15s; }}
        .header a:hover {{ color: #7dd3fc; }}
        iframe {{ width: 100%; height: calc(100% - 44px); border: none; }}
    </style>
</head>
<body>
    <div class="header">
        <div class="title">
            <span>EvalFlow 评测与可观察性中台</span>
            <span class="badge">LightRAG 生产大盘</span>
        </div>
        <div>
            <a href="/eval-studio">⚙️ 评测工坊 (Eval Studio)</a>
            <a href="{mlflow_url}" target="_blank">↗ 在新标签页打开</a>
            <a href="/webui/">← 返回 LightRAG 控制台</a>
        </div>
    </div>
    <iframe src="{mlflow_url}"></iframe>
</body>
</html>""")



# 5. Build Enterprise Operations Router (/ops)
ops_router = APIRouter(prefix="/ops", tags=["Enterprise Operations"])


class WorkspaceCreateRequest(BaseModel):
    tenant_id: str = "__default"
    project_id: str
    name: str
    code: Optional[str] = None
    description: Optional[str] = ""


class DatasetUpdateRequest(BaseModel):
    corpus_manifest: Optional[Dict[str, Any]] = None
    cases: List[Dict[str, Any]] = []


class DatasetGenerateRequest(BaseModel):
    project_id: Optional[str] = None
    size: int = 4
    test_cases_count: Optional[int] = None
    method: str = "native"
    incremental: bool = False
    differential: Optional[bool] = None
    base_dataset: Optional[str] = None
    output_name: Optional[str] = None
    dataset_name: Optional[str] = None


class MatrixRunRequest(BaseModel):
    project_id: Optional[str] = None
    dataset: Optional[str] = None
    dataset_name: Optional[str] = None
    matrix_mode: Optional[List[str]] = None
    modes: Optional[List[str]] = None
    top_k: int = 40
    limit: Optional[int] = None
    eval_engine: Optional[str] = "deepeval"
    mlflow: bool = True



class WorkspaceSelectRequest(BaseModel):
    tenant_id: str = "__default"
    project_id: str


class WorkspaceMetaUpdateRequest(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = ""


class RollbackRequest(BaseModel):
    tenant_id: str = "__default"
    project_id: str
    target_revision: str


@ops_router.get("/status")
async def get_ops_status(request: Request):
    tenant_id, project_id = current_workspace_ctx.get()
    target_dir = resolve_project_working_dir(tenant_id, project_id)
    active_rev = "rev_1"
    if target_dir.is_symlink():
        try:
            active_rev = target_dir.resolve().name
        except Exception:
            active_rev = "rev_1"

    # Check candidates
    cand_dir = storage_root / tenant_id / project_id / "candidates"
    has_candidate = False
    candidate_name = None
    if cand_dir.exists():
        candidates = [d.name for d in cand_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
        if candidates:
            has_candidate = True
            candidate_name = candidates[0]

    # Check snapshot
    rev_dir = storage_root / tenant_id / project_id / "revisions" / active_rev
    snapshot_sealed = (rev_dir / "snapshot.json").exists()

    return {
        "status": "online",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "active_version": active_rev,
        "active_path": str(target_dir),
        "has_candidate": has_candidate,
        "candidate_name": candidate_name,
        "snapshot_sealed": snapshot_sealed,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@ops_router.get("/workspaces")
async def list_workspaces():
    """Scans and returns all available multi-tenant workspaces with project metadata."""
    workspaces = []
    curr_tenant, curr_project = current_workspace_ctx.get()

    if storage_root.exists():
        # Check standard tenant directories
        for tenant_dir in storage_root.iterdir():
            if not tenant_dir.is_dir() or tenant_dir.name.startswith("."):
                continue
            if tenant_dir.name == "eval_benchmark":
                # Legacy root project
                meta = workspace_mgr.get_project_meta("__default", "eval_benchmark")
                workspaces.append({
                    "tenant_id": "__default",
                    "project_id": "eval_benchmark",
                    "name": meta["name"],
                    "code": meta.get("code"),
                    "description": meta.get("description", ""),
                    "active_version": "rev_1",
                    "is_current": (curr_project == "eval_benchmark"),
                })
                continue
            for proj_dir in tenant_dir.iterdir():
                if not proj_dir.is_dir() or proj_dir.name.startswith("."):
                    continue
                active_rev = "rev_1"
                active_link = proj_dir / "active"
                if active_link.is_symlink():
                    try:
                        active_rev = active_link.resolve().name
                    except Exception:
                        active_rev = "rev_1"
                meta = workspace_mgr.get_project_meta(tenant_dir.name, proj_dir.name)
                workspaces.append({
                    "tenant_id": tenant_dir.name,
                    "project_id": proj_dir.name,
                    "name": meta["name"],
                    "code": meta.get("code"),
                    "description": meta.get("description", ""),
                    "active_version": active_rev,
                    "is_current": (tenant_dir.name == curr_tenant and proj_dir.name == curr_project),
                })

    return {"total": len(workspaces), "workspaces": workspaces}


@ops_router.get("/workspaces/{tenant_id}/{project_id}/meta")
async def get_workspace_meta(tenant_id: str, project_id: str):
    """Retrieves project metadata."""
    return workspace_mgr.get_project_meta(tenant_id.strip(), project_id.strip())


@ops_router.put("/workspaces/{tenant_id}/{project_id}/meta")
async def update_workspace_meta(
    tenant_id: str, project_id: str, payload: WorkspaceMetaUpdateRequest
):
    """Updates metadata (friendly name, code, description) for a workspace."""
    tenant = tenant_id.strip() or "__default"
    project = project_id.strip()
    if not project:
        raise HTTPException(status_code=400, detail="project_id cannot be empty")
    saved = workspace_mgr.save_project_meta(
        tenant_id=tenant,
        project_id=project,
        name=payload.name,
        code=payload.code,
        description=payload.description or "",
    )
    return {
        "status": "success",
        "message": f"Updated metadata for {tenant}:{project}",
        "metadata": saved,
    }


@ops_router.post("/workspaces/select")
async def select_workspace(payload: WorkspaceSelectRequest, response: Response):
    """Sets active tenant & project cookies immediately with zero blocking."""
    tenant_id = payload.tenant_id.strip() or "__default"
    project_id = payload.project_id.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id cannot be empty")

    response.set_cookie("x_tenant_id", tenant_id, path="/", samesite="lax")
    response.set_cookie("x_project_id", project_id, path="/", samesite="lax")
    return {
        "status": "success",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "message": f"Active workspace switched to {tenant_id}:{project_id}",
    }


@ops_router.post("/workspaces")
async def create_workspace(payload: WorkspaceCreateRequest):
    """Explicitly creates a new multi-tenant project with revisions/rev_1 and metadata."""
    try:
        meta = workspace_mgr.create_project(
            tenant_id=payload.tenant_id,
            project_id=payload.project_id,
            name=payload.name,
            code=payload.code,
            description=payload.description or "",
        )
        await dynamic_rag_proxy.ensure_instance(payload.tenant_id, payload.project_id)
        return {
            "status": "success",
            "message": f"Project '{payload.project_id}' created successfully.",
            "project": meta,
        }
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create workspace project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@ops_router.delete("/workspaces/{tenant_id}/{project_id}")
async def delete_workspace(tenant_id: str, project_id: str, response: Response):
    """Safely archives and deletes a project with reader lease drain verification."""
    t_id = (tenant_id or "__default").strip()
    p_id = (project_id or "").strip()
    
    # 平台默认项目绝对禁止删除
    if p_id == "11111111-1111-4111-8111-111111111111":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the platform default project.",
        )

    curr_tenant, curr_project = current_workspace_ctx.get()
    # 若删除的是当前正在激活的项目，系统自动平滑将上下文切回默认项目并下发 Cookie
    if t_id == curr_tenant and p_id == curr_project:
        logger.info(f"Deleting active workspace {t_id}:{p_id}. Falling back to default project...")
        current_workspace_ctx.set(("__default", "11111111-1111-4111-8111-111111111111"))
        response.set_cookie("x_tenant_id", "__default", path="/", samesite="lax")
        response.set_cookie("x_project_id", "11111111-1111-4111-8111-111111111111", path="/", samesite="lax")

    try:
        dynamic_rag_proxy.invalidate_cache(t_id, p_id)
        res = await workspace_mgr.archive_delete_project(t_id, p_id)
        return res
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete workspace project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



@ops_router.get("/candidates")
async def get_candidates():
    tenant_id, project_id = current_workspace_ctx.get()
    cand_dir = storage_root / tenant_id / project_id / "candidates"
    if not cand_dir.exists():
        return {"candidates": []}

    candidates = []
    for d in cand_dir.iterdir():
        if d.is_dir() and not d.name.startswith("."):
            file_count = len(list(d.glob("*")))
            candidates.append({
                "candidate_name": d.name,
                "file_count": file_count,
                "created_at": datetime.fromtimestamp(d.stat().st_ctime, tz=timezone.utc).isoformat(),
            })
    return {"tenant_id": tenant_id, "project_id": project_id, "candidates": candidates}


@ops_router.post("/candidates/activate")
async def activate_candidate():
    """Performs atomic CAS promotion of the candidate directory to active revision."""
    tenant_id, project_id = current_workspace_ctx.get()
    cand_dir = storage_root / tenant_id / project_id / "candidates"
    if not cand_dir.exists():
        raise HTTPException(status_code=404, detail="No candidate directory exists for this workspace")

    candidates = [d for d in cand_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not candidates:
        raise HTTPException(status_code=400, detail="No candidate build found to activate")

    target_candidate = candidates[0]
    new_rev_num = await workspace_mgr.atomic_publish_candidate(tenant_id, project_id, target_candidate)
    new_rev_name = f"rev_{new_rev_num}"

    # Seal snapshot for integrity
    snapshot_mgr.seal_snapshot(tenant_id, project_id, new_rev_name)

    # Invalidate dynamic cache to load new revision immediately
    dynamic_rag_proxy.invalidate_cache(tenant_id, project_id)
    await dynamic_rag_proxy.ensure_instance(tenant_id, project_id)

    return {
        "status": "success",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "new_version": new_rev_name,
        "message": f"Successfully activated candidate as {new_rev_name}",
    }


@ops_router.get("/snapshots")
async def list_snapshots():
    tenant_id, project_id = current_workspace_ctx.get()
    rev_dir = storage_root / tenant_id / project_id / "revisions"
    if not rev_dir.exists():
        return {"snapshots": []}

    snapshots = []
    for r in sorted(rev_dir.iterdir(), key=lambda x: x.name):
        if r.is_dir() and not r.name.startswith("."):
            snap_file = r / "snapshot.json"
            is_sealed = snap_file.exists()
            is_valid = False
            errors = []
            if is_sealed:
                is_valid, errors = snapshot_mgr.verify_snapshot(snap_file)
            snapshots.append({
                "revision": r.name,
                "is_sealed": is_sealed,
                "is_valid": is_valid,
                "integrity_errors": errors,
            })
    return {"tenant_id": tenant_id, "project_id": project_id, "snapshots": snapshots}


@ops_router.post("/snapshots/rollback")
async def rollback_snapshot(payload: RollbackRequest):
    """Executes instant atomic rollback to specified historical revision."""
    tenant_id = payload.tenant_id.strip() or "__default"
    project_id = payload.project_id.strip()
    target_revision = payload.target_revision.strip()

    try:
        snapshot_mgr.rollback_to_revision(tenant_id, project_id, target_revision)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    dynamic_rag_proxy.invalidate_cache(tenant_id, project_id)
    await dynamic_rag_proxy.ensure_instance(tenant_id, project_id)

    return {
        "status": "success",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "active_version": target_revision,
        "message": f"Successfully rolled back workspace to {target_revision}",
    }


@ops_router.get("/documents/{doc_name:path}/raw")
async def get_document_raw(
    doc_name: str,
    tenant_id: Optional[str] = None,
    project_id: Optional[str] = None
):
    """Returns the raw physical file (images, PDFs, SVGs, etc.) safely from eval_data or storage."""
    clean_name = Path(doc_name).name
    if not clean_name or clean_name in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid document name")

    curr_tenant, curr_project = current_workspace_ctx.get()
    t_id = tenant_id or curr_tenant
    p_id = project_id or curr_project
    target_dir = resolve_project_working_dir(t_id, p_id)

    candidate_paths = [
        repo_root / "eval_data" / "__parsed__" / clean_name,
        repo_root / "eval_data" / clean_name,
        target_dir / clean_name,
        target_dir / "__parsed__" / clean_name,
    ]

    found_file = None
    for cand in candidate_paths:
        if cand.is_file():
            found_file = cand
            break

    if not found_file:
        for cand in storage_root.glob(f"**/{clean_name}"):
            if cand.is_file() and ".trash" not in str(cand):
                found_file = cand
                break

    if not found_file:
        raise HTTPException(status_code=404, detail=f"Physical document {clean_name} not found")

    suffix = found_file.suffix.lower()
    content_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".pdf": "application/pdf",
        ".md": "text/markdown; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".json": "application/json",
    }
    media_type = content_types.get(suffix, "application/octet-stream")
    return FileResponse(found_file, media_type=media_type)


@ops_router.get("/documents/{doc_id}/content")
async def get_document_content(
    doc_id: str,
    tenant_id: Optional[str] = None,
    project_id: Optional[str] = None
):
    """Retrieves full parsed document content and corresponding chunks with smart workspace discovery."""
    curr_tenant, curr_project = current_workspace_ctx.get()
    t_id = tenant_id or curr_tenant
    p_id = project_id or curr_project
    target_dir = resolve_project_working_dir(t_id, p_id)

    clean_id = doc_id.split("<SEP>")[0].split(",")[0].strip()
    if "-chunk-" in clean_id:
        clean_id = re.sub(r"-chunk-\d+$", "", clean_id)

    clean_name = Path(clean_id).name
    is_media = bool(re.search(r"\.(png|jpe?g|svg|webp|gif|pdf)$", clean_name, re.I))

    def load_from_dir(d: Path):
        full_content = ""
        found = False
        resolved_doc_id = clean_id
        doc_name = ""

        full_docs_file = d / "kv_store_full_docs.json"
        chunks_file = d / "kv_store_text_chunks.json"

        if chunks_file.exists():
            try:
                with open(chunks_file, "r", encoding="utf-8") as f:
                    all_chunks = json.load(f)
                    if clean_id in all_chunks and isinstance(all_chunks[clean_id], dict):
                        parent_id = all_chunks[clean_id].get("full_doc_id")
                        if parent_id:
                            resolved_doc_id = parent_id
            except Exception:
                pass

        if full_docs_file.exists():
            try:
                with open(full_docs_file, "r", encoding="utf-8") as f:
                    full_docs = json.load(f)
                    target_rec = full_docs.get(resolved_doc_id) or full_docs.get(clean_id)
                    if not target_rec:
                        for did, dval in full_docs.items():
                            if isinstance(dval, dict):
                                fp = dval.get("file_path") or dval.get("title") or ""
                                if Path(fp).name == clean_id or fp == clean_id:
                                    target_rec = dval
                                    resolved_doc_id = did
                                    break
                    if target_rec:
                        found = True
                        if isinstance(target_rec, dict):
                            full_content = target_rec.get("content", "")
                            doc_name = target_rec.get("file_path", "")
                        elif isinstance(target_rec, str):
                            full_content = target_rec
            except Exception as e:
                logger.warning(f"Failed to read full_docs in {d}: {e}")

        chunks = []
        if chunks_file.exists():
            try:
                with open(chunks_file, "r", encoding="utf-8") as f:
                    all_chunks = json.load(f)
                    for cid, cval in all_chunks.items():
                        c_parent = cval.get("full_doc_id") if isinstance(cval, dict) else ""
                        if (
                            cid.startswith(resolved_doc_id)
                            or cid.startswith(clean_id)
                            or c_parent == resolved_doc_id
                            or c_parent == clean_id
                        ):
                            found = True
                            tokens = cval.get("tokens", 0) if isinstance(cval, dict) else 0
                            content = cval.get("content", "") if isinstance(cval, dict) else str(cval)
                            order_idx = cval.get("chunk_order_index", 0) if isinstance(cval, dict) else 0
                            chunks.append({
                                "chunk_id": cid,
                                "tokens": tokens,
                                "content": content,
                                "chunk_order_index": order_idx
                            })
                            if not doc_name and isinstance(cval, dict):
                                doc_name = cval.get("file_path", "")
            except Exception as e:
                logger.warning(f"Failed to read text_chunks in {d}: {e}")

        status_file = d / "kv_store_doc_status.json"
        if status_file.exists() and not doc_name:
            try:
                with open(status_file, "r", encoding="utf-8") as f:
                    all_status = json.load(f)
                    stat = all_status.get(resolved_doc_id) or all_status.get(clean_id)
                    if isinstance(stat, dict):
                        doc_name = stat.get("file_path", "") or stat.get("metadata", {}).get("file_name", "")
            except Exception:
                pass

        chunks.sort(key=lambda x: (x.get("chunk_order_index", 0), x["chunk_id"]))
        return found, full_content, chunks, doc_name

    # 1. First probe targeted workspace
    found, full_content, chunks, doc_name = load_from_dir(target_dir)
    source_dir = str(target_dir)

    # 2. Search other workspaces
    if not found:
        logger.info(f"Doc {clean_id} not found in {target_dir}, searching other workspaces...")
        for cand_dir in storage_root.glob("**/kv_store_full_docs.json"):
            wdir = cand_dir.parent
            f, fc, ch, dn = load_from_dir(wdir)
            if f:
                found = True
                full_content = fc
                chunks = ch
                doc_name = dn
                source_dir = str(wdir)
                break

    # 3. Model-parsed resolution from parsed artifacts
    parsed_dir = target_dir / "__parsed__"
    if not parsed_dir.exists():
        for cand in [target_dir.parent / "__parsed__", target_dir.parent.parent / "__parsed__", repo_root / "eval_data" / "__parsed__"]:
            if cand.exists():
                parsed_dir = cand
                break

    if (not full_content or (full_content.startswith("Title:") and "Original Path:" in full_content)) and chunks:
        chunk_texts = [c["content"] for c in chunks if c.get("content")]
        assembled_chunks = "\n\n".join(chunk_texts)
        if len(assembled_chunks) > len(full_content):
            full_content = assembled_chunks

    if parsed_dir and parsed_dir.exists() and (doc_name or clean_name):
        c_name = Path(doc_name or clean_name).name
        for cand_file in parsed_dir.glob(f"{Path(c_name).stem}*"):
            if cand_file.is_file() and cand_file.suffix in [".md", ".txt", ".json"]:
                try:
                    parsed_text = cand_file.read_text(encoding="utf-8")
                    if len(parsed_text) > len(full_content):
                        full_content = parsed_text
                        logger.info(f"Loaded {len(full_content)} chars from model-parsed artifact {cand_file}")
                        break
                except Exception as ex:
                    logger.warning(f"Failed to read parsed artifact {cand_file}: {ex}")

    if (not doc_name or doc_name == "unknown_source") and full_content.startswith("Title:"):
        title_match = re.search(r"Title:\s*([^\n\r]+)", full_content)
        if title_match:
            doc_name = title_match.group(1).strip()

    # 4. 智能回退：若知识库无物理文件，但题库中包含引用该文档的支撑上下文切片，自动聚合呈现
    is_synthetic_context = False
    notice = ""
    if not found or (not full_content and len(chunks) == 0):
        datasets_dir = repo_root / "evaluation" / "datasets"
        synth_contexts = []
        if datasets_dir.exists():
            for p in datasets_dir.glob("*.json"):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        djson = json.load(f)
                        items = []
                        if isinstance(djson, list):
                            items = djson
                        elif isinstance(djson, dict):
                            items = djson.get("test_cases") or djson.get("data") or djson.get("cases") or []
                        for it in items:
                            sdocs = it.get("source_docs", [])
                            if clean_name in sdocs or any(clean_name in str(s) for s in sdocs):
                                for ctx in it.get("contexts", []):
                                    if ctx and ctx not in synth_contexts:
                                        synth_contexts.append(ctx)
                except Exception:
                    pass
        if synth_contexts:
            found = True
            is_synthetic_context = True
            chunks = [{
                "chunk_id": f"dataset-ctx-{i+1:03d}",
                "tokens": len(c.split()),
                "content": c,
                "chunk_order_index": i
            } for i, c in enumerate(synth_contexts)]
            full_content = "\n\n---\n\n".join(synth_contexts)
            notice = f"该文档尚未在当前知识库中灌库物理原件，以下切片内容提取自题库中引用该文档的 {len(chunks)} 条支撑上下文。"
            logger.info(f"Synthesized {len(chunks)} contexts for uningested doc {clean_name}")

    raw_url = f"/ops/documents/{clean_name}/raw"

    return {
        "status": "success",
        "doc_id": clean_id,
        "doc_name": doc_name or clean_name,
        "tenant_id": t_id,
        "project_id": p_id,
        "found": found,
        "source_workspace": source_dir,
        "full_content": full_content,
        "chunks_count": len(chunks),
        "chunks": chunks,
        "is_media": is_media,
        "raw_url": raw_url,
        "is_synthetic_context": is_synthetic_context,
        "notice": notice,
    }
# -------------------------------------------------------------
# Evaluation & Dataset Operations Router Extension
# -------------------------------------------------------------
datasets_dir = repo_root / "evaluation" / "datasets"
datasets_dir.mkdir(parents=True, exist_ok=True)


class EvalTaskManager:
    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._processes: Dict[str, asyncio.subprocess.Process] = {}

    def create_task(self, task_type: str, params: Dict[str, Any]) -> str:
        import uuid
        tid = f"task_{uuid.uuid4().hex[:12]}"
        self._tasks[tid] = {
            "task_id": tid,
            "type": task_type,
            "status": "running",
            "progress": 5,
            "logs": [f"[{datetime.now().strftime('%H:%M:%S')}] 任务初始化成功，正在后台拉起子进程..."],
            "params": params,
            "result_url": None,
            "error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return tid

    def register_process(self, task_id: str, proc: asyncio.subprocess.Process):
        self._processes[task_id] = proc

    async def abort_task(self, task_id: str) -> bool:
        proc = self._processes.get(task_id)
        if proc and proc.returncode is None:
            try:
                proc.terminate()
                try:
                    await asyncio.wait_for(proc.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()
            except Exception as e:
                logger.warning(f"Error terminating process for {task_id}: {e}")
        self._processes.pop(task_id, None)
        self.update_task(task_id, status="aborted", progress=0)
        self.append_log(task_id, "🛑 用户手动中止了打擂评测任务。")
        try:
            from catalog_manager import catalog_mgr
            catalog_mgr.update_eval_run(task_id, status="aborted", progress=0)
        except Exception:
            pass
        return True

    def list_running_tasks(self) -> List[Dict[str, Any]]:
        return [
            t for t in self._tasks.values()
            if t.get("status") == "running"
        ]

    def update_task(self, task_id: str, **kwargs):
        if task_id in self._tasks:
            self._tasks[task_id].update(kwargs)

    def append_log(self, task_id: str, line: str):
        if task_id in self._tasks:
            clean_line = line.strip()
            if clean_line:
                self._tasks[task_id]["logs"].append(clean_line)
                if len(self._tasks[task_id]["logs"]) > 120:
                    self._tasks[task_id]["logs"] = self._tasks[task_id]["logs"][-120:]

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self._tasks.get(task_id)


def _get_project_name_map() -> Dict[str, Tuple[str, str]]:
    """Returns mapping from project_id to (tenant_id, display_name)."""
    mapping = {
        "11111111-1111-4111-8111-111111111111": ("__default", "平台默认项目"),
        "eval_benchmark": ("__default", "评测基准"),
    }
    try:
        for tenant_dir in storage_root.iterdir():
            if not tenant_dir.is_dir() or tenant_dir.name.startswith("."):
                continue
            for proj_dir in tenant_dir.iterdir():
                if not proj_dir.is_dir() or proj_dir.name.startswith("."):
                    continue
                meta = workspace_mgr.get_project_meta(tenant_dir.name, proj_dir.name)
                display_name = meta.get("name") or proj_dir.name
                mapping[proj_dir.name] = (tenant_dir.name, display_name)
    except Exception as ex:
        logger.warning(f"Failed to scan project name map: {ex}")
    return mapping


eval_task_mgr = EvalTaskManager()


@ops_router.get("/evaluation/datasets")
async def list_evaluation_datasets():
    """Lists all available benchmark testset datasets with project and raw material lineage."""
    datasets_dir.mkdir(parents=True, exist_ok=True)
    proj_map = _get_project_name_map()
    results = []
    for f in sorted(datasets_dir.glob("*.json")):
        try:
            stat = f.stat()
            with open(f, "r", encoding="utf-8") as jf:
                data = json.load(jf)
            manifest = data.get("corpus_manifest", {})
            cases = data.get("cases") or data.get("test_cases") or []
            
            # 提取题库依赖的原始文档清单
            source_docs = manifest.get("source_docs", [])
            if not source_docs:
                manifest_docs = manifest.get("docs", [])
                if manifest_docs and isinstance(manifest_docs, list):
                    source_docs = [d.get("file_name") or d.get("file_path") for d in manifest_docs if isinstance(d, dict)]
            if not source_docs:
                req_set = set()
                for c in cases:
                    if isinstance(c, dict):
                        for sd in c.get("source_docs", []):
                            req_set.add(Path(sd).name)
                source_docs = list(req_set)
            else:
                source_docs = [Path(d).name for d in source_docs if d]

            raw_proj_id = manifest.get("project_id") or data.get("project_id")
            
            # 精准判断所属知识库项目：
            # 1. multihop_* 专属对应 eval_multihop 项目
            # 2. rgb_zh_* 专属对应 eval_rgb_zh (华为 RGB 评测基准 (中文)) 项目
            # 3. lineage_benchmark_* 对应 eval_benchmark
            # 4. 其他有明确 raw_proj_id 的优先采用 raw_proj_id
            target_project_id = "all"
            target_tenant_id = "__default"
            target_project_name = "全局通用基准 (Cross-Project)"
            is_benchmark = False

            if f.name.startswith("multihop_"):
                target_project_id = "eval_multihop"
                target_tenant_id = "__default"
                target_project_name = proj_map.get("eval_multihop", ("__default", "eval_multihop"))[1]
                is_benchmark = False
            elif f.name.startswith("rgb_zh_"):
                target_project_id = "eval_rgb_zh"
                target_tenant_id = "__default"
                target_project_name = proj_map.get("eval_rgb_zh", ("__default", "华为 RGB 评测基准 (中文)"))[1]
                is_benchmark = False
            elif f.name.startswith("lineage_benchmark_") or raw_proj_id == "eval_benchmark":
                target_project_id = "eval_benchmark"
                target_tenant_id = "__default"
                target_project_name = proj_map.get("eval_benchmark", ("__default", "评测基准"))[1]
                is_benchmark = False
            elif raw_proj_id and raw_proj_id not in ["unknown", "all", "*", "common"]:
                target_project_id = raw_proj_id
                target_tenant_id, target_project_name = proj_map.get(raw_proj_id, ("__default", raw_proj_id))
                is_benchmark = False
            else:
                is_benchmark = True

            # 抽取前 3 个用例预览
            sample_cases = []
            for idx, c in enumerate(cases[:3]):
                if isinstance(c, dict):
                    q = c.get("query") or c.get("question") or ""
                    a = c.get("answer") or c.get("ground_truth") or c.get("expected_output") or ""
                    ctx = c.get("context") or c.get("contexts") or []
                    sample_cases.append({
                        "id": c.get("id") or f"case_{idx+1}",
                        "question": q[:200] if len(q) > 200 else q,
                        "ground_truth": a[:200] if len(a) > 200 else a,
                        "context_count": len(ctx) if isinstance(ctx, list) else 1 if ctx else 0,
                    })

            results.append({
                "name": f.name,
                "project_id": target_project_id,
                "tenant_id": target_tenant_id,
                "project_name": target_project_name,
                "target_project_id": target_project_id,
                "target_project_name": target_project_name,
                "is_benchmark": is_benchmark,
                "revision_id": manifest.get("revision_id", "rev_1"),
                "cases_count": len(cases),
                "source_docs": source_docs,
                "corpus_docs_count": len(source_docs),
                "sample_cases": sample_cases,
                "engine": data.get("engine", "DeepEval/DocpIvuL"),
                "model": data.get("model", ""),
                "size_bytes": stat.st_size,
                "updated_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
        except Exception as ex:
            logger.warning(f"Failed to inspect dataset {f.name}: {ex}")
    return {"total": len(results), "datasets": results}


@ops_router.get("/evaluation/datasets/{dataset_name}")
async def get_evaluation_dataset_detail(dataset_name: str):
    """Retrieves full cases and lineage manifest of a testset."""
    safe_name = Path(dataset_name).name
    p = datasets_dir / safe_name
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Dataset '{safe_name}' not found.")
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "cases" not in data and "test_cases" in data:
            data["cases"] = data["test_cases"]
        return data
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Failed to read dataset: {ex}")


@ops_router.get("/evaluation/datasets/{dataset_name}/readiness")
async def check_evaluation_readiness(dataset_name: str, project_id: Optional[str] = Query(None)):
    """Validates whether target knowledge base has required source documents to run this dataset."""
    safe_name = Path(dataset_name).name
    p = datasets_dir / safe_name
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Dataset '{safe_name}' not found.")

    proj_id = project_id or _get_current_project_id()

    # 1. 读取题库中声明的原料文档
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        manifest = data.get("corpus_manifest", {})
        cases = data.get("cases") or data.get("test_cases") or []
        required_docs = manifest.get("source_docs", [])
        if not required_docs:
            req_set = set()
            for c in cases:
                for sd in c.get("source_docs", []):
                    req_set.add(Path(sd).name)
            required_docs = list(req_set)
        else:
            required_docs = [Path(d).name for d in required_docs]
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Failed to inspect dataset requirements: {ex}")

    # 2. 读取目标知识库的物理文档清单
    current_docs = []
    try:
        target_dir = None
        for cand in [
            storage_root / proj_id,
            storage_root / "__default" / proj_id,
            storage_root / "default" / proj_id,
        ]:
            if cand.exists() and cand.is_dir():
                target_dir = cand
                break

        if target_dir:
            docs_file = None
            active_link = target_dir / "active"
            if active_link.exists():
                docs_file = active_link.resolve() / "kv_store_full_docs.json"
            elif (target_dir / "rev_1").exists():
                docs_file = target_dir / "rev_1" / "kv_store_full_docs.json"

            if docs_file and docs_file.exists():
                raw_docs = json.loads(docs_file.read_text(encoding="utf-8"))
                for doc_meta in raw_docs.values():
                    fp = doc_meta.get("file_path") or doc_meta.get("title") or ""
                    if fp:
                        current_docs.append(Path(fp).name)
    except Exception as ex:
        logger.warning(f"Failed to read project docs for {proj_id}: {ex}")

    # 3. 计算就绪度与缺失覆盖
    matched = [d for d in required_docs if d in current_docs]
    missing = [d for d in required_docs if d not in current_docs]
    total_req = len(required_docs)

    proj_map = _get_project_name_map()
    raw_proj_id = manifest.get("project_id") or data.get("project_id")
    is_benchmark = False
    if safe_name in ["business_qa.json", "sample_lightrag.json", "synthesized_benchmark.json"] or \
       safe_name.startswith("multihop_") or safe_name.startswith("rgb_") or safe_name.startswith("lineage_benchmark_"):
        is_benchmark = True

    target_proj_id = "all"
    target_tenant_id = "__default"
    target_proj_name = "全局通用基准"
    is_benchmark = False

    if safe_name.startswith("multihop_"):
        target_proj_id = "eval_multihop"
        target_tenant_id = "__default"
        target_proj_name = proj_map.get("eval_multihop", ("__default", "eval_multihop"))[1]
    elif safe_name.startswith("rgb_zh_"):
        target_proj_id = "eval_rgb_zh"
        target_tenant_id = "__default"
        target_proj_name = proj_map.get("eval_rgb_zh", ("__default", "华为 RGB 评测基准 (中文)"))[1]
    elif safe_name.startswith("lineage_benchmark_") or raw_proj_id == "eval_benchmark":
        target_proj_id = "eval_benchmark"
        target_tenant_id = "__default"
        target_proj_name = proj_map.get("eval_benchmark", ("__default", "评测基准"))[1]
    elif raw_proj_id and raw_proj_id not in ["unknown", "all", "*", "common"]:
        target_proj_id = raw_proj_id
        target_tenant_id, target_proj_name = proj_map.get(raw_proj_id, ("__default", raw_proj_id))
    else:
        is_benchmark = True

    is_mismatched = (target_proj_id != "all" and target_proj_id != proj_id)

    curr_proj_name = proj_map.get(proj_id, ("__default", proj_id))[1]

    if total_req == 0:
        coverage = 1.0
        status = "ready"
        message = "该题库为自由探索/全局问答集，可在任意知识库上直接运行打擂。"
    elif len(matched) == total_req:
        coverage = 1.0
        status = "ready"
        message = f"契约完美就绪！当前知识库 100% 具备评测所需的全部 {total_req} 篇原材料文档。"
    elif len(matched) == 0:
        coverage = 0.0
        status = "missing"
        if is_mismatched:
            message = f"【知识库不匹配】该评测集归属于「{target_proj_name}」，当前处于「{curr_proj_name}」（缺少全部 {total_req} 篇原材料）。点击一键切换至对应知识库即可完美就绪！"
        else:
            message = f"原材料完全缺失！当前知识库缺少题库所需的全部 {total_req} 篇文档，强行运行必然全部失分！"
    else:
        coverage = round(len(matched) / total_req, 2)
        status = "partial"
        message = f"部分原材料就绪 ({len(matched)}/{total_req})，缺失 {len(missing)} 篇文档，打擂可能出现部分失分。"

    return {
        "status": status,
        "dataset_name": safe_name,
        "project_id": proj_id,
        "target_project_id": target_proj_id,
        "target_tenant_id": target_tenant_id,
        "target_project_name": target_proj_name,
        "is_mismatched": is_mismatched,
        "is_benchmark": is_benchmark,
        "coverage_rate": coverage,
        "total_required": total_req,
        "matched_docs": matched,
        "missing_docs": missing,
        "total_project_docs": len(current_docs),
        "message": message,
    }


@ops_router.delete("/evaluation/datasets/{dataset_name}")
async def delete_evaluation_dataset(dataset_name: str):
    """Safely moves a custom dataset to .trash folder (preserves standard benchmarks)."""
    safe_name = Path(dataset_name).name
    if safe_name in ("business_qa.json", "sample_lightrag.json"):
        raise HTTPException(status_code=400, detail=f"基准题库 '{safe_name}' 为系统级受保护资产，禁止删除。")

    p = datasets_dir / safe_name
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Dataset '{safe_name}' not found.")

    try:
        trash_dir = datasets_dir / ".trash"
        trash_dir.mkdir(parents=True, exist_ok=True)
        dest = trash_dir / f"{int(time.time())}_{safe_name}"
        shutil.move(str(p), str(dest))

        # 同步归档到 SQLite catalog
        try:
            from catalog_manager import catalog_mgr
            catalog_mgr.archive_dataset(safe_name)
        except Exception:
            pass

        return {
            "status": "success",
            "message": f"题库 '{safe_name}' 已安全移入回收站归档。",
            "dataset_name": safe_name,
        }
    except Exception as ex:
        logger.error(f"Failed to delete dataset {safe_name}: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(ex))



@ops_router.put("/evaluation/datasets/{dataset_name}")
async def update_evaluation_dataset(dataset_name: str, payload: DatasetUpdateRequest):
    """Persists updated cases and manifest back to dataset JSON."""
    safe_name = Path(dataset_name).name
    p = datasets_dir / safe_name
    try:
        current_data = {}
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                current_data = json.load(f)

        manifest = payload.corpus_manifest or current_data.get("corpus_manifest", {})
        cases = payload.cases
        # Re-index test_number
        for idx, item in enumerate(cases):
            item["test_number"] = idx + 1

        to_save = {
            "corpus_manifest": manifest,
            "cases": cases,
        }
        with open(p, "w", encoding="utf-8") as f:
            json.dump(to_save, f, ensure_ascii=False, indent=2)

        return {
            "status": "success",
            "message": f"Successfully persisted {len(cases)} cases to {safe_name}.",
            "dataset_name": safe_name,
            "cases_count": len(cases),
        }
    except Exception as ex:
        logger.error(f"Failed to update dataset {safe_name}: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(ex))


@ops_router.get("/evaluation/tasks/{task_id}")
async def get_evaluation_task(task_id: str):
    """Retrieves real-time status and logs of background eval/synthesis tasks."""
    t = eval_task_mgr.get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return t


def _find_matching_report_file(created_at_iso: Optional[str], completed_at_iso: Optional[str]) -> Optional[str]:
    res_dir = repo_root / "evaluation" / "results"
    if not res_dir.exists():
        return None
    candidates = list(res_dir.glob("deepeval_report_*.json"))
    if not candidates:
        return None

    time_str = completed_at_iso or created_at_iso
    if not time_str:
        return None

    target_dt = None
    try:
        from dateutil import parser as dt_parser
        target_dt = dt_parser.parse(time_str).astimezone()
    except Exception:
        pass

    if not target_dt:
        return None

    best_file = None
    min_diff = float("inf")
    for f in candidates:
        m = re.search(r"deepeval_report_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json", f.name)
        if m:
            try:
                from datetime import datetime
                f_dt = datetime(
                    int(m.group(1)), int(m.group(2)), int(m.group(3)),
                    int(m.group(4)), int(m.group(5)), int(m.group(6))
                ).astimezone()
                diff = abs((target_dt - f_dt).total_seconds())
                if diff < 600 and diff < min_diff:
                    min_diff = diff
                    best_file = f.name
            except Exception:
                pass
    return best_file


@ops_router.get("/evaluation/runs")
async def list_evaluation_runs(
    project_id: Optional[str] = None,
    limit: int = 50,
):
    """Lists evaluation battle runs, aggregating active running and completed runs."""
    from catalog_manager import catalog_mgr

    curr_ws = current_workspace_ctx.get()
    curr_proj = curr_ws[1] if curr_ws and isinstance(curr_ws, tuple) and len(curr_ws) > 1 else None
    p_id = project_id or curr_proj

    # 1. Fetch from SQLite
    db_runs = catalog_mgr.list_eval_runs(project_id=p_id, limit=limit)
    db_run_map = {r["task_id"]: r for r in db_runs}

    # 2. Merge running memory tasks
    running_tasks = eval_task_mgr.list_running_tasks()
    merged_results = []

    # Prepend active running tasks
    for rt in running_tasks:
        tid = rt["task_id"]
        rt_proj = (rt.get("params") or {}).get("project_id")
        if p_id and p_id != "all" and rt_proj and rt_proj != p_id:
            continue

        db_item = db_run_map.pop(tid, None)
        item = {
            "task_id": tid,
            "project_id": rt_proj or (db_item["project_id"] if db_item else (p_id or "default")),
            "dataset_name": (rt.get("params") or {}).get("dataset") or (db_item["dataset_name"] if db_item else "testset.json"),
            "modes": (rt.get("params") or {}).get("matrix_mode") or (db_item["modes"] if db_item else ["mix"]),
            "top_k": (rt.get("params") or {}).get("top_k") or (db_item["top_k"] if db_item else 40),
            "limit_count": (rt.get("params") or {}).get("limit") or (db_item["limit_count"] if db_item else None),
            "status": rt.get("status", "running"),
            "progress": rt.get("progress", 10),
            "runs": rt.get("runs") or (db_item["runs"] if db_item else []),
            "result_url": rt.get("result_url") or (db_item["result_url"] if db_item else None),
            "overall_score": rt.get("overall_score") or (db_item["overall_score"] if db_item else None),
            "pass_rate": rt.get("pass_rate") or (db_item["pass_rate"] if db_item else None),
            "metrics_summary": rt.get("metrics_summary") or (db_item["metrics_summary"] if db_item else {}),
            "report_file": rt.get("report_file") or (db_item["report_file"] if db_item else None),
            "created_at": rt.get("created_at") or (db_item["created_at"] if db_item else datetime.now(timezone.utc).isoformat()),
            "completed_at": rt.get("completed_at") or (db_item["completed_at"] if db_item else None),
            "recent_logs": rt.get("logs", [])[-15:],
        }
        merged_results.append(item)

    # Append remaining runs from SQLite
    res_dir = repo_root / "evaluation" / "results"
    for r in db_run_map.values():
        if r.get("status") == "completed" and (r.get("overall_score") is None or not r.get("report_file")):
            rep_file = r.get("report_file")
            target_p = None
            if rep_file and (res_dir / rep_file).exists():
                target_p = res_dir / rep_file
            else:
                matched_name = _find_matching_report_file(r.get("created_at"), r.get("completed_at"))
                if matched_name and (res_dir / matched_name).exists():
                    target_p = res_dir / matched_name
                    r["report_file"] = matched_name

            if target_p and target_p.exists():
                try:
                    cdata = json.loads(target_p.read_text(encoding="utf-8"))
                    if isinstance(cdata, list) and cdata:
                        tot = len(cdata)
                        ps = sum(1 for c in cdata if c.get("all_passed"))
                        r["pass_rate"] = round(ps / tot, 4)
                        scs = [c.get("overall_score") for c in cdata if c.get("overall_score") is not None]
                        r["overall_score"] = round(sum(scs) / len(scs), 4) if scs else 0.0
                        msums: Dict[str, List[float]] = {}
                        for c in cdata:
                            for mk, mv in (c.get("scores") or {}).items():
                                if mv is not None:
                                    try:
                                        msums.setdefault(mk, []).append(float(mv))
                                    except (ValueError, TypeError):
                                        pass
                        r["metrics_summary"] = {k: round(sum(v) / len(v), 4) for k, v in msums.items() if v}
                except Exception:
                    pass

        merged_results.append(r)

    return merged_results


@ops_router.get("/evaluation/runs/{task_id}")
async def get_evaluation_run_detail(task_id: str):
    """Retrieves full details of an evaluation run including test case scores and reasons."""
    from catalog_manager import catalog_mgr

    run_info = catalog_mgr.get_eval_run(task_id)
    mem_task = eval_task_mgr.get_task(task_id)

    if not run_info and not mem_task:
        raise HTTPException(status_code=404, detail=f"Eval run {task_id} not found")

    base = run_info or {
        "task_id": task_id,
        "project_id": (mem_task.get("params") or {}).get("project_id", "default"),
        "dataset_name": (mem_task.get("params") or {}).get("dataset", "testset.json"),
        "modes": (mem_task.get("params") or {}).get("matrix_mode", ["mix"]),
        "top_k": (mem_task.get("params") or {}).get("top_k", 40),
        "limit_count": (mem_task.get("params") or {}).get("limit"),
        "status": mem_task.get("status", "running"),
        "progress": mem_task.get("progress", 0),
        "runs": mem_task.get("runs", []),
        "result_url": mem_task.get("result_url"),
        "overall_score": mem_task.get("overall_score"),
        "pass_rate": mem_task.get("pass_rate"),
        "metrics_summary": mem_task.get("metrics_summary", {}),
        "report_file": mem_task.get("report_file"),
        "created_at": mem_task.get("created_at"),
        "completed_at": mem_task.get("completed_at"),
    }

    if mem_task:
        base["logs"] = mem_task.get("logs", [])
        base["progress"] = mem_task.get("progress", base.get("progress", 0))
        base["status"] = mem_task.get("status", base.get("status"))

    cases = []
    report_name = base.get("report_file")
    res_dir = repo_root / "evaluation" / "results"
    target_report = None
    if report_name and (res_dir / Path(report_name).name).exists():
        target_report = res_dir / Path(report_name).name
    else:
        matched_name = _find_matching_report_file(base.get("created_at"), base.get("completed_at"))
        if matched_name and (res_dir / matched_name).exists():
            target_report = res_dir / matched_name
            base["report_file"] = matched_name

    if target_report and target_report.exists():
        try:
            cases = json.loads(target_report.read_text(encoding="utf-8"))
            if isinstance(cases, list) and cases and base.get("overall_score") is None:
                tot = len(cases)
                ps = sum(1 for c in cases if c.get("all_passed"))
                base["pass_rate"] = round(ps / tot, 4)
                scs = [c.get("overall_score") for c in cases if c.get("overall_score") is not None]
                base["overall_score"] = round(sum(scs) / len(scs), 4) if scs else 0.0
                msums: Dict[str, List[float]] = {}
                for c in cases:
                    for mk, mv in (c.get("scores") or {}).items():
                        if mv is not None:
                            try:
                                msums.setdefault(mk, []).append(float(mv))
                            except (ValueError, TypeError):
                                pass
                base["metrics_summary"] = {k: round(sum(v) / len(v), 4) for k, v in msums.items() if v}
        except Exception as e:
            logger.warning(f"Failed to read report file {target_report}: {e}")

    base["cases"] = cases
    return base


@ops_router.delete("/evaluation/runs/{task_id}")
async def delete_evaluation_run(task_id: str):
    """Deletes an evaluation run record and cleans up associated artifacts."""
    from catalog_manager import catalog_mgr

    # If currently in memory task manager, remove it
    mem_task = eval_task_mgr.get_task(task_id)
    if mem_task:
        if mem_task.get("status") == "running":
            await eval_task_mgr.abort_task(task_id)
        eval_task_mgr._tasks.pop(task_id, None)

    # Delete from sqlite & disk report
    deleted = catalog_mgr.delete_eval_run(task_id)
    if not deleted and not mem_task:
        raise HTTPException(status_code=404, detail=f"Eval run {task_id} not found")

    return {"status": "deleted", "task_id": task_id, "message": "打擂成果记录已成功删除"}


@ops_router.post("/evaluation/tasks/{task_id}/abort")
async def abort_evaluation_task(task_id: str):
    """Aborts a currently running evaluation task."""
    mem_task = eval_task_mgr.get_task(task_id)
    if not mem_task:
        raise HTTPException(status_code=404, detail="Task not found in active memory")
    await eval_task_mgr.abort_task(task_id)
    return {"status": "aborted", "task_id": task_id, "message": "Evaluation task successfully aborted"}


async def _run_dataset_generate_bg(task_id: str, req: DatasetGenerateRequest):
    eval_venv_python = repo_root / "evaluation" / ".eval_venv" / "bin" / "python"
    py_exec = str(eval_venv_python) if eval_venv_python.exists() else sys.executable
    
    # 字段智能归一化
    proj_id = req.project_id or _get_current_project_id()
    num_cases = req.test_cases_count if req.test_cases_count is not None else req.size
    is_incremental = req.differential if req.differential is not None else req.incremental
    raw_name = req.output_name or req.dataset_name or f"synth_{proj_id[:8]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    out_filename = raw_name.strip()
    if not out_filename.endswith(".json"):
        out_filename += ".json"
    out_path = datasets_dir / Path(out_filename).name

    cmd = [
        py_exec,
        "-u",
        str(repo_root / "evaluation" / "dataset_generator.py"),
        "--from-project", proj_id,
        "--size", str(num_cases),
        "--output", str(out_path),
    ]
    if is_incremental:
        cmd.append("--incremental")
        if req.base_dataset:
            base_p = datasets_dir / Path(req.base_dataset).name
            if base_p.exists():
                cmd.extend(["--base-dataset", str(base_p)])

    eval_task_mgr.append_log(task_id, f"正在执行出题命令: {' '.join(cmd)}")
    try:
        sub_env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            env=sub_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(repo_root),
        )
        eval_task_mgr.register_process(task_id, proc)
        eval_task_mgr.update_task(task_id, progress=25)
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="ignore").rstrip()
            if text:
                eval_task_mgr.append_log(task_id, text)
                pm = re.search(r"\[PROGRESS:\s*(\d+)%\]", text)
                if pm:
                    eval_task_mgr.update_task(task_id, progress=int(pm.group(1)))
                elif "Step" in text or "切片" in text:
                    eval_task_mgr.update_task(task_id, progress=min(85, eval_task_mgr.get_task(task_id)["progress"] + 15))
        
        await proc.wait()
        eval_task_mgr._processes.pop(task_id, None)
        curr_t = eval_task_mgr.get_task(task_id)
        if curr_t and curr_t.get("status") == "aborted":
            eval_task_mgr.append_log(task_id, f"🛑 任务已确认中止退出 (exit code: {proc.returncode})")
        elif proc.returncode == 0:
            eval_task_mgr.update_task(task_id, status="completed", progress=100)
            eval_task_mgr.append_log(task_id, f"🎉 题库自动合成圆满完成！输出文件: {out_path.name}")
            try:
                from catalog_manager import catalog_mgr
                catalog_mgr.upsert_dataset(
                    name=out_path.name,
                    project_id=proj_id,
                    cases_count=num_cases,
                )
            except Exception:
                pass
        else:
            eval_task_mgr.update_task(task_id, status="failed", error=f"Process exited with code {proc.returncode}")
            eval_task_mgr.append_log(task_id, f"❌ 进程异常退出 (code: {proc.returncode})")
    except Exception as ex:
        eval_task_mgr.update_task(task_id, status="failed", error=str(ex))
        eval_task_mgr.append_log(task_id, f"❌ 执行异常: {ex}")


@ops_router.post("/evaluation/datasets/generate")
async def generate_dataset_endpoint(req: DatasetGenerateRequest):
    """Asynchronously generates or evolves a dataset using DeepEval synthesis."""
    tid = eval_task_mgr.create_task("dataset_generate", req.dict())
    asyncio.create_task(_run_dataset_generate_bg(tid, req))
    return {"status": "accepted", "task_id": tid, "message": "Dataset generation started in background."}


async def _run_matrix_evaluation_bg(task_id: str, req: MatrixRunRequest):
    eval_venv_python = repo_root / "evaluation" / ".eval_venv" / "bin" / "python"
    py_exec = str(eval_venv_python) if eval_venv_python.exists() else sys.executable
    
    proj_id = req.project_id or _get_current_project_id()
    raw_dataset = req.dataset or req.dataset_name or "business_qa.json"
    modes_list = req.matrix_mode or req.modes or ["mix", "naive"]
    
    dataset_path = datasets_dir / Path(raw_dataset).name
    if not dataset_path.exists():
        eval_task_mgr.update_task(task_id, status="failed", error=f"Dataset {raw_dataset} not found")
        return

    modes_str = ",".join(modes_list)
    cmd = [
        py_exec,
        "-u",
        str(repo_root / "evaluation" / "deepeval_runner.py"),
        "--dataset", str(dataset_path),
        "--project", proj_id,
        "--matrix-mode", modes_str,
        "--matrix-top-k", str(req.top_k),
    ]
    if req.limit and req.limit > 0:
        cmd.extend(["--limit", str(req.limit)])
    if req.mlflow:
        cmd.append("--mlflow")

    eval_task_mgr.append_log(task_id, f"⚔️ 正在启动多参数打擂: {' '.join(cmd)}")
    eval_task_mgr.update_task(task_id, progress=10)
    captured_runs = []
    captured_exp_id = None
    captured_report = None
    try:
        sub_env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            env=sub_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(repo_root),
        )
        eval_task_mgr.register_process(task_id, proc)
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="ignore").rstrip()
            if text:
                eval_task_mgr.append_log(task_id, text)
                pm = re.search(r"\[PROGRESS:\s*(\d+)%\]", text)
                if pm:
                    eval_task_mgr.update_task(task_id, progress=int(pm.group(1)))

                # 动态提取报告文件路径
                m_rep = re.search(r"deepeval_report_\d+_\d+\.json", text)
                if m_rep:
                    captured_report = m_rep.group(0)

                # 动态提取结构化 MLflow run 与 experiment 信息
                m_ml = re.search(r"\[MLFLOW_RUN\]\s+run_id=(\S+)\s+experiment_id=(\S+)", text)
                if m_ml:
                    rid = m_ml.group(1).strip()
                    eid = m_ml.group(2).strip()
                    if rid and rid not in captured_runs:
                        captured_runs.append(rid)
                    if eid:
                        captured_exp_id = eid
                elif "Run ID:" in text:
                    parts = text.split("Run ID:")
                    if len(parts) > 1:
                        rid = parts[1].strip().split()[0]
                        if rid and rid not in captured_runs:
                            captured_runs.append(rid)

        await proc.wait()
        eval_task_mgr._processes.pop(task_id, None)
        curr_t = eval_task_mgr.get_task(task_id)
        if curr_t and curr_t.get("status") == "aborted":
            eval_task_mgr.append_log(task_id, f"🛑 任务已确认中止退出 (exit code: {proc.returncode})")
        elif proc.returncode == 0:
            mlflow_host = os.getenv("MLFLOW_TRACKING_URI", "http://49.233.222.54:9128").rstrip("/")
            active_exp = captured_exp_id or "11"
            compare_url = f"{mlflow_host}/#/experiments/{active_exp}"
            if len(captured_runs) >= 2:
                import urllib.parse
                runs_json = json.dumps(captured_runs)
                exp_json = json.dumps([active_exp])
                compare_url = f"{mlflow_host}/compare-runs?runs={urllib.parse.quote(runs_json)}&experiments={urllib.parse.quote(exp_json)}"
            elif len(captured_runs) == 1:
                compare_url = f"{mlflow_host}/#/experiments/{active_exp}/runs/{captured_runs[0]}"

            # 解析报告提取核心综合指标
            overall_score = None
            pass_rate = None
            metrics_summary = None
            report_filename = captured_report
            if not report_filename:
                res_dir = repo_root / "evaluation" / "results"
                if res_dir.exists():
                    all_jsons = sorted(res_dir.glob("deepeval_report_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
                    if all_jsons:
                        report_filename = all_jsons[0].name

            if report_filename:
                target_json = repo_root / "evaluation" / "results" / report_filename
                if target_json.exists():
                    try:
                        report_data = json.loads(target_json.read_text(encoding="utf-8"))
                        if isinstance(report_data, list) and len(report_data) > 0:
                            total_cases = len(report_data)
                            passed_cases = sum(1 for c in report_data if c.get("all_passed"))
                            pass_rate = round(passed_cases / total_cases, 4)

                            valid_scores = [c.get("overall_score") for c in report_data if c.get("overall_score") is not None]
                            overall_score = round(sum(valid_scores) / len(valid_scores), 4) if valid_scores else 0.0

                            m_sums: Dict[str, List[float]] = {}
                            for c in report_data:
                                for mk, mv in (c.get("scores") or {}).items():
                                    if mv is not None:
                                        try:
                                            m_sums.setdefault(mk, []).append(float(mv))
                                        except (ValueError, TypeError):
                                            pass
                            metrics_summary = {
                                k: round(sum(vals) / len(vals), 4) for k, vals in m_sums.items() if vals
                            }
                    except Exception as e:
                        logger.warning(f"Failed to parse eval report {target_json}: {e}")

            eval_task_mgr.update_task(
                task_id,
                status="completed",
                progress=100,
                result_url=compare_url,
                runs=captured_runs,
                overall_score=overall_score,
                pass_rate=pass_rate,
                metrics_summary=metrics_summary,
                report_file=report_filename,
            )
            eval_task_mgr.append_log(task_id, f"🏆 矩阵打擂圆满完成！MLflow 对比大屏: {compare_url}")

            # 同步更新 SQLite catalog 记录
            try:
                from catalog_manager import catalog_mgr
                catalog_mgr.update_eval_run(
                    task_id=task_id,
                    status="completed",
                    progress=100,
                    runs=captured_runs,
                    result_url=compare_url,
                    overall_score=overall_score,
                    pass_rate=pass_rate,
                    metrics_summary=metrics_summary,
                    report_file=report_filename,
                )
            except Exception as ex:
                logger.warning(f"Failed to update eval run in catalog: {ex}")
        else:
            eval_task_mgr.update_task(task_id, status="failed", error=f"Process exited with code {proc.returncode}")
            eval_task_mgr.append_log(task_id, f"❌ 打擂进程异常退出 (code: {proc.returncode})")
    except Exception as ex:
        eval_task_mgr.update_task(task_id, status="failed", error=str(ex))
        eval_task_mgr.append_log(task_id, f"❌ 打擂异常: {ex}")


@ops_router.post("/evaluation/matrix-run")
async def run_matrix_evaluation_endpoint(req: MatrixRunRequest):
    """Asynchronously starts a multi-parameter battle evaluation."""
    tid = eval_task_mgr.create_task("matrix_evaluation", req.dict())
    try:
        from catalog_manager import catalog_mgr
        p_id = req.project_id or _get_current_project_id()
        catalog_mgr.record_eval_run(
            task_id=tid,
            project_id=p_id,
            dataset_name=req.dataset or req.dataset_name or "business_qa.json",
            modes=req.matrix_mode or req.modes or ["mix", "hybrid"],
            top_k=req.top_k,
            limit_count=req.limit,
        )
    except Exception as ex:
        logger.warning(f"Failed to record eval run in catalog: {ex}")
    asyncio.create_task(_run_matrix_evaluation_bg(tid, req))
    return {"status": "accepted", "task_id": tid, "message": "Matrix evaluation started in background."}


app.include_router(ops_router)


@app.api_route("/favicon.ico", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/favicon.png", methods=["GET", "HEAD"], include_in_schema=False)
async def get_root_favicon_png():
    fav = repo_root / "lightrag" / "api" / "webui" / "favicon.png"
    if fav.exists():
        return FileResponse(fav, media_type="image/png")
    return Response(status_code=404)


@app.api_route("/favicon.svg", methods=["GET", "HEAD"], include_in_schema=False)
async def get_root_favicon_svg():
    fav = repo_root / "lightrag" / "api" / "webui" / "favicon.svg"
    if fav.exists():
        return FileResponse(fav, media_type="image/svg+xml")
    return Response(status_code=404)


# 6. Floating Overlay Removed: ProjectSelector and UserAccountMenu natively integrated into WebUI SiteHeader


# 7. Multi-Tenant & SSO Resolution ASGI Middleware
class TenantResolutionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1. Resolve tenant and project from Query, Header or Cookie
        tenant_id = (
            request.query_params.get("tenant_id")
            or request.query_params.get("tenant")
            or request.headers.get("x-tenant-id")
            or request.cookies.get("x_tenant_id")
            or "__default"
        ).strip()

        project_id = (
            request.query_params.get("project_id")
            or request.query_params.get("project")
            or request.headers.get("x-project-id")
            or request.cookies.get("x_project_id")
            or "11111111-1111-4111-8111-111111111111"
        ).strip()

        # 2. Self-healing project metadata if project_name supplied in query parameters
        project_name = (
            request.query_params.get("project_name")
            or request.query_params.get("name")
        )
        if project_name and project_name.strip():
            try:
                workspace_mgr.save_project_meta(
                    tenant_id=tenant_id,
                    project_id=project_id,
                    name=project_name.strip(),
                )
            except Exception as e:
                logger.warning(f"Failed to auto-heal project meta for {tenant_id}:{project_id}: {e}")

        # 3. Warm up engine only for core RAG engine routes that actually query/mutate storage
        path = request.url.path
        is_ops_or_static = (
            path.startswith("/ops/")
            or path.startswith("/assets/")
            or path.startswith("/static/")
            or path in ("/webui", "/webui/", "/webui/index.html", "/", "/favicon.ico", "/favicon.png", "/favicon.svg")
            or path.startswith("/eval-studio")
            or path.startswith("/evalflow")
            or path.startswith("/auth/")
        )
        if not is_ops_or_static:
            await dynamic_rag_proxy.ensure_instance(tenant_id, project_id)

        # 4. Bind contextvar
        token_ctx = current_workspace_ctx.set((tenant_id, project_id))

        try:
            response = await call_next(request)

            # 4. Set persistent session cookies if query param was supplied
            if "project_id" in request.query_params or "project" in request.query_params:
                response.set_cookie("x_tenant_id", tenant_id, path="/", samesite="lax")
                response.set_cookie("x_project_id", project_id, path="/", samesite="lax")

            # 5. Handle SSO token auto-login & embed immersion injection
            path = request.url.path
            content_type = response.headers.get("content-type", "")
            is_html_request = (path in ("/webui", "/webui/", "/webui/index.html") or path == "/") and "text/html" in content_type

            # Check if embed mode is requested
            is_embed = request.query_params.get("embed") in ("true", "1", "yes")

            # Check SSO ticket or explicit JWT token
            sso_ticket = request.query_params.get("sso_ticket") or request.query_params.get("ticket")
            sso_token = None
            sso_user = None

            if sso_ticket:
                sso_secret = sso_auth_delegator.get_sso_secret()
                ticket_payload = sso_auth_delegator.verify_sso_ticket(sso_ticket, sso_secret)
                if ticket_payload:
                    sso_user = ticket_payload.get("username", "user")
                    sso_role = ticket_payload.get("role", "user")
                    try:
                        from lightrag.api.auth import auth_handler
                        if hasattr(auth_handler, "roles"):
                            auth_handler.roles[sso_user] = sso_role
                        sso_token = auth_handler.create_token(username=sso_user, role=sso_role)
                        logger.info(f"Verified SSO ticket for user {sso_user}, minted native token")
                    except Exception as ex:
                        logger.warning(f"Failed to mint token from SSO ticket: {ex}")
                else:
                    logger.warning("Invalid or expired SSO ticket provided in query params")
            elif request.query_params.get("token"):
                raw_token = request.query_params.get("token")
                if raw_token and len(raw_token.split(".")) == 3:
                    sso_token = raw_token
                    # Extract subject identity from valid token
                    try:
                        import jwt
                        token_secret = os.getenv("TOKEN_SECRET", "")
                        if token_secret:
                            decoded = jwt.decode(raw_token, token_secret, algorithms=["HS256"], options={"verify_signature": False})
                            sso_user = decoded.get("sub")
                    except Exception:
                        sso_user = None

            if sso_token:
                response.set_cookie("LIGHTRAG-API-TOKEN", sso_token, path="/", samesite="lax")

            if is_html_request:
                body_chunks = [chunk async for chunk in response.body_iterator]
                body_bytes = b"".join(body_chunks)
                body_str = body_bytes.decode("utf-8", errors="ignore")

                injected_snippets = []

                # Inject SSO script and tab routing script
                tab_param = request.query_params.get("tab", "").strip()
                sso_script = f"""<script>
(function() {{
    try {{
        var token = {json.dumps(sso_token) if sso_token else 'null'};
        var ssoUser = {json.dumps(sso_user) if sso_user else 'null'};
        if (token) {{
            localStorage.setItem('LIGHTRAG-API-TOKEN', token);
            if (ssoUser) {{
                localStorage.setItem('LIGHTRAG-PREVIOUS-USER', ssoUser);
            }}
        }}
        var urlParams = new URLSearchParams(window.location.search);
        var targetProj = urlParams.get('project_id') || urlParams.get('project') || {json.dumps(project_id)};
        var targetTenant = urlParams.get('tenant_id') || urlParams.get('tenant') || {json.dumps(tenant_id)};
        if (targetProj) {{
            var wsRaw = localStorage.getItem('lightrag-workspace-storage');
            var wsParsed = wsRaw ? JSON.parse(wsRaw) : {{ state: {{}}, version: 0 }};
            wsParsed.state = wsParsed.state || {{}};
            wsParsed.state.currentProjectId = targetProj;
            wsParsed.state.currentTenantId = targetTenant;
            localStorage.setItem('lightrag-workspace-storage', JSON.stringify(wsParsed));
        }}
        var tab = urlParams.get('tab') || {json.dumps(tab_param)};
        if (tab) {{
            // 1. Correct Zustand key: settings-storage
            var raw = localStorage.getItem('settings-storage');
            var parsed = raw ? JSON.parse(raw) : {{ state: {{}}, version: 22 }};
            parsed.state = parsed.state || {{}};
            parsed.state.currentTab = tab;
            localStorage.setItem('settings-storage', JSON.stringify(parsed));
            // 2. Backward compatibility alias
            localStorage.setItem('lightrag-settings-storage', JSON.stringify(parsed));
        }}
    }} catch(e) {{
        console.error('SSO/Tab initialization failed:', e);
    }}

    // Runtime double-insurance: trigger click on sidebar button once DOM is loaded
    window.addEventListener('DOMContentLoaded', function() {{
        var urlParams = new URLSearchParams(window.location.search);
        var tab = urlParams.get('tab') || {json.dumps(tab_param)};
        if (!tab) return;
        var attempts = 0;
        var interval = setInterval(function() {{
            attempts++;
            var buttons = document.querySelectorAll('aside button');
            var matched = false;
            buttons.forEach(function(btn) {{
                var text = (btn.innerText || '').toLowerCase();
                if (tab === 'knowledge-graph' && (text.includes('graph studio') || text.includes('图谱工坊'))) {{
                    btn.click();
                    matched = true;
                }} else if (tab === 'retrieval' && (text.includes('chat studio') || text.includes('智能问答'))) {{
                    btn.click();
                    matched = true;
                }} else if (tab === 'documents' && (text.includes('knowledge hub') || text.includes('知识资产'))) {{
                    btn.click();
                    matched = true;
                }}
            }});
            if (matched || attempts > 25) {{
                clearInterval(interval);
            }}
        }}, 120);
    }});
}})();
</script>"""
                injected_snippets.append(sso_script)

                if is_embed:
                    embed_css = """<style id="lightrag-embed-override">
    header { display: none !important; }
    aside { display: none !important; }
    main { height: 100vh !important; width: 100vw !important; overflow: hidden !important; }
    body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
</style>"""
                    injected_snippets.append(embed_css)

                injected_content = "\n".join(injected_snippets) + "\n"
                if "<head>" in body_str:
                    injected_html = body_str.replace("<head>", "<head>\n" + injected_content, 1)
                else:
                    injected_html = body_str.replace("</head>", injected_content + "</head>", 1)
                resp_headers = dict(response.headers)
                resp_headers.pop("content-length", None)
                return HTMLResponse(content=injected_html, status_code=response.status_code, headers=resp_headers)

            return response
        finally:
            current_workspace_ctx.reset(token_ctx)


app.add_middleware(TenantResolutionMiddleware)


@app.on_event("startup")
async def on_startup_sync_catalog():
    try:
        from catalog_manager import catalog_mgr
        catalog_mgr.sync_from_filesystem(storage_root, datasets_dir)
        logger.info("✅ catalog.sqlite 元数据关系表已成功同步就绪！")
    except Exception as ex:
        logger.warning(f"Failed to sync catalog on startup: {ex}")


def main():
    import uvicorn

    print(f"Starting Multi-Tenant Relay LightRAG Official WebUI server on 0.0.0.0:9621...")
    uvicorn.run(app, host=global_args.host, port=global_args.port, log_config=None)


if __name__ == "__main__":
    main()
