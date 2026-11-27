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
import random
import re
import sys
import time
from contextlib import contextmanager, nullcontext
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import mlflow
except ImportError:
    mlflow = None

# 强制行缓冲推流
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

import httpx

# Ensure project root in sys.path
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root))

from dotenv import load_dotenv
load_dotenv(repo_root / ".env", override=False)

from evaluation.mlflow_adapter import MLflowEvaluationTracker

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

        max_tokens = int(os.getenv("EVAL_JUDGE_MAX_TOKENS", "4096"))
        kwargs: Dict[str, Any] = {
            "model": model_name,
            "api_key": api_key,
            "max_retries": max_retries,
            "request_timeout": timeout,
            "max_tokens": max_tokens,
        }
        if base_url:
            kwargs["base_url"] = base_url

        self.client = ChatOpenAI(**kwargs)
        if DEEPEVAL_AVAILABLE:
            super().__init__(model_name=model_name)

    def load_model(self):
        return self.client

    @staticmethod
    def _repair_and_extract_json(text: str, schema: Optional[Any] = None) -> Any:
        """Robustly extracts, repairs, and deserializes JSON from potentially truncated or malformed LLM outputs."""
        if not text or not isinstance(text, str):
            return text
        raw = text.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()

        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        json_candidate = cleaned[start:end] if (start != -1 and end > start) else cleaned

        parsed_data = None
        # 1. 尝试直接解析
        try:
            parsed_data = json.loads(json_candidate)
        except Exception:
            # 2. 尝试剔除尾随逗号
            try:
                fixed = re.sub(r",\s*([\]}])", r"\1", json_candidate)
                parsed_data = json.loads(fixed)
            except Exception:
                # 3. 尝试闭合由于 token 截断导致缺失的引号和括号
                try:
                    open_braces = json_candidate.count("{") - json_candidate.count("}")
                    open_brackets = json_candidate.count("[") - json_candidate.count("]")
                    quote_count = json_candidate.count('"') - json_candidate.count(r'\"')
                    closing = ""
                    if quote_count % 2 != 0:
                        closing += '"'
                    closing += "]" * max(0, open_brackets)
                    closing += "}" * max(0, open_braces)
                    fixed_closed = json_candidate + closing
                    fixed_closed = re.sub(r",\s*([\]}])", r"\1", fixed_closed)
                    parsed_data = json.loads(fixed_closed)
                except Exception:
                    pass

        # 4. 若解析出字典，且目标 schema 存在，优先反序列化为 Pydantic 实例（直接满足 DeepEval 类型断言）
        if parsed_data is not None:
            if schema is not None:
                try:
                    if hasattr(schema, "model_validate"):
                        return schema.model_validate(parsed_data)
                    elif hasattr(schema, "parse_obj"):
                        return schema.parse_obj(parsed_data)
                    else:
                        return schema(**parsed_data)
                except Exception as val_err:
                    logger.debug(f"Pydantic schema 兜底校验未匹配: {val_err}")
            try:
                return json.dumps(parsed_data, ensure_ascii=False)
            except Exception:
                pass

        return raw

    def generate(self, prompt: str, schema: Optional[Any] = None, *args, **kwargs) -> Any:
        chat_model = self.load_model()
        if schema is not None:
            try:
                structured = chat_model.with_structured_output(schema)
                return structured.invoke(prompt)
            except Exception as e:
                logger.warning(f"⚠️ 结构化输出失败，降级为常规文本解析 ({e})")
        res = chat_model.invoke(prompt)
        return self._repair_and_extract_json(res.content, schema=schema)

    async def a_generate(self, prompt: str, schema: Optional[Any] = None, *args, **kwargs) -> Any:
        chat_model = self.load_model()
        for attempt in range(3):
            try:
                if schema is not None:
                    try:
                        structured = chat_model.with_structured_output(schema)
                        return await structured.ainvoke(prompt)
                    except Exception as e:
                        ex_sub = str(e).lower()
                        if "429" in ex_sub or "rate" in ex_sub:
                            raise e
                        logger.warning(f"⚠️ 异步结构化输出失败，降级为常规文本解析 ({e})")
                res = await chat_model.ainvoke(prompt)
                return self._repair_and_extract_json(res.content, schema=schema)
            except Exception as ex:
                ex_str = str(ex).lower()
                if ("429" in ex_str or "rate limit" in ex_str or "too many requests" in ex_str) and attempt < 2:
                    wait_sec = random.uniform(1.5, 3.5) * (attempt + 1)
                    logger.warning(f"⚠️ 遭遇裁判大模型 429 速率限制，随机退避 {wait_sec:.2f}s 后重试 (第 {attempt+1} 次)...")
                    await asyncio.sleep(wait_sec)
                    continue
                raise ex

    def get_model_name(self) -> str:
        return self.model_name


