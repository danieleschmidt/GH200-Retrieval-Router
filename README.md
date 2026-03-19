# GH200 Retrieval Router

A high-throughput **retrieval-augmented generation (RAG) router** that classifies incoming queries and dispatches them to the most appropriate retrieval backend — keeping latency low and GPU utilization high.

Built with Python stdlib + `numpy` (no heavy ML dependencies). Designed for GH200 Grace Hopper inference nodes where minimizing CPU overhead on the routing path matters.

---

## Architecture

```
Query ──► QueryClassifier ──► RetrievalRouter ──► LoadBalancer ──► Backend
                                      │                                │
                                      ▼                                ▼
                              LatencyTracker ◄──────────── RetrievalResult
```

### Components

| Component | Role |
|---|---|
| `QueryClassifier` | Heuristic tier assignment in <1ms (no model inference) |
| `RetrievalRouter` | Orchestrates classification → dispatch → fallback |
| `LoadBalancer` | Least-connections selection across backend replicas |
| `LatencyTracker` | Per-backend p50/p95/p99 with EMA smoothing |
| `ExactMatchBackend` | O(1) dict lookup — ideal for structured IDs, codes, FAQs |
| `SemanticBackend` | TF-IDF cosine similarity — fast for small-to-medium corpora |
| `CachedBackend` | LRU cache wrapping any backend — exploits temporal locality |
| `GenerativeBackend` | LLM synthesis stub — replace body with real API call |

---

## Query Tiers

The `QueryClassifier` assigns each query to one of four tiers:

| Tier | Signal | Typical latency |
|---|---|---|
| `CACHED` | ≤2 tokens (single-word / greeting) | ~0.01ms |
| `EXACT_MATCH` | ID pattern or short factual question | ~0.01ms |
| `SEMANTIC` | Medium-length, no analytical keywords | ~0.1ms |
| `GENERATIVE` | "explain/compare/analyze" or long query | ~80-120ms |

Classification is purely heuristic (token count, regex patterns, keyword sets) — tunable via constructor params.

---

## Usage

```python
from retrieval_router import (
    RetrievalRouter, QueryTier,
    ExactMatchBackend, SemanticBackend,
    CachedBackend, GenerativeBackend,
)

# Build backends
exact = ExactMatchBackend("exact-1", corpus={"what is rag": "RAG combines retrieval with LLMs."})
semantic = SemanticBackend("semantic-1", corpus=["...passage 1...", "...passage 2..."])
cache = CachedBackend("cache-1", backend=semantic, max_size=1024)
gen = GenerativeBackend("gen-1", simulated_latency_ms=100)  # swap body for real LLM

# Wire router
router = RetrievalRouter(fallback_score_threshold=0.20)
router.add_backend(QueryTier.CACHED, cache)
router.add_backend(QueryTier.EXACT_MATCH, exact)
router.add_backend(QueryTier.SEMANTIC, semantic)
router.add_backend(QueryTier.GENERATIVE, gen)

# Route
result = router.route("what is rag")
print(result.retrieval.answer)   # RAG combines retrieval with LLMs.
print(result.tier)               # QueryTier.EXACT_MATCH
print(result.total_latency_ms)   # ~0.02

# Batch
results = router.route_batch(queries)

# Observability
print(router.tier_distribution_pct())   # {'CACHED': 20.0, 'EXACT_MATCH': 30.0, ...}
print(router.latency_summary())         # [LatencyStats(backend='cache-1', p99=0.01ms), ...]
```

---

## Demo

Routes 100 sample queries and prints tier distribution + latency stats:

```
python demo.py
```

Example output:

```
Tier Distribution
  CACHED            20 queries  ( 20.0%)  ██████████
  EXACT_MATCH       30 queries  ( 30.0%)  ███████████████
  SEMANTIC          11 queries  ( 11.0%)  █████
  GENERATIVE        39 queries  ( 39.0%)  ███████████████████

Latency Statistics (per backend)
  generative-1: n=62 mean=5.00ms p50=5.00ms p95=5.00ms p99=5.03ms
  cache-1(hit): n=8  mean=0.00ms p50=0.00ms p95=0.00ms p99=0.00ms
  exact-1:      n=18 mean=0.00ms p50=0.00ms p95=0.00ms p99=0.00ms
  semantic-1:   n=12 mean=0.05ms p50=0.05ms p95=0.05ms p99=0.05ms

Cache hit rate: 70.0%  (hits=14, misses=6)
```

---

## Tests

```
python -m pytest tests/ -v    # 65 tests, stdlib only
```

---

## Design Notes

**Why heuristic classification?**  
Model-based query classification adds 10-50ms per query and creates a dependency on a secondary inference path. For a routing layer, <1ms classification with explainable rules is preferable. The classifier is tunable and can be replaced with a small classifier model if needed.

**Why TF-IDF over dense embeddings?**  
The `SemanticBackend` intentionally uses TF-IDF for zero-dependency operation. In production, swap it for a FAISS/cuVS HNSW index backed by GPU-accelerated embeddings — the interface (`retrieve(query) → RetrievalResult`) is unchanged.

**Why least-connections?**  
On GH200 nodes with multiple backend replicas at different utilization levels, least-connections prevents queue buildup behind a slow replica. Round-robin is simpler but causes head-of-line blocking under variable latency.

**Fallback policy**  
If a backend returns a result with `score < fallback_score_threshold`, the router transparently retries against the `GENERATIVE` tier. This provides a safety net for out-of-distribution queries without surfacing empty results.

---

## License

MIT © Daniel Schmidt
