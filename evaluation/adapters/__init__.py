"""
Evaluation Adapters for Open-source RAG Benchmarks.
"""

from .multihop_adapter import MultiHopRAGAdapter
from .rgb_adapter import HuaweiRGBAdapter

__all__ = ["HuaweiRGBAdapter", "MultiHopRAGAdapter"]
