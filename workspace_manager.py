from collections import OrderedDict
import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional, Tuple

from lightrag import LightRAG

from lease_manager import ReaderLeaseManager
from llm_client import (
    create_lightrag_embedding_func,
    unified_llm_func,
)

logger = logging.getLogger("workspace_manager")


def apply_workspace_namespace_patch() -> None:
    """Dynamically patches JsonKVStorage and JsonDocStatusStorage to inject working_dir MD5 hash into namespace."""
    import hashlib
    from lightrag.kg.json_kv_impl import JsonKVStorage
    from lightrag.kg.json_doc_status_impl import JsonDocStatusStorage

    if getattr(JsonKVStorage, "_is_workspace_patched", False):
        return

    orig_kv_post_init = JsonKVStorage.__post_init__

    def patched_kv_post_init(self) -> None:
        orig_kv_post_init(self)
        working_dir = (
            self.global_config.get("working_dir") if self.global_config else None
        )
        if working_dir:
            wdir = os.path.abspath(working_dir)
            wdir_tag = hashlib.md5(wdir.encode("utf-8")).hexdigest()[:12]
            if not self.namespace.startswith(f"{wdir_tag}_"):
                self.namespace = f"{wdir_tag}_{self.namespace}"

    JsonKVStorage.__post_init__ = patched_kv_post_init
    JsonKVStorage._is_workspace_patched = True

    orig_doc_post_init = JsonDocStatusStorage.__post_init__

    def patched_doc_post_init(self) -> None:
        orig_doc_post_init(self)
        working_dir = (
            self.global_config.get("working_dir") if self.global_config else None
        )
        if working_dir:
            wdir = os.path.abspath(working_dir)
            wdir_tag = hashlib.md5(wdir.encode("utf-8")).hexdigest()[:12]
            if not self.namespace.startswith(f"{wdir_tag}_"):
                self.namespace = f"{wdir_tag}_{self.namespace}"

    JsonDocStatusStorage.__post_init__ = patched_doc_post_init
    JsonDocStatusStorage._is_workspace_patched = True
    logger.info("Workspace namespace monkey-patch applied successfully.")


