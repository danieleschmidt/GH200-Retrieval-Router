"""Tests for QueryClassifier."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from retrieval_router.classifier import QueryClassifier, QueryTier


class TestQueryClassifier(unittest.TestCase):

    def setUp(self):
        self.clf = QueryClassifier()

    def test_cached_short_query(self):
        result = self.clf.classify("hello")
        self.assertEqual(result.tier, QueryTier.CACHED)

    def test_cached_single_word(self):
        result = self.clf.classify("ping")
        self.assertEqual(result.tier, QueryTier.CACHED)

    def test_exact_match_id_pattern(self):
        result = self.clf.classify("look up GH200-001 specs")
        self.assertEqual(result.tier, QueryTier.EXACT_MATCH)

    def test_exact_match_short_factual(self):
        result = self.clf.classify("what is python")
        self.assertEqual(result.tier, QueryTier.EXACT_MATCH)

    def test_semantic_medium_query(self):
        result = self.clf.classify("retrieval augmented generation improves factual accuracy")
        self.assertEqual(result.tier, QueryTier.SEMANTIC)

    def test_generative_explain(self):
        result = self.clf.classify("Explain why transformer architectures use attention mechanisms")
        self.assertEqual(result.tier, QueryTier.GENERATIVE)

    def test_generative_compare(self):
        result = self.clf.classify("Compare the trade-offs between exact match and dense retrieval")
        self.assertEqual(result.tier, QueryTier.GENERATIVE)

    def test_confidence_range(self):
        for q in ["hi", "what is numpy", "explain deep learning thoroughly"]:
            r = self.clf.classify(q)
            self.assertGreaterEqual(r.confidence, 0.0)
            self.assertLessEqual(r.confidence, 1.0)

    def test_batch_classify(self):
        queries = ["hello", "what is rag", "explain embeddings in detail please"]
        results = self.clf.classify_batch(queries)
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0].tier, QueryTier.CACHED)

    def test_signals_populated(self):
        r = self.clf.classify("what is a transformer model")
        self.assertIn("token_count", r.signals)
        self.assertIn("reason", r.signals)


class TestQueryClassifierEdgeCases(unittest.TestCase):

    def setUp(self):
        self.clf = QueryClassifier()

    def test_empty_string_cached(self):
        result = self.clf.classify("")
        self.assertEqual(result.tier, QueryTier.CACHED)

    def test_uuid_pattern(self):
        result = self.clf.classify("get document uuid:550e8400-e29b-41d4-a716-446655440000")
        self.assertEqual(result.tier, QueryTier.EXACT_MATCH)

    def test_very_long_query_generative(self):
        long = " ".join(["word"] * 30)
        result = self.clf.classify(long)
        self.assertEqual(result.tier, QueryTier.GENERATIVE)


if __name__ == "__main__":
    unittest.main()
