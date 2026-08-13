# ForFH Performance + Background Sync Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terapkan semua item performa hasil audit + fitur background sync dengan progress bar (dashboard & Pengaturan) yang tahan banting terhadap keluar paksa, tanpa mengurangi kualitas (keamanan, data integrity, resiliensi).

**Architecture:** Progress sync ditulis ke `campus_accounts` (kolom baru `sync_state`/`sync_step`/`sync_started_at`) dengan atomic lock (conditional UPDATE) dan TTL stale 10 menit; UI mem-poll `GET /api/campus/sync-status`. Performa: cache hasil AI (tabel `ai_cache`), deadline 35s + rate limit AI + gate aiEnabled di `executeAIRequest`, cron reminders di-cap & di-paralelkan, in-memory TTL cache untuk GET mahal dengan invalidasi dari route mutasi, throttle `last_seen_at`, client cache SWR-ish, dynamic import MarkdownEditor, circuit breaker persist ke `app_config`, robots/sitemap.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + Turso/libSQL, React 19, QStash cron, @libsql/client.

**Spec:** `docs/superpowers/specs/2026-08-13-perf-sync-progress-design.md`

## Global Constraints

- Kerjakan di branch `feat/perf-sync-progress` (sudah dibuat). JANGAN push tanpa izin user; user yang merge ke master.
- Jangan pernah menulis rahasia (token, password, JWT) ke file repo/commit/memory.
- Migrasi DB via `npm run db:generate` (drizzle-kit), JANGAN tulis SQL manual — snapshot harus konsisten.
- Semua tes harus tetap hijau: `npm run quality` (172 saat ini + tambahan baru). Build: `npm run build`.
- Ikuti pola kode yang ada (upsert, markSyncError, getSessionUser, logger, toast/success).
- Bahasa UI/teks: Indonesia (konsisten dengan app).
- `FORFH_SYNC_INTERVAL_MIN` default 30 (jangan ubah kode default; deploy pakai env 60 — langkah user).
- Kolom/type mengikuti schema Drizzle: timestamp = `integer(..., { mode: "timestamp_ms" })`, boolean = `integer(0|1)`.

---

### Task 1: Migrasi 0003 — kolom progress sync + tabel ai_cache

**Files:**
- Modify: `src/lib/db/schema.ts`
- Generate: `npm run db:generate` → `src/lib/db/migrations/0003_*.sql`
- Modify: `src/lib/db/init.ts` (DDL mirror maintenance-only — ikuti pola tabel campus_data)

**Interfaces:**
- Produces: kolom `campusAccounts.syncState` ('idle'|'running'), `campusAccounts.syncStep` (text|null), `campusAccounts.syncStartedAt` (Date|null); tabel `aiCache` (kolom: id, userId, jenis, cacheKey, resultJson, expiresAt, createdAt; unique `(user_id, jenis, cache_key)`). Nama export Drizzle: `aiCache`.

- [ ] **Step 1: Tambah kolom di `campusAccounts`** (schema.ts L33-58, setelah `lastSyncError` L47):

```ts
    lastSyncError: text("last_sync_error"),
    syncState: text("sync_state").notNull().default("idle"), // idle | running
    syncStep: text("sync_step"), // label langkah aktif (mulai, jadwal, kursus, tugas, nilai, info, selesai)
    syncStartedAt: integer("sync_started_at", { mode: "timestamp_ms" }),
```

- [ ] **Step 2: Tambah tabel `aiCache`** — sisipkan setelah blok `aiUsage` (schema.ts L644, sebelum `authRateLimits` L646):

```ts
export const aiCache = sqliteTable(
  "ai_cache",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jenis: text("jenis").notNull(), // daily_insight | explain_law
    cacheKey: text("cache_key").notNull(),
    resultJson: text("result_json").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userJenisKeyIdx: uniqueIndex("ai_cache_user_jenis_key_idx").on(table.userId, table.jenis, table.cacheKey),
  })
);
```

- [ ] **Step 3: Generate + migrate lokal**

```bash
npm run db:generate
npm run db:migrate   # terhadap forfh-local.db (env default file:) — cek 0003 applied
```

Expected: file `0003_*.sql` berisi ALTER TABLE campus_accounts ADD kolom + CREATE TABLE ai_cache + unique index; `meta/_journal.json` bertambah; migrate sukses & idempoten (jalankan 2×).

- [ ] **Step 4: Mirror DDL ke `src/lib/db/init.ts`** — ikuti pola blok `campus_data` di file itu: tambah `ALTER TABLE campus_accounts ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'idle'` (guard jika kolom sudah ada), `sync_step TEXT`, `sync_started_at INTEGER`; `CREATE TABLE IF NOT EXISTS ai_cache (...)` + `CREATE UNIQUE INDEX IF NOT EXISTS ai_cache_user_jenis_key_idx ...`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/init.ts src/lib/db/migrations
git commit -m "feat(db): kolom progress sync + tabel ai_cache (migrasi 0003)"
```

---

### Task 2: Sync core — atomic lock, progress step, cooldown login, route status, POST background

**Files:**
- Modify: `src/lib/campus/sync.ts`
- Modify: `src/app/api/auth/login/route.ts:147`
- Create: `src/app/api/campus/sync-status/route.ts`
- Modify: `src/app/api/campus/sync/route.ts`

**Interfaces:**
- Consumes: kolom Task 1 (`syncState`, `syncStep`, `syncStartedAt`).
- Produces:
  - `CampusSyncSummary.reason?: "throttled" | "in_progress"` (opsional)
  - `setSyncStep(userId, step: string): Promise<void>`
  - `GET /api/campus/sync-status` → `{connected:false}` atau `{connected:true, state, step, startedAt, lastSyncAt, lastSyncStatus, lastSyncError}`
  - `POST /api/campus/sync` → `{success:true, started:true}` (segera, tanpa menunggu sync)

- [ ] **Step 1: Perluas imports & konstanta** (sync.ts L16, L45):

```ts
import { and, eq, lt, or, isNull, ne } from "drizzle-orm";
...
const SYNC_INTERVAL_MIN = Number(process.env.FORFH_SYNC_INTERVAL_MIN || 30);
// Sync dianggap stale (proses mati di tengah — redeploy/crash) setelah 10 menit
const STALE_SYNC_MS = 10 * 60 * 1000;
```

Tambah field di `CampusSyncSummary` (L48-57): `reason?: "throttled" | "in_progress";`

- [ ] **Step 2: Helper `setSyncStep`** — tambah setelah `findAccount` (L116):

```ts
// Tulis label langkah sync berjalan (1 query ringan; dipantau UI via sync-status)
export async function setSyncStep(userId: string, step: string): Promise<void> {
  try {
    await db.update(campusAccounts).set({ syncStep: step }).where(eq(campusAccounts.userId, userId));
  } catch (e: any) {
    logger.warn(`setSyncStep ${userId}: ${e?.message || e}`);
  }
}
```

- [ ] **Step 3: Atomic lock + try/finally di `runCampusSync`**

Setelah blok throttle (L132, sebelum `let jwt`), sisipkan claim. **Penting — pola eksekusi**: codebase meng-await builder update langsung (tanpa `.run()`/`.returning()`) — lihat `upsertByExternal` L88 & update status L342. Builder update adalah `QueryPromise`: hasil await-nya = hasil `run()` = `{ success, changes, lastInsertRowid, rows, ... }`, jadi `claim.changes` valid:

```ts
  // --- Lock: atomic claim (conditional UPDATE). Cegah dua sync paralel per user
  // (login bootstrap, cron, tombol manual). SELECT tidak cukup — race antar
  // proses/instance. Baris dengan state running yang stale (> 10 mnt) diambil alih.
  const claim = await db.update(campusAccounts).set({
    syncState: "running",
    syncStep: "mulai",
    syncStartedAt: new Date(),
  }).where(and(
    eq(campusAccounts.userId, userId),
    or(
      ne(campusAccounts.syncState, "running"),
      isNull(campusAccounts.syncStartedAt),
      lt(campusAccounts.syncStartedAt, new Date(Date.now() - STALE_SYNC_MS)),
    ),
  ));
  if (claim.changes === 0) {
    return { skipped: true, reason: "in_progress", courses: 0, schedules: 0, tasks: 0, newTasks: 0, grades: 0, campusData: 0, instruksi: 0 };
  }