class TenantWorkspaceManager:
    """Enterprise multi-tenant workspace manager with zero-lock POSIX CAS activation and reader leases."""

    def __init__(
        self,
        storage_root: Path,
        lease_manager: Optional[ReaderLeaseManager] = None,
        max_cached_instances: Optional[int] = None,
    ):
        apply_workspace_namespace_patch()
        self.storage_root = Path(storage_root)
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self.max_cached_instances = max_cached_instances or int(
            os.getenv("MAX_ACTIVE_RAG_INSTANCES", "8")
        )
        # Key: "tenant_id:project_id" -> LightRAG instance (LRU)
        self._rag_instances: OrderedDict[str, LightRAG] = OrderedDict()
        # Key: "tenant_id:project_id" -> current version name (e.g. "rev_1")
        self._active_versions: Dict[str, str] = {}
        self.lease_mgr = lease_manager or ReaderLeaseManager()
        self._lock = asyncio.Lock()
    def get_project_dir(self, tenant_id: str, project_id: str) -> Path:
        p_dir = self.storage_root / tenant_id / project_id
        p_dir.mkdir(parents=True, exist_ok=True)
        return p_dir

    def get_project_meta_path(self, tenant_id: str, project_id: str) -> Path:
        """Returns physical path of meta.json for a project."""
        if tenant_id == "__default" and project_id == "eval_benchmark":
            eval_dir = self.storage_root / "eval_benchmark"
            if eval_dir.exists():
                return eval_dir / "meta.json"
        return self.get_project_dir(tenant_id, project_id) / "meta.json"

    def get_project_meta(self, tenant_id: str, project_id: str) -> Dict[str, Any]:
        """Loads project metadata with fallback defaults."""
        meta_path = self.get_project_meta_path(tenant_id, project_id)
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        return {
                            "tenant_id": data.get("tenant_id", tenant_id),
                            "project_id": data.get("project_id", project_id),
                            "name": data.get("name") or project_id,
                            "code": data.get("code"),
                            "description": data.get("description", ""),
                            "updated_at": data.get("updated_at"),
                        }
            except Exception as e:
                logger.warning(f"Failed to read project meta at {meta_path}: {e}")

        # Default fallback names
        name = project_id
        if project_id == "11111111-1111-4111-8111-111111111111":
            name = "平台默认项目"
        elif project_id == "eval_benchmark":
            name = "评测基准 (eval_benchmark)"

        return {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "name": name,
            "code": None,
            "description": "",
            "updated_at": None,
        }

    def save_project_meta(
        self,
        tenant_id: str,
        project_id: str,
        name: str,
        code: Optional[str] = None,
        description: str = "",
    ) -> Dict[str, Any]:
        """Atomically persists project metadata with POSIX tempfile replacement."""
        meta_path = self.get_project_meta_path(tenant_id, project_id)
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        clean_name = (name or "").strip() or project_id
        clean_code = (code or "").strip() or None
        data = {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "name": clean_name,
            "code": clean_code,
            "description": description or "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        temp_file = meta_path.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(str(temp_file), str(meta_path))
        return data

    def get_active_version_name(self, tenant_id: str, project_id: str) -> str:
        """Resolves the current active version folder name."""
        active_symlink = self.get_project_dir(tenant_id, project_id) / "active"
        if not active_symlink.exists():
            return "rev_1"
        try:
            target = active_symlink.resolve()
            return target.name
        except Exception:
            return "rev_1"

    def get_active_dir(self, tenant_id: str, project_id: str) -> Path:
        """Returns the active working directory, initializing rev_1 symlink if not present."""
        p_dir = self.get_project_dir(tenant_id, project_id)
        active_symlink = p_dir / "active"
        if not active_symlink.exists():
            rev_1 = p_dir / "revisions" / "rev_1"
            rev_1.mkdir(parents=True, exist_ok=True)
            active_symlink.symlink_to(
                Path("revisions") / "rev_1", target_is_directory=True
            )
        return active_symlink

    async def get_rag_engine(
        self,
        tenant_id: str = "__default",
        project_id: str = "11111111-1111-4111-8111-111111111111",
    ) -> Tuple[LightRAG, str]:
        """Returns initialized LightRAG engine and active version name with LRU eviction and reader leases."""
        key = f"{tenant_id}:{project_id}"
        async with self._lock:
            current_version = self.get_active_version_name(tenant_id, project_id)
            if key in self._rag_instances and self._active_versions.get(key) == current_version:
                self._rag_instances.move_to_end(key)
                return self._rag_instances[key], current_version

            # If existing instance was invalidated due to version shift, drain it gracefully
            old_rag = self._rag_instances.pop(key, None)
            old_ver = self._active_versions.pop(key, None)
            if old_rag is not None and old_ver is not None:
                await self.lease_mgr.mark_retired(
                    tenant_id, project_id, old_ver, old_rag,
                    cleanup_callback=lambda r: r.finalize_storages()
                )

            # Evict LRU entries if capacity reached
            while len(self._rag_instances) >= self.max_cached_instances:
                evict_key, evict_rag = self._rag_instances.popitem(last=False)
                evict_ver = self._active_versions.pop(evict_key, None)
                if evict_rag is not None and evict_ver is not None:
                    evict_tenant, evict_project = evict_key.split(":", 1)
                    await self.lease_mgr.mark_retired(
                        evict_tenant, evict_project, evict_ver, evict_rag,
                        cleanup_callback=lambda r: r.finalize_storages()
                    )

            active_dir = self.get_active_dir(tenant_id, project_id)
            rag = LightRAG(
                working_dir=str(active_dir),
                llm_model_func=unified_llm_func,
                embedding_func=create_lightrag_embedding_func(),
                addon_params={"language": "简体中文"},
            )
            await rag.initialize_storages()
            self._rag_instances[key] = rag
            self._active_versions[key] = current_version
            return self._rag_instances[key], self._active_versions[key]
    @asynccontextmanager
    async def acquire_read_lease(
        self, tenant_id: str, project_id: str
    ) -> AsyncGenerator[LightRAG, None]:
        """Acquires a versioned reader lease on the active engine to prevent abrupt teardown during queries."""
        rag, version_tag = await self.get_rag_engine(tenant_id, project_id)
        async with self.lease_mgr.lease(tenant_id, project_id, version_tag):
            yield rag

    async def atomic_publish_candidate(
        self, tenant_id: str, project_id: str, candidate_dir: Path
    ) -> int:
        """Publishes candidate build directory as the next revision using POSIX atomic symlink swap."""
        p_dir = self.get_project_dir(tenant_id, project_id)
        revisions_dir = p_dir / "revisions"
        revisions_dir.mkdir(parents=True, exist_ok=True)

        existing_revs = [
            int(d.name.split("_")[1])
            for d in revisions_dir.glob("rev_*")
            if d.is_dir() and d.name.split("_")[-1].isdigit()
        ]
        next_rev_num = (max(existing_revs) + 1) if existing_revs else 1
        target_rev_dir = revisions_dir / f"rev_{next_rev_num}"

        # Move candidate to revisions directory
        shutil.move(str(candidate_dir), str(target_rev_dir))

        # Linux POSIX Atomic Symlink Swap:
        # ln -sfn revisions/rev_<next> active.tmp && mv -T active.tmp active
        active_symlink = p_dir / "active"
        tmp_symlink = p_dir / "active.tmp"
        rel_target = Path("revisions") / f"rev_{next_rev_num}"

        if tmp_symlink.is_symlink() or tmp_symlink.exists():
            tmp_symlink.unlink()
        tmp_symlink.symlink_to(rel_target, target_is_directory=True)

        # os.replace performs atomic rename on POSIX
        os.replace(str(tmp_symlink), str(active_symlink))

        key = f"{tenant_id}:{project_id}"
        async with self._lock:
            old_version = self._active_versions.pop(key, None)
            old_rag = self._rag_instances.pop(key, None)

        if old_rag is not None and old_version is not None:
            # Launch non-blocking graceful drain for the retired version
            await self.lease_mgr.mark_retired(
                tenant_id, project_id, old_version, old_rag
            )

        return next_rev_num
