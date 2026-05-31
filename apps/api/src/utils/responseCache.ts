type CachedEntry<T> = {
  expiresAt: number;
  value: T;
};

const cache = new Map<string, CachedEntry<unknown>>();

export function getCachedValue<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setCachedValue<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, ttlMs),
  });
}

export function invalidateCachedValues(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
