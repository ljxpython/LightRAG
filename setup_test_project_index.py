import asyncio
import os
from pathlib import Path
import numpy as np
import openai
from dotenv import load_dotenv

repo_root = Path(__file__).resolve().parent
load_dotenv(repo_root / ".env")

from lightrag import LightRAG
from lightrag.utils import EmbeddingFunc

# Setup project directories
tenant_id = "__default"
project_id = "11111111-1111-4111-8111-111111111111"
project_dir = repo_root / "sandbox_storage" / tenant_id / project_id
rev_dir = project_dir / "rev_1"
active_symlink = project_dir / "active"

rev_dir.mkdir(parents=True, exist_ok=True)
if active_symlink.is_symlink() or active_symlink.exists():
    active_symlink.unlink()
active_symlink.symlink_to("rev_1", target_is_directory=True)
print("Symlink configured:", active_symlink, "->", active_symlink.resolve())

# Setup LLM & Embedding
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

rag = LightRAG(
    working_dir=str(active_symlink),
    llm_model_func=llm_func,
    embedding_func=EmbeddingFunc(
        embedding_dim=int(os.environ["EMBEDDING_DIM"]),
        max_token_size=8192,
        func=embed_func
    )
)

async def main():
    print("Initializing LightRAG storage...")
    await rag.initialize_storages()
    sample_text = (
        "Orion Service Architecture Specification\n"
        "1. Overview: LightRAG 1.5 integrates multimodal parsing natively with 1200 QPS throughput and 99.9% uptime.\n"
        "2. Incident Management: A production incident must be acknowledged within 7 minutes.\n"
        "3. Backup Policy: Orion backup retention is 35 days, restoration drills happen every 14 days.\n"
    )
    doc_id = "kd_ffba19b7a12345678901234567890123"
    filename = "orion_architecture.pdf"
    
    print("Inserting test document via ainsert...")
    await rag.ainsert(
        sample_text,
        ids=doc_id,
        file_paths=filename
    )
    print("Test document successfully indexed in rev_1!")

if __name__ == "__main__":
    asyncio.run(main())
