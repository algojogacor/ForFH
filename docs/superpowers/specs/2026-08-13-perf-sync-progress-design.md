# ForFH: Performance Overhaul + Background Sync Progress

Tanggal: 2026-08-13 · Branch: `feat/perf-sync-progress` · Status: **Disetujui user**

## Context

ForFH (Next.js 15 + Turso/Drizzle, deploy Koyeb) sudah menyimpan data kampus di DB (bukan realtime per kunjungan), tetapi audit performa menemukan: (1) setiap login = sync penuh paksa ke Kampus Kita + HE-BAT tanpa cooldown; (2) tidak ada visibilitas progres sync; (3) tidak ada guard race / pemulihan proses mati di tengah sync; (4) nol caching di API GET; (5) hasil AI tidak pernah di-cache (daily-insight dipanggil ulang tiap buka halaman); (6) cron reminders N+1 berurutan; (7) AI tanpa rate limit dan tanpa deadline total; (8) 3-4 query auth per request.

User memutuskan: implementasikan SEMUA perbaikan performa, dengan fitur background sync + loading bar progress dipasang di **dua tempat: dashboard + halaman Pengaturan** (opsi C).

## Tujuan (success criteria)

1. Login tetap instan (fire-and-forget, sudah) + cooldown sync (`SYNC_INTERVAL_MIN`, default 30 mnt; deploy disarankan 60).
2. User bisa melihat progres sync ("sedang sampai mana") di dashboard & Pengaturan.
3. Tidak ada error saat user keluar paksa (tutup tab, logout, redeploy di tengah sync).
4. Beban ke UNAIR/HE-BAT/provider AI turun (cooldown, cache AI, rate limit).
5. Semua tes hijau (172 + tes baru), build OK, keamanan & data integrity tidak berubah.

## Non-goals (tidak diimplementasi, dengan alasan)

- Outbox batch sync (offline jarang dipakai; benefit kecil vs risiko)
- DB connection pooling (1 instance Koyeb; Turso HTTP memadai)
- `loading.tsx` global (halaman client render instan; spinner internal sudah ada)
- Cookie-JWT untuk settings (perubahan arsitektur auth; throttle last_seen cukup)
- Streaming AI (endpoint JSON-schema; tidak memberi manfaat)

## A. Background sync + progress

### A1. Migrasi 0003 (via `npm run db:generate`, bukan tulis manual)

- `campus_accounts` + kolom:
  - `sync_state` TEXT NOT NULL DEFAULT 'idle' — 'idle' | 'running'
  - `sync_step` TEXT (nullable) — label langkah aktif
  - `sync_started_at` INTEGER (ms, nullable)
- Tabel baru `ai_cache`:
  - `id` text PK, `user_id` text FK users cascade
  - `jenis` text ('daily_insight' | 'explain_law'), `cache_key` text
  - `result_json` text, `expires_at` integer (ms)
  - unique index `(user_id, jenis, cache_key)`

### A2. Lock anti-race (atomic)

`runCampusSync(userId, opts)` setelah `findAccount` & throttle:

```ts
// atomic claim — SELECT tidak cukup (race antar instance/proses)
const claim = await db.update(campusAccounts).set({
  syncState: "running", syncStep: "mulai", syncStartedAt: Date.now(),
}).where(and(
  eq(campusAccounts.userId, userId),
  or(
    ne(campusAccounts.syncState, "running"),
    isNull(campusAccounts.syncStartedAt),
    lt(campusAccounts.syncStartedAt, Date.now() - STALE_SYNC_MS), // 10 menit
  )
)).returning();
if (claim.length === 0) return { ...SKIPPED, reason: "in_progress" };
```

- TTL stale `STALE_SYNC_MS = 10 * 60 * 1000` → proses mati di tengah (redeploy/crash) otomatis diambil alih tick berikutnya.
- `finally`: selalu reset `sync_state='idle'` (success & error).
- Skip karena in-progress: kembalikan `skipped: true` (sama seperti throttle skip).

### A3. Progress per langkah

Fase di `runCampusSync` (urut): `mulai → jadwal → kursus → tugas → nilai → info → selesai`.
Helper `setSyncStep(userId, step)` = `UPDATE campus_accounts SET sync_step=?` (1 query, fire-and-forget via await biasa). Posisi hook:

1. setelah claim: `mulai`
2. sebelum `Promise.all([jadwal, semesters, ics])`: `jadwal`
3. sebelum loop courses/schedules: `kursus`
4. sebelum loop tasks: `tugas`
5. sebelum loop KHS: `nilai`
6. sebelum `Promise.all(campusFetchers)`: `info`
7. setelah update status akhir: `selesai` → lalu `finally` reset idle

Error: `markSyncError` tetap dipanggil (lastSyncStatus='error', lastSyncError) lalu reset lock.

### A4. Login cooldown

`src/app/api/auth/login/route.ts` `bootstrapCampus`: `runCampusSync(userId)` **tanpa** `force: true` → throttle default 30 mnt berlaku. Login pertama (lastSyncAt null) tetap sync penuh. `void` fire-and-forget dipertahankan.

