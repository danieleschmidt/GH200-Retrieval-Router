"""
QueryClassifier — routes incoming queries to retrieval tiers based on heuristics.

Tiers:
  CACHED       — very short/recent queries that likely have a cached answer
  EXACT_MATCH  — highly specific lookups (IDs, codes, short factual queries)
  SEMANTIC     — medium-length questions that need embedding-based similarity
  GENERATIVE   — complex, multi-hop, or compositional queries needing LLM synthesis
"""

from __future__ import annotations

import re
from enum import Enum, auto
from dataclasses import dataclass


class QueryTier(Enum):
    CACHED = auto()
    EXACT_MATCH = auto()
    SEMANTIC = auto()
    GENERATIVE = auto()


# Patterns that signal different tiers
_ID_PATTERN = re.compile(
    r"\b([A-Z]{2,}[\w]*-\d+|[0-9a-f]{8,}|uuid:[0-9a-f-]+)\b", re.I
)
_QUESTION_WORDS = frozenset(
    ["what", "who", "where", "when", "which", "define", "list", "show", "get", "find"]
)
_GENERATIVE_WORDS = frozenset(
    [
        "explain", "compare", "summarize", "analyze", "how", "why",
        "describe", "evaluate", "discuss", "elaborate", "contrast",
        "pros", "cons", "trade-off", "tradeoff", "difference between",
    ]
)
_ENTITY_PATTERN = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[A-Z]{2,}(?:\s+[A-Z]{2,})*)\b"
)


@dataclass
class ClassificationResult:
    tier: QueryTier
    confidence: float          # 0.0 – 1.0
    signals: dict              # debug info


class QueryClassifier:
    """
    Classifies queries into retrieval tiers using lightweight heuristics.
    No ML model required — designed for <1ms classification latency.
    """

    def __init__(
        self,
        cache_max_tokens: int = 2,
        exact_max_tokens: int = 12,
        generative_min_tokens: int = 15,
    ):
        self.cache_max_tokens = cache_max_tokens
        self.exact_max_tokens = exact_max_tokens
        self.generative_min_tokens = generative_min_tokens

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def classify(self, query: str) -> ClassificationResult:
        """Classify a single query string."""
        tokens = query.lower().split()
        n = len(tokens)
        signals: dict = {"token_count": n}

        # --- CACHED tier: very short queries
        if n <= self.cache_max_tokens:
            signals["reason"] = "short_query"
            return ClassificationResult(QueryTier.CACHED, 0.85, signals)

        # --- EXACT_MATCH tier: ID patterns or short factual questions
        if _ID_PATTERN.search(query):
            signals["reason"] = "id_pattern"
            return ClassificationResult(QueryTier.EXACT_MATCH, 0.92, signals)

        first_word = tokens[0]
        if n <= self.exact_max_tokens and first_word in _QUESTION_WORDS:
            entities = _ENTITY_PATTERN.findall(query)
            signals["entities"] = entities
            signals["reason"] = "short_factual"
            return ClassificationResult(QueryTier.EXACT_MATCH, 0.78, signals)

        # --- GENERATIVE tier: complex / analytical questions
        generative_hits = sum(
            1 for w in _GENERATIVE_WORDS if w in query.lower()
        )
        signals["generative_hits"] = generative_hits
        if generative_hits >= 1 or n >= self.generative_min_tokens:
            confidence = min(0.95, 0.65 + generative_hits * 0.10 + (n - self.generative_min_tokens) * 0.005)
            signals["reason"] = "complex_query"
            return ClassificationResult(QueryTier.GENERATIVE, confidence, signals)

        # --- Default: SEMANTIC
        signals["reason"] = "default_semantic"
        return ClassificationResult(QueryTier.SEMANTIC, 0.70, signals)

    def classify_batch(self, queries: list[str]) -> list[ClassificationResult]:
        """Classify a list of queries."""
        return [self.classify(q) for q in queries]