```

Lalu **bungkus seluruh isi function (dari `let jwt` sampai status akhir) dalam try/finally**. Bentuk akhir:

```ts
  try {
    // ... semua fase yang ada, dengan panggilan setSyncStep di tiap pergantian fase:
    await setSyncStep(userId, "jadwal");   // sebelum Promise.all L168
    await setSyncStep(userId, "kursus");   // sebelum loop courses L184
    await setSyncStep(userId, "tugas");    // sebelum loop tasks L217
    await setSyncStep(userId, "nilai");    // sebelum loop KHS L290
    await setSyncStep(userId, "info");     // sebelum Promise.all(campusFetchers) L317
    // status akhir (L342): tambahkan reset lock di SET yang sama:
    //   syncState: "idle", syncStep: null, syncStartedAt: null,
    await setSyncStep(userId, "selesai");
  } finally {
    // Jaring pengaman: apa pun yang terjadi, lock harus lepas
    await db.update(campusAccounts)
      .set({ syncState: "idle", syncStep: null, syncStartedAt: null })
      .where(eq(campusAccounts.userId, userId))
      .run()
      .catch(() => {});
  }
```

Catatan: hasil await builder update langsung punya `changes` — `changes === 0` berarti user lain memegang lock (state running & fresh). Update status akhir (L342-348) **jangan duplikasi reset lock** — cukup tambah `syncState: "idle", syncStep: null, syncStartedAt: null` di SET yang sama (biar 1 query); `finally` tetap ada sebagai jaring pengaman untuk path error.

- [ ] **Step 4: `markSyncError` juga reset lock** (L353-360):

```ts
  await db.update(campusAccounts).set({
    lastSyncAt: new Date(),
    lastSyncStatus: "error",
    lastSyncError: message.slice(0, 500),
    syncState: "idle",
    syncStep: null,
    syncStartedAt: null,
    updatedAt: new Date(),
  }).where(eq(campusAccounts.userId, userId));
```

- [ ] **Step 5: Login cooldown** — `src/app/api/auth/login/route.ts:147`: `await runCampusSync(userId, { force: true });` → `await runCampusSync(userId);` (throttle default berlaku; login pertama tetap sync karena `lastSyncAt` null).

- [ ] **Step 6: Route `GET /api/campus/sync-status`** — file baru:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campusAccounts } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

// Status sync real-time untuk UI (progress bar dashboard & Pengaturan).
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  const acc = await db.query.campusAccounts.findFirst({
    where: eq(campusAccounts.userId, session.id),
  });
  if (!acc) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({
    connected: true,
    state: acc.syncState,          // idle | running
    step: acc.syncStep,            // mulai | jadwal | kursus | tugas | nilai | info | selesai
    startedAt: acc.syncStartedAt,
    lastSyncAt: acc.lastSyncAt,
    lastSyncStatus: acc.lastSyncStatus, // never | ok | error
    lastSyncError: acc.lastSyncError,
  });
}
```

- [ ] **Step 7: POST /api/campus/sync → background** — ganti isi route (`campus/sync/route.ts`) setelah guard sesi:

```ts
  // Jalankan di background — POST kembali segera; progress dipantau via
  // /api/campus/sync-status. Lock di runCampusSync mencegah tabrakan.
  void runCampusSync(session.id, { force: true }).catch(async (error: any) => {
    const message = error?.message || "Sinkronisasi gagal.";
    await markSyncError(session.id, message);
    logger.error(`Campus sync error (user ${session.id}):`, error);
  });
  return NextResponse.json({ success: true, started: true });
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/campus/sync.ts src/app/api/auth/login/route.ts src/app/api/campus/sync-status/route.ts src/app/api/campus/sync/route.ts
git commit -m "feat(sync): atomic lock + progress step + cooldown login + route status, POST background"
```

---

### Task 3: UI — SyncProgressCard (dashboard + Pengaturan)

**Files:**
- Create: `src/components/campus/SyncProgressCard.tsx`
- Modify: `src/app/page.tsx` (RSC dashboard — render card saat user connected)
- Modify: `src/app/pengaturan/page.tsx` (render card + handleSyncNow adaptif)

**Interfaces:**
- Consumes: `GET /api/campus/sync-status` (Task 2), `POST /api/campus/sync`.
- Produces: `SyncProgressCard({ className?: string })` — client component; render `null` saat tidak connected / tidak ada aktivitas.

