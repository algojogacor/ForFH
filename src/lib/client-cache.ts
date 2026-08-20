// Cache fetch GET sisi client (SWR-ish): dalam 60 detik, fetch dengan URL sama
// tidak memanggil server lagi. Wajib invalidate() setelah mutasi/logout/login
// agar data antar user & data basi tidak bocor.
const cache = new Map<string, { expiresAt: number; promise: Promise<any> }>();
const DEFAULT_TTL_MS = 60_000;

function resolveTtl(url: string, explicitTtl?: number): number {
  if (explicitTtl !== undefined) return explicitTtl;
  if (url.startsWith("/api/campus/info")) return 3_600_000; // 1 jam (Tier 2/3 info kampus)
  if (url.startsWith("/api/courses") || url.startsWith("/api/schedules") || url.startsWith("/api/exams")) return 600_000; // 10 menit (Tier 3 jadwal & ujian)
  if (url.startsWith("/api/tasks")) return 30_000; // 30 detik (Tier 1 tugas dinamis)
  if (url.startsWith("/api/attendance")) return 60_000; // 60 detik (Tier 1 presensi)
  return DEFAULT_TTL_MS;
}

export function cachedFetch(url: string, ttlMs?: number): Promise<any> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && hit.expiresAt > now) return hit.promise;
  const finalTtl = resolveTtl(url, ttlMs);
  const promise = fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch((e) => { cache.delete(url); throw e; });
  cache.set(url, { expiresAt: now + finalTtl, promise });
  return promise;
}

export function invalidateClientCache(prefix?: string): void {
  if (!prefix) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
