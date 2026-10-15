import json
from pathlib import Path
from typing import Any, Dict, List, Optional

class LocatorResolver:
    def __init__(self, data_root: Path):
        self.data_root = data_root
        self._doc_cache: Dict[str, Dict[str, Any]] = {}

    def _load_doc_data(self, doc_id: str) -> Dict[str, Any]:
        if doc_id in self._doc_cache:
            return self._doc_cache[doc_id]
        
        # 1. Search for docling_raw json first (highest precision)
        raw_candidates = list(self.data_root.glob(f"**/*{doc_id}*/*.json"))
        if not raw_candidates:
            raw_candidates = list(self.data_root.glob("**/*.docling_raw/*.json"))
        
        for cand in raw_candidates:
            try:
                data = json.loads(cand.read_text(encoding="utf-8"))
                if "texts" in data or "body" in data:
                    res = {"type": "docling_raw", "data": data}
                    self._doc_cache[doc_id] = res
                    return res
            except Exception:
                pass

        # 2. Search for .blocks.jsonl sidecar
        sidecar_candidates = list(self.data_root.glob(f"**/*{doc_id}*.blocks.jsonl"))
        if not sidecar_candidates:
            sidecar_candidates = list(self.data_root.glob("**/*.blocks.jsonl"))
        
        blocks = []
        if sidecar_candidates:
            target_file = sidecar_candidates[0]
            with open(target_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            blocks.append(json.loads(line))
                        except Exception:
                            pass
            res = {"type": "sidecar", "blocks": blocks}
            self._doc_cache[doc_id] = res
            return res

        return {}

    def resolve_locator(self, doc_id: str, file_path: str, chunk_content: str) -> Dict[str, Any]:
        unit = "page"
        ext = Path(file_path).suffix.lower()
        if ext in (".pptx", ".ppt"):
            unit = "slide"
        elif ext not in (".pdf", ".docx"):
            return {
                "unit": "unknown",
                "start": None,
                "end": None,
                "block_type": None
            }

        doc_meta = self._load_doc_data(doc_id)
        if not doc_meta:
            return {
                "unit": unit,
                "start": 1,
                "end": 1,
                "block_type": "text"
            }

        matched_pages = set()
        matched_types = []
        chunk_clean = chunk_content.replace("\n", " ").lower().strip()

        if doc_meta.get("type") == "docling_raw":
            raw_doc = doc_meta["data"]
            # Check texts items
            for item in raw_doc.get("texts", []):
                t_text = item.get("text", "").replace("\n", " ").lower().strip()
                if not t_text:
                    continue
                # Overlap match
                if t_text in chunk_clean or chunk_clean in t_text or any(len(p) > 15 and p in chunk_clean for p in t_text.split(". ")):
                    for prov in item.get("prov", []):
                        p_no = prov.get("page_no")
                        if p_no:
                            matched_pages.add(int(p_no))
                    matched_types.append("text")
            # Check tables
            for tbl in raw_doc.get("tables", []):
                for prov in tbl.get("prov", []):
                    p_no = prov.get("page_no")
                    if p_no:
                        matched_pages.add(int(p_no))
                matched_types.append("table")

        elif doc_meta.get("type") == "sidecar":
            for b in doc_meta.get("blocks", []):
                if b.get("type") != "content":
                    continue
                b_content = (b.get("content") or "").replace("\n", " ").strip().lower()
                if not b_content:
                    continue
                if b_content in chunk_clean or chunk_clean in b_content:
                    for pos in b.get("positions", []):
                        anchor = pos.get("anchor")
                        if anchor:
                            for page_str in anchor:
                                try:
                                    matched_pages.add(int(page_str))
                                except ValueError:
                                    pass
                    matched_types.append(b.get("block_type") or "text")

        if not matched_pages:
            return {
                "unit": unit,
                "start": 1,
                "end": 1,
                "block_type": "text"
            }

        start_page = min(matched_pages)
        end_page = max(matched_pages)
        block_type = matched_types[0] if matched_types else "text"

        return {
            "unit": unit,
            "start": start_page,
            "end": end_page,
            "block_type": block_type
        }
