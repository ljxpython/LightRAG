#!/usr/bin/env python3
"""
Enterprise DeepEval Quality Evaluation Runner.
Provides threshold-based CI/CD assertions and detailed explainability reasons for LightRAG.
Completely decoupled from official LightRAG source code.
"""

import argparse
import asyncio
import csv
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

# Ensure project root in sys.path
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root))

from dotenv import load_dotenv
load_dotenv(repo_root / ".env", override=False)

# Setup Clean Console Logger
logger = logging.getLogger("deepeval_runner")
logger.setLevel(logging.INFO)
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(sh)


# ----------------------------------------------------------------------
# DeepEval Integration & Custom Judge LLM
# ----------------------------------------------------------------------
try:
    from pydantic import BaseModel
    from deepeval.test_case import LLMTestCase
    from deepeval.models.base_model import DeepEvalBaseLLM
    from deepeval.metrics import (
        FaithfulnessMetric,
        AnswerRelevancyMetric,
        ContextualRecallMetric,
        ContextualPrecisionMetric,
    )
    from langchain_openai import ChatOpenAI
    DEEPEVAL_AVAILABLE = True
except ImportError:
    DEEPEVAL_AVAILABLE = False


class CustomDeepEvalLLM(DeepEvalBaseLLM if DEEPEVAL_AVAILABLE else object):
    """
    Adapts project-configured LLM (DeepSeek / SiliconFlow / OpenAI-compatible)
    for DeepEval Judge Evaluation.
    """

    def __init__(
        self,
        model_name: str,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        max_retries: int = 5,
        timeout: int = 120,
    ):
        self.model_name = model_name
        self.base_url = base_url
        self.api_key = api_key

        kwargs: Dict[str, Any] = {
            "model": model_name,
            "api_key": api_key,
            "max_retries": max_retries,
            "request_timeout": timeout,
        }
        if base_url:
            kwargs["base_url"] = base_url

        self.client = ChatOpenAI(**kwargs)
        if DEEPEVAL_AVAILABLE:
            super().__init__(model_name=model_name)

    def load_model(self):
        return self.client

    def generate(self, prompt: str, schema: Optional[Any] = None, *args, **kwargs) -> Any:
        chat_model = self.load_model()
        if schema is not None:
            try:
                structured = chat_model.with_structured_output(schema)
                return structured.invoke(prompt)
            except Exception as e:
                logger.warning(f"⚠️ 结构化输出失败，降级为常规文本解析 ({e})")
        res = chat_model.invoke(prompt)
        return res.content

    async def a_generate(self, prompt: str, schema: Optional[Any] = None, *args, **kwargs) -> Any:
        chat_model = self.load_model()
        if schema is not None:
            try:
                structured = chat_model.with_structured_output(schema)
                return await structured.ainvoke(prompt)
            except Exception as e:
                logger.warning(f"⚠️ 异步结构化输出失败，降级为常规文本解析 ({e})")
        res = await chat_model.ainvoke(prompt)
        return res.content

    def get_model_name(self) -> str:
        return self.model_name


# ----------------------------------------------------------------------
# API Helper Functions
# ----------------------------------------------------------------------
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
                headers={"Content-Type": "application/x-www-form-urlencoded"},
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


