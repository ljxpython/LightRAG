import asyncio
import html
import json
import logging
import os
import re
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
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
from workspace_manager import TenantWorkspaceManager

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


# 5. Build Enterprise Operations Router (/ops)
ops_router = APIRouter(prefix="/ops", tags=["Enterprise Operations"])


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
    """Sets active tenant & project cookies and primes the RAG engine."""
    tenant_id = payload.tenant_id.strip() or "__default"
    project_id = payload.project_id.strip()
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id cannot be empty")

    await dynamic_rag_proxy.ensure_instance(tenant_id, project_id)
    response.set_cookie("x_tenant_id", tenant_id, path="/", samesite="lax")
    response.set_cookie("x_project_id", project_id, path="/", samesite="lax")
    return {
        "status": "success",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "message": f"Active workspace switched to {tenant_id}:{project_id}",
    }


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

    # Pre-clean doc_id: handle composite <SEP> and chunk suffixes gracefully
    clean_id = doc_id.split("<SEP>")[0].split(",")[0].strip()
    if "-chunk-" in clean_id:
        clean_id = re.sub(r"-chunk-\d+$", "", clean_id)

    def load_from_dir(d: Path):
        full_content = ""
        found = False
        resolved_doc_id = clean_id
        doc_name = ""

        full_docs_file = d / "kv_store_full_docs.json"
        chunks_file = d / "kv_store_text_chunks.json"

        # If clean_id is a chunk ID directly, try to reverse-lookup its full_doc_id
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

        # Try to resolve title from doc_status if available
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

    # 2. If not found in target_dir, search across all candidate workspace revisions under storage_root
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

    # 3. Model-parsed resolution: strictly resolve from system-parsed data (chunks or __parsed__ store), NEVER live re-extract with pypdf
    parsed_dir = target_dir / "__parsed__"
    if not parsed_dir.exists():
        # Check parent workspace directories for __parsed__
        for cand in [target_dir.parent / "__parsed__", target_dir.parent.parent / "__parsed__", Path("eval_data/__parsed__")]:
            if cand.exists():
                parsed_dir = cand
                break

    # If full_content is empty or a pure ingest-stub but we have parsed chunks, assemble from chunks
    if (not full_content or (full_content.startswith("Title:") and "Original Path:" in full_content)) and chunks:
        # Check if chunks contain richer parsed body than the stub
        chunk_texts = [c["content"] for c in chunks if c.get("content")]
        assembled_chunks = "\n\n".join(chunk_texts)
        if len(assembled_chunks) > len(full_content):
            full_content = assembled_chunks

    # If parsed directory exists, check if model parser saved the markdown artifact
    if parsed_dir and parsed_dir.exists() and doc_name:
        clean_name = Path(doc_name).name
        # Match by base name (e.g. operations.md, api.md)
        for cand_file in parsed_dir.glob(f"{Path(clean_name).stem}*"):
            if cand_file.is_file() and cand_file.suffix in [".md", ".txt", ".json"]:
                try:
                    parsed_text = cand_file.read_text(encoding="utf-8")
                    if len(parsed_text) > len(full_content):
                        full_content = parsed_text
                        logger.info(f"Loaded {len(full_content)} chars from model-parsed artifact {cand_file}")
                        break
                except Exception as ex:
                    logger.warning(f"Failed to read parsed artifact {cand_file}: {ex}")

    # Fallback to Title if doc_name is still "unknown_source"
    if (not doc_name or doc_name == "unknown_source") and full_content.startswith("Title:"):
        title_match = re.search(r"Title:\s*([^\n\r]+)", full_content)
        if title_match:
            doc_name = title_match.group(1).strip()

    return {
        "status": "success",
        "doc_id": clean_id,
        "doc_name": doc_name or clean_id,
        "tenant_id": t_id,
        "project_id": p_id,
        "found": found,
        "source_workspace": source_dir,
        "full_content": full_content,
        "chunks_count": len(chunks),
        "chunks": chunks,
    }

app.include_router(ops_router)


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

        # 3. Warm up engine for current workspace
        await dynamic_rag_proxy.ensure_instance(tenant_id, project_id)

        # 4. Bind contextvar
        token_ctx = current_workspace_ctx.set((tenant_id, project_id))

        try:
            response = await call_next(request)

            # 4. Set persistent session cookies if query param was supplied
            if "project_id" in request.query_params or "project" in request.query_params:
                response.set_cookie("x_tenant_id", tenant_id, path="/", samesite="lax")
                response.set_cookie("x_project_id", project_id, path="/", samesite="lax")

            # 5. Handle SSO token auto-login
            sso_token = request.query_params.get("token")
            if sso_token:
                response.set_cookie("LIGHTRAG-API-TOKEN", sso_token, path="/", samesite="lax")
                path = request.url.path
                content_type = response.headers.get("content-type", "")
                if (path in ("/webui", "/webui/", "/webui/index.html") or path == "/") and "text/html" in content_type:
                    body_chunks = [chunk async for chunk in response.body_iterator]
                    body_bytes = b"".join(body_chunks)
                    body_str = body_bytes.decode("utf-8", errors="ignore")
                    sso_script = f"<script>localStorage.setItem('LIGHTRAG-API-TOKEN', {json.dumps(sso_token)});</script>"
                    injected_html = body_str.replace("</head>", sso_script + "</head>")
                    resp_headers = dict(response.headers)
                    resp_headers.pop("content-length", None)
                    return HTMLResponse(content=injected_html, status_code=response.status_code, headers=resp_headers)

            return response
        finally:
            current_workspace_ctx.reset(token_ctx)


app.add_middleware(TenantResolutionMiddleware)


def main():
    import uvicorn

    print(f"Starting Multi-Tenant Relay LightRAG Official WebUI server on 0.0.0.0:9621...")
    uvicorn.run(app, host=global_args.host, port=global_args.port, log_config=None)


if __name__ == "__main__":
    main()