- [ ] **Step 1: Buat komponen** `src/components/campus/SyncProgressCard.tsx`:

```tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

// Label langkah sync dalam Bahasa Indonesia + urutan fase (untuk persen).
const PHASES = ["mulai", "jadwal", "kursus", "tugas", "nilai", "info", "selesai"];
const PHASE_LABELS: Record<string, string> = {
  mulai: "Memulai sinkronisasi…",
  jadwal: "Menyinkronkan jadwal kuliah…",
  kursus: "Menyimpan mata kuliah…",
  tugas: "Menyinkronkan tugas HE-BAT…",
  nilai: "Menyinkronkan nilai…",
  info: "Menyinkronkan info kampus…",
  selesai: "Menyelesaikan…",
};

interface SyncStatus {
  connected: boolean;
  state?: string;
  step?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string;
  lastSyncError?: string | null;
}

export function SyncProgressCard({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [polling, setPolling] = useState(false);

  // Polling 2 detik: terus berjalan selama masih "running", berhenti sendiri
  // saat idle dan tidak ada transisi selesai yang perlu ditampilkan.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = false;

    const tick = async () => {
      if (active) return; // cegah tumpuk saat fetch lambat
      active = true;
      try {
        const res = await fetch("/api/campus/sync-status", { cache: "no-store" });
        if (!res.ok) { setPolling(false); return; }
        const data: SyncStatus = await res.json();
        if (cancelled) return;
        setStatus(data);
        if (data.connected && data.state === "running") {
          setPolling(true);
          timer = setTimeout(tick, 2000);
        } else if (data.connected && data.lastSyncAt &&
                   Date.now() - new Date(data.lastSyncAt).getTime() < 60_000) {
          setPolling(true); // transisi "baru selesai" — poll sebentar lagi, lalu berhenti
          timer = setTimeout(tick, 2000);
        } else {
          setPolling(false);
        }
      } catch {
        setPolling(false); // server tidak terjangkau — berhenti diam-diam
      } finally {
        active = false;
      }
    };

    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  const handleRetry = async () => {
    try { await fetch("/api/campus/sync", { method: "POST" }); } catch { /* dibiarkan */ }
    setStatus({ connected: true, state: "running", step: "mulai" });
  };

  if (!status?.connected) return null;
  const running = status.state === "running" || polling;
  const justDone = status.state !== "running" && status.lastSyncStatus === "ok" &&
    status.lastSyncAt && Date.now() - new Date(status.lastSyncAt).getTime() < 60_000;
  const hasError = status.lastSyncStatus === "error" && status.lastSyncError;

  if (!running && !justDone && !hasError) return null;

  const phaseIndex = status.step ? Math.max(0, PHASES.indexOf(status.step)) : 0;
  const percent = Math.min(100, Math.round((phaseIndex / (PHASES.length - 1)) * 100));

  return (
    <div className={`rounded-xl border border-border-default bg-surface-1 p-4 ${className}`}>
      {running ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground">
              {PHASE_LABELS[status.step || "mulai"] || "Menyinkronkan…"}
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(8, percent)}%` }}
            />
          </div>
        </div>
      ) : justDone ? (
        <div className="flex items-center gap-2 text-xs text-status-success">
          <CheckCircle2 className="h-4 w-4" />
          Sinkronisasi selesai — data kampus sudah diperbarui.
        </div>
      ) : hasError ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-status-danger min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium">Sinkronisasi gagal</p>
              <p className="text-muted-foreground truncate">{status.lastSyncError}</p>
            </div>
          </div>
          <button
            onClick={handleRetry}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

Catatan: class `text-status-success`/`text-status-danger`/`bg-status-success-subtle` mengikuti konvensi yang sudah dipakai AttendanceRecap; cek nama class aktual saat implementasi dan sesuaikan bila berbeda.

- [ ] **Step 2: Pasang di dashboard (RSC)** — `src/app/page.tsx`:

```tsx
import { eq } from "drizzle-orm";   // sudah ada
import { campusAccounts } from "@/lib/db";  // tambah ke import db L4
import { SyncProgressCard } from "@/components/campus/SyncProgressCard"; // import baru

// di dalam DashboardPage, sebelum `return` (setelah dashboardData):
const campusAcc = await db.query.campusAccounts.findFirst({
  where: eq(campusAccounts.userId, user.id),
});
...
<PageContainer variant="wide">
  {campusAcc ? <SyncProgressCard className="mb-4" /> : null}
  <DashboardClientView initialData={dashboardData} />
</PageContainer>
```

- [ ] **Step 3: Pasang di Pengaturan + adaptif handleSyncNow** — `src/app/pengaturan/page.tsx`:

```tsx
import { SyncProgressCard } from "@/components/campus/SyncProgressCard"; // import baru
```

Render `<SyncProgressCard className="mb-4" />` di atas Card koneksi kampus (tempat `loadCampusStatus()` dipakai — letakkan tepat di atas `{campus && (...)}` area). Ubah `handleSyncNow` (L36-52):

```tsx
  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/campus/sync", { method: "POST" });
      if (res.ok) {
        success("Sinkronisasi dimulai di latar belakang — pantau progress di atas.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Sinkronisasi gagal.");
      }
    } catch {
      toast("Gagal terhubung ke server.");
    } finally {
      setIsSyncing(false);
      loadCampusStatus();
    }
  };
```

- [ ] **Step 4: Verifikasi manual (dev)**

```bash
npm run dev
```

- Login akun sendiri → dashboard menampilkan card progress saat sync pertama berjalan (langkah berganti tiap beberapa detik).
- Setelah selesai → card berubah "Sinkronisasi selesai" lalu menghilang ±60 detik.
- Pengaturan → card yang sama; klik "Sync sekarang" → POST balik cepat, card menampilkan progress.
- Tutup tab di tengah sync → buka lagi: card menampilkan state yang benar (tidak error).

- [ ] **Step 5: Commit**

```bash
git add src/components/campus/SyncProgressCard.tsx src/app/page.tsx src/app/pengaturan/page.tsx
git commit -m "feat(ui): SyncProgressCard di dashboard & pengaturan + sync button background"
```

---

### Task 4: AI — cache hasil, deadline 35s, rate limit 30/jam, gate aiEnabled

**Files:**
- Create: `src/lib/ai/cache.ts`
- Modify: `src/lib/ai/router.ts`
- Modify: `src/app/api/ai/daily-insight/route.ts`
- Modify: `src/app/api/ai/explain-law/route.ts`