class RefusalAssertionMetric:
    """
    Evaluates whether the RAG system abstains from answering when facts
    are absent in the retrieved knowledge base (Huawei RGB Negative Rejection standard).
    """

    REFUSAL_PATTERNS = [
        "无法回答", "未提及", "没有提及", "未收录", "资料不足", "资料中无", "未包含",
        "无相关信息", "抱歉", "未能提供", "未能找到", "无法确认", "未找到相关",
        "根据已知资料，未", "根据现有资料，未", "无法基于提供", "没有提到",
        "cannot answer", "not mentioned", "no information", "insufficient", "unable to answer"
    ]

    def __init__(self, threshold: float = 0.7):
        self.threshold = threshold
        self.score: Optional[float] = None
        self.reason: Optional[str] = None

    async def a_measure(self, test_case: Any) -> float:
        actual = (test_case.actual_output or "").lower()
        is_refusal = any(pat.lower() in actual for pat in self.REFUSAL_PATTERNS)
        if is_refusal:
            self.score = 1.0
            self.reason = "系统准确识别资料中无对应事实并明确拒答，有效抵御未登录知识幻觉。"
        else:
            self.score = 0.0
            self.reason = "系统在背景资料缺失的情况下产生妄断推测（幻觉），未能做出正确拒答。"
        return self.score

    def is_successful(self) -> bool:
        return self.score is not None and self.score >= self.threshold