# ----------------------------------------------------------------------
# DeepEval Runner Core Pipeline
# ----------------------------------------------------------------------
async def evaluate_single_case_deepeval(
    idx: int,
    question: str,
    answer: str,
    contexts: List[str],
    ground_truth: str,
    project_id: str,
    judge_llm: CustomDeepEvalLLM,
    threshold: float = 0.7,
) -> Dict[str, Any]:
    """Evaluates a single test case using DeepEval metrics with granular reasons."""
    safe_contexts = [c for c in contexts if c and c.strip()]
    if not safe_contexts:
        safe_contexts = ["No relevant context retrieved from knowledge base."]

    test_case = LLMTestCase(
        input=question,
        actual_output=answer,
        expected_output=ground_truth or answer,
        retrieval_context=safe_contexts,
    )

    metrics_config = [
        ("faithfulness", FaithfulnessMetric(threshold=threshold, model=judge_llm, include_reason=True)),
        ("answer_relevancy", AnswerRelevancyMetric(threshold=threshold, model=judge_llm, include_reason=True)),
        ("contextual_recall", ContextualRecallMetric(threshold=threshold, model=judge_llm, include_reason=True)),
        ("contextual_precision", ContextualPrecisionMetric(threshold=threshold, model=judge_llm, include_reason=True)),
    ]

    metric_scores: Dict[str, Optional[float]] = {}
    metric_reasons: Dict[str, str] = {}
    metric_passed: Dict[str, bool] = {}

    for name, metric in metrics_config:
        try:
            # Measure metric asynchronously
            await metric.a_measure(test_case)
            score = round(float(metric.score), 4) if metric.score is not None else 0.0
            passed = bool(metric.is_successful())
            reason = metric.reason or "No specific reason provided."

            metric_scores[name] = score
            metric_reasons[name] = reason
            metric_passed[name] = passed
        except Exception as e:
            logger.warning(f"   ⚠️ 指标 [{name}] 计算异常: {e}")
            metric_scores[name] = None
            metric_reasons[name] = f"Error during metric evaluation: {str(e)}"
            metric_passed[name] = False

    valid_scores = [v for v in metric_scores.values() if v is not None]
    overall_score = round(sum(valid_scores) / len(valid_scores), 4) if valid_scores else 0.0
    all_passed = all(metric_passed.values())

    return {
        "test_number": idx,
        "question": question,
        "project": project_id,
        "contexts_count": len(safe_contexts),
        "scores": metric_scores,
        "reasons": metric_reasons,
        "passed": metric_passed,
        "overall_score": overall_score,
        "all_passed": all_passed,
        "answer": answer,
        "ground_truth": ground_truth,
    }


def save_deepeval_reports(results: List[Dict[str, Any]], results_dir: Path) -> Tuple[Path, Path]:
    """Saves structured DeepEval metrics and explainability reports as CSV and JSON."""
    results_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_file = results_dir / f"deepeval_report_{timestamp}.csv"
    json_file = results_dir / f"deepeval_report_{timestamp}.json"

    # Save JSON (Full trace with reasons)
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    # Save CSV (Summary tabular)
    fieldnames = [
        "test_number",
        "question",
        "faithfulness",
        "answer_relevancy",
        "contextual_recall",
        "contextual_precision",
        "overall_score",
        "all_passed",
        "contexts_count",
    ]
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            scores = r.get("scores", {})
            writer.writerow({
                "test_number": r["test_number"],
                "question": r["question"][:50] + "..." if len(r["question"]) > 50 else r["question"],
                "faithfulness": scores.get("faithfulness", "N/A"),
                "answer_relevancy": scores.get("answer_relevancy", "N/A"),
                "contextual_recall": scores.get("contextual_recall", "N/A"),
                "contextual_precision": scores.get("contextual_precision", "N/A"),
                "overall_score": r.get("overall_score", 0.0),
                "all_passed": "PASS" if r.get("all_passed") else "FAIL",
                "contexts_count": r.get("contexts_count", 0),
            })

    return csv_file, json_file


