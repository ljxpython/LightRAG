import asyncio
import json
import os
import sys
import time
from pathlib import Path
import numpy as np
import openai
from dotenv import load_dotenv

repo_root = Path(__file__).resolve().parent
load_dotenv(repo_root / ".env")

from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

# Setup LLM & Embedding with resilient retries
async def llm_func(prompt, system_prompt=None, history_messages=[], **kwargs):
    client = openai.AsyncOpenAI(
        base_url=os.environ["LLM_BASE_URL"],
        api_key=os.environ["LLM_API_KEY"],
        timeout=60.0
    )
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if history_messages:
        messages.extend(history_messages)
    messages.append({"role": "user", "content": prompt})
    extra_body = eval(os.environ.get("LLM_EXTRA_BODY_JSON", "{}"))

    for attempt in range(4):
        try:
            resp = await client.chat.completions.create(
                model=os.environ["LLM_MODEL"],
                messages=messages,
                extra_body=extra_body,
                max_tokens=8192
            )
            return resp.choices[0].message.content
        except Exception as e:
            if attempt < 3:
                await asyncio.sleep(2.0 * (attempt + 1))
            else:
                raise e

async def embed_func(texts: list[str]) -> np.ndarray:
    client = openai.AsyncOpenAI(
        base_url=os.environ["EMBEDDING_BASE_URL"],
        api_key=os.environ["EMBEDDING_API_KEY"],
        timeout=30.0
    )
    for attempt in range(4):
        try:
            resp = await client.embeddings.create(
                model=os.environ["EMBEDDING_MODEL"],
                input=texts,
                dimensions=int(os.environ["EMBEDDING_DIM"])
            )
            return np.array([item.embedding for item in resp.data])
        except Exception as e:
            if attempt < 3:
                await asyncio.sleep(2.0 * (attempt + 1))
            else:
                raise e

eval_storage = repo_root / "sandbox_storage" / "eval_benchmark" / "rev_1"
eval_storage.mkdir(parents=True, exist_ok=True)

rag = LightRAG(
    working_dir=str(eval_storage),
    llm_model_func=llm_func,
    embedding_func=EmbeddingFunc(
        embedding_dim=int(os.environ["EMBEDDING_DIM"]),
        max_token_size=8192,
        func=embed_func
    )
)

async def main():
    print("--- 1. Initializing Eval LightRAG Storage ---")
    await rag.initialize_storages()
    
    eval_data_dir = repo_root / "eval_data"
    corpus_files = ["operations.md", "api.md", "release.md"]
    doc_ids = {
        "operations.md": "kd_8b6b90b0903f456aabc9b1d076e1e573",
        "api.md": "kd_73784fd4779941918e8ed6cc39c3d7c4",
        "release.md": "kd_2391bf3f27e340b4bd3114fbfbb67f5e"
    }

    status_file = eval_storage / "kv_store_doc_status.json"
    status_data = {}
    if status_file.exists():
        try:
            status_data = json.loads(status_file.read_text())
        except Exception:
            pass

    for fname in corpus_files:
        doc_id = doc_ids[fname]
        doc_info = status_data.get(doc_id, {})
        if doc_info.get("status") == "processed":
            print(f"Document {fname} ({doc_id}) is already PROCESSED, skipping.")
            continue
        
        fpath = eval_data_dir / fname
        text = fpath.read_text(encoding="utf-8")
        print(f"Indexing/Retrying {fname} ({doc_id})...")
        start = time.monotonic()
        await rag.ainsert(text, ids=doc_id, file_paths=fname)
        print(f"Indexed {fname} in {time.monotonic() - start:.2f}s")

    print("\n--- 2. Executing 19 Questions Evaluation ---")
    questions = json.loads((eval_data_dir / "questions.json").read_text(encoding="utf-8"))
    
    results = []
    latencies = []
    recalled_count = 0
    evidence_count = 0
    factual_questions = 0

    for q in questions:
        qid = q["id"]
        query_text = q["query"]
        required = q["required"]
        
        t0 = time.monotonic()
        res = await rag.aquery_data(query_text, param=QueryParam(mode="hybrid", top_k=8))
        elapsed = time.monotonic() - t0
        latencies.append(elapsed)

        chunks = res.get("data", {}).get("chunks", [])
        matched_docs = {c.get("full_doc_id") or c.get("chunk_id", "").split("-")[0] for c in chunks}
        all_preview = "\n".join(c.get("content", "") for c in chunks).casefold()

        # Check required facts
        req_doc_ids = {doc_ids[name] for name in required if name in doc_ids}
        doc_recalled = (req_doc_ids.issubset(matched_docs)) if req_doc_ids else True
        
        facts_ok = True
        if required:
            factual_questions += 1
            for name, facts in required.items():
                for f in facts:
                    if f.casefold() not in all_preview:
                        facts_ok = False
                        break
            if doc_recalled:
                recalled_count += 1
            if facts_ok:
                evidence_count += 1
        
        status_str = "PASS" if (facts_ok and doc_recalled) else "FAIL"
        print(f"[{qid}] {status_str} | Latency: {elapsed:.3f}s | Query: {query_text[:30]}...")
        if not facts_ok:
            print(f"    Missing facts in required: {required}")

        results.append({
            "id": qid,
            "query": query_text,
            "elapsed": round(elapsed, 3),
            "doc_recalled": doc_recalled,
            "evidence_complete": facts_ok,
            "matched_docs": list(matched_docs)
        })

    p50 = float(np.percentile(latencies, 50))
    p95 = float(np.percentile(latencies, 95))
    recall_rate = recalled_count / factual_questions if factual_questions else 1.0
    evidence_rate = evidence_count / factual_questions if factual_questions else 1.0

    print("\n=======================================================")
    print("🎯 BENCHMARK SUMMARY (19 QUESTIONS)")
    print(f"Total Questions: {len(questions)} (Factual: {factual_questions})")
    print(f"Doc Recall@8: {recall_rate * 100:.1f}% ({recalled_count}/{factual_questions})")
    print(f"Evidence Completeness: {evidence_rate * 100:.1f}% ({evidence_count}/{factual_questions})")
    print(f"Latency P50: {p50:.3f}s")
    print(f"Latency P95: {p95:.3f}s")
    print("=======================================================")

    summary = {
        "total_questions": len(questions),
        "factual_questions": factual_questions,
        "recall_at_8": recall_rate,
        "evidence_completeness": evidence_rate,
        "latency_p50": round(p50, 3),
        "latency_p95": round(p95, 3),
        "results": results
    }
    (eval_storage / "benchmark_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print("Saved summary to benchmark_summary.json")

if __name__ == "__main__":
    asyncio.run(main())