**Interfaces:**
- Consumes: tabel `aiCache` (Task 1); `checkRateLimit` dari `src/lib/auth/rate-limit` (sudah ada).
- Produces:
  - `getCachedAI(userId: string, jenis: string, cacheKey: string): Promise<unknown | null>`
  - `setCachedAI(userId: string, jenis: string, cacheKey: string, data: unknown, ttlMs: number): Promise<void>`

- [ ] **Step 1: Buat `src/lib/ai/cache.ts`**

```ts
import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, aiCache } from "@/lib/db";
import { logger } from "@/lib/logger";

// Cache hasil AI per (user, jenis, key). Menghindari panggilan provider untuk
// permintaan deterministik (daily-insight per hari, explain-law per pertanyaan).
export async function getCachedAI(userId: string, jenis: string, cacheKey: string): Promise<unknown | null> {
  try {
    const row = await db.select().from(aiCache).where(and(
      eq(aiCache.userId, userId),
      eq(aiCache.jenis, jenis),
      eq(aiCache.cacheKey, cacheKey),
      gt(aiCache.expiresAt, new Date()),
    )).limit(1).then((rows) => rows[0]);
    if (!row) return null;
    return JSON.parse(row.resultJson);
  } catch (e: any) {
    logger.warn(`getCachedAI ${jenis}: ${e?.message || e}`);
    return null;
  }
}

export async function setCachedAI(userId: string, jenis: string, cacheKey: string, data: unknown, ttlMs: number): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlMs);
    const resultJson = JSON.stringify(data);
    const existing = await db.select().from(aiCache).where(and(
      eq(aiCache.userId, userId),
      eq(aiCache.jenis, jenis),
      eq(aiCache.cacheKey, cacheKey),
    )).limit(1).then((rows) => rows[0]);
    if (existing) {
      await db.update(aiCache).set({ resultJson, expiresAt }).where(eq(aiCache.id, existing.id));
    } else {
      await db.insert(aiCache).values({ id: crypto.randomUUID(), userId, jenis, cacheKey, resultJson, expiresAt });
    }
  } catch (e: any) {
    logger.warn(`setCachedAI ${jenis}: ${e?.message || e}`);
  }
}
```

- [ ] **Step 2: Deadline + rate limit + gate di `executeAIRequest`** (`src/lib/ai/router.ts`) — import baru:

```ts
import { eq } from "drizzle-orm";
import { db, userSettings } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { AICallOptions, AIResult } from "./types";
import { getNextGroqSlot, callGroq } from "./groq";
import { getNextOllamaSlot, callOllama } from "./ollama";

// Batas total seluruh rantai fallback — jangan biarkan request > 35 detik
const TOTAL_DEADLINE_MS = 35_000;
// Rate limit per user: 30 permintaan AI per jam
const AI_RATE_LIMIT = { maxAttempts: 30, windowMs: 60 * 60 * 1000 };
```

Di awal function `executeAIRequest` (sebelum slot groq):

```ts
export async function executeAIRequest<T = any>(options: AICallOptions): Promise<AIResult<T>> {
  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  const pastDeadline = () => Date.now() > deadline;

  // Gate per-user: rate limit + toggle AI (server-side, tidak hanya UI)
  if (options.userId) {
    const rl = await checkRateLimit(`ai:${options.userId}`, AI_RATE_LIMIT);
    if (!rl.allowed) {
      return {
        success: false,
        text: "Batas penggunaan AI tercapai. Coba lagi nanti.",
        provider: "groq", accountSlot: 1, model: "none", latencyMs: 0,
        error: rl.error || "rate limited", fallbackUsed: true,
      };
    }
    try {
      const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, options.userId) });
      if (settings && !settings.aiEnabled) {
        return {
          success: false,
          text: "Fitur AI dimatikan di Pengaturan.",
          provider: "groq", accountSlot: 1, model: "none", latencyMs: 0,
          error: "AI disabled", fallbackUsed: true,
        };
      }
    } catch { /* settings tidak ditemukan → lanjut (default aktif) */ }
  }
```

Lalu di **tiap** percobaan slot, sisipkan guard sebelum memanggil provider:

```ts
  const groqSlot1 = getNextGroqSlot();
  if (groqSlot1) {
    const res1 = await callGroq(groqSlot1, options);
    if (res1.success && (!options.responseSchema || res1.data !== undefined)) return res1;
    const groqSlot2 = getNextGroqSlot();
    if (groqSlot2 && groqSlot2 !== groqSlot1 && !pastDeadline()) {
      const res2 = await callGroq(groqSlot2, options);
      if (res2.success && (!options.responseSchema || res2.data !== undefined)) return res2;
    }
  }
  const ollamaSlot1 = getNextOllamaSlot();
  if (ollamaSlot1 && !pastDeadline()) {
    const resOllama1 = await callOllama(ollamaSlot1, options);
    if (resOllama1.success && (!options.responseSchema || resOllama1.data !== undefined)) return resOllama1;
    const ollamaSlot2 = getNextOllamaSlot();
    if (ollamaSlot2 && ollamaSlot2 !== ollamaSlot1 && !pastDeadline()) {
      const resOllama2 = await callOllama(ollamaSlot2, options);
      if (resOllama2.success && (!options.responseSchema || resOllama2.data !== undefined)) return resOllama2;
    }
    const lastResortModel = process.env.OLLAMA_LAST_RESORT_MODEL || "minimax-m3:cloud";
    if (!pastDeadline()) {
      const resMiniMax = await callOllama(ollamaSlot1, options, lastResortModel);
      if (resMiniMax.success && (!options.responseSchema || resMiniMax.data !== undefined)) return resMiniMax;
    }
  }
  // 6. Graceful degradation — SAMA seperti sebelumnya (teks tetap)
```

- [ ] **Step 3: daily-insight — baca/tulis cache** (`src/app/api/ai/daily-insight/route.ts`): import `getCachedAI, setCachedAI` dari `@/lib/ai/cache`. Sebelum blok `const systemPrompt = ...` (L94):

```ts
  // Cache harian: insight hari ini deterministik (data agenda tetap) — hindari
  // panggil provider berulang dalam satu hari.
  const dayKey = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); // YYYY-MM-DD (waktu WIB)
  const cachedInsight = await getCachedAI(user.id, "daily_insight", dayKey);
  if (cachedInsight) {
    return NextResponse.json({ success: true, insight: cachedInsight, cached: true });
  }
```

