from pathlib import Path
import tempfile
import pytest
from workspace_manager import apply_workspace_namespace_patch
from lightrag.kg.json_kv_impl import JsonKVStorage

@pytest.mark.asyncio
async def test_dynamic_namespace_isolation():
    apply_workspace_namespace_patch()
    with tempfile.TemporaryDirectory() as tmp1, tempfile.TemporaryDirectory() as tmp2:
        kv1 = JsonKVStorage(namespace="full_entities", workspace="", global_config={"working_dir": tmp1}, embedding_func=None)
        kv2 = JsonKVStorage(namespace="full_entities", workspace="", global_config={"working_dir": tmp2}, embedding_func=None)
        assert kv1.namespace != kv2.namespace
        assert kv1.namespace.endswith("_full_entities")
        assert kv2.namespace.endswith("_full_entities")

def test_graph_explorer_mtime_cache():
    import time
    import networkx as nx
    from graph_explorer import GraphExplorer

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        p_dir = tmp_path / "t1" / "p1" / "revisions" / "rev_1"
        p_dir.mkdir(parents=True, exist_ok=True)
        active_symlink = tmp_path / "t1" / "p1" / "active"
        active_symlink.symlink_to(Path("revisions") / "rev_1", target_is_directory=True)

        g_orig = nx.Graph()
        g_orig.add_node("Alpha", entity_type="test", description="Node Alpha")
        g_orig.add_node("Beta", entity_type="test", description="Node Beta")
        g_orig.add_edge("Alpha", "Beta", weight=1.0, description="connects")
        graph_file = p_dir / "graph_chunk_entity_relation.graphml"
        nx.write_graphml(g_orig, graph_file)

        explorer = GraphExplorer(tmp_path)
        # First read
        res1 = explorer.query_subgraph("t1", "p1", "Alpha")
        assert res1["status"] == "ok"
        assert res1["total_nodes"] == 2

        # Cache hit
        g_cached = explorer._get_cached_graph(graph_file)
        assert g_cached is not None

        # Verify performance: 10 repeated queries
        t0 = time.perf_counter()
        for _ in range(10):
            res = explorer.query_subgraph("t1", "p1", "Alpha")
            assert res["status"] == "ok"
        elapsed = time.perf_counter() - t0
        # 10 in-memory queries should be sub-millisecond or few milliseconds total
        assert elapsed < 0.1, f"Queries took too long: {elapsed}s"

def test_fast_candidate_link_inode_and_break_link():
    import os
    from ingest_service import fast_candidate_link

    with tempfile.TemporaryDirectory() as src_dir, tempfile.TemporaryDirectory() as dst_dir:
        src = Path(src_dir)
        dst = Path(dst_dir)

        # Create source files
        file_a = src / "data.json"
        file_a.write_text("original content", encoding="utf-8")
        file_tmp = src / "ignore.tmp"
        file_tmp.write_text("tmp content", encoding="utf-8")

        # Execute fast_candidate_link
        fast_candidate_link(src, dst)

        dst_a = dst / "data.json"
        assert dst_a.exists()
        assert not (dst / "ignore.tmp").exists(), "Tmp files must be ignored"

        # Verify inode sharing (zero-copy)
        assert os.stat(str(file_a)).st_ino == os.stat(str(dst_a)).st_ino

        # Simulate atomic_write break link (write to tmp, then replace dst)
        tmp_write = dst / "data.json.tmp"
        tmp_write.write_text("new sandboxed content", encoding="utf-8")
        os.replace(str(tmp_write), str(dst_a))

        # Inodes must differ now, source file untouched
        assert os.stat(str(file_a)).st_ino != os.stat(str(dst_a)).st_ino
        assert file_a.read_text(encoding="utf-8") == "original content"
        assert dst_a.read_text(encoding="utf-8") == "new sandboxed content"

@pytest.mark.asyncio
async def test_workspace_manager_lru_and_addon_params():
    from workspace_manager import TenantWorkspaceManager
    from lease_manager import ReaderLeaseManager

    with tempfile.TemporaryDirectory() as tmp_dir:
        lease_mgr = ReaderLeaseManager()
        # Cap at 2 instances
        mgr = TenantWorkspaceManager(Path(tmp_dir), lease_manager=lease_mgr, max_cached_instances=2)

        # 1. Access p1
        rag1, ver1 = await mgr.get_rag_engine("t1", "p1")
        assert ("t1:p1" in mgr._rag_instances)
        # Check addon_params
        assert getattr(rag1, "_addon_params", {}).get("language") == "简体中文" or getattr(rag1, "addon_params", {}).get("language") == "简体中文"

        # 2. Access p2
        rag2, ver2 = await mgr.get_rag_engine("t1", "p2")
        assert len(mgr._rag_instances) == 2
        assert list(mgr._rag_instances.keys()) == ["t1:p1", "t1:p2"]

        # 3. Access p1 again -> should move to end
        await mgr.get_rag_engine("t1", "p1")
        assert list(mgr._rag_instances.keys()) == ["t1:p2", "t1:p1"]

        # 4. Acquire lease on p2 before eviction to verify active lease hold
        async with lease_mgr.lease("t1", "p2", ver2):
            rag3, ver3 = await mgr.get_rag_engine("t1", "p3")
            assert len(mgr._rag_instances) == 2
            assert "t1:p2" not in mgr._rag_instances
            assert list(mgr._rag_instances.keys()) == ["t1:p1", "t1:p3"]
            # Must still be in draining while active lease is held
            assert ("t1", "p2", ver2) in lease_mgr._draining_instances

        # After lease release and a brief pause, draining completes
        import asyncio
        await asyncio.sleep(0.2)
        assert ("t1", "p2", ver2) not in lease_mgr._draining_instances
