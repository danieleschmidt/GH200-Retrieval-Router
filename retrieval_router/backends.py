"""
Retrieval backends.

RetrievalBackend      — abstract base
ExactMatchBackend     — dict-based O(1) lookup
SemanticBackend       — TF-IDF cosine similarity over a corpus
CachedBackend         — LRU cache wrapping any backend
GenerativeBackend     — mock LLM synthesis (returns templated response)
"""

from __future__ import annotations

import math
import re
import time
import collections
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class RetrievalResult:
    query: str
    answer: str
    source: str
    score: float          # relevance / confidence 0-1
    latency_ms: float
    metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------

class RetrievalBackend(ABC):
    """Abstract retrieval backend."""

    def __init__(self, name: str):
        self.name = name
        self._active_connections: int = 0

    # Least-connections tracking
    @property
    def active_connections(self) -> int:
        return self._active_connections

    def _inc(self) -> None:
        self._active_connections += 1

    def _dec(self) -> None:
        self._active_connections = max(0, self._active_connections - 1)

    @abstractmethod
    def retrieve(self, query: str) -> RetrievalResult:
        ...

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(name={self.name!r})"


# ---------------------------------------------------------------------------
# Exact Match
# ---------------------------------------------------------------------------

class ExactMatchBackend(RetrievalBackend):
    """
    Dictionary-based exact/prefix lookup.
    Simulates a fast key-value store (Redis, Memcached, hash index).
    """

    def __init__(self, name: str = "exact", corpus: Optional[dict[str, str]] = None):
        super().__init__(name)
        self._store: dict[str, str] = corpus or {}
        # Build lowercase index for case-insensitive lookup
        self._index: dict[str, str] = {k.lower(): v for k, v in self._store.items()}

    def add(self, key: str, value: str) -> None:
        self._store[key] = value
        self._index[key.lower()] = value

    def retrieve(self, query: str) -> RetrievalResult:
        t0 = time.perf_counter()
        self._inc()
        try:
            key = query.strip().lower()
            answer = self._index.get(key)
            if answer is None:
                # Try prefix match
                for k, v in self._index.items():
                    if k.startswith(key) or key.startswith(k):
                        answer = v
                        break
            hit = answer is not None
            latency = (time.perf_counter() - t0) * 1000
            return RetrievalResult(
                query=query,
                answer=answer or f"[no exact match for: {query!r}]",
                source=self.name,
                score=1.0 if hit else 0.0,
                latency_ms=latency,
                metadata={"hit": hit},
            )
        finally:
            self._dec()


# ---------------------------------------------------------------------------
# TF-IDF Semantic Backend
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def _build_tfidf(corpus: list[str]) -> tuple[list[dict[str, float]], dict[str, float]]:
    """Return (tf_vectors, idf_map) for the corpus."""
    N = len(corpus)
    tokenized = [_tokenize(doc) for doc in corpus]

    # TF
    tf_vectors = []
    for tokens in tokenized:
        freq: dict[str, int] = {}
        for t in tokens:
            freq[t] = freq.get(t, 0) + 1
        total = max(len(tokens), 1)
        tf_vectors.append({t: c / total for t, c in freq.items()})

    # IDF
    df: dict[str, int] = {}
    for tokens in tokenized:
        for t in set(tokens):
            df[t] = df.get(t, 0) + 1
    idf = {t: math.log((N + 1) / (c + 1)) + 1 for t, c in df.items()}

    return tf_vectors, idf


def _cosine(v1: dict[str, float], v2: dict[str, float]) -> float:
    common = set(v1) & set(v2)
    dot = sum(v1[t] * v2[t] for t in common)
    mag1 = math.sqrt(sum(x * x for x in v1.values()))
    mag2 = math.sqrt(sum(x * x for x in v2.values()))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return dot / (mag1 * mag2)


class SemanticBackend(RetrievalBackend):
    """
    TF-IDF cosine similarity retrieval over an in-memory corpus.
    No external dependencies — stdlib + math only.
    """

    def __init__(self, name: str = "semantic", corpus: Optional[list[str]] = None):
        super().__init__(name)
        self._corpus: list[str] = corpus or []
        self._tf_vectors: list[dict[str, float]] = []
        self._idf: dict[str, float] = {}
        if self._corpus:
            self._rebuild_index()

    def add_documents(self, docs: list[str]) -> None:
        self._corpus.extend(docs)
        self._rebuild_index()

    def _rebuild_index(self) -> None:
        self._tf_vectors, self._idf = _build_tfidf(self._corpus)

    def _query_vector(self, query: str) -> dict[str, float]:
        tokens = _tokenize(query)
        freq: dict[str, int] = {}
        for t in tokens:
            freq[t] = freq.get(t, 0) + 1
        total = max(len(tokens), 1)
        return {
            t: (c / total) * self._idf.get(t, 1.0)
            for t, c in freq.items()
        }

    def retrieve(self, query: str) -> RetrievalResult:
        t0 = time.perf_counter()
        self._inc()
        try:
            if not self._corpus:
                return RetrievalResult(
                    query=query,
                    answer="[semantic index is empty]",
                    source=self.name,
                    score=0.0,
                    latency_ms=(time.perf_counter() - t0) * 1000,
                )

            qv = self._query_vector(query)
            scores = []
            for i, tf in enumerate(self._tf_vectors):
                # Weight TF by IDF for doc vector too
                weighted = {t: v * self._idf.get(t, 1.0) for t, v in tf.items()}
                scores.append((i, _cosine(qv, weighted)))

            best_idx, best_score = max(scores, key=lambda x: x[1])
            latency = (time.perf_counter() - t0) * 1000
            return RetrievalResult(
                query=query,
                answer=self._corpus[best_idx],
                source=self.name,
                score=min(best_score, 1.0),
                latency_ms=latency,
                metadata={"top_k_scores": sorted([s for _, s in scores], reverse=True)[:3]},
            )
        finally:
            self._dec()


