interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class TTLCache {
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly store = new Map<string, CacheEntry<unknown>>();

  constructor(defaultTtlSeconds = 420, maxEntries = 768) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds?: number): void {
    const ttlMs = (ttlSeconds ?? this.defaultTtlMs / 1000) * 1000;
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictOldest();
    }
    this.store.set(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    });
  }

  clear(): void {
    this.store.clear();
  }

  private evictOldest(): void {
    const now = Date.now();
    for (const [k, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(k);
      }
    }
    if (this.store.size >= this.maxEntries && this.store.size > 0) {
      let oldestKey: string | null = null;
      let oldestExp = Infinity;
      for (const [k, entry] of this.store.entries()) {
        if (entry.expiresAt < oldestExp) {
          oldestExp = entry.expiresAt;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) {
        this.store.delete(oldestKey);
      }
    }
  }
}