Setelah `executeAIRequest` sukses (L112-114), cache **hanya hasil provider asli** (bukan fallback heuristic):

```ts
  if (result.success && result.data) {
    if (!result.fallbackUsed) {
      await setCachedAI(user.id, "daily_insight", dayKey, result.data, 24 * 60 * 60 * 1000);
    }
    return NextResponse.json({ success: true, insight: result.data });
  }
```

- [ ] **Step 4: explain-law — baca/tulis cache** (`src/app/api/ai/explain-law/route.ts`): import helper; setelah guard `regulationText` (L32), sebelum `systemPrompt` (L35):

```ts
  // Cache per pertanyaan: deterministik (teks pasal + pertanyaan sama → jawaban sama)
  const cacheKey = crypto
    .createHash("sha256")
    .update(`${title}|${regulationText}|${specificQuestion || ""}`)
    .digest("hex")
    .slice(0, 64);
  const cached = await getCachedAI(user.id, "explain_law", cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, explanation: cached, cached: true });
  }
```

Tambahkan `import crypto from "crypto";` di baris import. Setelah sukses (L49-51):

```ts
  if (result.success && result.data) {
    if (!result.fallbackUsed) {
      await setCachedAI(user.id, "explain_law", cacheKey, result.data, 24 * 60 * 60 * 1000);
    }
    return NextResponse.json({ success: true, explanation: result.data });
  }
```

- [ ] **Step 5: Verifikasi** — `npm run quality` (tes hijau), lalu dev: buka dashboard (daily-insight hit cache saat kedua kali), cek `ai_cache` di DB lokal (`SELECT jenis, cache_key, length(result_json) FROM ai_cache`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/cache.ts src/lib/ai/router.ts src/app/api/ai/daily-insight/route.ts src/app/api/ai/explain-law/route.ts
git commit -m "feat(ai): cache hasil harian & explain-law, deadline 35s, rate limit 30/jam, gate aiEnabled server"
```

---

### Task 5: Cron reminders — cap 50, batch dedupe, concurrency 5, cleanup ai_usage, sync paralel 3

**Files:**
- Modify: `src/lib/notifications/worker.ts`
- Modify: `src/lib/campus/sync.ts` (`syncDueUsers`)
- Modify: `src/app/api/internal/reminders/process/route.ts`

**Interfaces:**
- Consumes: tabel `appConfig` (sudah ada).
- Produces: `cleanupOldUsage(): Promise<void>` di `worker.ts`.

- [ ] **Step 1: Import + helper `mapLimit` + cleanup** di `worker.ts` — perluas import L2 (`and, eq, gte, isNull, sql, lt` dari drizzle; tambah `db, aiUsage, appConfig` ke import L3-11):

```ts
// Jalankan fn atas items dengan maksimal `limit` tugas bersamaan
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Hapus log pemakaian AI lebih tua dari 90 hari — sekali sehari (guard app_config)
export async function cleanupOldUsage(): Promise<void> {
  try {
    const row = await db.select().from(appConfig).where(eq(appConfig.key, "ai_usage_cleanup_last")).limit(1).then((r) => r[0]);
    const lastMs = row ? Number(row.value) || 0 : 0;
    if (Date.now() - lastMs < 24 * 60 * 60 * 1000) return;
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db.delete(aiUsage).where(lt(aiUsage.createdAt, cutoff));
    if (row) {
      await db.update(appConfig).set({ value: String(Date.now()), updatedAt: new Date() }).where(eq(appConfig.key, "ai_usage_cleanup_last"));
    } else {
      await db.insert(appConfig).values({ key: "ai_usage_cleanup_last", value: String(Date.now()) });
    }
  } catch (e: any) {
    logger.warn(`cleanupOldUsage: ${e?.message || e}`);
  }
}
```

- [ ] **Step 2: Cap 50 + concurrency di `processDueReminders`** — ganti blok L26-33:

```ts
  // Cap per tick: 50 user (tick QStash punya batas durasi)
  const activeUsers = (await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)).slice(0, 50);
```

Lalu bungkus loop `for (const { userId } of activeUsers) { ... }` menjadi `await mapLimit(activeUsers, 5, async ({ userId }) => { ... });` — isi per-user tetap sama, dengan dua perubahan (Step 3). Return `processedUsers: activeUsers.length` tetap.

- [ ] **Step 3: Batch dedupe per user (hilangkan N+1)** — di dalam blok per user, ganti dua bagian:

**Bagian class:** sebelum `for (const item of schedules)`, tambah:

```ts
      // Batch dedupe: 1 query untuk semua offset yang akan dicek hari ini
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
      const todayDeliveries = await db.select().from(notificationDeliveries).where(and(
        eq(notificationDeliveries.userId, userId),
        eq(notificationDeliveries.entityType, "class"),
        gte(notificationDeliveries.occurrenceAt, dayStart),
      ));
      const classSentKeys = new Set(todayDeliveries.map((d) =>
        `${d.entityId}|${d.occurrenceAt.getTime()}|${d.offsetMinutes}`
      ));
```

Lalu ganti cek `existing` (L79-87) menjadi: `const sentKey = `${item.scheduleId}|${occurrenceAt}|${offset}`; if (classSentKeys.has(sentKey)) continue;` dan hapus blok `const existing = await db.query...` (query DB). Setelah insert berhasil (L110-121), tambah `classSentKeys.add(sentKey);` (supaya dalam satu user tidak dobel).

**Bagian task:** pola sama — sebelum `for (const task of upcomingTasks)`:

```ts
      const todayTaskDeliveries = await db.select().from(notificationDeliveries).where(and(
        eq(notificationDeliveries.userId, userId),
        eq(notificationDeliveries.entityType, "task"),
        gte(notificationDeliveries.occurrenceAt, dayStart),
      ));
      const taskSentKeys = new Set(todayTaskDeliveries.map((d) =>
        `${d.entityId}|${d.occurrenceAt.getTime()}|${d.offsetMinutes}`
      ));
