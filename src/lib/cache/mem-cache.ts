// In-memory TTL cache (module-level). SAAT INI VALID untuk 1 instance (Koyeb
// free tier). Bila deploy multi-instance nanti, ganti dengan shared store
// (Redis/Upstash) — API-nya bisa tetap sama.
const store = new Map<string, { expiresAt: number; value: unknown }>();

export function memGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function memSet(key: string, value: unknown, ttlMs = 60_000): void {
  store.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function memDel(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function memClear(): void {
  store.clear();
}
