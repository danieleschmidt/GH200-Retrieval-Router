"""Tests for LoadBalancer."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import unittest
from retrieval_router.load_balancer import LoadBalancer
from retrieval_router.backends import ExactMatchBackend


def make_backend(name: str) -> ExactMatchBackend:
    return ExactMatchBackend(name=name, corpus={})


class TestLoadBalancer(unittest.TestCase):

    def test_select_single_backend(self):
        lb = LoadBalancer([make_backend("b1")])
        b = lb.select()
        self.assertEqual(b.name, "b1")

    def test_empty_pool_raises(self):
        lb = LoadBalancer()
        with self.assertRaises(RuntimeError):
            lb.select()

    def test_least_connections_selection(self):
        b1 = make_backend("b1")
        b2 = make_backend("b2")
        lb = LoadBalancer([b1, b2])

        # Manually simulate b1 being busy
        b1._active_connections = 5
        b2._active_connections = 1

        selected = lb.select()
        self.assertEqual(selected.name, "b2")

    def test_tie_broken_by_order(self):
        b1 = make_backend("b1")
        b2 = make_backend("b2")
        lb = LoadBalancer([b1, b2])
        # Both have 0 connections — b1 should win (first in list)
        selected = lb.select()
        self.assertEqual(selected.name, "b1")

    def test_add_backend(self):
        lb = LoadBalancer()
        lb.add_backend(make_backend("new"))
        self.assertEqual(lb.pool_size(), 1)

    def test_remove_backend(self):
        lb = LoadBalancer([make_backend("a"), make_backend("b")])
        removed = lb.remove_backend("a")
        self.assertTrue(removed)
        self.assertEqual(lb.pool_size(), 1)

    def test_remove_nonexistent(self):
        lb = LoadBalancer([make_backend("a")])
        removed = lb.remove_backend("x")
        self.assertFalse(removed)

    def test_stats_structure(self):
        lb = LoadBalancer([make_backend("s1")])
        lb.select()
        stats = lb.stats()
        self.assertEqual(len(stats), 1)
        self.assertIn("name", stats[0])
        self.assertIn("total_requests", stats[0])
        self.assertEqual(stats[0]["total_requests"], 1)

    def test_request_count_increments(self):
        lb = LoadBalancer([make_backend("cnt")])
        for _ in range(5):
            lb.select()
        self.assertEqual(lb.stats()[0]["total_requests"], 5)


if __name__ == "__main__":
    unittest.main()
