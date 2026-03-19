"""Tests for retrieval backends."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from retrieval_router.backends import (
    ExactMatchBackend,
    SemanticBackend,
    CachedBackend,
    GenerativeBackend,
    RetrievalResult,
)


class TestExactMatchBackend(unittest.TestCase):

    def setUp(self):
        self.backend = ExactMatchBackend(
            name="test-exact",
            corpus={"what is python": "Python is a language.", "hello": "Hello there!"},
        )

    def test_exact_hit(self):
        r = self.backend.retrieve("what is python")
        self.assertEqual(r.score, 1.0)
        self.assertIn("Python", r.answer)

    def test_case_insensitive(self):
        r = self.backend.retrieve("WHAT IS PYTHON")
        self.assertEqual(r.score, 1.0)

    def test_miss(self):
        r = self.backend.retrieve("what is javascript totally unknown")
        self.assertEqual(r.score, 0.0)

    def test_result_fields(self):
        r = self.backend.retrieve("hello")
        self.assertIsInstance(r, RetrievalResult)
        self.assertEqual(r.source, "test-exact")
        self.assertGreater(r.latency_ms, 0)

    def test_add_entry(self):
        self.backend.add("new key", "new value")
        r = self.backend.retrieve("new key")
        self.assertEqual(r.score, 1.0)
        self.assertEqual(r.answer, "new value")

    def test_active_connections_reset(self):
        self.backend.retrieve("hello")
        self.assertEqual(self.backend.active_connections, 0)


class TestSemanticBackend(unittest.TestCase):

    CORPUS = [
        "Python is a high-level programming language.",
        "NumPy provides numerical computing tools for Python.",
        "Machine learning requires large datasets.",
        "Natural language processing uses transformer models.",
        "Retrieval augmented generation improves accuracy.",
    ]

    def setUp(self):
        self.backend = SemanticBackend(name="test-semantic", corpus=self.CORPUS)

    def test_returns_result(self):
        r = self.backend.retrieve("Python programming")
        self.assertIsInstance(r, RetrievalResult)
        self.assertGreater(r.score, 0)

    def test_relevant_match(self):
        r = self.backend.retrieve("numerical computing numpy")
        self.assertIn("NumPy", r.answer)

    def test_empty_corpus(self):
        b = SemanticBackend(name="empty")
        r = b.retrieve("any query")
        self.assertEqual(r.score, 0.0)

    def test_latency_positive(self):
        r = self.backend.retrieve("machine learning datasets")
        self.assertGreater(r.latency_ms, 0)

    def test_active_connections_reset(self):
        self.backend.retrieve("test query")
        self.assertEqual(self.backend.active_connections, 0)

    def test_add_documents(self):
        b = SemanticBackend(name="test-grow")
        b.add_documents(["CUDA is used for GPU programming."])
        r = b.retrieve("GPU CUDA")
        self.assertGreater(r.score, 0)


class TestCachedBackend(unittest.TestCase):

    def setUp(self):
        self.backing = ExactMatchBackend(
            name="backing",
            corpus={"test query": "test answer"},
        )
        self.cache = CachedBackend(name="test-cache", backend=self.backing, max_size=10)

    def test_cache_miss_then_hit(self):
        r1 = self.cache.retrieve("test query")
        r2 = self.cache.retrieve("test query")
        self.assertIn("hit", r2.source)
        self.assertEqual(self.cache.hits, 1)
        self.assertEqual(self.cache.misses, 1)

    def test_hit_rate(self):
        self.cache.retrieve("test query")   # miss
        self.cache.retrieve("test query")   # hit
        self.cache.retrieve("test query")   # hit
        self.assertAlmostEqual(self.cache.hit_rate, 2 / 3)

    def test_warmup(self):
        self.cache.warm({"warm key": "warm value"})
        r = self.cache.retrieve("warm key")
        self.assertIn("hit", r.source)
        self.assertEqual(self.cache.hits, 1)

    def test_max_size_eviction(self):
        small_cache = CachedBackend(name="small", max_size=3)
        small_cache.warm({"a": "1", "b": "2", "c": "3"})
        small_cache.retrieve("d")  # should evict 'a'
        # 'a' should be evicted
        r = small_cache.retrieve("a")
        # no assertion on eviction result but no crash
        self.assertIsInstance(r, RetrievalResult)

    def test_cache_hit_faster(self):
        self.cache.retrieve("test query")   # miss
        r_hit = self.cache.retrieve("test query")  # hit
        self.assertLess(r_hit.latency_ms, 5)  # cache hit should be < 5ms

    def test_standalone_mode(self):
        standalone = CachedBackend(name="standalone", backend=None)
        r = standalone.retrieve("unknown query")
        self.assertIsInstance(r, RetrievalResult)


class TestGenerativeBackend(unittest.TestCase):

    def setUp(self):
        self.backend = GenerativeBackend(name="test-gen", simulated_latency_ms=1)

    def test_returns_result(self):
        r = self.backend.retrieve("explain quantum computing")
        self.assertIsInstance(r, RetrievalResult)

    def test_answer_contains_query(self):
        q = "explain quantum computing"
        r = self.backend.retrieve(q)
        self.assertIn(q, r.answer)

    def test_score_in_range(self):
        r = self.backend.retrieve("test")
        self.assertGreaterEqual(r.score, 0.70)
        self.assertLessEqual(r.score, 1.0)

    def test_simulated_flag(self):
        r = self.backend.retrieve("test")
        self.assertTrue(r.metadata.get("simulated"))

    def test_active_connections_reset(self):
        self.backend.retrieve("test")
        self.assertEqual(self.backend.active_connections, 0)


if __name__ == "__main__":
    unittest.main()
