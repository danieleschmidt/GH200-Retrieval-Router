"""Tests for LatencyTracker."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from retrieval_router.latency_tracker import LatencyTracker


class TestLatencyTracker(unittest.TestCase):

    def setUp(self):
        self.tracker = LatencyTracker(window_size=100, ema_alpha=0.1)

    def test_no_data_returns_none(self):
        self.assertIsNone(self.tracker.stats("nonexistent"))

    def test_single_record(self):
        self.tracker.record("b1", 10.0)
        s = self.tracker.stats("b1")
        self.assertIsNotNone(s)
        self.assertEqual(s.count, 1)
        self.assertEqual(s.mean_ms, 10.0)
        self.assertEqual(s.p50_ms, 10.0)
        self.assertEqual(s.p99_ms, 10.0)

    def test_multiple_records_percentiles(self):
        # Record 100 values: 1..100 ms
        for i in range(1, 101):
            self.tracker.record("b1", float(i))
        s = self.tracker.stats("b1")
        self.assertEqual(s.count, 100)
        # p50 should be ~50ms
        self.assertAlmostEqual(s.p50_ms, 50.5, delta=1.0)
        # p95 should be ~95ms
        self.assertAlmostEqual(s.p95_ms, 95.05, delta=2.0)
        # p99 should be ~99ms
        self.assertAlmostEqual(s.p99_ms, 99.01, delta=2.0)

    def test_min_max(self):
        for v in [5.0, 10.0, 100.0, 2.0]:
            self.tracker.record("b1", v)
        s = self.tracker.stats("b1")
        self.assertEqual(s.min_ms, 2.0)
        self.assertEqual(s.max_ms, 100.0)

    def test_ema_updates(self):
        self.tracker.record("b1", 10.0)
        self.tracker.record("b1", 20.0)
        s = self.tracker.stats("b1")
        # EMA should be between 10 and 20
        self.assertGreater(s.ema_ms, 10.0)
        self.assertLess(s.ema_ms, 20.0)

    def test_window_eviction(self):
        tracker = LatencyTracker(window_size=10)
        for i in range(20):
            tracker.record("b1", float(i))
        s = tracker.stats("b1")
        # Window is 10 so only last 10 values (10-19)
        self.assertEqual(s.count, 10)
        self.assertAlmostEqual(s.mean_ms, 14.5, delta=0.1)

    def test_multiple_backends(self):
        self.tracker.record("b1", 5.0)
        self.tracker.record("b2", 50.0)
        self.tracker.record("b3", 500.0)
        all_stats = self.tracker.all_stats()
        names = {s.backend_name for s in all_stats}
        self.assertEqual(names, {"b1", "b2", "b3"})

    def test_backend_names(self):
        self.tracker.record("x", 1.0)
        self.tracker.record("y", 2.0)
        names = set(self.tracker.backend_names())
        self.assertEqual(names, {"x", "y"})

    def test_stats_str(self):
        self.tracker.record("b1", 10.0)
        s = self.tracker.stats("b1")
        text = str(s)
        self.assertIn("b1", text)
        self.assertIn("p50", text)
        self.assertIn("p99", text)


if __name__ == "__main__":
    unittest.main()
