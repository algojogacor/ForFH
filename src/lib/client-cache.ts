// Cache fetch GET sisi client (SWR-ish): dalam 60 detik, fetch dengan URL sama
// tidak memanggil server lagi. Wajib invalidate() setelah mutasi/logout/login
// agar data antar user & data basi tidak bocor.
const cache = new Map<string, { expiresAt: number; promise: Promise<any> }>();
const DEFAULT_TTL_MS = 60_000;

export function cachedFetch(url: string, ttlMs: number = DEFAULT_TTL_MS): Promise<any> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expiresAt > now) return hit.promise;
  const promise = fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch((e) => { cache.delete(url); throw e; });
  cache.set(url, { expiresAt: now + ttlMs, promise });
  return promise;
}

export function invalidateClientCache(prefix?: string): void {
  if (!prefix) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