### A5. Route GET `/api/campus/sync-status`

Pola `/api/campus/status`: `getSessionUser()` → findFirst campusAccounts → tidak ada → `{connected:false}`. Ada →
`{connected, state, step, startedAt, lastSyncAt, lastSyncStatus, lastSyncError}`.

### A6. POST `/api/campus/sync` → background

`void runCampusSync(session.id, {force:true}).catch(e => markSyncError(...))` + return `{started:true}` segera. Tombol Pengaturan tidak menggantung 30+ detik.

### A7. UI `SyncProgressCard` (client component)

- Props: `{compact?: boolean}` (dashboard vs pengaturan).
- Poll `GET /api/campus/sync-status` tiap 2 detik **hanya saat** state='running' (atau saat first load state running). `setInterval` + cleanup `clearInterval` on unmount (AbortController per fetch; fetch dalam flight di-ignore saat unmount → tidak setState setelah unmount).
- Render:
  - `running` → bar progress **determinate** `percent = floor(phaseIndex / 7 * 100)` (7 fase: mulai..selesai) + label langkah Indonesia:
    `mulai` "Memulai sinkronisasi…", `jadwal` "Menyinkronkan jadwal…", `kursus` "Menyimpan mata kuliah…", `tugas` "Menyinkronkan tugas HE-BAT…", `nilai` "Menyinkronkan nilai…", `info` "Menyinkronkan info kampus…", `selesai` "Selesai ✓"
  - `lastSyncStatus='error'` → strip error merah + tombol "Coba lagi" (POST /api/campus/sync) + teks error (truncate)
  - idle + tidak error → sembunyi (kecuali `lastSyncAt` < 30 detik → tampilkan "Selesai ✓" transisi singkat)
  - `connected:false` → null (tidak dirender)
- Dashboard: `src/app/page.tsx` (RSC) — render `<SyncProgressCard/>` di atas konten utama **hanya untuk user connected** (cek campusAccounts di RSC, lalu pass `initialConnected`). Halaman lain client → cukup render komponen, ia polling sendiri.

### A8. Ketahanan "keluar paksa"

- Tutup tab/navigasi: server-side sync lanjut (proses Node tetap hidup); client polling berhenti via cleanup, tidak setState-after-unmount.
- Logout di tengah sync: sync keyed by userId, lanjut selesai; cooldown mencegah tabrakan setelah login ulang.
- Dua+ sync bersamaan (login+cron+manual): lock A2 → satu yang menang, lain `skipped`.
- Proses mati: TTL A2 (10 mnt) → tick berikutnya ambil alih.

## B. Item performa

### B1. Cache hasil AI (`ai_cache`)

- Helper `src/lib/ai/cache.ts`: `getCachedAI(userId, jenis, key)` / `setCachedAI(userId, jenis, key, json, ttlMs)`; hapus expired saat get; `expires_at` filter di SQL.
- `daily-insight`: key = `YYYY-MM-DD` (waktu lokal Asia/Jakarta — pakai Intl dengan timeZone), TTL 24 jam.
- `explain-law`: key = `sha256(question + context)` (dari request), TTL 24 jam.
- Endpoint lain (breakdown-task, parse-task, smart-deadline, summarize-note): input dinamis → TIDAK di-cache (jaga kualitas, hindari jawaban basi).

### B2. AI deadline total 35 detik

`executeAIRequest` (src/lib/ai/router.ts): catat `deadline = Date.now() + 35_000`; setiap pergantian slot cek `Date.now() > deadline` → hentikan rantai fallback; respons akhir tetap via path degradation yang ada (timeout → fallback berikutnya / error graceful).

### B3. AI rate limit + aiEnabled gate server-side

- Helper `checkRateLimit(scope, key)` pola login (tabel `auth_rate_limits`): scope `'ai'`, key = userId → **30 req/jam** per user. Di `executeAIRequest` awal: kalau over → throw error khas → route kembalikan 429.
- Gate `aiEnabled`: baca `userSettings` sekali di `executeAIRequest` (1 query, hanya saat request AI masuk); kalau off → 403-style error graceful. (Tidak menambah query per request lain.)
- Catatan: `executeAIRequest` butuh userId → pastikan pemanggil route mengoper `session.id` (cek tiap route AI; beberapa mungkin belum).

### B4. Cron reminders + cleanup

`src/lib/notifications/worker.ts`:
- Cap user/tick: 50 (dari tak terbatas).
- Hilangkan N+1: 1 query settings + 1 query schedules + 1 query tasks per user (sudah pola), lalu query dedupe per user untuk (schedule×offset, task×offset) jadi satu query batch per user.
- Concurrency: `Promise.all` dengan pool 5 user.
- `syncDueUsers` (sync.ts): pool 3 paralel.
- Cleanup `ai_usage`: di akhir tick, 1×/hari (guard `app_config` key `ai_usage_cleanup_last`): `DELETE WHERE created_at < now - 90 hari`.