class CounterfactualAssertionMetric:
    """
    Evaluates whether the RAG system resists counterfactual distortion or identifies
    factual errors injected into the context (Huawei RGB Counterfactual Robustness standard).
    """

    ERROR_DETECTION_PATTERNS = [
        "资料有误", "信息有误", "事实错误", "存在错误", "不准确", "伪造", "并非",
        "factual error", "incorrect in the provided", "document contains an error"
    ]

    def __init__(self, fake_answer: str = "", threshold: float = 0.7):
        self.fake_answer = (fake_answer or "").strip()
        self.threshold = threshold
        self.score: Optional[float] = None
        self.reason: Optional[str] = None

    async def a_measure(self, test_case: Any) -> float:
        actual = (test_case.actual_output or "").lower()
        expected = (test_case.expected_output or "").lower()
        fake = self.fake_answer.lower()

        # 1. Check if model explicitly detected error in materials
        detected_error = any(pat.lower() in actual for pat in self.ERROR_DETECTION_PATTERNS)
        if detected_error:
            self.score = 1.0
            self.reason = "模型成功识别输入资料中的事实错误并指出 (Error Detection)。"
            return self.score

        # 2. Check if model resists counterfactual fake answer and preserves ground truth
        if fake and fake in actual:
            self.score = 0.0
            self.reason = f"模型被反事实错误资料误导，输出了伪造答案: '{self.fake_answer}'。"
        elif expected and expected in actual:
            self.score = 1.0
            self.reason = "模型未被伪造事实带偏，准确输出了正确事实答案 (Resisted Counterfactual)。"
        else:
            self.score = 0.5
            self.reason = "模型既未指出材料错误，也未完全采信虚假答案，处于中立表述。"
        return self.score

    def is_successful(self) -> bool:
        return self.score is not None and self.score >= self.threshold


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
    import urllib.parse
    headers = {
        "Content-Type": "application/json",
        "X-Project-Id": urllib.parse.quote(str(project_id)),
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

    query_url = f"{rag_url.rstrip('/')}/query?project_id={urllib.parse.quote(str(project_id))}"
    resp = await client.post(query_url, json=payload, headers=headers)
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
    challenge_type: Optional[str] = None,
    assertion_rule: Optional[str] = None,
    fake_answer: Optional[str] = None,
    mode: Optional[str] = None,
) -> Dict[str, Any]:
    """Evaluates a single test case using DeepEval metrics with granular reasons."""
    # 对切片进行安全保护，防止单个超大切片或过多切片挤爆裁判大模型上下文与输出 Token
    max_chunk_chars = int(os.getenv("EVAL_MAX_CHUNK_CHARS", "3000"))
    max_contexts = int(os.getenv("EVAL_MAX_CONTEXTS", "15"))
    safe_contexts = []
    for c in contexts[:max_contexts]:
        if c and c.strip():
            c_str = c.strip()
            if len(c_str) > max_chunk_chars:
                c_str = c_str[:max_chunk_chars - 1000] + "\n...[切片超长保护截断]...\n" + c_str[-800:]
            safe_contexts.append(c_str)
    if not safe_contexts:
        safe_contexts = ["No relevant context retrieved from knowledge base."]

    test_case = LLMTestCase(
        input=question,
        actual_output=answer,
        expected_output=ground_truth or answer,
        retrieval_context=safe_contexts,
    )

    metrics_config: List[Tuple[str, Any]] = [
        ("faithfulness", FaithfulnessMetric(threshold=threshold, model=judge_llm, include_reason=True)),
        ("answer_relevancy", AnswerRelevancyMetric(threshold=threshold, model=judge_llm, include_reason=True)),
        ("contextual_recall", ContextualRecallMetric(threshold=threshold, model=judge_llm, include_reason=True)),
        ("contextual_precision", ContextualPrecisionMetric(threshold=threshold, model=judge_llm, include_reason=True)),
    ]

    # Huawei RGB Benchmark specialized assertions
    if assertion_rule == "must_refuse" or challenge_type == "negative_rejection":
        metrics_config.append(("refusal_assertion", RefusalAssertionMetric(threshold=threshold)))
    elif assertion_rule == "detect_error_or_resist_counterfactual" or challenge_type == "counterfactual_robustness":
        metrics_config.append(("counterfactual_assertion", CounterfactualAssertionMetric(fake_answer=fake_answer or "", threshold=threshold)))

    metric_scores: Dict[str, Optional[float]] = {}
    metric_reasons: Dict[str, str] = {}
    metric_passed: Dict[str, bool] = {}
    metric_latencies: Dict[str, float] = {}

    # 从环境变量读取裁判单指标熔断超时，默认放宽至 180 秒
    metric_timeout = float(os.getenv("EVAL_METRIC_TIMEOUT_SECONDS", "180.0"))
    judge_t0 = time.time()

    async def _measure_one(name, metric):
        m_t0 = time.time()
        try:
            await asyncio.wait_for(metric.a_measure(test_case), timeout=metric_timeout)
            score = round(float(metric.score), 4) if metric.score is not None else 0.0
            passed = bool(metric.is_successful())
            reason = metric.reason or "No specific reason provided."
            dur = round(time.time() - m_t0, 2)
            return name, score, passed, reason, dur
        except asyncio.TimeoutError:
            dur = round(time.time() - m_t0, 2)
            logger.warning(f"   ⚠️ 指标 [{name}] 评分超时 ({int(metric_timeout)}s 熔断保护生效)")
            return name, None, False, f"Metric evaluation timed out after {int(metric_timeout)}s.", dur
        except Exception as e:
            dur = round(time.time() - m_t0, 2)
            logger.warning(f"   ⚠️ 指标 [{name}] 计算异常: {e}")
            return name, None, False, f"Error during metric evaluation: {str(e)}", dur

    metric_results = await asyncio.gather(*[_measure_one(n, m) for n, m in metrics_config])
    judge_total_duration = round(time.time() - judge_t0, 2)
    for name, score, passed, reason, dur in metric_results:
        metric_scores[name] = score
        metric_passed[name] = passed
        metric_reasons[name] = reason
        metric_latencies[name] = dur

    valid_scores = [v for v in metric_scores.values() if v is not None]
    overall_score = round(sum(valid_scores) / len(valid_scores), 4) if valid_scores else 0.0
    all_passed = all(metric_passed.values())

    return {
        "test_number": idx,
        "question": question,
        "project": project_id,
        "mode": mode,
        "contexts_count": len(safe_contexts),
        "contexts": safe_contexts,  # 检索侧真实召回切片原文，供用户在报告与前端检视
        "scores": metric_scores,
        "reasons": metric_reasons,
        "passed": metric_passed,
        "metric_latencies": metric_latencies,
        "judge_duration_seconds": judge_total_duration,
        "overall_score": overall_score,
        "all_passed": all_passed,
        "answer": answer,  # 生成侧大模型回答
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
        "rag_duration_seconds",
        "judge_duration_seconds",
        "total_duration_seconds",
        "faithfulness",
        "answer_relevancy",
        "contextual_recall",
        "contextual_precision",
        "refusal_assertion",
        "counterfactual_assertion",
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
                "rag_duration_seconds": r.get("rag_duration_seconds", 0.0),
                "judge_duration_seconds": r.get("judge_duration_seconds", 0.0),
                "total_duration_seconds": r.get("total_duration_seconds", 0.0),
                "faithfulness": scores.get("faithfulness", "N/A"),
                "answer_relevancy": scores.get("answer_relevancy", "N/A"),
                "contextual_recall": scores.get("contextual_recall", "N/A"),
                "contextual_precision": scores.get("contextual_precision", "N/A"),
                "refusal_assertion": scores.get("refusal_assertion", "N/A"),
                "counterfactual_assertion": scores.get("counterfactual_assertion", "N/A"),
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
    mlflow_enabled: bool = True,
    experiment_name: Optional[str] = None,
    mlflow_tracking_uri: Optional[str] = None,
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
    print(f"   • MLflow 上报: {'开启 (' + (mlflow_tracking_uri or 'http://49.233.222.54:9128') + ')' if mlflow_enabled else '关闭'}")
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

    # Bloodline & Lineage Validation Guard
    manifest = data.get("corpus_manifest")
    if manifest:
        print("\n🛡️ [Lineage Guard] 正在核查评测集数据血缘契约...")
        bound_project = manifest.get("project_id")
        rev_id = manifest.get("revision_id")
        hash_sig = manifest.get("snapshot_hash", "")
        print(f"   • 签约项目:  {bound_project} (修订号: {rev_id})")
        print(f"   • 文档指纹:  {hash_sig[:30]}...")
        print(f"   • 语料规模:  共包含 {manifest.get('total_docs', 0)} 篇物理入库文档")
        if bound_project and bound_project != project_id:
            storage_base = repo_root / "sandbox_storage" / "__default"
            curr_target = storage_base / project_id
            bound_target = storage_base / bound_project
            if bound_target.exists() and (not curr_target.exists() or sum(f.stat().st_size for f in curr_target.glob("**/*") if f.is_file()) < 50000):
                print(f"   🔄 [血缘自愈切换] 检测到当前指定项目【{project_id}】物理语料为空，自动对齐为签约绑定的真实语料项目【{bound_project}】！")
                project_id = bound_project
            else:
                logger.warning(f"⚠️ [血缘告警] 评测集声明绑定项目为【{bound_project}】，当前运行指定为【{project_id}】，请注意避免测试误判！")
        else:
            print("   ✅ 血缘指纹与目标项目 100% 契合！")

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

    # 提前初始化 MLflow Tracker，建立包含全生命周期的 Run 作用域以支持单题 Span 级联 Trace 收集
    tracker = None
    if mlflow_enabled:
        tracker = MLflowEvaluationTracker(
            tracking_uri=mlflow_tracking_uri,
            experiment_name=experiment_name,
            enabled=True,
        )

    run_name = f"deepeval_{project_id}_{mode}_topk{top_k}"
    run_cm = (
        tracker.start_run(run_name=run_name, tags={"framework": "DeepEval", "project": project_id, "mode": mode})
        if (tracker and tracker.enabled)
        else nullcontext()
    )

    @contextmanager
    def safe_span(name: str, span_type: str = "CHAIN", inputs: Optional[Dict[str, Any]] = None):
        """安全创建 MLflow Trace Span，任何异常静默降级不阻断评测核心链路。"""
        if not (mlflow and tracker and tracker.enabled and tracker.active_run):
            yield None
            return
        try:
            with mlflow.start_span(name=name, span_type=span_type) as sp:
                if inputs:
                    try:
                        sp.set_inputs(inputs)
                    except Exception:
                        pass
                yield sp
        except Exception as ex:
            logger.debug(f"Span {name} exception: {ex}")
            yield None

    with run_cm:
        # Step 3: Run Evaluation Pipeline
        suite_t0 = time.time()
        print(f"\n📊 [Step 3/3] 开始全量 DeepEval 断言评测 (共 {len(test_cases)} 题，协程并发度: {concurrency})...", flush=True)
        semaphore = asyncio.Semaphore(concurrency)
        completed_cases = 0

        async with httpx.AsyncClient(timeout=120.0) as client:
            async def _eval_case_worker(idx: int, case: Dict[str, Any], total_cases: int) -> Dict[str, Any]:
                nonlocal completed_cases
                q = case["question"]
                gt = case.get("ground_truth", "")
                p_id = project_id or case.get("project") or "eval_benchmark"

                async with semaphore:
                    print(f"\n--------------------------------------------------------------------------------", flush=True)
                    print(f"👉 [用例 {idx:02d}/{total_cases:02d}] 项目: {p_id}", flush=True)
                    print(f"   ❓ 问题: \"{q}\"", flush=True)

                    trace_id = None
                    trace_url = None

                    with safe_span(
                        f"eval_case_#{idx:02d}",
                        span_type="CHAIN",
                        inputs={
                            "question": q,
                            "ground_truth": gt,
                            "project_id": p_id,
                            "mode": mode,
                            "top_k": top_k,
                        },
                    ) as root_span:
                        try:
                            # 子 Span 1: LightRAG 检索
                            with safe_span(
                                "lightrag_retrieval",
                                span_type="RETRIEVER",
                                inputs={"query": q, "mode": mode, "top_k": top_k, "project_id": p_id},
                            ) as ret_span:
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
                                if ret_span:
                                    ret_span.set_outputs({
                                        "contexts_count": len(ctxs),
                                        "latency_seconds": latency,
                                        "contexts_preview": [c[:300] for c in ctxs[:5]],
                                    })

                            print(f"   ⚡ RAG 响应完成 (耗时 {latency}s, 提取到 {len(ctxs)} 个切片)", flush=True)
                            print(f"   💬 回答摘要: {ans[:100]}..." if len(ans) > 100 else f"   💬 回答: {ans}", flush=True)

                            # 子 Span 2: RAG 生成结果映射
                            with safe_span(
                                "rag_generation",
                                span_type="LLM",
                                inputs={
                                    "contexts_count": len(ctxs),
                                    "prompt_instruction": user_prompt or "Default LightRAG Query",
                                },
                            ) as gen_span:
                                if gen_span:
                                    gen_span.set_outputs({
                                        "answer": ans,
                                        "answer_length": len(ans),
                                    })

                            # 子 Span 3: DeepEval 裁判打分与深度诊断
                            print(f"   ⚖️  DeepEval 裁判打分与深度诊断分析中...", flush=True)
                            c_type = case.get("challenge_type")
                            a_rule = case.get("assertion_rule")
                            fake_ans = case.get("counterfactual_fake_answer")

                            with safe_span(
                                "deepeval_judgement",
                                span_type="EVALUATOR",
                                inputs={
                                    "actual_output": ans,
                                    "expected_output": gt,
                                    "threshold": threshold,
                                    "challenge_type": c_type,
                                },
                            ) as judge_span:
                                res = await evaluate_single_case_deepeval(
                                    idx=idx,
                                    question=q,
                                    answer=ans,
                                    contexts=ctxs,
                                    ground_truth=gt,
                                    project_id=p_id,
                                    judge_llm=judge_llm,
                                    threshold=threshold,
                                    challenge_type=c_type,
                                    assertion_rule=a_rule,
                                    fake_answer=fake_ans,
                                    mode=mode,
                                )
                                if judge_span:
                                    judge_span.set_outputs({
                                        "overall_score": res.get("overall_score"),
                                        "all_passed": res.get("all_passed"),
                                        "passed": res.get("passed"),
                                        "scores": res.get("scores"),
                                        "reasons": res.get("reasons"),
                                        "judge_duration_seconds": res.get("judge_duration_seconds", 0.0),
                                    })

                            res["rag_duration_seconds"] = latency
                            judge_dur = res.get("judge_duration_seconds", 0.0)
                            total_dur = round(latency + judge_dur, 2)
                            res["total_duration_seconds"] = total_dur

                            if root_span:
                                root_span.set_outputs({
                                    "overall_score": res["overall_score"],
                                    "all_passed": res["all_passed"],
                                    "rag_duration_seconds": latency,
                                    "judge_duration_seconds": judge_dur,
                                    "total_duration_seconds": total_dur,
                                })
                                try:
                                    trace_id = getattr(root_span, "request_id", None)
                                    if trace_id and tracker and tracker.tracking_uri:
                                        trace_url = f"{tracker.tracking_uri.rstrip('/')}/#/experiments/{tracker.experiment_id}/traces/{trace_id}"
                                except Exception:
                                    pass

                            if trace_id:
                                res["trace_id"] = trace_id
                            if trace_url:
                                res["trace_url"] = trace_url

                            # Print Granular Metrics and Reasons
                            scores = res["scores"]
                            reasons = res["reasons"]
                            passed = res["passed"]

                            print(f"   📈 指标与诊断分析 (评测耗时: {judge_dur}s | 单题端到端耗时: {total_dur}s):", flush=True)
                            for m_name in scores.keys():
                                s = scores.get(m_name)
                                status_str = "✅ PASS" if passed.get(m_name) else "❌ FAIL"
                                score_str = f"{s:.4f}" if s is not None else "N/A"
                                m_dur = res.get("metric_latencies", {}).get(m_name, 0.0)
                                print(f"      • {m_name:<25}: {score_str} [{status_str}] ({m_dur}s)", flush=True)
                                r = reasons.get(m_name)
                                if r and r != "No specific reason provided.":
                                    print(f"        └─ 🔍 理由: {r}", flush=True)

                            status_badge = "✅ ALL PASS" if res["all_passed"] else "⚠️ SOME FAILED"
                            trace_badge = f" | 🔗 Trace: {trace_id}" if trace_id else ""
                            print(f"   🏁 [用例 {idx:02d}] 综合得分: {res['overall_score']:.4f} | 最终断言: {status_badge} | ⏱️ 耗时 {total_dur}s{trace_badge}", flush=True)

                        except Exception as e:
                            print(f"   ❌ 用例 {idx} 执行异常: {e}", flush=True)
                            if root_span:
                                try:
                                    trace_id = getattr(root_span, "request_id", None)
                                    if trace_id and tracker and tracker.tracking_uri:
                                        trace_url = f"{tracker.tracking_uri.rstrip('/')}/#/experiments/{tracker.experiment_id}/traces/{trace_id}"
                                except Exception:
                                    pass
                            res = {
                                "test_number": idx,
                                "question": q,
                                "project": p_id,
                                "ground_truth": gt,
                                "answer": "未返回回答内容（执行异常）",
                                "contexts": [],
                                "contexts_count": 0,
                                "scores": {},
                                "reasons": {"error": f"用例执行异常: {str(e)}"},
                                "passed": {},
                                "overall_score": 0.0,
                                "all_passed": False,
                                "rag_duration_seconds": 0.0,
                                "judge_duration_seconds": 0.0,
                                "total_duration_seconds": 0.0,
                                "error": str(e),
                            }
                            if trace_id:
                                res["trace_id"] = trace_id
                            if trace_url:
                                res["trace_url"] = trace_url

                    completed_cases += 1
                    prog = min(90, int((completed_cases / total_cases) * 90))
                    print(f"[PROGRESS: {prog}%]", flush=True)
                    return res

            gathered_results = await asyncio.gather(
                *[_eval_case_worker(idx, case, len(test_cases)) for idx, case in enumerate(test_cases, start=1)]
            )
            results = list(gathered_results)
            results.sort(key=lambda r: r.get("test_number", 0))

        # Summary Report
        results_dir = Path(__file__).parent / "results"
        csv_path, json_path = save_deepeval_reports(results, results_dir)

        print("\n" + "=" * 80)
        print("🏆 DeepEval 评测全量执行完毕！汇总统计:")
        total_cases = len(results)
        success_cases = sum(1 for r in results if r.get("all_passed"))
        
        # Calculate Averages and Latencies
        avg_scores = {}
        for m in ["faithfulness", "answer_relevancy", "contextual_recall", "contextual_precision"]:
            vals = [r["scores"][m] for r in results if r.get("scores", {}).get(m) is not None]
            avg_scores[m] = sum(vals) / len(vals) if vals else 0.0

        suite_duration = round(time.time() - suite_t0, 2)
        avg_case_duration = round(sum(r.get("total_duration_seconds", 0.0) for r in results) / total_cases, 2) if total_cases else 0.0
        avg_rag_duration = round(sum(r.get("rag_duration_seconds", 0.0) for r in results) / total_cases, 2) if total_cases else 0.0
        avg_judge_duration = round(sum(r.get("judge_duration_seconds", 0.0) for r in results) / total_cases, 2) if total_cases else 0.0

        print(f"   • 测试总题数:      {total_cases}")
        print(f"   • 全额通过题数:    {success_cases}/{total_cases} (通过率: {success_cases/total_cases*100:.1f}%)")
        print(f"   • 平均忠实度:      {avg_scores['faithfulness']:.4f}")
        print(f"   • 平均回答相关度:  {avg_scores['answer_relevancy']:.4f}")
        print(f"   • 平均上下文召回率: {avg_scores['contextual_recall']:.4f}")
        print(f"   • 平均上下文精确度: {avg_scores['contextual_precision']:.4f}")
        print(f"   • ⏱️ 打擂总耗时:   {suite_duration}s (并发度: {concurrency})")
        print(f"   • ⚡ 题均综合耗时: {avg_case_duration}s (RAG检索: {avg_rag_duration}s | 裁判质检: {avg_judge_duration}s)")
        print(f"   • 报表保存 (CSV):  {csv_path}")
        print(f"   • 报表保存 (JSON): {json_path}")
        print("=" * 80)

        # Step 4: MLflow Tracking Integration
        if tracker and tracker.enabled and tracker.active_run:
            print("\n📡 [Step 4/4] 正在将评测指标、超参数与推理证据链同步至 MLflow 平台...")
            tracker.log_params({
                "project": project_id,
                "mode": mode,
                "top_k": top_k,
                "chunk_top_k": chunk_top_k,
                "enable_rerank": enable_rerank,
                "threshold": threshold,
                "dataset": dataset_path.name,
                "total_cases": total_cases,
                "concurrency": concurrency,
            })
            tracker.log_metrics({
                "faithfulness": avg_scores["faithfulness"],
                "answer_relevancy": avg_scores["answer_relevancy"],
                "contextual_recall": avg_scores["contextual_recall"],
                "contextual_precision": avg_scores["contextual_precision"],
                "pass_rate": round(success_cases / total_cases, 4) if total_cases else 0.0,
                "total_duration_seconds": suite_duration,
                "avg_case_duration_seconds": avg_case_duration,
                "avg_rag_duration_seconds": avg_rag_duration,
                "avg_judge_duration_seconds": avg_judge_duration,
            })
            tracker.log_results_table(results, framework="deepeval", artifact_file="deepeval_cases.json")
            tracker.log_artifacts([csv_path, json_path])
            print("   ✅ MLflow 指标与证据链大表同步完成！")

    ret_run_id = None
    if mlflow_enabled and "tracker" in locals() and tracker and tracker.run_id:
        ret_run_id = tracker.run_id

    # 4 项黄金核心指标均值
    core_scores = [avg_scores.get(m, 0.0) for m in ["faithfulness", "answer_relevancy", "contextual_recall", "contextual_precision"]]
    overall_mean = sum(core_scores) / len(core_scores) if core_scores else 0.0

    return {
        "mode": mode,
        "top_k": top_k,
        "total_cases": total_cases,
        "success_cases": success_cases,
        "pass_rate": round(success_cases / total_cases, 4) if total_cases else 0.0,
        "overall_score": round(overall_mean, 4),
        "metrics": avg_scores,
        "total_duration_seconds": suite_duration,
        "avg_case_duration_seconds": avg_case_duration,
        "avg_rag_duration_seconds": avg_rag_duration,
        "avg_judge_duration_seconds": avg_judge_duration,
        "report_file": json_path.name,
        "csv_file": csv_path.name,
        "run_id": ret_run_id,
    }


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
        default=int(os.getenv("EVAL_CONCURRENCY", "3")),
        help="Number of concurrent evaluation queries (default: 3 or EVAL_CONCURRENCY)",
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
    parser.add_argument(
        "--mlflow",
        dest="mlflow_enabled",
        action="store_true",
        default=True,
        help="Enable syncing metrics and reasoning table to remote MLflow platform (default: True)",
    )
    parser.add_argument(
        "--no-mlflow",
        dest="mlflow_enabled",
        action="store_false",
        help="Disable syncing to MLflow",
    )
    parser.add_argument(
        "--experiment-name",
        type=str,
        default=None,
        help="Target MLflow experiment name (default: lightrag-production-evaluation)",
    )
    parser.add_argument(
        "--mlflow-tracking-uri",
        type=str,
        default=None,
        help="Target MLflow server URI (default: http://49.233.222.54:9128)",
    )

    parser.add_argument(
        "--matrix-mode",
        type=str,
        default=None,
        help="Comma-separated retrieval modes for matrix benchmark evaluation (e.g. 'mix,naive')",
    )
    parser.add_argument(
        "--matrix-top-k",
        type=str,
        default=None,
        help="Comma-separated top-k values for matrix evaluation (e.g. '20,40')",
    )

    args = parser.parse_args()

    modes = [m.strip() for m in args.matrix_mode.split(",") if m.strip()] if args.matrix_mode else [args.mode]
    top_ks = [int(k.strip()) for k in args.matrix_top_k.split(",") if k.strip()] if args.matrix_top_k else [args.top_k]

    if len(modes) > 1 or len(top_ks) > 1:
        print("=" * 80, flush=True)
        print("⚔️  启动 LightRAG 多参数矩阵打擂横向对比评测 (Matrix Evaluation)", flush=True)
        print(f"   • 评测模式组合: {modes}", flush=True)
        print(f"   • Top-K 候选组合: {top_ks}", flush=True)
        print(f"   • 总打擂轮次:   {len(modes) * len(top_ks)} 轮", flush=True)
        if args.limit:
            print(f"   • 🚀 极速打擂验证模式: 仅抽样前 {args.limit} 题 (快速出分)", flush=True)
        print("=" * 80, flush=True)

        matrix_results = []
        for m in modes:
            for k in top_ks:
                print(f"\n▶️ [打擂子任务] 正在运行模式: mode={m}, top_k={k}...")
                sub_res = asyncio.run(
                    run_deepeval_suite(
                        dataset_path=args.dataset,
                        project_id=args.project,
                        rag_url=args.rag_url,
                        top_k=k,
                        concurrency=args.concurrency,
                        threshold=args.threshold,
                        limit=args.limit,
                        mode=m,
                        chunk_top_k=args.chunk_top_k,
                        enable_rerank=args.enable_rerank,
                        user_prompt=args.user_prompt,
                        max_total_tokens=args.max_total_tokens,
                        mlflow_enabled=args.mlflow_enabled,
                        experiment_name=args.experiment_name,
                        mlflow_tracking_uri=args.mlflow_tracking_uri,
                    )
                )
                if sub_res:
                    matrix_results.append(sub_res)

        # 导出多模式矩阵打擂汇总报告 (Matrix Summary Protocol)
        res_dir = Path(__file__).parent / "results"
        res_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        summary_name = f"deepeval_matrix_summary_{ts}.json"
        summary_path = res_dir / summary_name
        summary_payload = {
            "type": "matrix_summary",
            "dataset": args.dataset.name,
            "project_id": args.project,
            "created_at": datetime.now().isoformat(),
            "rounds": len(matrix_results),
            "modes": modes,
            "top_ks": top_ks,
            "mode_results": matrix_results,
        }
        with open(summary_path, "w", encoding="utf-8") as fp:
            json.dump(summary_payload, fp, indent=2, ensure_ascii=False)

        print(f"\n[MATRIX_SUMMARY] file={summary_path.name}", flush=True)
        print("\n" + "=" * 80)
        print(f"🏁 全参数矩阵打擂评测执行完毕！已聚合生成打擂汇总: {summary_path.name}")
        print(f"🔗 请访问 MLflow 平台大屏勾选上述 Runs 进行可视化横向打擂对比 (Compare Runs):")
        print(f"   {args.mlflow_tracking_uri or 'http://49.233.222.54:9128'}")
        print("=" * 80)
    else:
        active_mode = modes[0] if modes else args.mode
        active_top_k = top_ks[0] if top_ks else args.top_k
        asyncio.run(
            run_deepeval_suite(
                dataset_path=args.dataset,
                project_id=args.project,
                rag_url=args.rag_url,
                top_k=active_top_k,
                concurrency=args.concurrency,
                threshold=args.threshold,
                limit=args.limit,
                mode=active_mode,
                chunk_top_k=args.chunk_top_k,
                enable_rerank=args.enable_rerank,
                user_prompt=args.user_prompt,
                max_total_tokens=args.max_total_tokens,
                mlflow_enabled=args.mlflow_enabled,
                experiment_name=args.experiment_name,
                mlflow_tracking_uri=args.mlflow_tracking_uri,
            )
        )


if __name__ == "__main__":
    main()
