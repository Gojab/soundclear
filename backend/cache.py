from __future__ import annotations

import threading
import time
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")


class TTLCache:
    """Thread-safe in-memory TTL cache for ytmusicapi responses."""

    def __init__(self, default_ttl_seconds: int = 420, max_entries: int = 512) -> None:
        self._default_ttl = default_ttl_seconds
        self._max_entries = max_entries
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if now >= expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        ttl = ttl_seconds if ttl_seconds is not None else self._default_ttl
        expires_at = time.monotonic() + ttl
        with self._lock:
            if len(self._store) >= self._max_entries and key not in self._store:
                self._evict_oldest_locked()
            self._store[key] = (expires_at, value)

    def get_or_set(
        self, key: str, loader: Callable[[], T], ttl_seconds: Optional[int] = None
    ) -> T:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = loader()
        self.set(key, value, ttl_seconds=ttl_seconds)
        return value

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def _evict_oldest_locked(self) -> None:
        now = time.monotonic()
        expired_keys = [k for k, (exp, _) in self._store.items() if now >= exp]
        for k in expired_keys:
            del self._store[k]
        if len(self._store) >= self._max_entries and self._store:
            oldest_key = min(self._store, key=lambda k: self._store[k][0])
            del self._store[oldest_key]
