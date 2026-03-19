#!/usr/bin/env python3
"""
GH200 Retrieval Router — Demo

Routes 100 queries through the system and prints tier distribution + latency stats.
"""

import random
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from retrieval_router import (
    RetrievalRouter,
    QueryTier,
    ExactMatchBackend,
    SemanticBackend,
    CachedBackend,
    GenerativeBackend,
)

# ---------------------------------------------------------------------------
# Build corpus
# ---------------------------------------------------------------------------

EXACT_CORPUS = {
    "what is python": "Python is a high-level, interpreted programming language.",
    "what is numpy": "NumPy is a library for numerical computing in Python.",
    "who is alan turing": "Alan Turing was a mathematician and computer scientist.",
    "what is rag": "RAG (Retrieval-Augmented Generation) combines retrieval with LLMs.",
    "what is tfidf": "TF-IDF measures term frequency weighted by inverse document frequency.",
    "define embeddings": "Embeddings are dense vector representations of text or data.",
    "what is a gpu": "A GPU (Graphics Processing Unit) is used for parallel computation.",
    "what is cuda": "CUDA is NVIDIA's parallel computing platform for GPU programming.",
    "gh200-001": "GH200 spec: 480GB HBM3e, 900GB/s NVLink bandwidth, 72 Arm cores.",
    "ticket-42": "Ticket 42: Fix memory leak in the vector index compaction path.",
}

SEMANTIC_CORPUS = [
    "The GH200 Grace Hopper Superchip combines ARM CPU and Hopper GPU for HPC workloads.",
    "NVLink-C2C provides 900 GB/s chip-to-chip bandwidth for CPU-GPU coherent memory.",
    "High-throughput inference requires careful batching strategies to saturate GPU FLOPS.",
    "Retrieval-augmented generation improves factual accuracy by grounding LLM outputs.",
    "TF-IDF similarity is a lightweight alternative to dense embeddings for small corpora.",
    "Least-connections load balancing routes traffic to the least busy backend instance.",
    "Exponential moving averages smooth noisy latency signals for stable p99 estimation.",
    "LRU caching is effective for workloads with temporal locality in query patterns.",
    "Vector databases use ANN indices like HNSW or IVF-PQ for fast similarity search.",
    "Query classification reduces unnecessary LLM calls by routing to cheaper backends.",
    "CUDA kernel fusion reduces memory bandwidth pressure in attention computation.",
    "Flash attention rewrites the attention algorithm to avoid materializing large matrices.",
    "Quantization reduces model size and increases throughput with minimal accuracy loss.",
    "Speculative decoding uses a small draft model to accelerate autoregressive generation.",
    "Prefix caching avoids redundant KV computation for shared context in batched requests.",
]

CACHE_WARMUP = {
    "hello": "Hello! How can I help you?",
    "hi": "Hi there!",
    "help": "I can answer questions about AI, hardware, and retrieval systems.",
    "version": "GH200-Retrieval-Router v1.0.0",
    "status": "All systems operational.",
    "ping": "pong",
}

# ---------------------------------------------------------------------------
# Sample queries (mix of tiers)
# ---------------------------------------------------------------------------

CACHED_QUERIES = [
    "hello", "hi", "help", "status", "ping", "version",
    "ok", "thanks", "bye", "yes",
]

EXACT_QUERIES = [
    "what is python", "what is numpy", "what is rag", "gh200-001",
    "ticket-42", "define embeddings", "what is cuda", "what is a gpu",
    "who is alan turing", "what is tfidf",
]

SEMANTIC_QUERIES = [
    "how does NVLink bandwidth affect inference throughput",
    "retrieval augmented generation improves accuracy",
    "batching strategies for GPU utilization",
    "TF-IDF vs dense embeddings for similarity",
    "load balancing algorithms for distributed inference",
    "latency tracking with exponential moving averages",
    "caching query results for repeated workloads",
    "vector database index structures HNSW",
    "quantization techniques for LLM serving",
    "Flash attention memory optimization",
]

