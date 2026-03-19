"""
RetrievalRouter — orchestrates classification → routing → load balancing → aggregation.

Architecture:
  1. QueryClassifier determines the tier (CACHED / EXACT_MATCH / SEMANTIC / GENERATIVE)
  2. Per-tier LoadBalancer selects the least-loaded backend instance
  3. Backend executes retrieval and returns a RetrievalResult
  4. LatencyTracker records the observed latency
  5. Router returns the result (+ optional fallback on low-score results)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from .classifier import QueryClassifier, QueryTier, ClassificationResult
from .backends import RetrievalBackend, RetrievalResult
from .load_balancer import LoadBalancer
from .latency_tracker import LatencyTracker


@dataclass
class RouterResult:
    query: str
    tier: QueryTier
    classification: ClassificationResult
    retrieval: RetrievalResult
    total_latency_ms: float
    fallback_used: bool = False


class RetrievalRouter:
    """
    High-throughput retrieval router for RAG inference pipelines.

    Usage::

        router = RetrievalRouter()
        router.add_backend(QueryTier.EXACT_MATCH, exact_backend)
        router.add_backend(QueryTier.SEMANTIC, semantic_backend)
        router.add_backend(QueryTier.CACHED, cache_backend)
        router.add_backend(QueryTier.GENERATIVE, gen_backend)

        result = router.route("What is the capital of France?")
        print(result.retrieval.answer)
    """

    def __init__(
        self,
        classifier: Optional[QueryClassifier] = None,
        latency_tracker: Optional[LatencyTracker] = None,
        fallback_score_threshold: float = 0.20,
        fallback_tier: QueryTier = QueryTier.GENERATIVE,
    ):
        self._classifier = classifier or QueryClassifier()
        self._tracker = latency_tracker or LatencyTracker()
        self._pools: dict[QueryTier, LoadBalancer] = {t: LoadBalancer() for t in QueryTier}
        self._fallback_threshold = fallback_score_threshold
        self._fallback_tier = fallback_tier

        # Aggregate counters
        self._counters: dict[QueryTier, int] = {t: 0 for t in QueryTier}
        self._total = 0
        self._errors = 0

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def add_backend(self, tier: QueryTier, backend: RetrievalBackend) -> None:
        """Register a backend for a given tier."""
        self._pools[tier].add_backend(backend)

    def remove_backend(self, tier: QueryTier, name: str) -> bool:
        return self._pools[tier].remove_backend(name)

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------

    def route(self, query: str) -> RouterResult:
        """Route a single query and return a RouterResult."""
        t_start = time.perf_counter()

        classification = self._classifier.classify(query)
        tier = classification.tier

        result, fallback_used = self._dispatch(query, tier)

        total_ms = (time.perf_counter() - t_start) * 1000
        self._tracker.record(result.source, result.latency_ms)
        self._counters[tier] += 1
        self._total += 1

        return RouterResult(
            query=query,
            tier=tier,
            classification=classification,
            retrieval=result,
            total_latency_ms=round(total_ms, 3),
            fallback_used=fallback_used,
        )

    def route_batch(self, queries: list[str]) -> list[RouterResult]:
        """Route a batch of queries (sequential; extend to ThreadPool for parallelism)."""
        return [self.route(q) for q in queries]

    # ------------------------------------------------------------------
    # Internal dispatch
    # ------------------------------------------------------------------

    def _dispatch(
        self, query: str, tier: QueryTier, _depth: int = 0
    ) -> tuple[RetrievalResult, bool]:
        pool = self._pools[tier]
        fallback_used = False

        if pool.pool_size() == 0:
            # No backends registered for this tier — fall back
            fallback_tier = self._fallback_tier
            if _depth == 0 and fallback_tier != tier and self._pools[fallback_tier].pool_size() > 0:
                result, _ = self._dispatch(query, fallback_tier, _depth=1)
                return result, True
            # Last resort: return an error result
            return RetrievalResult(
                query=query,
                answer=f"[no backend available for tier {tier.name}]",
                source="router",
                score=0.0,
                latency_ms=0.0,
                metadata={"error": "no_backend"},
            ), False

        backend = pool.select()
        try:
            result = backend.retrieve(query)
        except Exception as exc:
            self._errors += 1
            result = RetrievalResult(
                query=query,
                answer=f"[backend error: {exc}]",
                source=backend.name,
                score=0.0,
                latency_ms=0.0,
                metadata={"error": str(exc)},
            )
            return result, False

        # Optionally fall back if score is too low
        if (
            _depth == 0
            and result.score < self._fallback_threshold
            and self._fallback_tier != tier
            and self._pools[self._fallback_tier].pool_size() > 0
        ):
            fallback_result, _ = self._dispatch(query, self._fallback_tier, _depth=1)
            if fallback_result.score > result.score:
                return fallback_result, True

        return result, fallback_used

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------

    def tier_distribution(self) -> dict[str, int]:
        return {t.name: self._counters[t] for t in QueryTier}

    def tier_distribution_pct(self) -> dict[str, float]:
        total = max(self._total, 1)
        return {t.name: round(self._counters[t] / total * 100, 1) for t in QueryTier}

    def latency_summary(self) -> list[str]:
        return [str(s) for s in self._tracker.all_stats()]

    def summary(self) -> dict:
        return {
            "total_queries": self._total,
            "errors": self._errors,
            "tier_distribution": self.tier_distribution(),
            "tier_distribution_pct": self.tier_distribution_pct(),
        }
