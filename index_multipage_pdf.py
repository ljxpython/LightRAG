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

active_dir = repo_root / "sandbox_storage" / "__default" / "11111111-1111-4111-8111-111111111111" / "active"

rag = LightRAG(
    working_dir=str(active_dir),
    llm_model_func=llm_func,
    embedding_func=EmbeddingFunc(
        embedding_dim=int(os.environ["EMBEDDING_DIM"]),
        max_token_size=8192,
        func=embed_func
    )
)

async def main():
    await rag.initialize_storages()
    full_text = (
        "Page 1: Project Architecture Overview\n"
        "LightRAG 1.5 integrates multimodal parsing natively with docling support.\n"
        "Page 2: Performance Evaluation\n"
        "The system peak throughput achieves 1200 QPS with 99.9% uptime."
    )
    doc_id = "kd_12345678901234567890123456789012"
    file_path = "sample_multipage.pdf"
    
    print("Indexing sample_multipage.pdf into active LightRAG storage...")
    await rag.ainsert(full_text, ids=doc_id, file_paths=file_path)
    print("sample_multipage.pdf indexed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
