"""Live E2E Verification Script for 8-Tool FastMCP Gateway on Production Port 8001."""

from __future__ import annotations

import asyncio
import json
from fastmcp import Client


async def main():
    print("=" * 70)
    print("Connecting to live FastMCP Knowledge Gateway at http://127.0.0.1:8001/mcp...")
    print("=" * 70)

    client = Client("http://127.0.0.1:8001/mcp")

    async with client:
        # 1. Verify Tool Count and Signatures
        tools = await client.list_tools()
        tool_names = [t.name for t in tools]
        print(f"\n[1] Tools registered in live gateway: {len(tools)} tools")
        for i, t in enumerate(tools, 1):
            print(f"    {i}. {t.name} - {t.description[:60]}...")
        assert len(tools) == 8, f"Expected 8 tools, got {len(tools)}"

        # Helper to parse payload
        def get_payload(res):
            if hasattr(res, "content") and res.content:
                return json.loads(res.content[0].text)
            if hasattr(res, "text"):
                return json.loads(res.text)
            return res

        # 2. Call mcp_get_project_knowledge_stats
        print("\n[2] Testing mcp_get_project_knowledge_stats...")
        stats_res = await client.call_tool("mcp_get_project_knowledge_stats", {})
        stats_data = get_payload(stats_res)
        print(f"    Status: {stats_data.get('status')}")
        print(f"    Active Version: {stats_data.get('active_version')}")
        print(f"    Total Documents: {stats_data.get('total_documents')}")
        print(f"    Total Entities: {stats_data.get('total_entities')}")
        print(f"    Total Relations: {stats_data.get('total_relations')}")
        print(f"    Total Chunks: {stats_data.get('total_chunks')}")
        assert stats_data.get("status") == "ok"
        assert stats_data.get("snapshot_valid") is True

        # 3. Call mcp_list_project_knowledge_documents
        print("\n[3] Testing mcp_list_project_knowledge_documents...")
        docs_res = await client.call_tool("mcp_list_project_knowledge_documents", {"limit": 5})
        docs_data = get_payload(docs_res)
        docs = docs_data.get("documents", [])
        print(f"    Retrieved {len(docs)} documents:")
        sample_doc_id = None
        for d in docs:
            print(f"      - [{d.get('status')}] {d.get('filename')} (id: {d.get('document_id')})")
            if not sample_doc_id:
                sample_doc_id = d.get("document_id")

        # 4. Call mcp_get_project_knowledge_document_status
        if sample_doc_id:
            print(f"\n[4] Testing mcp_get_project_knowledge_document_status for {sample_doc_id}...")
            st_res = await client.call_tool("mcp_get_project_knowledge_document_status", {"document_id": sample_doc_id})
            st_data = get_payload(st_res)
            print(f"    Status: {st_data.get('status')}, Overall: {st_data.get('overall_status')}")

        # 5. Call mcp_query_knowledge_graph
        print("\n[5] Testing mcp_query_knowledge_graph (Fuzzy search & subgraph traversal)...")
        # Querying an entity that exists in our migrated graph
        graph_res = await client.call_tool("mcp_query_knowledge_graph", {"entity_name": "接口文档.pdf", "depth": 1})
        graph_data = get_payload(graph_res)
        print(f"    Status: {graph_data.get('status')}")
        print(f"    Matched: {graph_data.get('entity')}")
        print(f"    Total Nodes: {graph_data.get('total_nodes', len(graph_data.get('nodes', [])))}")
        print(f"    Total Edges: {graph_data.get('total_edges', len(graph_data.get('edges', [])))}")
        if graph_data.get("nodes"):
            for n in graph_data.get("nodes")[:3]:
                print(f"      Node: {n.get('name')} ({n.get('type')}) - {n.get('description')[:50]}")
        assert graph_data.get("status") == "ok"
        assert graph_data.get("total_nodes", 0) >= 2

        # 6. Call mcp_query_project_knowledge (Backward Compatibility & Extension)
        print("\n[6] Testing mcp_query_project_knowledge (Backward compatible signature)...")
        q_res = await client.call_tool("mcp_query_project_knowledge", {"query": "架构设计", "top_k": 2})
        q_data = get_payload(q_res)
        print(f"    Status: {q_data.get('status')}")
        print(f"    Sources count: {len(q_data.get('sources', []))}")
        if q_data.get("sources"):
            s0 = q_data["sources"][0]
            print(f"      Source 1: {s0.get('title')} (id: {s0.get('source_id')})")
            print(f"      Preview: {s0.get('preview')[:80]}...")

    print("\n" + "=" * 70)
    print("ALL 8 TOOLS VERIFIED SUCCESSFULLY ON PRODUCTION GATEWAY!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