```

Ganti cek existing task (L149-157) jadi in-memory `if (taskSentKeys.has(sentKey)) continue;` (sentKey = `${task.id}|${dueTimestamp}|${offset}`) + `taskSentKeys.add(sentKey)` setelah insert.

- [ ] **Step 4: `syncDueUsers` paralel 3** — `src/lib/campus/sync.ts`: import `mapLimit` dari `@/lib/notifications/worker` (atau pindahkan helper ke `src/lib/utils.ts` bila ingin shared — tetap di worker.ts, import lintas modul OK). Ganti loop L381-390:

```ts
  let synced = 0, failed = 0;
  await mapLimit(due, 3, async (acc) => {
    try {
      const s = await runCampusSync(acc.userId);
      if (!s.skipped) synced++;
    } catch (e: any) {
      failed++;
      await markSyncError(acc.userId, e?.message || "Sinkronisasi otomatis gagal.");
    }
  });
```

- [ ] **Step 5: Panggil `cleanupOldUsage`** — `src/app/api/internal/reminders/process/route.ts`: setelah `processDueReminders` dan `syncDueUsers` berhasil (cari struktur route — ikuti blok try yang sudah ada), tambah:

```ts
      await cleanupOldUsage();
```

(import dari `@/lib/notifications/worker`).

- [ ] **Step 6: Verifikasi + Commit**

```bash
npm run quality   # tes tetap hijau
git add src/lib/notifications/worker.ts src/lib/campus/sync.ts src/app/api/internal/reminders/process/route.ts
git commit -m "perf(cron): cap 50 user, batch dedupe, concurrency 5, cleanup ai_usage 90 hari, sync paralel 3"
```

---

### Task 6: In-memory cache GET mahal + invalidasi + throttle last_seen

**Files:**
- Create: `src/lib/cache/mem-cache.ts`
- Modify: `src/app/api/campus/info/route.ts`
- Modify: `src/app/api/tasks/route.ts` + `src/app/api/tasks/[id]/route.ts` + `src/app/api/tasks/[id]/subtasks/route.ts` + `src/app/api/subtasks/[id]/route.ts`
- Modify: `src/app/api/notes/route.ts` + `src/app/api/notes/[id]/route.ts`
- Modify: `src/lib/campus/sync.ts` (invalidasi saat sync selesai) + `src/app/api/campus/disconnect/route.ts`
- Modify: `src/lib/auth/session.ts`

**Interfaces:**
- Produces (mem-cache, module-level Map — komentar: valid 1 instance Koyeb; ganti shared store bila multi-instance):
  - `memGet<T>(key: string): T | null`
  - `memSet(key: string, value: unknown, ttlMs?: number): void` (default 60_000)
  - `memDel(prefix: string): void` — hapus semua key berawalan prefix
  - `memClear(): void`

- [ ] **Step 1: Buat `src/lib/cache/mem-cache.ts`**

```ts
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
```

- [ ] **Step 2: `/api/campus/info`** — import `memGet, memSet`; setelah blok `items` selesai (sebelum return L34):

```ts
  const payload = { connected: true, lastSyncAt: acc.lastSyncAt, items };
  memSet(`campus-info:${session.id}`, payload, 60_000);
  return NextResponse.json(payload);
```

(Response `connected:false` tidak di-cache.)

- [ ] **Step 3: Invalidasi campus-info saat sync** — di `sync.ts` import `memDel` dari `@/lib/cache/mem-cache`; di update status akhir (SET yang sama, Task 2 Step 3) tambahkan setelah update: `memDel(`campus-info:${userId}`);` — dan juga di `markSyncError` setelah update. Di `src/app/api/campus/disconnect/route.ts`: setelah delete campus_accounts, `memDel(`campus-info:${session.id}`);` + `memDel(`tasks:${session.id}`);` (lihat Step 4).

- [ ] **Step 4: `/api/tasks` GET + invalidasi mutasi** — GET: setelah `processedTasks` dihitung (L44):

```ts
  const payload = { tasks: processedTasks };
  memSet(`tasks:${user.id}`, payload, 30_000);
  return NextResponse.json(payload);
```

(dengan `const cached = memGet<{ tasks: unknown[] }>(`tasks:${user.id}`); if (cached) return NextResponse.json(cached);` di awal, setelah guard sesi.)

Invalidasi di semua route mutasi tasks (tambahkan setelah operasi sukses, import `memDel`): `src/app/api/tasks/route.ts` POST → `memDel(`tasks:${user.id}`);`; `src/app/api/tasks/[id]/route.ts` (PATCH/DELETE — ikuti struktur yang ada, panggil `memDel` di tiap cabang sukses); `src/app/api/tasks/[id]/subtasks/route.ts` POST; `src/app/api/subtasks/[id]/route.ts` (PATCH/DELETE). Lihat pola: `const user = await getSessionUser(); ... memDel(`tasks:${user.id}`);`.

- [ ] **Step 5: `/api/notes` — strip konten + cache** — GET: setelah query notes (L26), sebelum return:

```ts
  const includeContent = searchParams.get("includeContent") === "true";
  const listNotes = includeContent
    ? allNotes
    : allNotes.map((n) => ({ ...n, content: undefined }));
  const payload = { notes: listNotes };
  if (!includeContent) memSet(`notes-list:${user.id}`, payload, 30_000);
  return NextResponse.json(payload);
```

(+ `const cached = memGet<{ notes: unknown[] }>(`notes-list:${user.id}`); if (cached) return NextResponse.json(cached);` setelah guard sesi, hanya saat `!includeContent`.) Invalidasi: POST notes/route.ts → `memDel(`notes-list:${user.id}`);`; `src/app/api/notes/[id]/route.ts` (PATCH/DELETE) → `memDel(`notes-list:${user.id}`);`. **Periksa pemakai `/api/notes`**: halaman catatan & CommandMenu memakai `n.content`? CommandMenu hanya butuh title (L47). Halaman catatan membuka note via `[id]` — cek di implementasi: kalau ada pemakai yang butuh konten di list, beri `?includeContent=true` di fetch-nya.

- [ ] **Step 6: Throttle `last_seen_at`** — `src/lib/auth/session.ts`: tambah modul map + ganti blok L83-86:

```ts
// Throttle write last_seen_at: maks 1×/menit per user (request path tidak
// selalu nulis DB)
const lastSeenThrottle = new Map<string, number>();

// ...di validateSession, ganti:
  const lastWrite = lastSeenThrottle.get(foundSession.userId) || 0;
  if (Date.now() - lastWrite > 60_000) {
    lastSeenThrottle.set(foundSession.userId, Date.now());
    db.update(sessions)
      .set({ lastSeenAt: now })
      .where(eq(sessions.id, foundSession.id))
      .catch((err) => logger.error("Error updating session lastSeenAt:", err));
  }
