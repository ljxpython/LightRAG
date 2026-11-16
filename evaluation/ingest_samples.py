#!/usr/bin/env python3
"""
Sample Documents Ingest Tool for LightRAG Evaluation.

Uploads documents from evaluation/documents/ into a specified LightRAG project
via the REST API and tracks extraction completion.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import List, Dict

import httpx

# Load root .env
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root))

from dotenv import load_dotenv
load_dotenv(repo_root / ".env", override=False)


async def obtain_token(rag_url: str) -> str:
    """Authenticates against /login and returns a fresh JWT access token."""
    auth_accounts = os.getenv("AUTH_ACCOUNTS", "admin:admin123456")
    username, password = auth_accounts.split(",")[0].split(":", 1)
    login_url = f"{rag_url.rstrip('/')}/login"
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            login_url,
            data={"username": username, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        resp.raise_for_status()
        token = resp.json().get("access_token")
        if not token:
            raise RuntimeError("Failed to acquire access_token from /login")
        return token


async def ingest_documents(rag_url: str, project_id: str, doc_dir: Path):
    print("=" * 70)
    print(f"📦 启动评测原料文档入库流水线")
    print(f"   • 目标服务:  {rag_url}")
    print(f"   • 目标项目:  {project_id}")
    print(f"   • 语料目录:  {doc_dir.resolve()}")
    print("=" * 70)

    token = await obtain_token(rag_url)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Project-Id": project_id,
        "Content-Type": "application/json"
    }

    doc_files = [f for f in sorted(doc_dir.glob("*.md")) if f.name != "README.md"]
    if not doc_files:
        print("❌ 未在目录中找到任何有效 Markdown 语料文件！")
        return

    print(f"\n找到 {len(doc_files)} 篇待入库评测文档:")
    for f in doc_files:
        print(f"  - {f.name} ({f.stat().st_size} bytes)")

    async with httpx.AsyncClient(timeout=60.0) as client:
        track_ids: Dict[str, str] = {}

        for doc_file in doc_files:
            content = doc_file.read_text(encoding="utf-8")
            payload = {
                "text": content,
                "file_source": doc_file.name
            }
            
            try:
                res = await client.post(
                    f"{rag_url.rstrip('/')}/documents/text",
                    json=payload,
                    headers=headers
                )
                if res.status_code == 409:
                    print(f"  ⚠️ 文档已存在，跳过: {doc_file.name}")
                    continue
                res.raise_for_status()
                data = res.json()
                t_id = data.get("track_id")
                track_ids[doc_file.name] = t_id
                print(f"  📤 提交成功: {doc_file.name} (track_id: {t_id})")
            except Exception as e:
                print(f"  ❌ 提交失败: {doc_file.name} - {e}")

        # Poll tracking status until all done
        if track_ids:
            max_attempts = max(60, len(track_ids) * 3)
            print(f"\n⏳ 正在等待后台图谱抽取与向量构建完成 (共 {len(track_ids)} 篇，最大轮询 {max_attempts} 次)...")
            pending = set(track_ids.keys())
            for attempt in range(max_attempts):
                await asyncio.sleep(3.0)
                done_this_round = set()
                for name in list(pending):
                    t_id = track_ids[name]
                    try:
                        poll_res = await client.get(
                            f"{rag_url.rstrip('/')}/documents/track_status/{t_id}",
                            headers=headers
                        )
                        if poll_res.status_code == 200:
                            p_data = poll_res.json()
                            status = p_data.get("status")
                            if status in ("processed", "completed"):
                                print(f"    ✅ 已处理完成: {name}")
                                done_this_round.add(name)
                            elif status == "failed":
                                print(f"    ❌ 处理失败: {name}")
                                done_this_round.add(name)
                    except Exception:
                        pass
                pending -= done_this_round
                if not pending:
                    break
                if (attempt + 1) % 5 == 0:
                    print(f"    ⏳ 抽取构建中... 剩余 {len(pending)}/{len(track_ids)} 篇待完成")

            if pending:
                print(f"  ⚠️ 超时或仍在后台索引中: {pending}")
            else:
                print(f"\n🎉 全部评测文档已成功注入项目 [{project_id}] 并完成知识图谱构建！")
        else:
            print(f"\n✅ 语料已就绪，可直接执行评测！")


def main():
    parser = argparse.ArgumentParser(description="Ingest sample documents for LightRAG evaluation.")
    parser.add_argument(
        "--project", "-p",
        type=str,
        default="eval_benchmark",
        help="Target project ID (default: eval_benchmark)",
    )
    parser.add_argument(
        "--endpoint", "-r",
        type=str,
        default=os.getenv("LIGHTRAG_API_URL", "http://localhost:9621"),
        help="LightRAG server API endpoint (default: http://localhost:9621)",
    )
    parser.add_argument(
        "--dir", "-d", "--docs-dir",
        dest="dir",
        type=str,
        default=str(repo_root / "evaluation" / "documents"),
        help="Path to documents folder (default: evaluation/documents)",
    )
    args = parser.parse_args()
    asyncio.run(ingest_documents(args.endpoint, args.project, Path(args.dir)))


if __name__ == "__main__":
    main()