GENERATIVE_QUERIES = [
    "Explain why retrieval-augmented generation improves factual accuracy compared to standard LLMs",
    "Compare the trade-offs between exact match and semantic retrieval for enterprise search",
    "Analyze how the GH200 architecture benefits high-throughput RAG inference workloads",
    "Why does p99 latency matter more than mean latency for production inference systems?",
    "Describe how speculative decoding and prefix caching interact in batched LLM serving",
    "How should a system choose between TF-IDF and dense vector retrieval at query time?",
    "Evaluate the pros and cons of LRU caching for highly variable query distributions",
    "Explain the difference between NVLink and PCIe for multi-GPU memory bandwidth",
    "How does query classification reduce overall system cost in a RAG pipeline?",
    "Summarize the key design decisions in a high-throughput retrieval routing system",
]


def build_query_set(n: int = 100) -> list[str]:
    """Sample n queries with realistic tier distribution."""
    random.seed(42)
    pool = (
        CACHED_QUERIES * 3        # ~18%
        + EXACT_QUERIES * 3       # ~18%
        + SEMANTIC_QUERIES * 4    # ~24%
        + GENERATIVE_QUERIES * 4  # ~24%
        + [f"what is term {i}" for i in range(30)]   # more exact-ish
        + [f"explain concept {i} in detail" for i in range(20)]  # more generative
    )
    return random.choices(pool, k=n)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 65)
    print("  GH200 Retrieval Router — Demo (100 queries)")
    print("=" * 65)

    # --- Build backends ---
    exact1 = ExactMatchBackend(name="exact-1", corpus=EXACT_CORPUS)
    exact2 = ExactMatchBackend(name="exact-2", corpus=EXACT_CORPUS)

    semantic = SemanticBackend(name="semantic-1", corpus=SEMANTIC_CORPUS)

    cache = CachedBackend(name="cache-1", backend=semantic, max_size=512)
    cache.warm(CACHE_WARMUP)

    gen1 = GenerativeBackend(name="generative-1", simulated_latency_ms=80)
    gen2 = GenerativeBackend(name="generative-2", simulated_latency_ms=90)

    # --- Wire up router ---
    router = RetrievalRouter(fallback_score_threshold=0.15)
    router.add_backend(QueryTier.CACHED, cache)
    router.add_backend(QueryTier.EXACT_MATCH, exact1)
    router.add_backend(QueryTier.EXACT_MATCH, exact2)
    router.add_backend(QueryTier.SEMANTIC, semantic)
    router.add_backend(QueryTier.GENERATIVE, gen1)
    router.add_backend(QueryTier.GENERATIVE, gen2)

    # --- Route 100 queries ---
    queries = build_query_set(100)
    print(f"\nRouting {len(queries)} queries...\n")

    results = router.route_batch(queries)

    # --- Sample output ---
    print("Sample results (first 5):")
    print("-" * 65)
    for r in results[:5]:
        fb = " [fallback]" if r.fallback_used else ""
        answer_preview = r.retrieval.answer[:70].replace("\n", " ")
        print(f"  Q: {r.query[:55]!r}")
        print(f"     tier={r.tier.name}{fb}  score={r.retrieval.score:.2f}  "
              f"latency={r.total_latency_ms:.2f}ms")
        print(f"     A: {answer_preview}...")
        print()

    # --- Tier distribution ---
    print("Tier Distribution")
    print("-" * 65)
    dist = router.tier_distribution()
    pct = router.tier_distribution_pct()
    for tier in QueryTier:
        bar = "█" * int(pct[tier.name] / 2)
        print(f"  {tier.name:15s}  {dist[tier.name]:4d} queries  ({pct[tier.name]:5.1f}%)  {bar}")

    # --- Latency stats ---
    print("\nLatency Statistics (per backend)")
    print("-" * 65)
    for stat in router._tracker.all_stats():
        print(f"  {stat}")

    # --- Cache performance ---
    print(f"\nCache hit rate: {cache.hit_rate:.1%}  "
          f"(hits={cache.hits}, misses={cache.misses})")

    # --- Summary ---
    summary = router.summary()
    print(f"\nTotal routed: {summary['total_queries']}  "
          f"Errors: {summary['errors']}")
    print("=" * 65)


if __name__ == "__main__":
    main()
