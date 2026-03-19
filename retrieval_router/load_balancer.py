"""
LoadBalancer — distributes queries across backend instances using least-connections.

Strategy: pick the backend with the fewest active connections at dispatch time.
Ties are broken by backend index (stable ordering).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Optional

from .backends import RetrievalBackend


@dataclass
class BackendStats:
    backend: RetrievalBackend
    total_requests: int = 0
    total_errors: int = 0


class LoadBalancer:
    """
    Least-connections load balancer over a pool of RetrievalBackend instances.

    Thread-safe: selection uses a lock to prevent race conditions under
    concurrent dispatch (relevant for future async extensions).
    """

    def __init__(self, backends: Optional[list[RetrievalBackend]] = None):
        self._lock = threading.Lock()
        self._pool: list[BackendStats] = []
        for b in (backends or []):
            self.add_backend(b)

    # ------------------------------------------------------------------
    # Pool management
    # ------------------------------------------------------------------

    def add_backend(self, backend: RetrievalBackend) -> None:
        with self._lock:
            self._pool.append(BackendStats(backend=backend))

    def remove_backend(self, name: str) -> bool:
        with self._lock:
            before = len(self._pool)
            self._pool = [s for s in self._pool if s.backend.name != name]
            return len(self._pool) < before

    # ------------------------------------------------------------------
    # Selection
    # ------------------------------------------------------------------

    def select(self) -> RetrievalBackend:
        """Return the backend with the fewest active connections."""
        with self._lock:
            if not self._pool:
                raise RuntimeError("LoadBalancer: pool is empty")
            best = min(self._pool, key=lambda s: s.backend.active_connections)
            best.total_requests += 1
            return best.backend

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def stats(self) -> list[dict]:
        with self._lock:
            return [
                {
                    "name": s.backend.name,
                    "active_connections": s.backend.active_connections,
                    "total_requests": s.total_requests,
                    "total_errors": s.total_errors,
                }
                for s in self._pool
            ]

    def pool_size(self) -> int:
        return len(self._pool)