```

- [ ] **Step 7: Verifikasi + Commit**

```bash
npm run quality
git add src/lib/cache/mem-cache.ts src/app/api/campus/info/route.ts src/lib/campus/sync.ts src/app/api/campus/disconnect/route.ts src/app/api/tasks/route.ts "src/app/api/tasks/[id]/route.ts" "src/app/api/tasks/[id]/subtasks/route.ts" "src/app/api/subtasks/[id]/route.ts" src/app/api/notes/route.ts "src/app/api/notes/[id]/route.ts" src/lib/auth/session.ts
git commit -m "perf(api): mem-cache GET mahal + invalidasi mutasi, strip konten notes, throttle last_seen"
```

---

### Task 7: Client cache SWR-ish (CommandMenu, kalender, kehadiran, info-kampus)

**Files:**
- Create: `src/lib/client-cache.ts`
- Modify: `src/components/layout/CommandMenu.tsx`
- Modify: `src/app/kalender/page.tsx`
- Modify: `src/app/kehadiran/page.tsx`
- Modify: `src/app/info-kampus/page.tsx`
- Modify: handler logout & login success (cari `logout` di `src/components/layout/*`; `src/app/login/page.tsx`) — tambah `invalidateClientCache()`

**Interfaces:**
- Produces:
  - `cachedFetch(url: string, ttlMs?: number): Promise<any>` — GET dengan cache in-memory per URL; gagal → hapus cache & rethrow.
  - `invalidateClientCache(prefix?: string): void` — hapus semua / per prefix. **WAJIB dipanggil setelah mutasi & setelah login/logout** (data antar user tidak boleh bocor).

- [ ] **Step 1: Buat `src/lib/client-cache.ts`** (bukan "use client" — util murni browser, dipakai komponen client):

```ts
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
```

- [ ] **Step 2: CommandMenu** — ganti 3 `fetch` di useEffect (L32-35) dengan `cachedFetch("/api/tasks"), cachedFetch("/api/courses"), cachedFetch("/api/notes")` (import dari `@/lib/client-cache`). `.catch(() => ({ tasks: [] }))` tetap dipertahankan.

- [ ] **Step 3: kalender & kehadiran & info-kampus** — ganti `fetch(...)` GET per mount dengan `cachedFetch(...)` (import sama). Kehadiran: 2 fetch (`/api/attendance`, `/api/campus/info`). Kalender: 3 fetch (`/api/tasks`, `/api/exams`, `/api/schedules`). Info-kampus: `/api/campus/info`.

- [ ] **Step 4: Invalidate setelah mutasi & auth change** — cari handler:
  - `logout` (kemungkinan `src/components/layout/AppShell.tsx` atau sidebar/nav) → tambah `invalidateClientCache();` sebelum navigasi ke /login.
  - Login sukses (`src/app/login/page.tsx` — setelah POST sukses) → `invalidateClientCache();` sebelum redirect.
  - Halaman yang melakukan mutasi tasks/notes (tugas, kalender, catatan — cari `fetch(...method: "PATCH"/"POST"/"DELETE"...)`) → tambah `invalidateClientCache();` setelah respons ok (dalam `then` atau setelah await sukses).

- [ ] **Step 5: Verifikasi + Commit**

```bash
npm run build        # pastikan client-cache tidak masuk ke server bundle yang salah
git add src/lib/client-cache.ts src/components/layout/CommandMenu.tsx src/app/kalender/page.tsx src/app/kehadiran/page.tsx src/app/info-kampus/page.tsx src/app/login/page.tsx
git commit -m "perf(ui): client cache SWR-ish + invalidasi mutasi/auth"
```

---

### Task 8: Misc — MarkdownEditor dynamic, circuit breaker persist, robots/sitemap

**Files:**
- Modify: `src/app/catatan/page.tsx`
- Modify: `src/lib/ai/circuit-breaker.ts`
- Modify: `src/lib/ai/router.ts` (panggil load persisted cooldown)
- Create: `src/app/robots.ts`, `src/app/sitemap.ts`

- [ ] **Step 1: MarkdownEditor dynamic** — `src/app/catatan/page.tsx`: ganti import L8 `import { MarkdownEditor } from "@/components/notes/MarkdownEditor";` dengan:

```ts
import dynamic from "next/dynamic";
const MarkdownEditor = dynamic(
  () => import("@/components/notes/MarkdownEditor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className="h-40 animate-pulse rounded-lg bg-muted" /> }
);
```

Pemakaian `<MarkdownEditor ... />` di L255 tidak berubah.

- [ ] **Step 2: Circuit breaker persist** — `circuit-breaker.ts`:

```ts
import { AIProviderName, AIAccountSlot, SlotHealth } from "./types";
import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
```

Tambah di akhir `recordSlotFailure`, saat masuk COOLDOWN (di semua cabang cooldown, sebelum return):

```ts
  if (health.state === "COOLDOWN") {
    // Persist cooldown — tidak hilang saat redeploy (fire-and-forget).
    // Builder update bisa di-await langsung (QueryPromise → hasil `run()`
    // punya `.changes`) — pola yang sama dengan sync.ts.
    db.update(appConfig)
      .set({ value: String(health.cooldownUntil), updatedAt: new Date() })
      .where(eq(appConfig.key, `ai_slot_cooldown:${key}`))
      .then(async (r) => {
        if (r.changes === 0) {
          await db.insert(appConfig).values({ key: `ai_slot_cooldown:${key}`, value: String(health.cooldownUntil) });
        }
      })
      .catch(() => {});
  }
```

Dan fungsi load (panggil sekali di awal `executeAIRequest` router.ts):

```ts
// Muat cooldown tersimpan (app_config) ke slotStates — jalankan sekali saat server jalan
let cooldownsLoaded = false;
export async function loadPersistedCooldowns(): Promise<void> {
  if (cooldownsLoaded) return;
  cooldownsLoaded = true;
  try {
    const rows = await db.select().from(appConfig);
    for (const row of rows) {
      if (!row.key.startsWith("ai_slot_cooldown:")) continue;
      const key = row.key.replace("ai_slot_cooldown:", "");
      if (slotStates[key]) slotStates[key].cooldownUntil = Number(row.value) || 0;
    }
  } catch (e: any) {
    logger.warn(`loadPersistedCooldowns: ${e?.message || e}`);
  }
}
```

`router.ts` Step 1 Task 4: tambah `import { loadPersistedCooldowns } from "./circuit-breaker";` dan di awal `executeAIRequest` setelah `pastDeadline` definisi: `await loadPersistedCooldowns();`.

- [ ] **Step 3: robots.ts + sitemap.ts**

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/pengaturan", "/berkas"] },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL || "https://forfh.id"}/sitemap.xml`,
  };
}
```

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://forfh.id";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
```

- [ ] **Step 4: Verifikasi + Commit**

```bash
npm run quality && npm run build
git add src/app/catatan/page.tsx src/lib/ai/circuit-breaker.ts src/lib/ai/router.ts src/app/robots.ts src/app/sitemap.ts
git commit -m "perf: MarkdownEditor dynamic, circuit breaker persist, robots/sitemap"
```

---

### Task 9: Tes baru + verifikasi penuh + E2E

**Files:**
- Create: `src/tests/perf.test.ts`
- Modify: `src/tests/run-tests.ts` (registrasi)

**Interfaces:**
- Consumes: `memGet/memSet/memDel` (Task 6), `getCachedAI/setCachedAI` (Task 4 — perlu DB, SKIP di unit), `PHASE_LABELS` (Task 3).

- [ ] **Step 1: Buat `src/tests/perf.test.ts`** (pure, tanpa DB/network — ikuti pola `campus.test.ts` dengan `assert`):

```ts
import { memClear, memDel, memGet, memSet } from "@/lib/cache/mem-cache";

export async function runPerfTests(assert: (condition: boolean, name: string) => void) {
  // --- mem-cache ---
  memClear();
  memSet("a:1", { x: 1 }, 60_000);
  assert(memGet("a:1")?.x === 1, "mem-cache: get setelah set");

  memSet("a:2", { x: 2 }, 1); // TTL 1 ms — sudah lewat saat dibaca
  assert(memGet("a:2") === null, "mem-cache: TTL expired → null");

  memDel("a:");
  assert(memGet("a:1") === null && memGet("a:2") === null, "mem-cache: memDel prefix");
  memClear();

  // --- mem-cache: tipe tidak bocor antar key ---
  memSet("b:1", 42, 60_000);
  assert(memGet<number>("b:1") === 42, "mem-cache: nilai primitif");
  memClear();

  // --- (ai cache & rate limit butuh DB/network — diuji lewat E2E/manual) ---
}
```

- [ ] **Step 2: Registrasi di `run-tests.ts`** — ikuti pola import + panggil `runPerfTests(assert)` di dalam daftar run (sama seperti `runCampusTests`). Periksa struktur file saat implementasi (biasanya `await runCampusTests(assert)` di dalam per-batch loop).

- [ ] **Step 3: Verifikasi penuh**

```bash
npm run quality    # semua tes hijau (172 + baru)
npm run build      # build produksi OK, standalone artifact
```

- [ ] **Step 4: E2E live (dev, akun sendiri)** — checklist:
  - Login → card progress muncul & selesai; `/api/campus/sync-status` menampilkan state benar selama running.
  - Pengaturan → "Sync sekarang" balik cepat; progress terlihat; cooldown: login ulang < interval → status `lastSyncAt` tidak berubah.
  - Tutup tab saat sync berjalan → buka lagi → tidak ada error di log server (`dev-server.log`), lock tidak macet (sync berikutnya jalan).
  - Hentikan jaringan saat sync → card menampilkan error + tombol Coba lagi berfungsi.
  - Daily-insight dua kali berturut → hit ke-2 `cached: true` (respons JSON).
  - AI over limit: 30+ request (atau ubah konstanta sementara) → respons graceful.
  - `aiEnabled` mati di Pengaturan → route AI tetap graceful (fallback heuristic).
  - Toggle task di /tugas → data langsung segar (client cache invalidated).
  - `SELECT sync_state, sync_step FROM campus_accounts` → selalu `idle` setelah sync selesai.

- [ ] **Step 5: Review mandiri + serahkan ke user**

```bash
git log --oneline master..feat/perf-sync-progress   # daftar commit untuk review
git status --short                                   # pastikan bersih
```

Lapor ke user: ringkasan commit, hasil quality/build, checklist E2E, langkah deploy (env Koyeb: `FORFH_SYNC_INTERVAL_MIN=60` + redeploy; migrasi 0003 otomatis lewat... **PENTING**: jalankan `npm run db:migrate` terhadap Turso produksi — pakai env inline seperti saat membuat DB baru; lalu update memory proyek).

---

## Self-Review catatan

- **Spec coverage**: A1→Task1, A2-A6→Task2, A7-A8→Task3, B1-B3→Task4, B4→Task5, B5-B6→Task6, B7→Task7, B8-B10→Task8, verifikasi→Task9. ✓
- **Type consistency**: `setSyncStep` (Task2) dipakai Task2 saja; `memGet/memSet/memDel` (Task6) dipakai Task6 + tes Task9; `getCachedAI/setCachedAI` (Task4) dipakai Task4; `mapLimit` (Task5) dipakai Task5; `SyncProgressCard` (Task3) dipakai Task3; `cachedFetch/invalidateClientCache` (Task7) dipakai Task7. `claim.changes` → dibuktikan dari sumber: `SQLiteUpdateBase extends QueryPromise` (update.cjs L52), `execute()` tanpa returning → `run()` (L186-187), dan `run()` libsql driver = `client.execute(stmt)` yang mengembalikan `{ success, changes, lastInsertRowid, rows, ... }`. ✓
- **Verifikasi kolom `notificationDeliveries`** (schema.ts L560-580): `userId, entityType, entityId, occurrenceAt, offsetMinutes` semua ada — kode batch dedupe Task 5 valid. ✓
- **Verifikasi `router.ts`**: struktur 6 langkah persis sesuai kode Task 4 Step 2 (groq1→groq2→ollama1→ollama2→minimax→degradation). ✓
- **Verifikasi `daily-insight/route.ts`**: `now` ada (L16), `executeAIRequest` sudah kirim `userId: user.id` (L109) — kode Task 4 Step 3 valid. ✓
- **Verifikasi class name UI**: `text-status-success`, `text-status-danger`, `bg-status-success-subtle`, `bg-status-danger-subtle` dipakai luas di komponen (Badge.tsx, TaskCard.tsx, dll). ✓