### B5. In-memory cache 60s GET mahal

- Helper `src/lib/cache/mem-cache.ts`: module-level `Map<string, {expiresAt, value}>`; `memGet(key)` / `memSet(key, value, ttlMs=60_000)` / `memDel(keyPrefix)`.
- Dipasang di:
  - `GET /api/campus/info`: key `campus-info:{userId}`, TTL 60s. Invalidasi: setelah sync selesai (di `runCampusSync` akhir / `markSyncError`) → `memDel('campus-info:')` — hmm, key per user: `memDelKey('campus-info:'+userId)`.
  - `GET /api/tasks`: key `tasks:{userId}`, TTL 30s. Invalidasi dari route mutasi tasks (POST/PATCH/DELETE `/api/tasks`).
  - `GET /api/notes`: list → strip `content` (payload turun drastis); `?includeContent=true` untuk editor. Cache list 30s; invalidasi pada mutasi notes.
- Catatan: valid untuk 1 instance (Koyeb free tier). Komentar di helper: saat multi-instance, ganti shared store.

### B6. Throttle `last_seen_at`

`src/lib/auth/session.ts` `getSessionUser`: module Map `lastSeenSentAt: Map<userId, number>`; update DB hanya jika `now - last > 60_000`.

### B7. Client cache SWR-ish

- Util `src/lib/client-cache.ts` ("use client" tidak perlu — murni browser util): `cachedFetch(url, {ttlMs=60_000})` → Map keyed URL; `clientCacheInvalidate(urlPrefix?)` dipanggil setelah mutasi sukses.
- Dipakai: `CommandMenu` (3 endpoint), `/kalender` (3 fetch), `/kehadiran` (2 fetch), `/info-kampus`. Halaman tetap refetch saat TTL lewat.
- Hati-hati: jangan cache POST; hanya GET.

### B8. MarkdownEditor dynamic

`src/components/notes/MarkdownEditor.tsx` → `next/dynamic(() => import(...), {ssr:false})` di pemakai (catatan/bacaan/berkas). Cek pola import pemakai saat implementasi.

### B9. Circuit breaker persist

`src/lib/ai/circuit-breaker.ts`: pada 429/5xx tulis `cooldown_until` ke `app_config` (key `ai_slot_cooldown:{slot}`); init baca dari DB. Sisakan in-memory sebagai fast-path.

### B10. robots.ts + sitemap.ts

`src/app/robots.ts` (allow all + sitemap URL) & `src/app/sitemap.ts` (1 URL utama dari `NEXT_PUBLIC_APP_URL`). Kecil, tidak runtime.

## Verifikasi

1. `npm run quality` — 172 tes tetap hijau + tes baru: lock claim (state transisi), skip in-progress, rate limit AI (over → reject), cache helper (TTL, expiry, invalidasi), deadline router (slot > deadline tidak dipanggil), B5 helper.
2. `npm run build` — 55+ routes, standalone OK.
3. Live lokal (`npm run dev`, akun sendiri):
   - Login → card progress muncul di dashboard (sync pertama jalan, terlihat langkah-langkah).
   - Pengaturan → card progress + tombol "Sync sekarang" return cepat, progress terlihat.
   - Tutup tab di tengah sync → tidak ada error di log server; polling berhenti bersih.
   - Cooldown: login ulang < 30 mnt → sync skipped (status menunjukkan lastSyncAt baru tidak berubah).
   - Error path: hentikan internet saat sync → card menampilkan error + tombol coba lagi.
4. Manual E2E (WebBridge) bila perlu: connect HE-BAT + sync dari localhost.

## Risiko & mitigasi

- **Race lock tidak support bila ada Turso replica lag** → lock via conditional UPDATE adalah operasi atomik pada primary; Turso single-primary. Aman.
- **In-memory cache vs multi-instance** → didokumentasikan; Koyeb free = 1 instance. Invalidasi menyeluruh dari route mutasi mencegah data basi.
- **B4 mengubah worker reminder** → perilaku notifikasi tidak berubah (hanya batching/concurrency); tes quality menutup logika dedupe.
- **AI rate limit 30/jam** → cukup untuk pemakaian normal; 429 ditampilkan ramah di UI.
- **aiEnabled gate** → user yang mematikan AI di Pengaturan: semua route AI 403 graceful (tidak crash, UI menampilkan pesan).
- **Migrasi 0003** → additive; `db:push` tidak digunakan; generate via drizzle-kit menjaga snapshot.

## Urutan implementasi (commit per langkah)

1. `0003` schema + generate + migrate lokal
2. A2-A4 sync lock/progress/cooldown + A5 route status + A6 POST background
3. A7 UI card (dashboard + pengaturan) + A8
4. B1-B3 AI (cache, deadline, rate limit, gate)
5. B4 cron + cleanup
6. B5-B6 mem-cache + throttle session
7. B7 client cache
8. B8-B10 (dynamic import, circuit persist, robots/sitemap)
9. Tes baru + `npm run quality` + `npm run build` → review mandiri → serahkan ke user
