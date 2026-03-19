"""
LatencyTracker — per-backend p50/p95/p99 latency statistics.

Uses a sliding window + exponential moving averages for low-memory tracking.
Also maintains a bounded sample buffer for accurate percentile computation.
"""

from __future__ import annotations

import math
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LatencyStats:
    backend_name: str
    count: int
    mean_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    min_ms: float
    max_ms: float
    ema_ms: float          # exponential moving average

    def __str__(self) -> str:
        return (
            f"{self.backend_name}: n={self.count} "
            f"mean={self.mean_ms:.2f}ms "
            f"p50={self.p50_ms:.2f}ms "
            f"p95={self.p95_ms:.2f}ms "
            f"p99={self.p99_ms:.2f}ms "
            f"ema={self.ema_ms:.2f}ms"
        )


def _percentile(sorted_samples: list[float], p: float) -> float:
    """Compute percentile from a sorted list. p in [0, 100]."""
    if not sorted_samples:
        return 0.0
    n = len(sorted_samples)
    idx = (p / 100) * (n - 1)
    lower = int(idx)
    upper = min(lower + 1, n - 1)
    frac = idx - lower
    return sorted_samples[lower] * (1 - frac) + sorted_samples[upper] * frac


class LatencyTracker:
    """
    Tracks per-backend latency with percentile computation.

    Maintains a bounded circular buffer (default 2000 samples) per backend.
    Sorted samples are cached and invalidated on new observations for efficiency.
    """

    def __init__(self, window_size: int = 2000, ema_alpha: float = 0.05):
        """
        Args:
            window_size: max samples per backend (older samples evicted)
            ema_alpha:   EMA smoothing factor (0 < α ≤ 1); lower = more stable
        """
        self._window = window_size
        self._alpha = ema_alpha
        self._lock = threading.Lock()
        # backend_name → deque of latency samples (ms)
        self._samples: dict[str, deque[float]] = {}
        # backend_name → cached sorted samples (invalidated on write)
        self._sorted_cache: dict[str, Optional[list[float]]] = {}
        # backend_name → EMA value
        self._ema: dict[str, float] = {}
        # backend_name → running sum, min, max
        self._sum: dict[str, float] = {}
        self._min: dict[str, float] = {}
        self._max: dict[str, float] = {}

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def record(self, backend_name: str, latency_ms: float) -> None:
        """Record a latency observation for a backend."""
        with self._lock:
            if backend_name not in self._samples:
                self._samples[backend_name] = deque(maxlen=self._window)
                self._sorted_cache[backend_name] = None
                self._ema[backend_name] = latency_ms
                self._sum[backend_name] = 0.0
                self._min[backend_name] = math.inf
                self._max[backend_name] = -math.inf

            buf = self._samples[backend_name]

            # If evicting, subtract from sum
            if len(buf) == self._window:
                evicted = buf[0]
                self._sum[backend_name] -= evicted

            buf.append(latency_ms)
            self._sorted_cache[backend_name] = None  # invalidate
            self._sum[backend_name] += latency_ms
            self._min[backend_name] = min(self._min[backend_name], latency_ms)
            self._max[backend_name] = max(self._max[backend_name], latency_ms)
            # EMA update
            α = self._alpha
            self._ema[backend_name] = α * latency_ms + (1 - α) * self._ema[backend_name]

    # ------------------------------------------------------------------
    # Querying
    # ------------------------------------------------------------------

    def stats(self, backend_name: str) -> Optional[LatencyStats]:
        """Return latency statistics for a backend, or None if no data."""
        with self._lock:
            buf = self._samples.get(backend_name)
            if not buf:
                return None

            # Build sorted cache if needed
            if self._sorted_cache[backend_name] is None:
                self._sorted_cache[backend_name] = sorted(buf)
            sorted_s = self._sorted_cache[backend_name]

            n = len(sorted_s)
            mean = self._sum[backend_name] / n

            return LatencyStats(
                backend_name=backend_name,
                count=n,
                mean_ms=round(mean, 3),
                p50_ms=round(_percentile(sorted_s, 50), 3),
                p95_ms=round(_percentile(sorted_s, 95), 3),
                p99_ms=round(_percentile(sorted_s, 99), 3),
                min_ms=round(self._min[backend_name], 3),
                max_ms=round(self._max[backend_name], 3),
                ema_ms=round(self._ema[backend_name], 3),
            )

    def all_stats(self) -> list[LatencyStats]:
        """Return stats for all tracked backends."""
        with self._lock:
            names = list(self._samples.keys())
        return [s for name in names if (s := self.stats(name)) is not None]

    def backend_names(self) -> list[str]:
        with self._lock:
            return list(self._samples.keys())
