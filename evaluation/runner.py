#!/usr/bin/env python3
"""
Enterprise RAGAS Evaluation CLI Runner.
Dispatches test cases with multi-tenant routing, JWT authentication, and verbose step-by-step traces.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

# Ensure project root in sys.path
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root))

from dotenv import load_dotenv
load_dotenv(repo_root / ".env", override=False)

from evaluation.engine import RAGEvaluationEngine

# Setup Clean Console Logger
logger = logging.getLogger("eval_runner")
logger.setLevel(logging.INFO)
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(sh)


async def obtain_jwt_token(rag_url: str) -> str:
    """Authenticates against /login and acquires a JWT Bearer token."""
    auth_accounts = os.getenv("AUTH_ACCOUNTS", "admin:admin123456")
    username, password = auth_accounts.split(",")[0].split(":", 1)
    login_url = f"{rag_url.rstrip('/')}/login"
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                login_url,
                data={"username": username, "password": password},
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            resp.raise_for_status()
            token = resp.json().get("access_token")
            if token:
                return token
        except Exception as e:
            logger.warning(f"⚠️ 无法通过账号密码自动登录 ({e})，将尝试匿名请求。")
    return ""


async def query_lightrag(
    client: httpx.AsyncClient,
    rag_url: str,
    question: str,
    project_id: str,
    token: str,
    top_k: int = 40,
    mode: str = "mix",
    chunk_top_k: Optional[int] = None,
    enable_rerank: Optional[bool] = None,
    user_prompt: Optional[str] = None,
    max_total_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Queries LightRAG /query with project isolation headers and advanced tuning parameters."""
    headers = {
        "Content-Type": "application/json",
        "X-Project-Id": project_id,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    payload: Dict[str, Any] = {
        "query": question,
        "mode": mode,
        "include_references": True,
        "include_chunk_content": True,
        "response_type": "Multiple Paragraphs",
        "top_k": top_k,
    }
    if chunk_top_k is not None:
        payload["chunk_top_k"] = chunk_top_k
    if enable_rerank is not None:
        payload["enable_rerank"] = enable_rerank
    if user_prompt:
        payload["user_prompt"] = user_prompt
    if max_total_tokens is not None:
        payload["max_total_tokens"] = max_total_tokens

    resp = await client.post(f"{rag_url.rstrip('/')}/query", json=payload, headers=headers)
    resp.raise_for_status()
    data = resp.json()

    answer = data.get("response", "")
    references = data.get("references", [])

    contexts = []
    for ref in references:
        content = ref.get("content", [])
        if isinstance(content, list):
            contexts.extend(content)
        elif isinstance(content, str):
            contexts.append(content)

    return {"answer": answer, "contexts": contexts}


async def run_evaluation(
    dataset_path: Path,
    project_id: str,
    rag_url: str,
    top_k: int = 40,
    concurrency: int = 2,
    mode: str = "mix",
    chunk_top_k: Optional[int] = None,
    enable_rerank: Optional[bool] = None,
    user_prompt: Optional[str] = None,
    max_total_tokens: Optional[int] = None,
):
    print("=" * 80)
    print("🚀 启动独立外挂式多租户 RAGAS 质量评测")
    print(f"   • 评测数据集:  {dataset_path.name}")
    print(f"   • 目标项目ID:  {project_id}")
    print(f"   • 查询检索模式: {mode}")
    print(f"   • 召回候选数:  KG Top-K={top_k}, Chunk Top-K={chunk_top_k or '默认'}")
    print(f"   • 启用重排:    {'是' if enable_rerank is not False else '否'}")
    if user_prompt:
        print(f"   • 自定义提示词: {user_prompt[:50]}...")
    print(f"   • 目标服务:    {rag_url}")
    print(f"   • 并发上限:    {concurrency}")
    print("=" * 80)

    if not dataset_path.exists():
        print(f"❌ 找不到测试集文件: {dataset_path}")
        return

    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    test_cases: List[Dict[str, Any]] = data.get("test_cases", [])
    if not test_cases:
        print("❌ 测试集内容为空！")
        return

    # Step 1: JWT Login
    print(f"\n🔑 [Step 1/3] 正在向 {rag_url} 获取操作令牌...")
    token = await obtain_jwt_token(rag_url)
    if token:
        print("   ✅ 成功获取 JWT Bearer 身份认证令牌！")

    # Step 2: Initialize RAGAS Engine
    print(f"⚙️  [Step 2/3] 初始化 RAGAS 裁判大模型与打分管道...")
    engine = RAGEvaluationEngine()
    print(f"   • 裁判大模型: {engine.eval_model} ({engine.eval_base_url or 'OpenAI'})")
    print(f"   • 裁判向量库: {engine.embedding_model}")

    # Step 3: Dispatch Evaluations
    print(f"\n📊 [Step 3/3] 开始全量用例评测流水线 (共 {len(test_cases)} 题)...")
    semaphore = asyncio.Semaphore(concurrency)
    results = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        for idx, case in enumerate(test_cases, start=1):
            async with semaphore:
                q = case["question"]
                gt = case.get("ground_truth", "")
                # CLI project argument takes strict precedence over dataset hardcoding
                p_id = project_id or case.get("project") or "eval_benchmark"

                print(f"\n--------------------------------------------------------------------------------")
                print(f"👉 [用例 {idx:02d}/{len(test_cases):02d}] 项目: {p_id}")
                print(f"   ❓ 问题: \"{q}\"")

                try:
                    t0 = asyncio.get_event_loop().time()
                    rag_res = await query_lightrag(
                        client,
                        rag_url,
                        q,
                        p_id,
                        token,
                        top_k=top_k,
                        mode=mode,
                        chunk_top_k=chunk_top_k,
                        enable_rerank=enable_rerank,
                        user_prompt=user_prompt,
                        max_total_tokens=max_total_tokens,
                    )
                    latency = round(asyncio.get_event_loop().time() - t0, 2)

                    ans = rag_res["answer"]
                    ctxs = rag_res["contexts"]

                    print(f"   ⏱️  检索完成 ({latency}s) | 命中 {len(ctxs)} 个切片")
                    print(f"   🤖 模型回答: {ans[:120].strip()}...")
                    if ctxs:
                        preview_c = ctxs[0].replace('\n', ' ')[:90]
                        print(f"   📄 首切片片段: {preview_c}...")

                    # Evaluate with RAGAS
                    print(f"   ⚖️  正在由裁判大模型评测 RAGAS 四大维度...")
                    score_res = await engine.evaluate_single_case(idx, q, ans, ctxs, gt, p_id)

                    m = score_res["metrics"]
                    print(f"   🎯 裁决结果: RAGAS Score: {score_res['ragas_score']:.4f} | Status: {score_res['status']}")
                    print(f"      - Faithfulness (保真度):     {m['faithfulness']:.4f}")
                    print(f"      - Context Recall (召回率):   {m['context_recall']:.4f}")
                    print(f"      - Context Precision (信噪比): {m['context_precision']:.4f}")
                    rel_str = f"{m['answer_relevance']:.4f}" if m['answer_relevance'] is not None else "N/A"
                    print(f"      - Answer Relevance (相关度): {rel_str}")

                    results.append(score_res)
                except Exception as e:
                    print(f"   ❌ 执行异常: {e}")
                    results.append({
                        "test_number": idx, "question": q, "project": p_id,
                        "error": str(e), "ragas_score": 0.0, "status": "FAIL",
                        "metrics": {"faithfulness": 0.0, "context_recall": 0.0, "context_precision": 0.0, "answer_relevance": None}
                    })

    # Summary
    stats = engine.calculate_stats(results)
    reports = engine.export_reports(results, stats)

    print("\n" + "=" * 90)
    print("📈 RAGAS 评测最终大表")
    print("=" * 90)
    print(f"{'#':<3} | {'Project':<16} | {'Faith':<7} | {'Recall':<7} | {'Prec':<7} | {'AnswRel':<7} | {'RAGAS':<7} | {'Status'}")
    print("-" * 90)
    for r in results:
        m = r.get("metrics", {})
        rel = f"{m.get('answer_relevance'):.4f}" if m.get("answer_relevance") is not None else "N/A"
        print(f"{r['test_number']:<3} | {r['project'][:16]:<16} | {m.get('faithfulness', 0):<7.4f} | {m.get('context_recall', 0):<7.4f} | {m.get('context_precision', 0):<7.4f} | {rel:<7} | {r['ragas_score']:<7.4f} | {r['status']}")
    print("=" * 90)

    print(f"\n📊 汇总统计 (共 {stats['total']} 题, 成功率: {stats['success_rate']}%):")
    print(f"   • 平均 RAGAS Score:       {stats['avg_ragas_score']:.4f}")
    print(f"   • 平均 Faithfulness:      {stats['avg_faithfulness']:.4f}")
    print(f"   • 平均 Context Recall:    {stats['avg_context_recall']:.4f}")
    print(f"   • 平均 Context Precision: {stats['avg_context_precision']:.4f}")
    print(f"\n📁 报表已生成:")
    print(f"   • CSV 报表:  {reports['csv'].resolve()}")
    print(f"   • JSON 报告: {reports['json'].resolve()}")
    print("=" * 90)


def main():
    parser = argparse.ArgumentParser(description="Run decoupled multi-tenant RAGAS evaluation.")
    parser.add_argument(
        "--project", "-p",
        type=str,
        default="eval_benchmark",
        help="Target Project ID (default: eval_benchmark)",
    )
    parser.add_argument(
        "--dataset", "-d",
        type=str,
        default=str(repo_root / "evaluation" / "datasets" / "sample_lightrag.json"),
        help="Path to evaluation dataset JSON",
    )
    parser.add_argument(
        "--endpoint", "-r",
        type=str,
        default=os.getenv("LIGHTRAG_API_URL", "http://localhost:9621"),
        help="LightRAG server API endpoint (default: http://localhost:9621)",
    )
    parser.add_argument(
        "--concurrency", "-c",
        type=int,
        default=int(os.getenv("EVAL_CONCURRENCY", "2")),
        help="Concurrency level for evaluation (default: 2)",
    )
    parser.add_argument(
        "--mode", "-m",
        type=str,
        default="mix",
        choices=["naive", "local", "global", "hybrid", "mix"],
        help="Query retrieval mode (default: mix)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=40,
        help="KG entities and relations top_k (default: 40)",
    )
    parser.add_argument(
        "--chunk-top-k",
        type=int,
        default=None,
        help="Text chunk top_k (default: 20 in server)",
    )
    parser.add_argument(
        "--enable-rerank",
        dest="enable_rerank",
        action="store_true",
        default=None,
        help="Explicitly enable reranking",
    )
    parser.add_argument(
        "--no-rerank",
        dest="enable_rerank",
        action="store_false",
        help="Explicitly disable reranking",
    )
    parser.add_argument(
        "--user-prompt",
        type=str,
        default=None,
        help="Additional custom prompt instruction appended to user query",
    )
    parser.add_argument(
        "--max-total-tokens",
        type=int,
        default=None,
        help="Max total tokens for context (default: 30000 in server)",
    )

    args = parser.parse_args()
    asyncio.run(run_evaluation(
        dataset_path=Path(args.dataset),
        project_id=args.project,
        rag_url=args.endpoint,
        concurrency=args.concurrency,
        top_k=args.top_k,
        mode=args.mode,
        chunk_top_k=args.chunk_top_k,
        enable_rerank=args.enable_rerank,
        user_prompt=args.user_prompt,
        max_total_tokens=args.max_total_tokens,
    ))


if __name__ == "__main__":
    main()
