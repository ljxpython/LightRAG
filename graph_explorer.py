"""Knowledge Graph Subgraph Explorer for Deep-Reasoning Agents.

Reads NetworkX graphml from active workspace revision and performs fast
fuzzy entity lookup and N-degree subgraph traversal.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
import networkx as nx

logger = logging.getLogger("graph_explorer")


class GraphExplorer:
    def __init__(self, storage_root: Path):
        self.storage_root = Path(storage_root)

    def _get_active_graph_path(self, tenant_id: str, project_id: str) -> Optional[Path]:
        p_dir = self.storage_root / tenant_id / project_id
        active_symlink = p_dir / "active"
        if not active_symlink.exists():
            return None
        try:
            target_dir = active_symlink.resolve()
            graph_path = target_dir / "graph_chunk_entity_relation.graphml"
            if graph_path.exists():
                return graph_path
        except Exception:
            pass
        return None

    def query_subgraph(
        self,
        tenant_id: str,
        project_id: str,
        entity_name: str,
        depth: int = 1,
        max_nodes: int = 30,
    ) -> Dict[str, Any]:
        """Explores N-degree relational neighborhood around a target entity."""
        graph_path = self._get_active_graph_path(tenant_id, project_id)
        if not graph_path:
            return {
                "status": "no_hit",
                "entity": entity_name,
                "nodes": [],
                "edges": [],
                "message": "Graph not initialized for this project",
            }

        try:
            g = nx.read_graphml(graph_path)
        except Exception as e:
            logger.error(f"Failed to read graphml at {graph_path}: {e}")
            return {
                "status": "error",
                "entity": entity_name,
                "nodes": [],
                "edges": [],
                "message": str(e),
            }

        # 1. Fuzzy match target entity
        target_node = None
        entity_lower = entity_name.strip().lower()

        # Exact match
        for node in g.nodes:
            if str(node).lower() == entity_lower:
                target_node = node
                break

        # Substring / partial match if exact match not found
        if not target_node:
            for node in g.nodes:
                if entity_lower in str(node).lower() or str(node).lower() in entity_lower:
                    target_node = node
                    break

        if not target_node:
            return {
                "status": "no_hit",
                "entity": entity_name,
                "nodes": [],
                "edges": [],
                "message": f"Entity '{entity_name}' not found in knowledge graph",
            }

        # 2. Extract neighborhood by depth
        visited_nodes: Set[str] = {target_node}
        current_layer: Set[str] = {target_node}

        depth = max(1, min(depth, 3))  # Cap depth at 3 to prevent explosion
        for _ in range(depth):
            next_layer: Set[str] = set()
            for n in current_layer:
                neighbors = set(g.neighbors(n))
                next_layer.update(neighbors - visited_nodes)
            visited_nodes.update(next_layer)
            current_layer = next_layer
            if len(visited_nodes) >= max_nodes:
                break

        subgraph_nodes = list(visited_nodes)[:max_nodes]
        subgraph = g.subgraph(subgraph_nodes)

        # 3. Serialize nodes and edges
        nodes_out = []
        for n in subgraph.nodes:
            node_data = dict(subgraph.nodes[n])
            nodes_out.append({
                "name": str(n),
                "type": node_data.get("entity_type", "unknown"),
                "description": node_data.get("description", ""),
            })

        edges_out = []
        for u, v, data in subgraph.edges(data=True):
            edges_out.append({
                "source": str(u),
                "target": str(v),
                "weight": float(data.get("weight", 1.0)),
                "description": data.get("description", ""),
                "keywords": data.get("keywords", ""),
            })

        return {
            "status": "ok",
            "entity": str(target_node),
            "matched_query": entity_name,
            "total_nodes": len(nodes_out),
            "total_edges": len(edges_out),
            "nodes": nodes_out,
            "edges": edges_out,
        }