# ---------------------------------------------------------------------------
# LRU Cache Backend
# ---------------------------------------------------------------------------

class CachedBackend(RetrievalBackend):
    """
    LRU cache wrapping an underlying backend.
    Cache keys are normalized lowercase queries.
    """

    def __init__(
        self,
        name: str = "cached",
        backend: Optional[RetrievalBackend] = None,
        max_size: int = 1024,
    ):
        super().__init__(name)
        self._backend = backend
        self._max_size = max_size
        self._cache: collections.OrderedDict[str, RetrievalResult] = collections.OrderedDict()
        self.hits = 0
        self.misses = 0

    def _cache_key(self, query: str) -> str:
        return " ".join(query.lower().split())

    def retrieve(self, query: str) -> RetrievalResult:
        t0 = time.perf_counter()
        self._inc()
        try:
            key = self._cache_key(query)

            if key in self._cache:
                self.hits += 1
                self._cache.move_to_end(key)
                result = self._cache[key]
                # Return cached with updated latency
                return RetrievalResult(
                    query=result.query,
                    answer=result.answer,
                    source=f"{self.name}(hit)",
                    score=result.score,
                    latency_ms=(time.perf_counter() - t0) * 1000,
                    metadata={**result.metadata, "cache_hit": True},
                )

            self.misses += 1
            if self._backend:
                result = self._backend.retrieve(query)
            else:
                # Standalone mode: return a simple stored answer or miss
                latency = (time.perf_counter() - t0) * 1000
                result = RetrievalResult(
                    query=query,
                    answer=f"[cache miss, no backing backend for: {query!r}]",
                    source=self.name,
                    score=0.0,
                    latency_ms=latency,
                    metadata={"cache_hit": False},
                )

            # Evict LRU if full
            if len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)
            self._cache[key] = result
            return result
        finally:
            self._dec()

    def warm(self, entries: dict[str, str]) -> None:
        """Pre-warm cache with known query→answer pairs."""
        for query, answer in entries.items():
            key = self._cache_key(query)
            self._cache[key] = RetrievalResult(
                query=query,
                answer=answer,
                source=f"{self.name}(warm)",
                score=1.0,
                latency_ms=0.0,
                metadata={"cache_hit": True, "warmed": True},
            )

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0


# ---------------------------------------------------------------------------
# Generative (mock)
# ---------------------------------------------------------------------------

class GenerativeBackend(RetrievalBackend):
    """
    Mock generative backend — simulates LLM synthesis latency and response.
    In production, swap retrieve() body for an actual LLM API call.
    """

    _TEMPLATE = (
        "Based on retrieved context, here is a synthesized answer to: '{query}'. "
        "[This response would be generated by the LLM using top-k retrieved passages "
        "and chain-of-thought reasoning. Simulated confidence: {score:.2f}]"
    )

    def __init__(self, name: str = "generative", simulated_latency_ms: float = 120.0):
        super().__init__(name)
        self._sim_latency = simulated_latency_ms

    def retrieve(self, query: str) -> RetrievalResult:
        t0 = time.perf_counter()
        self._inc()
        try:
            # Simulate variable LLM latency
            import random
            jitter = random.gauss(0, self._sim_latency * 0.1)
            target = max(1, self._sim_latency + jitter)
            # Spin for simulated latency (capped at 5ms to keep tests fast)
            deadline = t0 + min(target, 5) / 1000
            while time.perf_counter() < deadline:
                pass

            score = round(0.70 + 0.25 * random.random(), 3)
            latency = (time.perf_counter() - t0) * 1000
            return RetrievalResult(
                query=query,
                answer=self._TEMPLATE.format(query=query, score=score),
                source=self.name,
                score=score,
                latency_ms=latency,
                metadata={"simulated": True, "target_latency_ms": target},
            )
        finally:
            self._dec()
