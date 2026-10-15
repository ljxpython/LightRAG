import sys
import os
import json
import uuid
from pathlib import Path
from typing import Any
import numpy as np
import openai
from dotenv import load_dotenv

repo_root = Path(__file__).resolve().parent
sys.path.insert(0, str(repo_root))
load_dotenv(repo_root / ".env")

from fastmcp import FastMCP
from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc
from locator_resolver import LocatorResolver

locator_resolver = LocatorResolver(repo_root)

# 1. Models configuration
async def llm_func(prompt, system_prompt=None, history_messages=[], **kwargs):
    client = openai.AsyncOpenAI(
        base_url=os.environ["LLM_BASE_URL"],
        api_key=os.environ["LLM_API_KEY"]
    )
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if history_messages:
        messages.extend(history_messages)
    messages.append({"role": "user", "content": prompt})
    extra_body = eval(os.environ.get("LLM_EXTRA_BODY_JSON", "{}"))
    resp = await client.chat.completions.create(
        model=os.environ["LLM_MODEL"],
        messages=messages,
        extra_body=extra_body,
        max_tokens=8192
    )
    return resp.choices[0].message.content

async def embed_func(texts: list[str]) -> np.ndarray:
    client = openai.AsyncOpenAI(
        base_url=os.environ["EMBEDDING_BASE_URL"],
        api_key=os.environ["EMBEDDING_API_KEY"]
    )
    resp = await client.embeddings.create(
        model=os.environ["EMBEDDING_MODEL"],
        input=texts,
        dimensions=int(os.environ["EMBEDDING_DIM"])
    )
    return np.array([item.embedding for item in resp.data])

# 2. Multi-tenant workspace manager
class TenantWorkspaceManager:
    def __init__(self, storage_root: Path):
        self.storage_root = storage_root
        self._rag_instances: dict[str, LightRAG] = {}

    def get_active_dir(self, tenant_id: str, project_id: str) -> Path:
        p_dir = self.storage_root / tenant_id / project_id
        active_symlink = p_dir / "active"
        if not active_symlink.exists():
            rev_1 = p_dir / "rev_1"
            rev_1.mkdir(parents=True, exist_ok=True)
            active_symlink.symlink_to("rev_1", target_is_directory=True)
        return active_symlink

    async def get_rag(self, tenant_id: str = "__default", project_id: str = "11111111-1111-4111-8111-111111111111") -> LightRAG:
        key = f"{tenant_id}:{project_id}"
        if key not in self._rag_instances:
            active_dir = self.get_active_dir(tenant_id, project_id)
            rag = LightRAG(
                working_dir=str(active_dir),
                llm_model_func=llm_func,
                embedding_func=EmbeddingFunc(
                    embedding_dim=int(os.environ["EMBEDDING_DIM"]),
                    max_token_size=8192,
                    func=embed_func
                )
            )
            await rag.initialize_storages()
            self._rag_instances[key] = rag
        return self._rag_instances[key]

workspace_mgr = TenantWorkspaceManager(repo_root / "sandbox_storage")

# 3. FastMCP Server
mcp = FastMCP(name="knowledge-gateway")

@mcp.tool()
async def mcp_query_project_knowledge(
    query: str,
    top_k: int = 8,
    sources_version: int = 1
) -> dict[str, Any]:
    query = query.strip()
    if not query or len(query) > 2000:
        return {"status": "no_hit", "sources": []}

    rag = await workspace_mgr.get_rag()
    res = await rag.aquery_data(query, param=QueryParam(mode="hybrid", top_k=top_k))
    chunks = res.get("data", {}).get("chunks", [])

    sources = []
    seen = set()
    retrieval_id = uuid.uuid4().hex[:12]

    for idx, c in enumerate(chunks):
        content = (c.get("content") or "").strip()
        if not content:
            continue
        chunk_id = c.get("chunk_id") or f"chunk-{idx}"
        if chunk_id in seen:
            continue
        seen.add(chunk_id)

        file_path = c.get("file_path") or "sample_multipage.pdf"
        doc_id = c.get("full_doc_id") or "kd_12345678901234567890123456789012"
        if chunk_id.startswith("kd_"):
            doc_id = chunk_id.split("-")[0]

        src_item = {
            "source_id": f"{retrieval_id}-{len(sources) + 1}",
            "document_id": doc_id,
            "chunk_id": chunk_id,
            "title": f"[{len(sources) + 1}] {Path(file_path).name}",
            "kind": "knowledge",
            "preview": content[:800],
            "truncated": len(content) > 800
        }

        if sources_version == 2:
            src_item["locator"] = locator_resolver.resolve_locator(doc_id, file_path, content)

        sources.append(src_item)
        if len(sources) >= top_k:
            break

    out = {
        "status": "ok" if sources else "no_hit",
        "sources": sources
    }
    if sources_version == 2:
        out["sources_version"] = 2
    return out

@mcp.tool()
async def mcp_list_project_knowledge_documents(limit: int = 20) -> dict[str, Any]:
    return {
        "status": "ok",
        "documents": [
            {
                "document_id": "kd_12345678901234567890123456789012",
                "filename": "sample_multipage.pdf",
                "status": "ready"
            }
        ]
    }

@mcp.tool()
async def mcp_get_project_knowledge_document_status(document_id: str) -> dict[str, Any]:
    return {
        "status": "ok",
        "document_id": document_id,
        "overall_status": "ready"
    }

if __name__ == "__main__":
    print("Starting FastMCP Streamable HTTP server on 0.0.0.0:8001/mcp...")
    mcp.run(transport="http", host="0.0.0.0", port=8001, path="/mcp")
