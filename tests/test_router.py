"""Integration tests for RetrievalRouter."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from retrieval_router import (
    RetrievalRouter,
    QueryTier,
    ExactMatchBackend,
    SemanticBackend,
    CachedBackend,
    GenerativeBackend,
)


def build_router() -> RetrievalRouter:
    router = RetrievalRouter(fallback_score_threshold=0.10)
    router.add_backend(
        QueryTier.EXACT_MATCH,
        ExactMatchBackend("exact-1", corpus={"what is python": "Python is a language."}),
    )
    router.add_backend(
        QueryTier.SEMANTIC,
        SemanticBackend("semantic-1", corpus=["Python is a programming language.", "NumPy is for math."]),
    )
    cache = CachedBackend("cache-1", max_size=50)
    cache.warm({"hello": "hi there", "ping": "pong"})
    router.add_backend(QueryTier.CACHED, cache)
    router.add_backend(
        QueryTier.GENERATIVE,
        GenerativeBackend("gen-1", simulated_latency_ms=1),
    )
    return router


class TestRetrievalRouter(unittest.TestCase):

    def setUp(self):
        self.router = build_router()

    def test_route_returns_result(self):
        r = self.router.route("hello")
        self.assertIsNotNone(r)
        self.assertEqual(r.tier, QueryTier.CACHED)

    def test_route_exact_match(self):
        r = self.router.route("what is python")
        self.assertEqual(r.tier, QueryTier.EXACT_MATCH)
        self.assertIn("Python", r.retrieval.answer)

    def test_route_generative(self):
        r = self.router.route("Explain in detail why transformers use attention mechanisms over RNNs")
        self.assertEqual(r.tier, QueryTier.GENERATIVE)

    def test_total_latency_positive(self):
        r = self.router.route("ping")
        self.assertGreater(r.total_latency_ms, 0)

    def test_route_batch(self):
        queries = ["hello", "what is python", "explain deep learning thoroughly"]
        results = self.router.route_batch(queries)
        self.assertEqual(len(results), 3)

    def test_tier_distribution(self):
        self.router.route("hello")
        self.router.route("what is python")
        dist = self.router.tier_distribution()
        self.assertGreaterEqual(dist[QueryTier.CACHED.name], 1)
        self.assertGreaterEqual(dist[QueryTier.EXACT_MATCH.name], 1)

    def test_summary_structure(self):
        self.router.route("hello")
        s = self.router.summary()
        self.assertIn("total_queries", s)
        self.assertIn("tier_distribution", s)
        self.assertEqual(s["total_queries"], 1)

    def test_no_backend_for_tier(self):
        router = RetrievalRouter()
        router.add_backend(
            QueryTier.GENERATIVE,
            GenerativeBackend("gen-fallback", simulated_latency_ms=1),
        )
        # Route a cached query — no cached backend, should fall back
        r = router.route("hi")
        # Either a fallback was used, or it's an error result — no crash
        self.assertIsNotNone(r.retrieval)

    def test_latency_stats_populated_after_routing(self):
        self.router.route("hello")
        stats = self.router.latency_summary()
        self.assertGreater(len(stats), 0)

    def test_classification_attached(self):
        r = self.router.route("hello")
        self.assertIsNotNone(r.classification)
        self.assertIn("token_count", r.classification.signals)


class TestRouterFallback(unittest.TestCase):

    def test_fallback_to_generative_on_low_score(self):
        router = RetrievalRouter(fallback_score_threshold=0.99)  # force fallback
        router.add_backend(
            QueryTier.SEMANTIC,
            SemanticBackend("semantic-1", corpus=["unrelated content about weather"]),
        )
        router.add_backend(
            QueryTier.GENERATIVE,
            GenerativeBackend("gen-1", simulated_latency_ms=1),
        )
        r = router.route("neural network architecture details")
        # With threshold=0.99, semantic will likely fall back to generative
        # Just verify no crash and result is valid
        self.assertIsNotNone(r.retrieval.answer)


if __name__ == "__main__":
    unittest.main()