async def run_deepeval_suite(
    dataset_path: Path,
    project_id: str,
    rag_url: str,
    top_k: int = 40,
    concurrency: int = 2,
    threshold: float = 0.7,
    limit: Optional[int] = None,
    mode: str = "mix",
    chunk_top_k: Optional[int] = None,
    enable_rerank: Optional[bool] = None,
    user_prompt: Optional[str] = None,
    max_total_tokens: Optional[int] = None,
):
    print("=" * 80)
    print("🎯 启动独立外挂式 DeepEval 工业级断言与诊断评测")
    print(f"   • 评测数据集:  {dataset_path.name}")
    print(f"   • 目标项目ID:  {project_id}")
    print(f"   • 查询检索模式: {mode}")
    print(f"   • 召回候选数:  KG Top-K={top_k}, Chunk Top-K={chunk_top_k or '默认'}")
    print(f"   • 启用重排:    {'是' if enable_rerank is not False else '否'}")
    if user_prompt:
        print(f"   • 自定义提示词: {user_prompt[:50]}...")
    print(f"   • 目标服务:    {rag_url}")
    print(f"   • 断言阈值:    {threshold} (>= {threshold} 为 PASS)")
    print(f"   • 并发限制:    {concurrency}")
    print("=" * 80)

    if not DEEPEVAL_AVAILABLE:
        print("❌ 未检测到 deepeval 依赖！请运行: pip install deepeval")
        return

    if not dataset_path.exists():
        print(f"❌ 找不到测试集文件: {dataset_path}")
        return

    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    test_cases: List[Dict[str, Any]] = data.get("test_cases", [])
    if limit is not None and limit > 0:
        test_cases = test_cases[:limit]
    if not test_cases:
        print("❌ 测试集内容为空！")
        return

    # Step 1: JWT Authentication
    print(f"\n🔑 [Step 1/3] 正在向 {rag_url} 获取操作令牌...")
    token = await obtain_jwt_token(rag_url)
    if token:
        print("   ✅ 成功获取 JWT Bearer 身份认证令牌！")

    # Step 2: Initialize DeepEval Judge Model
    print(f"⚙️  [Step 2/3] 初始化 DeepEval 裁判大模型 (DeepEvalBaseLLM)...")
    model_name = os.getenv("EVAL_LLM_MODEL") or os.getenv("LLM_MODEL", "deepseek-v4.1-flash")
    base_url = os.getenv("EVAL_LLM_BINDING_HOST") or os.getenv("LLM_BASE_URL", "")
    api_key = os.getenv("EVAL_LLM_BINDING_API_KEY") or os.getenv("LLM_API_KEY", "")

    judge_llm = CustomDeepEvalLLM(
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
    )
    print(f"   • 裁判模型:    {model_name} ({base_url or 'OpenAI Default'})")

    # Step 3: Run Evaluation Pipeline
    print(f"\n📊 [Step 3/3] 开始全量 DeepEval 断言评测 (共 {len(test_cases)} 题)...")
    semaphore = asyncio.Semaphore(concurrency)
    results = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        for idx, case in enumerate(test_cases, start=1):
            async with semaphore:
                q = case["question"]
                gt = case.get("ground_truth", "")
                p_id = project_id or case.get("project") or "eval_benchmark"

                print(f"\n--------------------------------------------------------------------------------")
                print(f"👉 [用例 {idx:02d}/{len(test_cases):02d}] 项目: {p_id}")
                print(f"   ❓ 问题: \"{q}\"")

                try:
                    t0 = time.time()
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
                    latency = round(time.time() - t0, 2)

                    ans = rag_res["answer"]
                    ctxs = rag_res["contexts"]

                    print(f"   ⚡ RAG 响应完成 (耗时 {latency}s, 提取到 {len(ctxs)} 个切片)")
                    print(f"   💬 回答摘要: {ans[:100]}..." if len(ans) > 100 else f"   💬 回答: {ans}")

                    # Measure via DeepEval
                    print(f"   ⚖️  DeepEval 裁判打分与深度诊断分析中...")
                    res = await evaluate_single_case_deepeval(
                        idx=idx,
                        question=q,
                        answer=ans,
                        contexts=ctxs,
                        ground_truth=gt,
                        project_id=p_id,
                        judge_llm=judge_llm,
                        threshold=threshold,
                    )
                    results.append(res)

                    # Print Granular Metrics and Reasons
                    scores = res["scores"]
                    reasons = res["reasons"]
                    passed = res["passed"]

                    print(f"   📈 指标与诊断分析:")
                    for m_name in ["faithfulness", "answer_relevancy", "contextual_recall", "contextual_precision"]:
                        s = scores.get(m_name)
                        status_str = "✅ PASS" if passed.get(m_name) else "❌ FAIL"
                        score_str = f"{s:.4f}" if s is not None else "N/A"
                        print(f"      • {m_name:<20}: {score_str} [{status_str}]")
                        r = reasons.get(m_name)
                        if r and r != "No specific reason provided.":
                            print(f"        └─ 🔍 理由: {r}")

                    status_badge = "✅ ALL PASS" if res["all_passed"] else "⚠️ SOME FAILED"
                    print(f"   🏁 综合得分: {res['overall_score']:.4f} | 最终断言: {status_badge}")

                except Exception as e:
                    print(f"   ❌ 用例 {idx} 执行异常: {e}")
                    results.append({
                        "test_number": idx,
                        "question": q,
                        "project": p_id,
                        "scores": {},
                        "reasons": {"error": str(e)},
                        "passed": {},
                        "overall_score": 0.0,
                        "all_passed": False,
                        "error": str(e),
                    })

    # Summary Report
    results_dir = Path(__file__).parent / "results"
    csv_path, json_path = save_deepeval_reports(results, results_dir)

    print("\n" + "=" * 80)
    print("🏆 DeepEval 评测全量执行完毕！汇总统计:")
    total_cases = len(results)
    success_cases = sum(1 for r in results if r.get("all_passed"))
    
    # Calculate Averages
    avg_scores = {}
    for m in ["faithfulness", "answer_relevancy", "contextual_recall", "contextual_precision"]:
        vals = [r["scores"][m] for r in results if r.get("scores", {}).get(m) is not None]
        avg_scores[m] = sum(vals) / len(vals) if vals else 0.0

    print(f"   • 测试总题数:      {total_cases}")
    print(f"   • 全额通过题数:    {success_cases}/{total_cases} (通过率: {success_cases/total_cases*100:.1f}%)")
    print(f"   • 平均忠实度:      {avg_scores['faithfulness']:.4f}")
    print(f"   • 平均回答相关度:  {avg_scores['answer_relevancy']:.4f}")
    print(f"   • 平均上下文召回率: {avg_scores['contextual_recall']:.4f}")
    print(f"   • 平均上下文精确度: {avg_scores['contextual_precision']:.4f}")
    print(f"   • 报表保存 (CSV):  {csv_path}")
    print(f"   • 报表保存 (JSON): {json_path}")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Run DeepEval Evaluation for LightRAG")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path(__file__).parent / "datasets" / "sample_lightrag.json",
        help="Path to evaluation dataset JSON",
    )
    parser.add_argument(
        "--project",
        type=str,
        default="eval_benchmark",
        help="Target LightRAG project/workspace ID",
    )
    parser.add_argument(
        "--rag-url",
        type=str,
        default=os.getenv("RAG_SERVICE_URL", "http://localhost:9621"),
        help="Base URL of LightRAG server",
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
        "--mode", "-m",
        type=str,
        default="mix",
        choices=["naive", "local", "global", "hybrid", "mix"],
        help="Query retrieval mode (default: mix)",
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
    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Number of concurrent evaluation queries",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.7,
        help="DeepEval metric pass/fail threshold",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of test cases to evaluate (useful for rapid probing)",
    )

    args = parser.parse_args()

    asyncio.run(
        run_deepeval_suite(
            dataset_path=args.dataset,
            project_id=args.project,
            rag_url=args.rag_url,
            top_k=args.top_k,
            concurrency=args.concurrency,
            threshold=args.threshold,
            limit=args.limit,
            mode=args.mode,
            chunk_top_k=args.chunk_top_k,
            enable_rerank=args.enable_rerank,
            user_prompt=args.user_prompt,
            max_total_tokens=args.max_total_tokens,
        )
    )


if __name__ == "__main__":
    main()
