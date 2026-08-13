# Asisten WhatsApp (Baileys 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot WhatsApp Baileys 7 (`feat/wa-assistant`) di deploy yang sama dengan web — binding multi-user via OTP web-first, perintah `!` + AI natural language, notifikasi reminder menggantikan web push bagi user terhubung, auth state terenkripsi di Turso, socket lifecycle ber-state-machine.

**Architecture:** `src/lib/wa/*` = modul murni + adapter (session-store SignalKeyStore di Turso, client-manager state machine, identity resolver PN/LID, pipeline pesan). Worker notifikasi routing via `sendReminder` (WA → fallback web push). Route API WA `runtime="nodejs"` + UI WhatsAppCard di Pengaturan. Semua tes memakai Baileys di-mock / libsql `:memory:` — tanpa jaringan eksternal.

**Tech Stack:** `@whiskeysockets/baileys@7.0.0-rc14` (pin exact, ESM), Next.js 15.1.7, Turso/Drizzle 0.38, `crypto/at-rest.ts` (AES-256-GCM), QStash tick existing, tsx test runner.

## Global Constraints

Nilai verbatim dari spec `docs/superpowers/specs/2026-08-13-wa-assistant-design.md`. Setiap task tunduk pada ini:

1. **Baileys pin exact `"@whiskeysockets/baileys": "7.0.0-rc14"`** (tanpa `^`/`~`); versi `< 7.0.0-rc12` / `6.7.22` DITOLAK. Acceptance: `npm ls @whiskeysockets/baileys` → satu baris rc14, tanpa transitive duplicate; versi dicatat di `docs/BUILD_STATUS.md`.
2. **ESM compatibility gate**: DILARANG `require(...)`/`const { default: makeWASocket } = require(...)` untuk Baileys — import ESM. Acceptance: `npm run build` sukses tanpa CJS/ESM interop error.
3. **Tidak hardcode protocol version WhatsApp** di source code (pakai default Baileys 7).
4. **Prefer LID sebagai transport identity; JANGAN PERNAH membuat `${lid}@s.whatsapp.net`** — `@lid` dan `@s.whatsapp.net` dua identity berbeda.
5. **`resolveWhatsAppTarget(binding)` urutan**: `binding.jid` valid → apa adanya; `binding.lid` → `` `${lid}@lid` ``; hanya `phone` → `` `${phone}@s.whatsapp.net` `` (fallback). Application layer TIDAK mengimplementasi LID protocol kedua.
6. **`classifyDisconnect(statusCode)` = pure function**; callback socket hanya memanggil classifier. Matriks A4: 408/428 → temporary; 515 → recreate; 401 → loggedOut (stop + auth invalid); 440 → replaced (stop, TANPA reconnect); 500 → badSession (stop + auth invalid); 411/403 → fatal; 503 → backoff maks 3 upaya; tanpa error → unknown (backoff terbatas).
7. **Backoff**: min 1s, max 60s, jitter ±20%; batas 10 upaya berurutan → setelah itu tetap cap maksimum hanya untuk temporary; selalu setelah state stabil (`reconnecting`, bukan loop ketat).
8. **State machine socket**: `stopped | starting | connecting | open | reconnecting | closing | logged_out | error`. **`ensureWaClient()` idempoten** — saat `starting/connecting/reconnecting` → return startup promise yang sama; `open` → no-op; `logged_out`/error fatal → TANPA auto-recreate.
9. **Constraint deployment (tulis sebagai komentar di code)**: 1 deployment = 1 instance = 1 socket = 1 bot account; horizontal scaling DILARANG.
10. **Health 5 level**: `healthy | degraded | possibly_silent | disconnected | auth_invalid`. `possibly_silent` = open + tidak ada inbound (`lastMessageEvent`/`lastSuccessfulReceive`) > 15 menit — **BUKAN unhealthy** (no false alarm). Health = fungsi gabungan indikator.
11. **`waKeepAlive()`** (dipanggil dari tick QStash `POST /api/internal/reminders/process`): `open` → healthy; socket missing/dead → `ensureWaClient()`; auth invalid → `auth-invalid` (tanpa recreate). QStash = health/recovery trigger, BUKAN pengganti persistent socket.
12. **Pairing state machine** (persist `app_config` key `wa_pairing`): `pairing_not_started → pairing_code_requested → waiting_for_phone → pairing_success | pairing_failed` (failed = expired / 408 / 401 selama menunggu). `requestPairingCode(phone)` tetap dipakai.
13. **Auth state storage**: creds = 1 baris `app_config` key `wa_creds` (JSON terenkripsi via `encryptText`); keys = tabel `wa_signal_keys` (`type`, `key`, `value` terenkripsi, PK `(type, key)`). `SignalKeyStore`: `get(type, ids) → {[id]: value}`; `set(data)` — nilai `null` = DELETE; `transaction(fn, type)` dipakai `lid-mapping`. Kedua sumber perubahan ditangani: `creds.update` DAN `keys.set/get` kapan saja.
14. **`wa_bindings`** (migrasi 0004, additive): `id` text PK uuid · `userId` text FK users cascade **UNIQUE** · `phone` text **UNIQUE** (E.164 tanpa `+`, `628…`) · `lid` text null **UNIQUE** · `jid` text null **UNIQUE** · `status` text default `'pending'` (`pending|active|unlinked`) · `otpCode` text null (sha256 hex) · `otpExpiresAt` integer null (ms) · `otpAttempts` integer default 0 · `createdAt/updatedAt` text strftime default. Binding lama tanpa lid/jid tetap valid; lid/jid backfill non-destruktif.
15. **OTP web-first**: valid 10 menit; maks 3 percobaan; maks 5 request/10 menit per user DAN per nomor (pola `auth_rate_limits` via `checkRateLimit`); **OTP baru membatalkan OTP sebelumnya** (overwrite `otpCode`/`otpExpiresAt`, reset `otpAttempts=0`); sukses → reset `otpCode=null, otpExpiresAt=null, otpAttempts=0`. Kirim ke `` `${phone}@s.whatsapp.net` `` (raw phone; lid/jid kosong saat pending).
16. **Guard bot**: hanya `messages.upsert` type `notify`; group/broadcast/status/newsletter/system diabaikan; sender belum terhubung → panduan maks **1/sender/jam**; rate limit **20 pesan/menit** dengan **key dari resolved identity** (prioritas `userId`, fallback JID/LID stabil — BUKAN substring phone); AI bebas kuota 30/jam web + **interval 5 detik per pengirim** + cap input **500 char**.
17. **Lingkup data**: bot hanya membaca data user sendiri; TIDAK pernah memanggil Kampus Kita/HE-BAT.
18. **Format output**: header emoji + bold, divider, ≤ ~3500 char (application UX/safety limit); waktu lokal **Asia/Jakarta**.
19. **AI path**: `executeAIRequest` **tanpa `userId`** (bebas kuota 30/jam); `aiEnabled` mati → graceful "Fitur AI nonaktif — ketik !help untuk perintah."
20. **Notifikasi**: binding active → `resolveWhatsAppTarget` → sendText; gagal → caller terima failure → **fallback web push**; record `notificationDeliveries` `channel: 'whatsapp'` | `'web_push'`; **dedupe key `(entityId|occurrenceAt|offset)` tidak berubah**; queue in-memory maks 50 FIFO HANYA short reconnect; gagal lama → drop + caller failure. WA sukses → TIDAK dobel kirim web push.
21. **Semua route WA**: `export const runtime = "nodejs"` + guard `getSessionUser()` (401).
22. **Migrasi 0004 via `npm run db:generate`** + mirror DDL dev di `src/lib/db/init.ts`. Env baru: `WA_ADMIN_PHONE`, `WA_BOT_PHONE` (E.164).

## Deviations (adjudicated — tidak mengubah perilaku produk, dicatat di ledger SDD)

- **`health.ts` dikerjakan di Task 3, bukan Task 7** (urutan spec §10): client-manager merekam health events saat callback socket — A6 butuh modul health lebih dulu. Route `GET /api/wa/status` tetap Task 7.
- **File baru di luar daftar file spec**: `src/lib/wa/types.ts` (tipe bersama WaSocketState/WaIdentity/dll. — cegah drift antar modul), `src/lib/wa/pipeline.ts` (orchestrasi C1 — testable murni, spec C1 menggambarkan pipeline eksplisit), `src/lib/wa/executors/putuskan.ts` (mutasi DB unlink — spec menaruh `!putuskan` di C3 tanpa file executor).
- **`src/lib/env.ts` & `.env.example`** ikut diubah (deklarasi `WA_BOT_PHONE`/`WA_ADMIN_PHONE`) — syarat route pairing.
- `updatedAt` pada `wa_bindings` di-set manual `new Date().toISOString()` saat update (kolom tidak auto-update — pola repo sama).
- `!insight` memakai cache key `wa-insight:${dayKey}` (bukan key web) — web menyimpan objek terstruktur, WA menyimpan teks; menghindari `String(obj)` → "[object Object]".

## File Structure

```
Baru:
  src/lib/wa/types.ts            — tipe bersama (WaSocketState, DisconnectClass, WaHealthIndicators, WaIdentity, WaBindingRow)
  src/lib/wa/session-store.ts    — WaSessionStore (SignalKeyStore adapter Turso) + creds load/save terenkripsi
  src/lib/wa/client-manager.ts   — WaClientManager (state machine, classifyDisconnect, ensureWaClient, waKeepAlive, getWaClientManager)
  src/lib/wa/health.ts           — indikator in-memory + computeHealth (5 level)
  src/lib/wa/identity.ts         — resolveWhatsAppIdentity + resolveWhatsAppTarget + createIdentityDeps
  src/lib/wa/normalize.ts        — normalizePhone, maskPhone
  src/lib/wa/format.ts           — semua formatter + clampOutput + helper WIB
  src/lib/wa/commands.ts         — parseCommand + dispatchCommand + buildExecutorDeps
  src/lib/wa/rate-limit.ts       — waRateLimitKey, allowMessage, allowGuide, allowAiReply
  src/lib/wa/send.ts             — WaSendService (queue 50 FIFO) + getWaSendService
  src/lib/wa/pipeline.ts         — processIncomingMessage (C1) + registerMessagePipeline
  src/lib/wa/ai.ts               — handleNaturalLanguage (C5)
  src/lib/wa/pairing.ts          — state machine pairing + hooks (A7)
  src/lib/wa/executors/jadwal.ts  src/lib/wa/executors/tugas.ts  src/lib/wa/executors/selesai.ts
  src/lib/wa/executors/nilai.ts   src/lib/wa/executors/insight.ts src/lib/wa/executors/putuskan.ts
  src/app/api/wa/status/route.ts  src/app/api/wa/otp/request/route.ts  src/app/api/wa/otp/verify/route.ts
  src/app/api/wa/unlink/route.ts  src/app/api/wa/pairing/route.ts
  src/components/wa/WhatsAppCard.tsx
  src/tests/wa.test.ts
  docs/WA_ACCEPTANCE.md           — checklist acceptance F2 (dibuat Task 8)

Diubah:
  package.json                    — pin @whiskeysockets/baileys 7.0.0-rc14
  src/lib/db/schema.ts            — waBindings + waSignalKeys + usersRelations
  src/lib/db/migrations/0004_*.sql (via npm run db:generate)
  src/lib/db/init.ts              — mirror DDL dev
  src/lib/env.ts                  — WA_BOT_PHONE, WA_ADMIN_PHONE (optional)
  .env.example                    — dua env baru
  src/lib/notifications/worker.ts — sendReminder + decideDeliveryChannel
  src/app/api/internal/reminders/process/route.ts — panggil waKeepAlive()
  src/app/pengaturan/page.tsx     — pasang WhatsAppCard
  src/tests/run-tests.ts          — registrasi runWaTests
  docs/BUILD_STATUS.md            — catatan versi Baileys rc14
```

---

### Task 1: Deps Baileys rc14 + ESM gate + migrasi 0004 + init.ts

**Files:**
- Modify: `package.json`
- Modify: `src/lib/db/schema.ts` (tambah `waBindings`, `waSignalKeys`, relasi)
- Create: `src/lib/db/migrations/0004_*.sql` (via `npm run db:generate`)
- Modify: `src/lib/db/init.ts` (mirror DDL dev)
- Modify: `src/lib/env.ts`, `.env.example`
- Create: `src/tests/wa.test.ts` (skeleton ESM gate) + Modify `src/tests/run-tests.ts`
- Modify: `docs/BUILD_STATUS.md`

**Interfaces:**
- Produces: tabel `wa_bindings` + `wa_signal_keys` di schema (dipakai Task 2–7); `runWaTests(assert)` terdaftar (semua task tes menambah ke file ini); env `WA_BOT_PHONE`/`WA_ADMIN_PHONE` tersedia via `env` (dipakai Task 7).

- [ ] **Step 1: Install Baileys pin exact**

```bash
npm install @whiskeysockets/baileys@7.0.0-rc14 --save-exact
```

Verify: `grep '"@whiskeysockets/baileys"' package.json` → `"@whiskeysockets/baileys": "7.0.0-rc14"` (tanpa `^`/`~`). Lalu `npm ls @whiskeysockets/baileys` → satu baris `7.0.0-rc14`, tanpa duplikat transitive.

- [ ] **Step 2: ESM gate test (failing test dulu)**

`src/tests/wa.test.ts`:

```ts
import { makeWASocket } from "@whiskeysockets/baileys";

export async function runWaTests(assert: (condition: boolean, name: string) => void) {
  console.log("\n--- 9. WhatsApp Assistant (Baileys 7) Tests ---");

  // ESM gate: import statis bernama langsung dari paket (DILARANG require()).
  // Gagal di sini = CJS/ESM interop error → seluruh suite crash (fail loud).
  assert(typeof makeWASocket === "function", "ESM import Baileys 7 works (makeWASocket tersedia)");
}
```

`src/tests/run-tests.ts`: tambah `import { runWaTests } from "./wa.test";` dan panggil `await runWaTests(assert);` setelah `runPerfTests(assert)`.

- [ ] **Step 3: Run untuk memastikan ESM gate hijau**

Run: `npm test` → baris `✅ PASS: ESM import Baileys 7 works` + 176 tes existing tetap hijau. (Bila import crash: gagal di transpile tsx — periksa versi tsx/Node; jangan ganti ke require.)

- [ ] **Step 4: Schema `wa_bindings` + `wa_signal_keys`**

Di `src/lib/db/schema.ts`, tambahkan setelah tabel `authRateLimits` (sebelum `appConfig`):

```ts
// ----------------------------------------------------
// 10. WhatsApp (Baileys 7) — binding & auth-state keys
// ----------------------------------------------------
export const waBindings = sqliteTable(
  "wa_bindings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    phone: text("phone").notNull().unique(), // verification identity, E.164 tanpa "+" (628...)
    lid: text("lid").unique(), // transport identity — user part "@lid"
    jid: text("jid").unique(), // transport JID siap kirim (PN atau LID jid)
    status: text("status").notNull().default("pending"), // pending | active | unlinked
    otpCode: text("otp_code"), // sha256 hex
    otpExpiresAt: integer("otp_expires_at"), // ms
    otpAttempts: integer("otp_attempts").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    userIdIdx: uniqueIndex("wa_bindings_user_id_idx").on(table.userId),
    phoneIdx: uniqueIndex("wa_bindings_phone_idx").on(table.phone),
    lidIdx: uniqueIndex("wa_bindings_lid_idx").on(table.lid),
    jidIdx: uniqueIndex("wa_bindings_jid_idx").on(table.jid),
  })
);

export const waSignalKeys = sqliteTable(
  "wa_signal_keys",
  {
    type: text("type").notNull(), // namespace Baileys: lid-mapping, tctoken, device-list, session-*, pre-key-*, app-state-*
    key: text("key").notNull(), // id dalam namespace
    value: text("value").notNull(), // terenkripsi (encryptText)
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.type, table.key] }),
  })
);
```

Di `usersRelations` (blok `many(...)` setelah `legalBookmarks`): tambah `waBindings: many(waBindings),`. **Wajib**: tambahkan `primaryKey` ke import `drizzle-orm/sqlite-core` (baris 1 schema.ts saat ini: `import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";` → tambah `primaryKey`). `sql` dan `relations` sudah ada di import `drizzle-orm`.

- [ ] **Step 5: Generate migrasi + mirror init.ts**

```bash
npm run db:generate
```

Verify: `src/lib/db/migrations/0004_*.sql` berisi `CREATE TABLE wa_bindings` + `CREATE UNIQUE INDEX` (4×) + `CREATE TABLE wa_signal_keys`; `meta/_journal.json` bertambah 1 entry. Kemudian mirror DDL dev di `src/lib/db/init.ts` — tambah 2 statement CREATE TABLE + index ke array `ddlStatements` (pola blok `push_subscriptions` di init.ts, `CREATE TABLE IF NOT EXISTS`):

```sql
CREATE TABLE IF NOT EXISTS wa_bindings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL UNIQUE,
  lid TEXT UNIQUE,
  jid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  otp_code TEXT,
  otp_expires_at INTEGER,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_bindings_user_id_idx ON wa_bindings(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS wa_bindings_phone_idx ON wa_bindings(phone);
CREATE UNIQUE INDEX IF NOT EXISTS wa_bindings_lid_idx ON wa_bindings(lid);
CREATE UNIQUE INDEX IF NOT EXISTS wa_bindings_jid_idx ON wa_bindings(jid);
CREATE TABLE IF NOT EXISTS wa_signal_keys (
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (type, key)
);
```

Run `npm run db:migrate` (DB lokal `forfh-local.db`; env Turso tidak perlu inline — default local). Verify idempoten: run dua kali, tidak error.

- [ ] **Step 6: env.ts + .env.example + BUILD_STATUS**

`src/lib/env.ts` — di blok server env (dekat TURSO_*):

```ts
    // WhatsApp Bot (Baileys) — dipakai route pairing & OTP
    WA_BOT_PHONE: z.string().optional(), // E.164 tanpa "+" (requestPairingCode)
    WA_ADMIN_PHONE: z.string().optional(), // E.164 — pemilik bot
```

`.env.example`: tambah `WA_BOT_PHONE=` dan `WA_ADMIN_PHONE=` dengan komentar "E.164 tanpa +".

`docs/BUILD_STATUS.md` — tambah baris tabel scorecard setelah baris "Campus Sync":

```
| **WhatsApp Assistant (Baileys)** | ✅ PASS (dependency gate) | `@whiskeysockets/baileys@7.0.0-rc14` pin exact (≥ rc12 = patch CVE-2026-48063; versi < 7.0.0-rc12 / 6.7.22 ditolak). Import ESM — tidak ada CJS interop. 1 deployment = 1 instance = 1 socket. |
```

- [ ] **Step 7: Verifikasi + commit**

Run: `npm run typecheck` → 0 error; `npm test` → ESM gate + 176 existing hijau.

```bash
git add package.json package-lock.json src/lib/db/schema.ts src/lib/db/init.ts src/lib/db/migrations src/lib/env.ts .env.example src/tests/wa.test.ts src/tests/run-tests.ts docs/BUILD_STATUS.md
git commit -m "feat: wa-assistant — pin baileys rc14, migrasi 0004 wa_bindings & wa_signal_keys"
```

---

### Task 2: session-store.ts — SignalKeyStore adapter Turso + creds terenkripsi

**Files:**
- Create: `src/lib/wa/types.ts`
- Create: `src/lib/wa/session-store.ts`
- Test: `src/tests/wa.test.ts` (section auth-state)

**Interfaces:**
- Consumes: `schema.appConfig`, `schema.waSignalKeys` (Task 1); `encryptText/decryptText` (`@/lib/crypto/at-rest`).
- Produces: `class WaSessionStore implements SignalKeyStore` dengan `loadAuthState()`, `saveCreds(creds)`, `get(type, ids)`, `set(data)`, `transaction(fn, type)`; konstanta `WA_CREDS_KEY = "wa_creds"`, `WA_AUTH_INVALID_KEY = "wa_auth_invalid"` (dipakai Task 3 untuk flag auth invalid).

- [ ] **Step 1: types.ts (tipe bersama)**

```ts
// Tipe bersama modul WA — diimpor modul lain; jangan taruh tipe ini di modul
// yang punya siklus (client-manager ↔ health) agar tidak circular.

export type WaSocketState =
  | "stopped" | "starting" | "connecting" | "open"
  | "reconnecting" | "closing" | "logged_out" | "error";

export type DisconnectClass =
  | "temporary" | "restart" | "logged_out" | "replaced" | "bad_session"
  | "mismatch" | "forbidden" | "unavailable" | "unknown";

export type WaHealthStatus =
  | "healthy" | "degraded" | "possibly_silent" | "disconnected" | "auth_invalid";

export interface WaHealthIndicators {
  socketState: WaSocketState;
  lastConnectionUpdate: number | null; // ms epoch
  lastMessageEvent: number | null;
  lastSendAttempt: number | null;
  lastSuccessfulSend: number | null;
  lastSuccessfulReceive: number | null;
  lastAuthPersistence: number | null;
  failedSendAttempts: number;
  authInvalid: boolean;
}

export interface WaIdentity {
  lid?: string; // user part "@lid"
  phone?: string; // E.164 tanpa "+"
  jid?: string; // jid penuh (PN "@s.whatsapp.net" atau LID "@lid")
}

export type WaBindingRow = typeof import("@/lib/db/schema").waBindings.$inferSelect;
```

- [ ] **Step 2: session-store.ts — serialisasi nilai keystore**

```ts
import { and, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { AuthenticationCreds, AuthenticationState, SignalKeyStore } from "@whiskeysockets/baileys";
import { initAuthCreds } from "@whiskeysockets/baileys";
import * as schema from "@/lib/db/schema";
import { decryptText, encryptText } from "@/lib/crypto/at-rest";
import { logger } from "@/lib/logger";

export const WA_CREDS_KEY = "wa_creds";
export const WA_AUTH_INVALID_KEY = "wa_auth_invalid";

// ---- Serialisasi nilai keystore: round-trip eksak untuk semua namespace ----
// lid-mapping → string; prekeys/sessions/app-state → Buffer; tctoken → objek
// { token: Buffer, timestamp }. Prefiks 2 karakter memastikan ambiguitas nol.
function encodeValue(value: unknown): string {
  if (Buffer.isBuffer(value)) return `b:${value.toString("base64")}`;
  if (typeof value === "string") return `s:${value}`;
  return `j:${JSON.stringify(value, (_k, v) => (Buffer.isBuffer(v) ? { __buf: v.toString("base64") } : v))}`;
}

function decodeValue(encoded: string): unknown {
  const prefix = encoded.slice(0, 2);
  if (prefix === "b:") return Buffer.from(encoded.slice(2), "base64");
  if (prefix === "s:") return encoded.slice(2);
  return JSON.parse(encoded.slice(2), (_k, v) =>
    v && typeof v === "object" && "__buf" in v ? Buffer.from((v as { __buf: string }).__buf, "base64") : v
  );
}
```

- [ ] **Step 3: WaSessionStore class**

```ts
export class WaSessionStore implements SignalKeyStore {
  // null = dalam transaksi (pending map aktif); isi pending = ops belum commit
  private pending: Map<string, string | null> | null = null;

  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  /** Baca creds terenkripsi dari app_config; tanpa baris → initAuthCreds() baru. */
  async loadAuthState(): Promise<AuthenticationState> {
    const row = await this.db
      .select().from(schema.appConfig)
      .where(eq(schema.appConfig.key, WA_CREDS_KEY)).limit(1).then((r) => r[0]);
    if (!row) return { creds: initAuthCreds(), keys: this };
    try {
      return { creds: JSON.parse(decryptText(row.value)) as AuthenticationCreds, keys: this };
    } catch (err) {
      logger.warn("wa_creds korup — memulai auth state baru", err);
      return { creds: initAuthCreds(), keys: this };
    }
  }

  async saveCreds(creds: AuthenticationCreds): Promise<void> {
    const payload = encryptText(JSON.stringify(creds));
    await this.db
      .insert(schema.appConfig).values({ key: WA_CREDS_KEY, value: payload })
      .onConflictDoUpdate({ target: schema.appConfig.key, set: { value: payload } });
  }

  /** Batch SELECT per namespace + decrypt. Value hilang = tidak ada. */
  async get(type: string, ids: string[]): Promise<Record<string, any>> {
    if (!ids.length) return {};
    const out: Record<string, any> = {};
    const missing: string[] = [];
    for (const id of ids) {
      const txVal = this.pending?.get(`${type}:${id}`);
      if (txVal === null) continue; // dihapus dalam transaksi
      if (txVal !== undefined) { out[id] = decodeValue(txVal); continue; }
      missing.push(id);
    }
    if (missing.length) {
      const rows = await this.db
        .select().from(schema.waSignalKeys)
        .where(and(eq(schema.waSignalKeys.type, type), inArray(schema.waSignalKeys.key, missing)));
      for (const row of rows) {
        try { out[row.key] = decodeValue(decryptText(row.value)); }
        catch (err) { logger.warn("gagal dekripsi signal key", { type, key: row.key }, err); }
      }
    }
    return out;
  }

  /** Upsert per (type, key); nilai null = DELETE (semantik Baileys). */
  async set(data: Record<string, any>): Promise<void> {
    const entries = Object.entries(data);
    if (!entries.length) return;
    if (this.pending) {
      for (const [k, v] of entries) this.pending.set(k, v === null ? null : encodeValue(v));
      return;
    }
    await this.applyOps(entries);
  }

  /** Pola transaksi keystore (dipakai lid-mapping: key + reverse key ditulis atomik).
   *  Selama transaksi aktif, set() menumpuk ke pending map; get() membaca pending
   *  dulu. Commit berurutan (2 key lid-mapping — biaya trivial). Throw → dibuang. */
  async transaction<T>(fn: (store: SignalKeyStore) => Promise<T>, _type?: string): Promise<T> {
    const outer = this.pending;
    this.pending = outer ?? new Map();
    try {
      const result = await fn(this);
      if (!outer) await this.applyOps([...this.pending.entries()]);
      return result;
    } finally {
      this.pending = outer;
    }
  }

  private async applyOps(ops: Array<[string, string | null]>): Promise<void> {
    for (const [k, v] of ops) {
      const sep = k.indexOf(":");
      const type = k.slice(0, sep);
      const key = k.slice(sep + 1);
      if (v === null) {
        await this.db.delete(schema.waSignalKeys)
          .where(and(eq(schema.waSignalKeys.type, type), eq(schema.waSignalKeys.key, key)));
      } else {
        const encoded = encryptText(v);
        await this.db
          .insert(schema.waSignalKeys).values({ type, key, value: encoded })
          .onConflictDoUpdate({
            target: [schema.waSignalKeys.type, schema.waSignalKeys.key],
            set: { value: encoded },
          });
      }
    }
  }
}
```

Catatan implementasi: pastikan `initAuthCreds` diekspor rc14 (`npm ls` menunjuk satu versi; bila nama berbeda, sesuaikan import dan catat di report). Signature `transaction` boleh dua arg; arg kedua (`type`) diabaikan dengan `_type` (kompatibel interface Baileys). Bila interface `SignalKeyStore` rc14 menuntut anggota tambahan (mis. `getAllKeys`), tambahkan stub konsisten (return `{}`) — interface nyata menang; catat di report.

- [ ] **Step 4: Test auth-state (failing test — libsql `:memory:`)**

**Imports — tambahkan di header `src/tests/wa.test.ts`** (import hanya boleh top-level file, JANGAN di dalam fungsi):

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as dbSchema from "../lib/db/schema";
import { WaSessionStore } from "../lib/wa/session-store";
```

Lalu append blok tes di dalam `runWaTests`, setelah assert ESM gate:

```ts

// DDL minimal untuk :memory: — jaga sinkron dgn schema.ts waBindings/waSignalKeys
const MEM_DDL = [
  `CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))`,
  `CREATE TABLE IF NOT EXISTS wa_signal_keys (type TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY (type, key))`,
  `CREATE TABLE IF NOT EXISTS wa_bindings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, phone TEXT NOT NULL UNIQUE, lid TEXT UNIQUE, jid TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending', otp_code TEXT, otp_expires_at INTEGER, otp_attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
];

async function createMemDb() {
  const client = createClient({ url: ":memory:" });
  for (const ddl of MEM_DDL) await client.execute(ddl);
  return drizzle(client, { schema: dbSchema });
}
```

Lalu di dalam `runWaTests`, blok auth-state:

```ts
  // ===== F1 — Auth state (storage adapter, libsql :memory:) =====
  {
    const memDb = await createMemDb();
    const store = new WaSessionStore(memDb);

    // save/load creds (round-trip terenkripsi)
    const fakeCreds: any = { me: { id: "62812@lid" }, registered: true, noiseKey: { private: Buffer.from("ab"), public: Buffer.from("cd") } };
    await store.saveCreds(fakeCreds);
    const restored = await store.loadAuthState();
    assert(restored.creds.me.id === "62812@lid", "creds round-trip: save → load utuh");
    const rawRow = await memDb.select().from(dbSchema.appConfig).where(eq(dbSchema.appConfig.key, "wa_creds")).limit(1).then((r) => r[0]);
    assert(!!rawRow && !rawRow.value.includes("62812"), "creds tersimpan terenkripsi (plaintext tidak tampil)");

    // save/load key per namespace
    await store.set({ "lid-mapping:lidA": "628111" });
    const got = await store.get("lid-mapping", ["lidA"]);
    assert(got["lidA"] === "628111", "key round-trip: set → get mengembalikan nilai sama");

    // update existing key → load updated
    await store.set({ "lid-mapping:lidA": "628222" });
    const got2 = await store.get("lid-mapping", ["lidA"]);
    assert(got2["lidA"] === "628222", "update key → get mengembalikan nilai baru");

    // delete key (null) → absent
    await store.set({ "lid-mapping:lidA": null });
    const got3 = await store.get("lid-mapping", ["lidA"]);
    assert(got3["lidA"] === undefined, "delete key (null) → get tidak mengembalikan");

    // lid-mapping + _reverse dalam satu transaksi → keduanya ada
    await store.transaction(async () => {
      await store.set({ "lid-mapping:lidB": "628333", "lid-mapping:628333_reverse": "lidB" });
    });
    const lidB = await store.get("lid-mapping", ["lidB"]);
    const rev = await store.get("lid-mapping", ["628333_reverse"]);
    assert(lidB["lidB"] === "628333" && rev["628333_reverse"] === "lidB", "transaction lid-mapping: key + _reverse ditulis atomik");

    // tctoken namespace (objek dengan Buffer)
    const tctoken = { token: Buffer.from("tok"), timestamp: 1755000000000 };
    await store.set({ "tctoken:628333": tctoken });
    const tc = await store.get("tctoken", ["628333"]) as any;
    assert(Buffer.isBuffer(tc["628333"]?.token) && tc["628333"]?.timestamp === 1755000000000, "tctoken round-trip (objek + Buffer)");

    // "restart": instance store baru dari data yang sama → restore utuh
    const store2 = new WaSessionStore(memDb);
    const restored2 = await store2.get("lid-mapping", ["lidB"]);
    const tc2 = await store2.get("tctoken", ["628333"]) as any;
    assert(restored2["lidB"] === "628333" && Buffer.isBuffer(tc2["628333"]?.token), "restart: store baru dari data sama → mapping & tctoken utuh");
  }
```

Tambahkan import `eq` dari `drizzle-orm` di wa.test.ts.

- [ ] **Step 5: Run test — hijau + typecheck**

Run: `npm test` → assert auth-state 7× PASS + ESM gate. `npm run typecheck` → 0 error.

- [ ] **Step 6: Commit**

```bash
git add src/lib/wa/types.ts src/lib/wa/session-store.ts src/tests/wa.test.ts
git commit -m "feat: wa session-store — SignalKeyStore adapter Turso terenkripsi + tes auth-state"
```

---

### Task 3: client-manager.ts — state machine, disconnect matrix, keepalive + health.ts

**Files:**
- Create: `src/lib/wa/client-manager.ts`
- Create: `src/lib/wa/health.ts`
- Modify: `src/app/api/internal/reminders/process/route.ts` (panggil `waKeepAlive`)
- Test: `src/tests/wa.test.ts` (section socket manager + health + classifyDisconnect)

**Interfaces:**
- Consumes: `WaSessionStore` (Task 2), `types.ts` (Task 2), `appConfig` (flag auth invalid), logger, db.
- Produces: `classifyDisconnect(statusCode)` pure; `nextBackoffDelayMs(attempt)` pure; `WaClientManager` (state, `ensureWaClient()`, `isReady()`, `sendText()`, `requestPairingCode()`, `on(event, cb)`, `options`); `waKeepAlive(manager)`; `getWaClientManager()` singleton; `isIgnoredJid(jid)`; modul `health` (`recordSocketState`, `recordConnectionOpen`, `recordInboundMessage`, `recordSendAttempt/Success/Failure`, `recordReceiveSuccess`, `recordAuthPersistence`, `recordAuthInvalid`, `getHealthIndicators`, `computeHealth`, `resetHealthForTests`). Dipakai Task 5–7.

- [ ] **Step 1: health.ts (failing test dulu — computeHealth pure)**

**Imports (header wa.test.ts — import dilarang di dalam fungsi):** `import { computeHealth, resetHealthForTests, getHealthIndicators } from "../lib/wa/health";` dan `import type { WaHealthIndicators } from "../lib/wa/types";`

```ts
  // ===== F1 — Health model (pure) =====
  {
    const base: WaHealthIndicators = {
      socketState: "open", lastConnectionUpdate: Date.now() - 1000, lastMessageEvent: Date.now() - 1000,
      lastSendAttempt: Date.now() - 1000, lastSuccessfulSend: Date.now() - 1000,
      lastSuccessfulReceive: Date.now() - 1000, lastAuthPersistence: Date.now() - 1000,
      failedSendAttempts: 0, authInvalid: false,
    };
    assert(computeHealth({ ...base }) === "healthy", "open + event baru → healthy");
    const silent: WaHealthIndicators = { ...base, lastMessageEvent: Date.now() - 20 * 60_000, lastSuccessfulReceive: Date.now() - 20 * 60_000 };
    assert(computeHealth(silent) === "possibly_silent", "open + tak ada inbound >15 mnt → possibly_silent (BUKAN unhealthy)");
    const degraded: WaHealthIndicators = { ...base, failedSendAttempts: 3 };
    assert(computeHealth(degraded) === "degraded", "open + 3 kiriman gagal beruntun → degraded");
    assert(computeHealth({ ...base, socketState: "reconnecting" }) === "disconnected", "socket tidak open → disconnected");
    assert(computeHealth({ ...base, authInvalid: true }) === "auth_invalid", "flag auth invalid → auth_invalid");
    // Segar open tanpa pesan masuk: berbasis lastConnectionUpdate → sehat (tanpa false alarm langsung)
    assert(computeHealth({ ...base, lastMessageEvent: null, lastSuccessfulReceive: null, lastConnectionUpdate: Date.now() - 60_000 }) === "healthy",
      "baru open + belum ada pesan → healthy (bukan mungkin_silent instan)");
  }
```

`src/lib/wa/health.ts`:

```ts
import type { DisconnectClass, WaHealthIndicators, WaHealthStatus, WaSocketState } from "./types";

const SILENT_THRESHOLD_MS = 15 * 60_000; // A6: lastMessageEvent basi > 15 menit
const DEGRADED_FAILURES = 3; // A6: kiriman gagal beruntun

// Health = fungsi gabungan indikator (A6), BUKAN satu pencatat waktu.
// Observability — tanpa aggressive probing; possibly_silent ≠ unhealthy.
const indicators: WaHealthIndicators = {
  socketState: "stopped",
  lastConnectionUpdate: null,
  lastMessageEvent: null,
  lastSendAttempt: null,
  lastSuccessfulSend: null,
  lastSuccessfulReceive: null,
  lastAuthPersistence: null,
  failedSendAttempts: 0,
  authInvalid: false,
};

export function getHealthIndicators(): WaHealthIndicators {
  return { ...indicators };
}

export function resetHealthForTests(): void {
  Object.assign(indicators, {
    socketState: "stopped", lastConnectionUpdate: null, lastMessageEvent: null,
    lastSendAttempt: null, lastSuccessfulSend: null, lastSuccessfulReceive: null,
    lastAuthPersistence: null, failedSendAttempts: 0, authInvalid: false,
  });
}

export function recordSocketState(state: WaSocketState): void { indicators.socketState = state; }
export function recordConnectionOpen(isNewLogin: boolean): void {
  indicators.socketState = "open";
  indicators.lastConnectionUpdate = Date.now();
  if (isNewLogin) indicators.lastAuthPersistence = Date.now();
}
export function recordInboundMessage(): void { indicators.lastMessageEvent = Date.now(); }
export function recordReceiveSuccess(): void { indicators.lastSuccessfulReceive = Date.now(); }
export function recordSendAttempt(): void { indicators.lastSendAttempt = Date.now(); }
export function recordSendSuccess(): void { indicators.lastSuccessfulSend = Date.now(); indicators.failedSendAttempts = 0; }
export function recordSendFailure(): void { indicators.failedSendAttempts += 1; }
export function recordAuthPersistence(): void { indicators.lastAuthPersistence = Date.now(); }
export function recordAuthInvalid(v: boolean): void { indicators.authInvalid = v; }

/** Model 5 level (A6). possibly_silent TIDAK pernah = unhealthy. */
export function computeHealth(h: WaHealthIndicators): WaHealthStatus {
  if (h.authInvalid) return "auth_invalid";
  if (h.socketState !== "open") return "disconnected";
  const now = Date.now();
  // Inbound events; saat belum pernah ada pesan, pakai lastConnectionUpdate
  // agar bot yang baru connect tidak langsung diflag "silent".
  const lastInbound = Math.max(h.lastMessageEvent ?? 0, h.lastSuccessfulReceive ?? 0, h.lastConnectionUpdate ?? 0);
  if (now - lastInbound > SILENT_THRESHOLD_MS) return "possibly_silent";
  if (h.failedSendAttempts >= DEGRADED_FAILURES) return "degraded";
  return "healthy";
}

// DisconnectClass hanya dipakai tipe callback client-manager; re-export agar
// consumer tidak perlu import types langsung dua kali.
export type { DisconnectClass };
```

- [ ] **Step 2: Test classifyDisconnect + backoff (failing)**

**Imports (header):** `import { classifyDisconnect, nextBackoffDelayMs } from "../lib/wa/client-manager";`

```ts
  // ===== F1 — classifyDisconnect pure (matriks A4) =====
  {
    assert(classifyDisconnect(408) === "temporary", "408 connectionLost/timedOut → temporary");
    assert(classifyDisconnect(428) === "temporary", "428 connectionClosed → temporary");
    assert(classifyDisconnect(515) === "restart", "515 restartRequired → restart");
    assert(classifyDisconnect(401) === "logged_out", "401 loggedOut → logged_out");
    assert(classifyDisconnect(440) === "replaced", "440 connectionReplaced → replaced");
    assert(classifyDisconnect(500) === "bad_session", "500 badSession → bad_session");
    assert(classifyDisconnect(411) === "mismatch", "411 multideviceMismatch → mismatch");
    assert(classifyDisconnect(403) === "forbidden", "403 forbidden → forbidden");
    assert(classifyDisconnect(503) === "unavailable", "503 unavailableService → unavailable");
    assert(classifyDisconnect(undefined) === "unknown", "tanpa error → unknown");

    // Backoff: min 1s, max 60s, jitter ±20% (A3)
    const d1 = nextBackoffDelayMs(1);
    assert(d1 >= 800 && d1 <= 1200, "backoff attempt 1 dalam 0.8–1.2s (base 1s ±20%)");
    const d10 = nextBackoffDelayMs(10);
    assert(d10 >= 48_000 && d10 <= 72_000, "backoff attempt 10 terkunci di 60s ±20% (cap)");
  }
```

- [ ] **Step 3: client-manager.ts — classify, backoff, manager**

```ts
import { makeWASocket } from "@whiskeysockets/baileys";
import type { AuthenticationCreds, AuthenticationState, WAMessage, WASocket } from "@whiskeysockets/baileys";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import * as health from "./health";
import { WA_AUTH_INVALID_KEY, WaSessionStore } from "./session-store";
import type { DisconnectClass, WaSocketState } from "./types";

// =====================================================================
// KONSTRAIN DEPLOYMENT (spec A1): 1 deployment = 1 instance = 1 socket
// = 1 bot account. Horizontal scaling DILARANG — dua instance yang
// membaca auth state yang sama akan login sebagai device yang sama
// (conflict). Distribusi socket antar instance = non-goal MVP.
// =====================================================================

/** Matriks disconnect spec A4 — PURE function (callback socket hanya
 *  memanggil classifier; logika klasifikasi TIDAK ditanam di callback).
 *  Nilai numerik sesuai DisconnectReason Baileys 7 (spec §1):
 *  connectionClosed=428, connectionLost/timedOut=408, connectionReplaced=440,
 *  loggedOut=401, badSession=500, restartRequired=515, multideviceMismatch=411,
 *  forbidden=403, unavailableService=503. */
export function classifyDisconnect(statusCode: number | undefined): DisconnectClass {
  switch (statusCode) {
    case 408:
    case 428: return "temporary";
    case 515: return "restart";
    case 401: return "logged_out";
    case 440: return "replaced";
    case 500: return "bad_session";
    case 411: return "mismatch";
    case 403: return "forbidden";
    case 503: return "unavailable";
    default: return "unknown";
  }
}

/** Backoff eksponensial: base min 1s, cap 60s, jitter ±20% (A3). */
export function nextBackoffDelayMs(attempt: number): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** Guard jid yang diabaikan: grup/broadcast/status/newsletter (C1). */
export function isIgnoredJid(jid: string | null | undefined): boolean {
  if (!jid) return true;
  return (
    jid.endsWith("@g.us") || jid.endsWith("@broadcast") ||
    jid.endsWith("@status") || jid.endsWith("@newsletter")
  );
}

// Logger minimal untuk Baileys (adaptor pino-like; level dipakai Baileys utk
// mem-filter log internal). Cast as any — struktur logger pino bukan kontrak
// publik; verifikasi saat typecheck rc14.
const waLogger = {
  level: "info",
  trace: () => {},
  debug: () => {},
  info: (msg: string, ...a: any[]) => logger.info(msg, ...a),
  warn: (msg: string, ...a: any[]) => logger.warn(msg, ...a),
  error: (msg: string, ...a: any[]) => logger.error(msg, ...a),
  child: () => waLogger,
} as any;

const MAX_CONSECUTIVE_ATTEMPTS = 10; // A3: setelah 10 → tetap cap 60s utk temporary
const RESTART_DELAY_MS = 250;

export interface WaManagerOptions {
  makeSocket?: (auth: AuthenticationState) => WASocket;
  loadAuth?: () => Promise<AuthenticationState>;
  persistCreds?: (creds: AuthenticationCreds) => Promise<void>;
  readAuthFlag?: () => Promise<boolean>;
  persistAuthFlag?: (value: boolean) => Promise<void>;
  scheduleTimer?: (fn: () => void, delayMs: number) => void;
  now?: () => number;
}

const defaultStore = new WaSessionStore(db);

export class WaClientManager {
  state: WaSocketState = "stopped";
  /** Alasan fatal (auth_invalid | replaced | mismatch | forbidden | bad_session | unavailable | unknown) — mengunci auto-recreate. */
  fatalReason: string | null = null;

  private readonly options: Required<WaManagerOptions>;
  private socket: WASocket | null = null;
  private authState: AuthenticationState | null = null;
  private startupPromise: Promise<void> | null = null;
  private backoffAttempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Record<string, Array<(payload: any) => void | Promise<void>>> = {};
  private wiringDone = false;

  constructor(options: WaManagerOptions = {}) {
    this.options = {
      makeSocket: (auth) =>
        makeWASocket({
          auth,
          logger: waLogger,
          markOnlineOnConnect: true, // spec §1 — konfigurasi socket yang dipakai
          syncFullHistory: false,
          shouldIgnoreJid: (jid) => isIgnoredJid(jid),
          // keepAliveIntervalMs (30s) & connectTimeoutMs (20s): default Baileys
        }),
      loadAuth: () => defaultStore.loadAuthState(),
      persistCreds: (creds) => defaultStore.saveCreds(creds),
      readAuthFlag: async () => {
        const row = await db.select().from(schema.appConfig)
          .where(eq(schema.appConfig.key, WA_AUTH_INVALID_KEY)).limit(1).then((r) => r[0]);
        return row?.value === "1";
      },
      persistAuthFlag: async (value) => {
        health.recordAuthInvalid(value);
        await db.insert(schema.appConfig)
          .values({ key: WA_AUTH_INVALID_KEY, value: value ? "1" : "0" })
          .onConflictDoUpdate({ target: schema.appConfig.key, set: { value: value ? "1" : "0" } });
      },
      scheduleTimer: (fn, delayMs) => { this.timer = setTimeout(fn, delayMs); },
      now: () => Date.now(),
      ...options,
    };
  }

  on(event: "open", cb: (info: { isNewLogin: boolean }) => void | Promise<void>): void;
  on(event: "close", cb: (info: { classification: DisconnectClass; statusCode?: number }) => void | Promise<void>): void;
  on(event: "message", cb: (msg: WAMessage) => void | Promise<void>): void;
  on(event: string, cb: (payload: any) => void | Promise<void>): void {
    (this.listeners[event] ??= []).push(cb);
  }

  isReady(): boolean {
    return this.state === "open" && !!this.socket;
  }

  async isAuthInvalid(): Promise<boolean> {
    return this.options.readAuthFlag();
  }

  /** Idempoten (A2): starting/connecting/reconnecting → startup promise yang
   *  SAMA; open → no-op; logged_out/error fatal → TANPA auto-recreate. */
  async ensureWaClient(): Promise<WaSocketState> {
    if (this.state === "open") return "open";
    if (this.fatalReason) return this.state;
    if (this.startupPromise) { await this.startupPromise; return this.state; }
    this.startupPromise = this.initSocket().finally(() => { this.startupPromise = null; });
    await this.startupPromise;
    return this.state;
  }

  async sendText(jid: string, text: string): Promise<boolean> {
    if (!this.isReady() || !this.socket) return false;
    try {
      await this.socket.sendMessage(jid, { text });
      return true;
    } catch (err) {
      logger.warn("wa: gagal mengirim", { jid }, err);
      return false;
    }
  }

  /** Pairing: requestPairingCode tetap dipakai (Baileys 7). */
  async requestPairingCode(phone: string): Promise<string> {
    if (!this.socket) throw new Error("Socket belum siap — panggil ensureWaClient() dulu");
    return this.socket.requestPairingCode(phone);
  }

  async setAuthInvalidFlag(): Promise<void> { await this.options.persistAuthFlag(true); }
  async clearAuthInvalidFlag(): Promise<void> { await this.options.persistAuthFlag(false); }

  // ---- internal ----

  private async initSocket(): Promise<void> {
    this.state = "starting";
    try {
      this.authState ??= await this.options.loadAuth();
      const sock = this.options.makeSocket(this.authState);
      this.socket = sock;
      sock.ev.on("connection.update", (update) => { void this.handleConnectionUpdate(update); });
      sock.ev.on("creds.update", (creds) => { void this.handleCredsUpdate(creds); });
      sock.ev.on("messages.upsert", (upsert) => { void this.handleMessagesUpsert(upsert); });
      this.state = "connecting";
      health.recordSocketState("connecting");
      this.ensureWiring();
    } catch (err) {
      this.state = "error";
      health.recordSocketState("error");
      logger.error("wa: gagal inisialisasi socket", err);
    }
  }

  private ensureWiring(): void {
    if (this.wiringDone) return;
    this.wiringDone = true;
    // Import dinamis: pipeline & pairing tidak boleh membuat siklus statis
    // (client-manager ↔ pipeline ↔ send ↔ client-manager).
    void import("./pipeline").then((m) => m.registerMessagePipeline(this)).catch((e) => logger.warn("wa: wiring pipeline gagal", e));
    void import("./pairing").then((m) => m.registerPairingHooks(this)).catch((e) => logger.warn("wa: wiring pairing gagal", e));
  }

  private async handleConnectionUpdate(update: any): Promise<void> {
    if (update.connection === "open") {
      this.state = "open";
      this.backoffAttempt = 0;
      health.recordConnectionOpen(!!update.isNewLogin);
      if (update.isNewLogin) {
        await this.persistCredsNow();
        await this.clearAuthInvalidFlag();
      }
      await this.emit("open", { isNewLogin: !!update.isNewLogin });
    } else if (update.connection === "close") {
      await this.handleClose(update);
    } else if (update.connection === "connecting") {
      this.state = "connecting";
      health.recordSocketState("connecting");
    }
  }

  private async handleClose(update: any): Promise<void> {
    const err = update.lastDisconnect?.error as any;
    const statusCode =
      typeof err?.status === "number" ? err.status :
      typeof err?.code === "number" ? err.code : undefined;
    const classification = classifyDisconnect(statusCode);
    logger.warn("wa: koneksi tertutup", { classification, statusCode, message: err?.message });

    switch (classification) {
      case "restart": // 515: tutup socket lama → init ulang (auth sama)
        this.state = "closing";
        try { this.socket?.end(new Error("restartRequired")); } catch { /* noop */ }
        this.socket = null;
        this.state = "reconnecting";
        health.recordSocketState("reconnecting");
        this.scheduleReconnect(RESTART_DELAY_MS);
        break;
      case "temporary": // 408/428
        this.state = "reconnecting";
        health.recordSocketState("reconnecting");
        this.scheduleReconnect(0);
        break;
      case "unavailable": // 503: maks 3 upaya berurutan
        if (this.backoffAttempt < 3) {
          this.state = "reconnecting";
          health.recordSocketState("reconnecting");
          this.scheduleReconnect(0);
        } else {
          this.stopFatal("unavailable");
        }
        break;
      case "logged_out":
      case "bad_session":
        this.stopFatal("auth_invalid");
        await this.setAuthInvalidFlag();
        break;
      case "replaced": // 440: TIDAK pernah auto-reconnect
        this.stopFatal("replaced");
        break;
      default: // mismatch / forbidden / unknown
        this.stopFatal(classification);
        break;
    }
    await this.emit("close", { classification, statusCode });
  }

  private stopFatal(reason: string): void {
    this.fatalReason = reason;
    this.state = reason === "auth_invalid" ? "logged_out" : "error";
    health.recordSocketState(this.state);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try { this.socket?.end(new Error(reason)); } catch { /* noop */ }
    this.socket = null;
  }

  /** A3: backoff eksponensial 1s–60s + jitter ±20%; batas 10 upaya berurutan,
   *  setelah itu tetap cap maksimum (temporary). Selalu jeda via timer —
   *  reconnecting, bukan loop ketat. */
  private scheduleReconnect(extraMs: number): void {
    if (this.fatalReason || this.timer) return;
    this.backoffAttempt += 1;
    const base = this.backoffAttempt >= MAX_CONSECUTIVE_ATTEMPTS ? 60_000 : nextBackoffDelayMs(this.backoffAttempt);
    const delay = Math.max(0, base + extraMs);
    this.options.scheduleTimer(() => {
      this.timer = null;
      if (this.fatalReason) return;
      void this.ensureWaClient();
    }, delay);
  }

  private async handleCredsUpdate(creds: AuthenticationCreds): Promise<void> {
    if (!this.authState) return;
    this.authState.creds = creds; // Baileys mengganti objek creds — ikuti referensi baru
    await this.persistCredsNow();
  }

  private async persistCredsNow(): Promise<void> {
    try {
      if (!this.authState) return;
      await this.options.persistCreds(this.authState.creds);
      health.recordAuthPersistence();
    } catch (err) {
      logger.error("wa: gagal menyimpan creds", err);
    }
  }

  private async handleMessagesUpsert(upsert: { messages: WAMessage[]; type: string }): Promise<void> {
    if (!upsert || upsert.type !== "notify" || !Array.isArray(upsert.messages)) return; // C1: hanya notify
    for (const msg of upsert.messages) {
      health.recordInboundMessage();
      await this.emit("message", msg);
    }
  }

  private async emit(event: string, payload: any): Promise<void> {
    for (const cb of this.listeners[event] ?? []) {
      try { await cb(payload); } catch (err) { logger.warn(`wa: listener ${event} error`, err); }
    }
  }
}

/** A5: keepalive dari tick QStash. QStash = health/recovery trigger, BUKAN
 *  pengganti persistent socket; tidak pernah recreate socket tiap tick. */
export async function waKeepAlive(manager: WaClientManager): Promise<string> {
  if (await manager.isAuthInvalid()) return "auth-invalid"; // tanpa recreate
  if (manager.state === "open") return "healthy";
  const state = await manager.ensureWaClient();
  return state === "open" ? "recovered" : state;
}

let managerSingleton: WaClientManager | null = null;
export function getWaClientManager(): WaClientManager {
  managerSingleton ??= new WaClientManager();
  return managerSingleton;
}
```

- [ ] **Step 4: Test socket manager (Baileys di-mock — fake socket)**

**Imports (header):** `import { WaClientManager, waKeepAlive } from "../lib/wa/client-manager";`

```ts

  // ===== F1 — Socket manager (Baileys di-mock) =====
  {
    interface FakeSocket {
      ev: { on: (ev: string, cb: (p: any) => void) => void };
      sendMessage: () => Promise<any>;
      requestPairingCode: () => Promise<string>;
      end: (err?: Error) => void;
      handlers: Record<string, (p: any) => void>;
    }
    function makeFakeSocket(): FakeSocket {
      const handlers: Record<string, (p: any) => void> = {};
      return {
        handlers,
        ev: { on: (ev, cb) => { handlers[ev] = cb; } },
        sendMessage: async () => ({}),
        requestPairingCode: async () => "ABC-DEF",
        end: () => {},
      };
    }
    async function makeManager(opts: { onClose?: (p: any) => void }) {
      let callCount = 0;
      let authInvalid = false;
      const sockets: FakeSocket[] = [];
      const manager = new WaClientManager({
        makeSocket: (() => { callCount++; const s = makeFakeSocket(); sockets.push(s); return s; }) as any,
        loadAuth: async () => ({ creds: { me: { id: "62812@lid" }, registered: false } as any, keys: {} as any }),
        persistCreds: async () => {},
        readAuthFlag: async () => authInvalid,
        persistAuthFlag: async (v) => { authInvalid = v; },
        scheduleTimer: (fn) => { fn(); }, // fire langsung (deterministik untuk tes)
      });
      manager.on("close", opts.onClose ?? (() => {}));
      return { manager, sockets, getCallCount: () => callCount };
    }

    // ensureWaClient idempoten: 3× berurutan → 1 socket
    const m1 = await makeManager({});
    await Promise.all([m1.manager.ensureWaClient(), m1.manager.ensureWaClient(), m1.manager.ensureWaClient()]);
    assert(m1.getCallCount() === 1, "ensureWaClient 3× berurutan → tepat 1 socket (shared startup promise)");
    // saat state connecting (startup promise aktif) — panggilan lagi → tetap 1 socket
    assert(m1.getCallCount() === 1, "panggilan saat connecting → shared promise, bukan socket baru");

    // connect → open; temporary disconnect (408) → reconnect (backoff, 2 socket)
    const m2 = await makeManager({});
    await m2.manager.ensureWaClient();
    m2.sockets[0].handlers["connection.update"]({ connection: "open" });
    assert(m2.manager.state === "open" && m2.manager.isReady(), "connect → state open");
    m2.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: { status: 408 } } });
    await new Promise((r) => setTimeout(r, 10));
    assert(m2.getCallCount() === 2, "disconnect temporary (408) → reconnect via backoff");
    assert(m2.manager.fatalReason === null, "temporary → fatalReason tetap null");

    // loggedOut (401) → stop + auth invalid; TANPA recreate
    const m3 = await makeManager({});
    await m3.manager.ensureWaClient();
    m3.sockets[0].handlers["connection.update"]({ connection: "open" });
    m3.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: { status: 401 } } });
    assert(m3.manager.state === "logged_out" && m3.manager.fatalReason === "auth_invalid", "loggedOut (401) → state logged_out + fatal");
    assert(m3.getCallCount() === 1, "loggedOut → TIDAK auto-recreate");
    const keep3 = await waKeepAlive(m3.manager);
    assert(keep3 === "auth-invalid", "waKeepAlive saat auth invalid → auth-invalid (tanpa recreate)");

    // connectionReplaced (440) → stop, TIDAK reconnect
    const m4 = await makeManager({});
    await m4.manager.ensureWaClient();
    m4.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: { status: 440 } } });
    assert(m4.manager.state === "error" && m4.manager.fatalReason === "replaced", "connectionReplaced (440) → stop tanpa reconnect");
    assert(m4.getCallCount() === 1, "connectionReplaced → 1 socket saja");

    // restartRequired (515) → recreate (auth sama)
    const m5 = await makeManager({});
    await m5.manager.ensureWaClient();
    m5.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: { status: 515 } } });
    await new Promise((r) => setTimeout(r, 10));
    assert(m5.getCallCount() === 2, "restartRequired (515) → recreate socket");

    // waKeepAlive: open → healthy; dead → ensure (recovered)
    const m6 = await makeManager({});
    assert((await waKeepAlive(m6.manager)) === "connecting", "waKeepAlive saat belum ada socket → ensure → state");
    m6.sockets[0].handlers["connection.update"]({ connection: "open" });
    assert((await waKeepAlive(m6.manager)) === "healthy", "waKeepAlive saat open → healthy");

    // creds.update → persist + health lastAuthPersistence
    resetHealthForTests();
    m6.sockets[0].handlers["creds.update"]({ me: { id: "62812@lid" }, registered: true } as any);
    await new Promise((r) => setTimeout(r, 5));
    assert(getHealthIndicators().lastAuthPersistence !== null, "creds.update → lastAuthPersistence tercatat");
  }
```

Catatan: `resetHealthForTests()` harus di-import; `handlers["connection.update"]` dipanggil sinkron, tapi handler ber-`void` async — `await new Promise(setTimeout 10)` memberi ruang mikro untuk reentrancy manager.

- [ ] **Step 5: waKeepAlive di tick QStash**

`src/app/api/internal/reminders/process/route.ts` — tambah import dan panggilan (setelah `processDueReminders()`, sebelum/paralel dengan `syncDueUsers()`):

```ts
import { getWaClientManager, waKeepAlive } from "@/lib/wa/client-manager";
import { logger } from "@/lib/logger";
```

Di dalam `POST`, setelah `const result = await processDueReminders();`:

```ts
  // Keepalive bot WA: health/recovery trigger (A5) — jangan recreate tiap tick
  let waKeepalive = "skipped";
  try {
    waKeepalive = await waKeepAlive(getWaClientManager());
  } catch (err: any) {
    logger.warn("wa keepalive error:", err?.message || err);
    waKeepalive = "error";
  }
```

Dan tambahkan `waKeepalive` ke response JSON.

- [ ] **Step 6: Run + commit**

Run: `npm test` (semua assert baru hijau), `npm run typecheck`.

```bash
git add src/lib/wa/client-manager.ts src/lib/wa/health.ts src/app/api/internal/reminders/process/route.ts src/tests/wa.test.ts
git commit -m "feat: wa client-manager — state machine, disconnect matrix, keepalive + health 5 level"
```

---

### Task 4: identity.ts + normalize.ts + format.ts + commands.ts + rate-limit.ts — pure

**Files:**
- Create: `src/lib/wa/identity.ts`, `src/lib/wa/normalize.ts`, `src/lib/wa/format.ts`, `src/lib/wa/commands.ts`, `src/lib/wa/rate-limit.ts`
- Test: `src/tests/wa.test.ts` (identity resolver + target + normalize + format + parser + rate-limit key)

**Interfaces:**
- Consumes: `types.ts` (WaIdentity, WaBindingRow); `db` + `waBindings`; `checkRateLimit` (`@/lib/auth/rate-limit`); Baileys utils `isLidUser/isPnUser/jidDecode`.
- Produces: `normalizePhone`, `maskPhone`; `collectCandidateJids`, `resolveWhatsAppIdentity(key, deps)`, `resolveWhatsAppTarget(binding)`, `createIdentityDeps(opts)`, `isValidTransportJid`; `parseCommand(text)`, `WaCommand` type; `waRateLimitKey`, `allowMessage(rlKey)`, `allowGuide(rlKey)`, `allowAiReply(rlKey)`, `resetAiReplyForTests`; formatter set (daftar lengkap di bawah — dipakai Task 5–7).
- `dispatchCommand` + `buildExecutorDeps` DISERAHKAN ke Task 5 (butuh executors); Task 4 hanya parser + meta help.

- [ ] **Step 1: Test normalize + identity (failing)**

**Imports (header wa.test.ts):**

```ts
import { normalizePhone, maskPhone } from "../lib/wa/normalize";
import { collectCandidateJids, resolveWhatsAppIdentity, resolveWhatsAppTarget } from "../lib/wa/identity";
import type { WaBindingRow } from "../lib/wa/types";
```

Lalu blok tes:

```ts
  // ===== F1 — normalize (verification identity) =====
  {
    assert(normalizePhone("081234567890") === "6281234567890", "08xx → 628xx");
    assert(normalizePhone("+62 812-3456-7890") === "6281234567890", "+62 dengan spasi/tanda → 628");
    assert(normalizePhone("6281234567890") === "6281234567890", "628xx tetap");
    assert(normalizePhone("81234567890") === "6281234567890", "8xx → 628");
    assert(normalizePhone("12345") === null, "nomor terlalu pendek → null");
    assert(maskPhone("6281234567890") === "628****90", "maskPhone menyembunyikan tengah");
  }

  // ===== F1 — Identity resolver (pure, Baileys utils nyata) =====
  {
    const deps = {
      getPNForLID: async (lid: string) => (lid === "lidA" ? "628111111111" : null),
      findBindingByLid: async (lid: string): Promise<WaBindingRow | null> =>
        lid === "lidA" ? ({ id: "b1", userId: "u1", phone: "628111111111", lid: "lidA", jid: null, status: "active", otpCode: null, otpExpiresAt: null, otpAttempts: 0, createdAt: "", updatedAt: "" } as WaBindingRow) : null,
      findBindingByJid: async (jid: string): Promise<WaBindingRow | null> => null,
      findBindingByPhone: async (phone: string): Promise<WaBindingRow | null> =>
        phone === "628222222222" ? ({ id: "b2", userId: "u2", phone: "628222222222", lid: null, jid: null, status: "active", otpCode: null, otpExpiresAt: null, otpAttempts: 0, createdAt: "", updatedAt: "" } as WaBindingRow) : null,
      backfillBinding: async () => {},
    };

    // PN identity → userId
    const res1 = await resolveWhatsAppIdentity({ remoteJid: "628111111111@s.whatsapp.net" } as any, deps);
    assert(res1.userId === "u1", "PN identity → userId via phone lookup");
    // LID identity → userId via mapping PN → phone
    const res2 = await resolveWhatsAppIdentity({ remoteJid: "lidA@lid" } as any, deps);
    assert(res2.userId === "u1" && res2.identity.lid === "lidA", "LID identity → userId (via mapping)");
    // unknown → null
    const res3 = await resolveWhatsAppIdentity({ remoteJid: "628999999999@s.whatsapp.net" } as any, deps);
    assert(res3.userId === null, "identity asing → userId null");
    // alternates: participant > remoteJid
    const res4 = await resolveWhatsAppIdentity({ participant: "628222222222@s.whatsapp.net", remoteJid: "628999999999@s.whatsapp.net" } as any, deps);
    assert(res4.userId === "u2", "participant diprioritaskan atas remoteJid");
    // tanpa key → null
    const res5 = await resolveWhatsAppIdentity(null, deps);
    assert(res5.userId === null, "tanpa key → null");

    // collectCandidateJids dedupe + urutan
    const jids = collectCandidateJids({ participant: "a@lid", remoteJid: "a@lid", participantAlt: "b@s.whatsapp.net" } as any);
    assert(jids.length === 2 && jids[0] === "a@lid" && jids[1] === "b@s.whatsapp.net", "kandidat jid dedupe + urut participant > remoteJid > alternates");
  }

  // ===== F1 — resolveWhatsAppTarget (D2: prefer LID, JANGAN ${lid}@s.whatsapp.net) =====
  {
    assert(resolveWhatsAppTarget({ jid: "628111111111@s.whatsapp.net", lid: "lidA", phone: "628111111111" }) === "628111111111@s.whatsapp.net", "jid valid dipakai apa adanya");
    assert(resolveWhatsAppTarget({ jid: null, lid: "lidA", phone: "628111111111" }) === "lidA@lid", "lid → `${lid}@lid` (TANPA @s.whatsapp.net)");
    assert(resolveWhatsAppTarget({ jid: null, lid: null, phone: "628111111111" }) === "628111111111@s.whatsapp.net", "hanya phone → fallback `${phone}@s.whatsapp.net`");
    assert(resolveWhatsAppTarget({ jid: "lidA@lid", lid: "lidA", phone: "628111111111" }) === "lidA@lid", "jid LID tersimpan → apa adanya");
  }
```

- [ ] **Step 2: normalize.ts + identity.ts**

```ts
// src/lib/wa/normalize.ts — phone adalah verification/UI identity (B3);
// transport identity (lid/jid) ditangani resolver terpisah (C2/D2).
export function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  let normalized = digits;
  if (normalized.startsWith("0")) normalized = "62" + normalized.slice(1);
  else if (normalized.startsWith("8")) normalized = "62" + normalized;
  if (normalized.length < 10 || normalized.length > 15) return null;
  return normalized;
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
}
```

```ts
// src/lib/wa/identity.ts — satu-satunya tempat menjawab:
// "given WhatsApp identity → ForFH user?" (C2) dan
// "ForFH user → WhatsApp target?" (D2).
import { isLidUser, isPnUser, jidDecode } from "@whiskeysockets/baileys";
import type { WAMessageKey } from "@whiskeysockets/baileys";
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { WaBindingRow, WaIdentity } from "./types";

export interface IdentityDeps {
  /** Resolver LID→PN dari internal Baileys (sock.signalRepository.lidMapping);
   *  absen → LID dipakai sebagai identitas lid saja. */
  getPNForLID?: (lid: string) => Promise<string | null>;
  findBindingByLid: (lid: string) => Promise<WaBindingRow | null>;
  findBindingByJid: (jid: string) => Promise<WaBindingRow | null>;
  findBindingByPhone: (phone: string) => Promise<WaBindingRow | null>;
  backfillBinding: (bindingId: string, patch: { lid?: string; jid?: string }) => Promise<void>;
}

export function createIdentityDeps(opts: { getPNForLID?: (lid: string) => Promise<string | null> } = {}): IdentityDeps {
  return {
    getPNForLID: opts.getPNForLID,
    findBindingByLid: async (lid) => db.query.waBindings.findFirst({ where: eq(waBindings.lid, lid) }),
    findBindingByJid: async (jid) => db.query.waBindings.findFirst({ where: eq(waBindings.jid, jid) }),
    findBindingByPhone: async (phone) => db.query.waBindings.findFirst({ where: eq(waBindings.phone, phone) }),
    backfillBinding: async (bindingId, patch) => {
      await db.update(waBindings).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(waBindings.id, bindingId));
    },
  };
}

/** Dedupe + urutan kandidat: explicit participant > remoteJid > alternates (C2). */
export function collectCandidateJids(key: WAMessageKey | null | undefined): string[] {
  if (!key) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const jid of [key.participant, key.remoteJid, key.participantAlt, key.remoteJidAlt]) {
    if (jid && !seen.has(jid)) { seen.add(jid); out.push(jid); }
  }
  return out;
}

export function isValidTransportJid(jid: string): boolean {
  if (!jid || jid.length > 100) return false;
  const decoded = jidDecode(jid);
  return !!decoded?.user && !!decoded?.server;
}

export interface ResolvedIdentity {
  userId: string | null;
  identity: WaIdentity;
  binding: WaBindingRow | null;
}

/** C2 — jangan pernah asumsi semua identity berupa `628...@s.whatsapp.net`.
 *  Semua konversi lewat resolver; mapping LID dipelihara internal Baileys di
 *  keystore `lid-mapping` — application layer TIDAK membuat mapping LID kustom. */
export async function resolveWhatsAppIdentity(
  key: WAMessageKey | null | undefined,
  deps: IdentityDeps
): Promise<ResolvedIdentity> {
  const identity: WaIdentity = {};
  for (const jid of collectCandidateJids(key)) {
    let lid: string | undefined;
    let phone: string | undefined;
    let isLid = false;

    if (isLidUser(jid)) {
      isLid = true;
      lid = jidDecode(jid)?.user;
      if (lid) {
        identity.lid = lid;
        phone = (await deps.getPNForLID?.(lid)) ?? undefined;
        if (phone) identity.phone = phone;
      }
    } else if (isPnUser(jid)) {
      phone = jidDecode(jid)?.user;
      if (phone) {
        identity.phone = phone;
        identity.jid = jid;
      }
    } else {
      continue; // jid aneh (bukan PN/LID) → kandidat berikutnya
    }

    // Lookup binding: prioritas lid → jid → phone (C2)
    let binding: WaBindingRow | null = null;
    if (lid) binding = await deps.findBindingByLid(lid);
    if (!binding) binding = await deps.findBindingByJid(jid);
    if (!binding && phone) binding = await deps.findBindingByPhone(phone);

    if (binding) {
      // Backfill non-destruktif: isi lid/jid yang masih kosong
      const patch: { lid?: string; jid?: string } = {};
      if (isLid && lid && !binding.lid) patch.lid = lid;
      if (identity.jid && !binding.jid) patch.jid = identity.jid;
      if (Object.keys(patch).length > 0) {
        try { await deps.backfillBinding(binding.id, patch); }
        catch (err) { logger.warn("wa: backfill binding gagal", err); }
      }
      return { userId: binding.userId, identity, binding: { ...binding, ...patch } };
    }
  }
  return { userId: null, identity, binding: null };
}

/** D2 — target outbound. Prinsip: prefer LID sebagai transport identity;
 *  JANGAN PERNAH otomatis mengembalikan LID → PN, dan JANGAN PERNAH membuat
 *  `${lid}@s.whatsapp.net` (`@lid` vs `@s.whatsapp.net` dua identity berbeda). */
export function resolveWhatsAppTarget(binding: { jid?: string | null; lid?: string | null; phone: string }): string | null {
  if (binding.jid && isValidTransportJid(binding.jid)) return binding.jid;
  if (binding.lid) return `${binding.lid}@lid`;
  return `${binding.phone}@s.whatsapp.net`; // fallback binding tanpa transport identity
}
```

- [ ] **Step 3: Test parser + format + rate-limit key (failing)**

**Imports (header):** `import { parseCommand } from "../lib/wa/commands";`, `import { formatJadwal, formatTugas, formatHelp, clampOutput, formatNotLinked } from "../lib/wa/format";`, `import { waRateLimitKey, allowAiReply, resetAiReplyForTests } from "../lib/wa/rate-limit";`

```ts
  // ===== F1 — commands parser (pure) =====
  {
    const c1 = parseCommand("!jadwal besok");
    assert(c1.command === "jadwal" && c1.args === "besok", "!jadwal besok → command jadwal + args besok");
    const c2 = parseCommand("!JADWAL");
    assert(c2.command === "jadwal", "command case-insensitive");
    const c3 = parseCommand("!menu");
    assert(c3.command === "menu", "!menu dikenal");
    const c4 = parseCommand("!tidakada");
    assert(c4.command === "unknown", "perintah tak dikenal → unknown (dispatcher → !help singkat)");
    const c5 = parseCommand("halo");
    assert(c5.command === "unknown", "tanpa prefix ! → unknown (jalur AI)");
  }

  // ===== F1 — formatter (pure) =====
  {
    const out = formatJadwal(
      [{ startTime: "08:00", endTime: "09:40", courseName: "Hukum Pidana", room: "A-203" }],
      "📅 *JADWAL HARI INI*",
      "ketik !jadwal besok utk besok"
    );
    assert(out.includes("08:00–09:40") && out.includes("Hukum Pidana") && out.includes("Ruang A-203") && out.includes("1 kelas"), "formatJadwal: waktu, MK, ruang, ringkasan");
    const outT = formatTugas([{ title: "Resume Buku PIH", dueAt: Date.now() + 3600_000, done: false, courseName: "PIH" }]);
    assert(outT.includes("[1]") && outT.includes("⏳") && outT.includes("PIH"), "formatTugas: nomor urut + status + MK");
    assert(formatHelp(true).includes("!hubungkan") && formatHelp(true).includes("!putuskan"), "formatHelp memuat semua perintah");
    assert(clampOutput("x".repeat(4000)).length <= 3500, "clampOutput memotong ke ≤3500 char");
    assert(formatNotLinked("6281234567890").includes("6281234567890"), "panduan hubungkan memuat nomor sender");
  }

  // ===== F1 — rate limit key (resolved identity) + interval AI =====
  {
    assert(waRateLimitKey("u1", {}, "6281@s.whatsapp.net") === "wa:user:u1", "key memakai userId bila ter-resolve");
    const keyJid = waRateLimitKey(null, { jid: "6282@s.whatsapp.net" }, "6282@s.whatsapp.net");
    assert(keyJid === "wa:jid:6282@s.whatsapp.net", "tanpa userId → key dari JID stabil (bukan substring phone)");
    const keyLid = waRateLimitKey(null, { lid: "lidX" }, "lidX@lid");
    assert(keyLid === "wa:jid:lidX@lid", "fallback LID → key stabil @lid");
    resetAiReplyForTests();
    assert(allowAiReply("wa:user:u1") === true, "AI interval: pesan pertama diizinkan");
    assert(allowAiReply("wa:user:u1") === false, "AI interval: pesan kedua < 5 detik → ditolak");
    await new Promise((r) => setTimeout(r, 5100));
    assert(allowAiReply("wa:user:u1") === true, "AI interval: setelah 5 detik → diizinkan lagi");
  }
```

- [ ] **Step 4: format.ts — formatter lengkap**

```ts
// src/lib/wa/format.ts — semua formatter balasan (C4). PURE: data masuk,
// teks keluar. Waktu lokal Asia/Jakarta. ≤ ~3500 char = application UX/safety
// limit (bukan hard limit WhatsApp).
export interface JadwalItem { startTime: string; endTime: string; courseName: string; room?: string | null; }
export interface TugasItem { title: string; dueAt: number | null; done: boolean; courseName?: string | null; }
export interface NilaiItem { courseName: string; komponen: number; letterGrade: string | null; }

export const OUTPUT_MAX_CHARS = 3500;
const DIVIDER = "─".repeat(22);
const WIB_TZ = "Asia/Jakarta";

/** Date dengan wall-clock WIB (akses getDay/getHours dst. dalam WIB). */
export function wibWallClock(ts: number): Date {
  return new Date(new Date(ts).toLocaleString("en-US", { timeZone: WIB_TZ }));
}

export function formatWibDateTime(ts: number): string {
  const w = wibWallClock(ts);
  const dd = String(w.getDate()).padStart(2, "0");
  const mm = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][w.getMonth()];
  return `${dd} ${mm} ${String(w.getHours()).padStart(2, "0")}:${String(w.getMinutes()).padStart(2, "0")}`;
}

export function formatWibDayName(ts: number): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: WIB_TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(ts));
}

export function clampOutput(text: string, max: number = OUTPUT_MAX_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 40) + "\n…ketik !x utk lengkap";
}

export function formatJadwal(items: JadwalItem[], title: string, hint: string): string {
  if (!items.length) return `${title}\n${DIVIDER}\nTidak ada kelas.\n${DIVIDER}\n${hint}`;
  const body = items
    .map((i) => `🕐 ${i.startTime}–${i.endTime} · ${i.courseName}${i.room ? `\n   Ruang ${i.room}` : ""}`)
    .join(`\n${DIVIDER}\n`);
  return `${title}\n${DIVIDER}\n${body}\n${DIVIDER}\n${items.length} kelas · ${hint}`;
}

export function formatTugas(items: TugasItem[]): string {
  if (!items.length) return `📝 *TUGAS*\n${DIVIDER}\nTidak ada tugas aktif.\n${DIVIDER}\nKetik !tugas utk melihat lagi`;
  const body = items
    .map((t, i) => `${i + 1}. ${t.done ? "✅" : "⏳"} *${t.title}*${t.courseName ? ` (${t.courseName})` : ""}\n   ${t.dueAt ? `Tenggat ${formatWibDateTime(t.dueAt)}` : "Tanpa tenggat"}`)
    .join(`\n${DIVIDER}\n`);
  return `📝 *TUGAS (${items.length} terdekat)*\n${DIVIDER}\n${body}\n${DIVIDER}\nKetik !selesai <nomor> utk menandai selesai`;
}

export function formatNilai(items: NilaiItem[]): string {
  if (!items.length) return `🎓 *NILAI*\n${DIVIDER}\nBelum ada nilai tersinkron. Sync dari Pengaturan.`;
  const body = items
    .map((n) => `📘 *${n.courseName}*\n   ${n.komponen} komponen${n.letterGrade ? ` · ${n.letterGrade}` : ""}`)
    .join(`\n${DIVIDER}\n`);
  return `🎓 *NILAI*\n${DIVIDER}\n${body}`;
}

export function formatInsight(text: string): string {
  return `💡 *INSIGHT HARI INI*\n${DIVIDER}\n${text}`;
}

export function formatHelp(long: boolean): string {
  const list = [
    "!hubungkan — cara link akun",
    "!jadwal [hari ini|besok|minggu ini|senin..minggu]",
    "!tugas [n] — n tugas terdekat",
    "!selesai <nomor> — tandai tugas selesai",
    "!nilai — ringkasan nilai",
    "!insight — insight harian",
    "!putuskan — putuskan koneksi WA",
    "!help / !menu — bantuan ini",
  ];
  if (long) return `🛟 *BANTUAN FORFH*\n${DIVIDER}\n${list.join("\n")}`;
  return `🛟 !hubungkan · !jadwal · !tugas [n] · !selesai <n> · !nilai · !insight · !putuskan · !help`;
}

export function formatNotLinked(phone: string | null): string {
  return `📱 *HUBUNGKAN FORFH*\n${DIVIDER}\nKamu belum terhubung dengan ForFH.\nLangkah:\n1. Buka forfh → Pengaturan\n2. Klik "Hubungkan WhatsApp"\n3. Masukkan nomor ${phone ?? "kamu"}\n4. Masukkan kode OTP yang dikirim di chat ini`;
}

export function formatOtpMessage(otp: string): string {
  return `🔐 *Kode verifikasi ForFH*\n\nKode Anda: *${otp}*\n\nBerlaku 10 menit. Masukkan di halaman Pengaturan. Jangan bagikan kode ini.`;
}

export function formatKuliahReminder(courseName: string, room: string | null, startTime: string, minutesUntil: number, primary: boolean): string {
  const header = primary ? "🔔 *Kuliah 4 jam lagi*" : `⏰ *Kuliah ${minutesUntil} menit lagi*`;
  return `${header}\n${courseName}${room ? ` · Ruang ${room}` : ""} · ${startTime}`;
}

export function formatTugasReminder(title: string, offsetLabel: string): string {
  return `📝 *Pengingat Tugas*\n${title} · Tenggat ${offsetLabel} lagi.`;
}
```

- [ ] **Step 5: commands.ts (parser) + rate-limit.ts**

```ts
// src/lib/wa/commands.ts — parser + dispatcher (C3). Dispatcher dibangun di
// Task 5 setelah executors ada; parser + meta 100% pure.
export type WaCommand =
  | "hubungkan" | "jadwal" | "tugas" | "selesai" | "nilai" | "insight"
  | "help" | "menu" | "putuskan" | "unknown";

export interface ParsedCommand { command: WaCommand; args: string; }

const KNOWN: Record<string, WaCommand> = {
  hubungkan: "hubungkan", jadwal: "jadwal", tugas: "tugas", selesai: "selesai",
  nilai: "nilai", insight: "insight", help: "help", menu: "menu", putuskan: "putuskan",
};

export function parseCommand(text: string): ParsedCommand {
  const trimmed = (text || "").trim();
  if (!trimmed.startsWith("!")) return { command: "unknown", args: "" };
  const [raw, ...rest] = trimmed.slice(1).split(/\s+/);
  const cmd = (raw ?? "").toLowerCase();
  return { command: KNOWN[cmd] ?? "unknown", args: rest.join(" ").trim() };
}
```

```ts
// src/lib/wa/rate-limit.ts — B4: key dari resolved identity (prioritas userId,
// fallback JID/LID stabil — BUKAN substring phone).
import { checkRateLimit } from "@/lib/auth/rate-limit";
import type { WaIdentity } from "./types";

const MESSAGE_LIMIT = { maxAttempts: 20, windowMs: 60_000 }; // 20 pesan/menit
const GUIDE_LIMIT = { maxAttempts: 1, windowMs: 60 * 60_000 }; // panduan maks 1/sender/jam
const AI_INTERVAL_MS = 5_000; // B4: interval 5 detik antar pesan AI per sender

const aiLastReply = new Map<string, number>();

export function waRateLimitKey(userId: string | null, identity: WaIdentity, remoteJid: string): string {
  if (userId) return `wa:user:${userId}`;
  const stable = identity.jid || (identity.lid ? `${identity.lid}@lid` : null) || remoteJid;
  return `wa:jid:${stable}`;
}

export async function allowMessage(rlKey: string): Promise<{ allowed: boolean }> {
  return checkRateLimit(`wa:msg:${rlKey}`, MESSAGE_LIMIT);
}

export async function allowGuide(rlKey: string): Promise<{ allowed: boolean }> {
  return checkRateLimit(`wa:guide:${rlKey}`, GUIDE_LIMIT);
}

/** Guard interval AI — in-memory (Turso hot path, F4). Pemanggilan pertama
 *  mengonsumsi slot; pesan yang ditolak TIDAK menggeser last-reply. */
export function allowAiReply(rlKey: string): boolean {
  const now = Date.now();
  const last = aiLastReply.get(rlKey) ?? 0;
  if (now - last < AI_INTERVAL_MS) return false;
  aiLastReply.set(rlKey, now);
  if (aiLastReply.size > 5000) {
    const cutoff = now - 10 * 60_000;
    for (const [k, v] of aiLastReply) if (v < cutoff) aiLastReply.delete(k);
  }
  return true;
}

export function resetAiReplyForTests(): void { aiLastReply.clear(); }
```

- [ ] **Step 6: Run + commit**

Run: `npm test` + `npm run typecheck` (assert baru hijau semua).

```bash
git add src/lib/wa/identity.ts src/lib/wa/normalize.ts src/lib/wa/format.ts src/lib/wa/commands.ts src/lib/wa/rate-limit.ts src/tests/wa.test.ts
git commit -m "feat: wa identity resolver PN/LID + normalize, format, commands parser, rate-limit — tes pure"
```

---

### Task 5: Executors + dispatcher + ai.ts + send.ts + pipeline.ts

**Files:**
- Create: `src/lib/wa/executors/jadwal.ts`, `executors/tugas.ts`, `executors/selesai.ts`, `executors/nilai.ts`, `executors/insight.ts`, `executors/putuskan.ts`
- Create: `src/lib/wa/ai.ts`, `src/lib/wa/send.ts`, `src/lib/wa/pipeline.ts`
- Modify: `src/lib/wa/commands.ts` (tambah `dispatchCommand`, `buildExecutorDeps`, `CommandExecutorDeps`)
- Test: `src/tests/wa.test.ts` (pipeline messaging + security + dispatcher decision + send queue)

**Interfaces:**
- Consumes: formatter set (Task 4), `parseCommand` (Task 4), `resolveWhatsAppIdentity`/`createIdentityDeps` (Task 4), `WaClientManager` + `health` (Task 3), `executeAIRequest` (`@/lib/ai/router`), `getCachedAI/setCachedAI` (`@/lib/ai/cache`).
- Produces: `executeJadwal(userId, args)`, `executeTugas(userId, args)`, `executeSelesai(userId, args)`, `executeNilai(userId)`, `executeInsight(userId)`, `executePutuskan(userId, args)`; `dispatchCommand(cmd, args, deps)`; `handleNaturalLanguage(userId, text)`; `WaSendService` (`send`, `sendStrict`, `isReady`, `getQueueLength`) + `getWaSendService()`; `processIncomingMessage(deps, msg)` + `registerMessagePipeline(manager)`; `MessageDeps` interface.

- [ ] **Step 1: executors/jadwal.ts**

```ts
import { asc, eq } from "drizzle-orm";
import { db, classSchedules, courses } from "@/lib/db";
import { formatJadwal, wibWallClock, formatWibDayName } from "../format";
import type { JadwalItem } from "../format";

export type JadwalScope = "hari_ini" | "besok" | "minggu_ini" | "hari";

const DAY_NAMES: Record<string, number> = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 };
const DAY_ID: string[] = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function parseJadwalScope(args: string, now: Date): { scope: JadwalScope; dayOfWeek?: number; title: string; hint: string } {
  const arg = (args || "").trim().toLowerCase();
  const today = wibWallClock(now.getTime());
  const todayDOW = today.getDay();
  if (arg === "besok") {
    const dow = (todayDOW + 1) % 7;
    const target = new Date(today); target.setDate(today.getDate() + 1);
    return { scope: "besok", dayOfWeek: dow, title: `📅 *JADWAL BESOK — ${formatWibDayName(target.getTime())}*`, hint: "ketik !jadwal utk hari ini" };
  }
  if (arg === "minggu ini") {
    return { scope: "minggu_ini", title: "📅 *JADWAL MINGGU INI*", hint: "ketik !jadwal senin utk lihat per hari" };
  }
  if (arg in DAY_NAMES) {
    const dow = DAY_NAMES[arg];
    const target = new Date(today);
    let diff = dow - todayDOW;
    if (diff < 0) diff += 7;
    target.setDate(today.getDate() + diff);
    return { scope: "hari", dayOfWeek: dow, title: `📅 *JADWAL ${DAY_ID[dow].toUpperCase()} — ${formatWibDayName(target.getTime())}*`, hint: "ketik !jadwal utk hari ini" };
  }
  return { scope: "hari_ini", dayOfWeek: todayDOW, title: `📅 *JADWAL HARI INI — ${formatWibDayName(now.getTime())}*`, hint: "ketik !jadwal besok utk besok" };
}

export interface JadwalRow { startTime: string; endTime: string; courseName: string; room: string | null; dayOfWeek: number; }

export async function fetchJadwalData(userId: string): Promise<JadwalRow[]> {
  const rows = await db
    .select({
      startTime: classSchedules.startTime, endTime: classSchedules.endTime,
      courseName: courses.name, room: classSchedules.room, dayOfWeek: classSchedules.dayOfWeek,
    })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(eq(classSchedules.userId, userId))
    .orderBy(asc(classSchedules.dayOfWeek), asc(classSchedules.startTime));
  return rows as JadwalRow[];
}

export async function executeJadwal(userId: string, args: string, now: Date = new Date()): Promise<string> {
  const parsed = parseJadwalScope(args, now);
  const rows = await fetchJadwalData(userId);
  let items: JadwalItem[];
  if (parsed.scope === "minggu_ini") {
    items = rows
      .filter((r) => r.dayOfWeek >= 1 && r.dayOfWeek <= 6)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime, courseName: r.courseName, room: r.room }));
  } else {
    items = rows
      .filter((r) => r.dayOfWeek === parsed.dayOfWeek)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime, courseName: r.courseName, room: r.room }));
  }
  return formatJadwal(items, parsed.title, parsed.hint);
}
```

- [ ] **Step 2: executors/tugas.ts + selesai.ts + nilai.ts**

```ts
// executors/tugas.ts
import { asc, eq, isNull, sql } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { formatTugas } from "../format";
import type { TugasItem } from "../format";

export interface TugasItemData { id: string; title: string; dueAt: number | null; courseName: string | null; }

export async function fetchTugasData(userId: string, n: number): Promise<TugasItemData[]> {
  const rows = await db.query.tasks.findMany({
    where: and(eq(tasks.userId, userId), isNull(tasks.deletedAt), sql`${tasks.status} != 'DONE'`),
    orderBy: [asc(sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`), asc(tasks.dueAt)],
    with: { course: true },
    limit: n,
  });
  return rows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.getTime() ?? null, courseName: t.course?.name ?? null }));
}

export async function executeTugas(userId: string, args: string): Promise<string> {
  const n = Math.min(10, Math.max(1, parseInt(args.trim(), 10) || 5));
  const items = await fetchTugasData(userId, n);
  return formatTugas(items.map((t) => ({ title: t.title, dueAt: t.dueAt, done: false, courseName: t.courseName })));
}
```

Catatan: tambahkan import `and` dari drizzle-orm di tugas.ts.

```ts
// executors/selesai.ts — toggle: DONE → IN_PROGRESS, aktif → DONE
import { and, eq } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { fetchTugasData } from "./tugas";

export async function executeSelesai(userId: string, args: string, now: Date = new Date()): Promise<string> {
  const idx = parseInt((args || "").trim(), 10);
  if (!Number.isInteger(idx) || idx < 1) return "Format: !selesai <nomor> — nomor dari daftar !tugas";
  const items = await fetchTugasData(userId, 10);
  const target = items[idx - 1];
  if (!target) return `Tidak ada tugas nomor ${idx}. Ketik !tugas utk daftar terbaru.`;
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, target.id), eq(tasks.userId, userId)) });
  if (!task) return "Tugas tidak ditemukan.";
  const wasDone = task.status === "DONE";
  await db
    .update(tasks)
    .set({ status: wasDone ? "IN_PROGRESS" : "DONE", completedAt: wasDone ? null : now, updatedAt: now })
    .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)));
  return wasDone
    ? `↩️ *${target.title}* dibuka kembali.`
    : `✅ *${target.title}* ditandai selesai.`;
}
```

```ts
// executors/nilai.ts — ringkasan per MK (baca data user sendiri, B5)
import { asc, eq } from "drizzle-orm";
import { db, grades, courses } from "@/lib/db";
import { formatNilai } from "../format";
import type { NilaiItem } from "../format";

export interface NilaiRow { courseName: string; letterGrade: string | null; }

export async function fetchNilaiData(userId: string): Promise<NilaiRow[]> {
  const rows = await db
    .select({ courseName: courses.name, letterGrade: grades.letterGrade })
    .from(grades)
    .innerJoin(courses, eq(grades.courseId, courses.id))
    .where(eq(grades.userId, userId))
    .orderBy(asc(courses.name));
  const byCourse = new Map<string, NilaiItem>();
  for (const r of rows) {
    const cur = byCourse.get(r.courseName) ?? { courseName: r.courseName, komponen: 0, letterGrade: null };
    cur.komponen += 1;
    if (r.letterGrade) cur.letterGrade = r.letterGrade;
    byCourse.set(r.courseName, cur);
  }
  return [...byCourse.values()];
}

export async function executeNilai(userId: string): Promise<string> {
  return formatNilai(await fetchNilaiData(userId));
}
```

- [ ] **Step 3: executors/insight.ts + putuskan.ts**

```ts
// executors/insight.ts — reuse cache AI 24 jam (C3); cache WA terpisah dari
// web (web menyimpan objek terstruktur, WA teks — hindari String(obj)).
import { asc, eq } from "drizzle-orm";
import { db, classSchedules, courses, tasks } from "@/lib/db";
import { executeAIRequest } from "@/lib/ai/router";
import { getCachedAI, setCachedAI } from "@/lib/ai/cache";
import { formatInsight } from "../format";
import { fetchTugasData } from "./tugas";

const WA_INSIGHT_SYSTEM_PROMPT = `Kamu asisten ForFH. Buat "insight harian" singkat (maks ~300 karakter) dalam Bahasa Indonesia untuk mahasiswa: sorot kuliah hari ini, tenggat tugas terdekat, dan saran singkat. Data user:\n\n{{DATA}}`;

export async function executeInsight(userId: string, now: Date = new Date()): Promise<string> {
  const dayKey = `wa-insight:${now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}`;
  const cached = await getCachedAI(userId, "daily_insight", dayKey);
  if (cached) return formatInsight(String(cached));

  // Data ringkas (sama dgn route daily-insight)
  const nowWib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const todayClasses = await db
    .select({ name: courses.name, startTime: classSchedules.startTime })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(and(eq(classSchedules.userId, userId), eq(classSchedules.enabled, 1), eq(classSchedules.dayOfWeek, nowWib.getDay())))
    .orderBy(asc(classSchedules.startTime))
    .then((r) => r.slice(0, 8));
  const tasksData = await fetchTugasData(userId, 5);

  const dataStr =
    `Jadwal hari ini (WIB): ${todayClasses.map((c) => `${c.startTime} ${c.name}`).join(", ") || "tidak ada"}\n` +
    `Tugas terdekat: ${tasksData.map((t) => `${t.title}${t.dueAt ? ` (deadline ${new Date(t.dueAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })})` : ""}`).join("; ") || "tidak ada"}`;

  const result = await executeAIRequest({
    prompt: "Buat insight harian untuk saya.",
    systemPrompt: WA_INSIGHT_SYSTEM_PROMPT.replace("{{DATA}}", dataStr),
    requestType: "daily_insight",
    userId, // perintah ! — perilaku normal (termasuk kuota 30/jam web)
    maxTokens: 400,
  });
  if (result.success && result.text) {
    await setCachedAI(userId, "daily_insight", dayKey, result.text, 24 * 60 * 60 * 1000);
    return formatInsight(result.text);
  }
  // Fallback heuristik (tanpa AI)
  const next = todayClasses[0];
  const fallback = next
    ? `Kuliah berikutnya hari ini: ${next.name} pukul ${next.startTime}.`
    : "Tidak ada kuliah hari ini — waktu luang bisa dipakai mengerjakan tugas.";
  const tugasFallback = tasksData[0] ? ` Tugas terdekat: ${tasksData[0].title}.` : "";
  return formatInsight(fallback + tugasFallback);
}
```

```ts
// executors/putuskan.ts — !putuskan dengan konfirmasi sekali (C3)
import { and, eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";

const pendingUnlink = new Map<string, number>(); // userId → timestamp

export async function executePutuskan(userId: string, args: string): Promise<string> {
  const confirm = (args || "").trim().toLowerCase() === "ya";
  const pendingAt = pendingUnlink.get(userId) ?? 0;
  if (!confirm) {
    pendingUnlink.set(userId, Date.now());
    return "⚠️ Putuskan koneksi WhatsApp?\nBalas: !putuskan ya\n(ini tidak menghapus akun ForFH)";
  }
  pendingUnlink.delete(userId);
  if (Date.now() - pendingAt > 2 * 60_000) return "Konfirmasi kedaluwarsa. Ketik !putuskan lagi.";
  const binding = await db.query.waBindings.findFirst({
    where: and(eq(waBindings.userId, userId), eq(waBindings.status, "active")),
  });
  if (!binding) return "Tidak ada koneksi WhatsApp yang aktif.";
  await db
    .update(waBindings)
    .set({ status: "unlinked", updatedAt: new Date().toISOString() })
    .where(eq(waBindings.id, binding.id));
  return "🔌 Koneksi WhatsApp diputuskan. Hubungkan lagi kapan saja via Pengaturan.";
}
```

- [ ] **Step 4: commands.ts — dispatcher**

Append ke `src/lib/wa/commands.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { executeJadwal } from "./executors/jadwal";
import { executeTugas } from "./executors/tugas";
import { executeSelesai } from "./executors/selesai";
import { executeNilai } from "./executors/nilai";
import { executeInsight } from "./executors/insight";
import { executePutuskan } from "./executors/putuskan";
import { formatHelp, formatNotLinked } from "./format";

export interface CommandExecutorDeps {
  jadwal: (userId: string, args: string) => Promise<string>;
  tugas: (userId: string, args: string) => Promise<string>;
  selesai: (userId: string, args: string) => Promise<string>;
  nilai: (userId: string) => Promise<string>;
  insight: (userId: string) => Promise<string>;
  hubungkan: (userId: string) => Promise<string>;
  putuskan: (userId: string, args: string) => Promise<string>;
  help: (long: boolean) => string;
}

/** Dispatcher C3: perintah dikenal → executor; unknown → !help singkat. */
export async function dispatchCommand(cmd: WaCommand, args: string, deps: CommandExecutorDeps): Promise<string> {
  switch (cmd) {
    case "hubungkan": return deps.hubungkan("");
    case "jadwal": return deps.jadwal("", args);
    case "tugas": return deps.tugas("", args);
    case "selesai": return deps.selesai("", args);
    case "nilai": return deps.nilai("");
    case "insight": return deps.insight("");
    case "putuskan": return deps.putuskan("", args);
    case "menu":
    case "help":
      return deps.help(true);
    default:
      return deps.help(false); // unknown → !help singkat
  }
}

/** Deps produksi terikat userId. !hubungkan cek status binding user. */
export function buildExecutorDeps(userId: string): CommandExecutorDeps {
  return {
    jadwal: (_u, args) => executeJadwal(userId, args),
    tugas: (_u, args) => executeTugas(userId, args),
    selesai: (_u, args) => executeSelesai(userId, args),
    nilai: (_u) => executeNilai(userId),
    insight: (_u) => executeInsight(userId),
    hubungkan: async (_u) => {
      const binding = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, userId) });
      if (binding?.status === "active") return `Kamu sudah terhubung dengan nomor ${binding.phone.slice(0, 3)}****${binding.phone.slice(-2)}. Ketik !putuskan utk memutuskan.`;
      return formatNotLinked(null);
    },
    putuskan: (_u, args) => executePutuskan(userId, args),
    help: (long) => formatHelp(long),
  };
}
```

`hubungkan` memakai import statis `db`/`waBindings`/`eq` — tambahkan ke header commands.ts (tidak ada siklus: executor lain sudah import `db` statis dan `commands.ts` tidak di-import oleh mereka).

- [ ] **Step 5: ai.ts + send.ts**

```ts
// src/lib/wa/ai.ts — C5: natural language TANPA checkRateLimit('ai') —
// executeAIRequest dipanggil TANPA userId agar kuota 30/jam web tidak
// terpakai; aiEnabled dicek manual di sini.
import { eq } from "drizzle-orm";
import { db, userSettings } from "@/lib/db";
import { executeAIRequest } from "@/lib/ai/router";
import { fetchJadwalData } from "./executors/jadwal";
import { fetchTugasData } from "./executors/tugas";
import { fetchNilaiData } from "./executors/nilai";

const WA_AI_SYSTEM_PROMPT = `Kamu adalah asisten ForFH — aplikasi jadwal kuliah, tugas, dan nilai mahasiswa. Jawab pertanyaan user dengan SINGKAT (maks ~500 karakter), ramah, Bahasa Indonesia, boleh pakai emoji dan *bold* secukupnya. Tidak perlu listing panjang. Data user saat ini:\n\n{{DATA}}`;

export async function handleNaturalLanguage(userId: string, text: string): Promise<string> {
  const trimmed = (text || "").trim().slice(0, 500); // cap input 500 char (B4)
  if (!trimmed) return "Halo! Ketik !help utk daftar perintah.";
  const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  if (settings && !settings.aiEnabled) return "Fitur AI nonaktif — ketik !help untuk perintah.";

  const [jadwal, tugas, nilai] = await Promise.all([
    fetchJadwalData(userId),
    fetchTugasData(userId, 5),
    fetchNilaiData(userId),
  ]);
  const dataStr =
    `Jadwal minggu ini: ${jadwal.slice(0, 10).map((j) => `${j.dayOfWeek} ${j.startTime} ${j.courseName}`).join(", ") || "tidak ada"}\n` +
    `Tugas terdekat: ${tugas.map((t) => t.title).join("; ") || "tidak ada"}\n` +
    `Nilai: ${nilai.map((n) => `${n.courseName} (${n.komponen} komponen)${n.letterGrade ? ` ${n.letterGrade}` : ""}`).join("; ") || "belum ada"}`;

  const result = await executeAIRequest({
    prompt: trimmed,
    systemPrompt: WA_AI_SYSTEM_PROMPT.replace("{{DATA}}", dataStr),
    requestType: "study_assistant",
    maxTokens: 800,
    // userId sengaja TIDAK dikirim — C5: jalur WA bebas kuota 30/jam web
  });
  return result.success && result.text
    ? result.text
    : "Layanan AI sedang tidak tersedia. Ketik !help untuk perintah.";
}
```

```ts
// src/lib/wa/send.ts — D4: queue in-memory maks 50 FIFO HANYA untuk short
// reconnect. Gagal lama → drop + caller menerima failure (worker fallback
// web push). Bukan guaranteed delivery.
import { logger } from "@/lib/logger";
import * as health from "./health";
import { getWaClientManager } from "./client-manager";
import type { WaClientManager } from "./client-manager";

const QUEUE_MAX = 50;

export interface SendResult { sent: boolean; queued: boolean; }

export class WaSendService {
  private queue: Array<{ jid: string; text: string }> = [];
  private flushing = false;

  constructor(private readonly manager: WaClientManager = getWaClientManager()) {
    manager.on("open", () => { void this.flushQueue(); });
  }

  isReady(): boolean { return this.manager.isReady(); }
  getQueueLength(): number { return this.queue.length; }

  /** Kirim langsung; bila socket tidak siap → queue bila pendek, else drop. */
  async send(jid: string, text: string): Promise<SendResult> {
    health.recordSendAttempt();
    if (this.manager.isReady()) {
      const ok = await this.manager.sendText(jid, text);
      if (ok) { health.recordSendSuccess(); return { sent: true, queued: false }; }
      health.recordSendFailure();
      return { sent: false, queued: false };
    }
    if (this.queue.length < QUEUE_MAX) {
      this.queue.push({ jid, text });
      return { sent: false, queued: true };
    }
    health.recordSendFailure();
    return { sent: false, queued: false }; // drop — caller menerima failure
  }

  /** Tanpa antrean: gagal = failure seketika (dipakai notifikasi — hindari
   *  dobel kirim dengan web push fallback). */
  async sendStrict(jid: string, text: string): Promise<SendResult> {
    health.recordSendAttempt();
    if (!this.manager.isReady()) { health.recordSendFailure(); return { sent: false, queued: false }; }
    const ok = await this.manager.sendText(jid, text);
    if (ok) { health.recordSendSuccess(); return { sent: true, queued: false }; }
    health.recordSendFailure();
    return { sent: false, queued: false };
  }

  private async flushQueue(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length && this.manager.isReady()) {
        const item = this.queue.shift()!;
        try { await this.manager.sendText(item.jid, item.text); }
        catch (err) { logger.warn("wa: gagal kirim antrean", err); }
      }
    } finally { this.flushing = false; }
  }
}

let serviceSingleton: WaSendService | null = null;
export function getWaSendService(): WaSendService {
  serviceSingleton ??= new WaSendService();
  return serviceSingleton;
}
```

- [ ] **Step 6: pipeline.ts — orchestrasi C1**

```ts
// src/lib/wa/pipeline.ts — C1: messages.upsert → validasi → identity →
// router (command / AI / panduan). Semua ketergantungan di-inject (MessageDeps)
// agar murni dan dites dengan event mock tanpa jaringan.
import { isJidUser } from "@whiskeysockets/baileys";
import type { WAMessage } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";
import { getWaSendService } from "./send";
import { dispatchCommand, parseCommand, buildExecutorDeps } from "./commands";
import type { WaCommand } from "./commands";
import { handleNaturalLanguage } from "./ai";
import { createIdentityDeps, resolveWhatsAppIdentity } from "./identity";
import { allowAiReply, allowGuide, allowMessage, waRateLimitKey } from "./rate-limit";
import { clampOutput, formatNotLinked } from "./format";
import type { WaBindingRow, WaIdentity } from "./types";
import type { WaClientManager } from "./client-manager";

export interface MessageDeps {
  resolveIdentity(key: WAMessage["key"]): Promise<{ userId: string | null; identity: WaIdentity; binding: WaBindingRow | null }>;
  allowMessage(rlKey: string): Promise<boolean>;
  allowGuide(rlKey: string): Promise<boolean>;
  allowAiReply(rlKey: string): boolean;
  executeCommand(cmd: WaCommand, args: string, userId: string): Promise<string>;
  executeAi(userId: string, text: string): Promise<string>;
  send(jid: string, text: string): Promise<{ sent: boolean; queued: boolean }>;
}

function extractText(msg: WAMessage): string {
  const content = msg.message;
  if (!content) return "";
  if (typeof content.conversation === "string") return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  return "";
}

export type PipelineResult = "handled" | "ignored" | "guide" | "rate-limited";

export async function processIncomingMessage(deps: MessageDeps, msg: WAMessage): Promise<PipelineResult> {
  const key = msg.key;
  const remoteJid = key?.remoteJid;
  // Validasi event (C1/B4): bukan user jid (grup/broadcast/status/newsletter)
  // → diabaikan. Jangan pernah memproses event blind.
  if (!remoteJid || !isJidUser(remoteJid)) return "ignored";
  const text = extractText(msg);
  if (!text) return "ignored";

  const { userId, identity } = await deps.resolveIdentity(key);
  if (!userId) {
    // Sender belum terhubung → panduan, maks 1/sender/jam (B4)
    if (await deps.allowGuide(waRateLimitKey(null, identity, remoteJid))) {
      await deps.send(remoteJid, formatNotLinked(identity.phone ?? null));
      return "guide";
    }
    return "rate-limited";
  }

  if (!(await deps.allowMessage(waRateLimitKey(userId, identity, remoteJid)))) return "rate-limited"; // 20/menit — drop diam-diam

  if (text.startsWith("!")) {
    const parsed = parseCommand(text);
    const reply = await deps.executeCommand(parsed.command, parsed.args, userId);
    await deps.send(remoteJid, clampOutput(reply));
    return "handled";
  }

  if (!deps.allowAiReply(waRateLimitKey(userId, identity, remoteJid))) return "rate-limited"; // interval 5 detik
  const reply = await deps.executeAi(userId, text);
  await deps.send(remoteJid, clampOutput(reply));
  return "handled";
}

let registered = false;
/** Wire pipeline ke manager singleton (dipanggil client-manager via import
 *  dinamis saat socket dibuat — idempoten per proses). */
export function registerMessagePipeline(manager: WaClientManager): void {
  if (registered) return;
  registered = true;
  const sendService = getWaSendService();
  const deps: MessageDeps = {
    resolveIdentity: (key) => resolveWhatsAppIdentity(key, createIdentityDeps({ getPNForLID: (lid) => manager.getPNForLID(lid) })),
    allowMessage: async (k) => (await allowMessage(k)).allowed,
    allowGuide: async (k) => (await allowGuide(k)).allowed,
    allowAiReply: (k) => allowAiReply(k),
    executeCommand: (cmd, args, userId) => dispatchCommand(cmd, args, buildExecutorDeps(userId)),
    executeAi: (userId, text) => handleNaturalLanguage(userId, text),
    send: (jid, text) => sendService.send(jid, text),
  };
  manager.on("message", (msg) => {
    void processIncomingMessage(deps, msg).catch((err) => logger.error("wa: pipeline error", err));
  });
}
```

client-manager perlu method `getPNForLID` — tambahkan ke `WaClientManager` (di Task 3 file):

```ts
  /** Resolver LID→PN dari internal Baileys (signalRepository.lidMapping).
   *  Mapping dipelihara Baileys di keystore — application layer tidak
   *  membuat mapping LID kustom yang konflik. */
  async getPNForLID(lid: string): Promise<string | null> {
    try {
      const pn = await this.socket?.signalRepository?.lidMapping?.getPNForLID(lid);
      return pn ?? null;
    } catch { return null; }
  }
```

- [ ] **Step 7: Test pipeline + security + send queue (failing)**

**Imports (header):** `import { processIncomingMessage } from "../lib/wa/pipeline";`, `import type { MessageDeps } from "../lib/wa/pipeline";`, `import { WaSendService } from "../lib/wa/send";`

```ts

  // ===== F1 — Messaging (pure, event mock) + Security =====
  {
    function msg(remoteJid: string, text: string, extra: any = {}): any {
      return { key: { remoteJid, ...extra }, message: { conversation: text } };
    }
    const calls: Array<{ jid: string; text: string }> = [];
    let userIdFor: string | null = "u1";
    let guideAllowed = true;
    let msgAllowed = true;
    let aiAllowed = true;
    const deps: MessageDeps = {
      resolveIdentity: async (key) => ({ userId: userIdFor, identity: {}, binding: null }),
      allowMessage: async () => msgAllowed,
      allowGuide: async () => guideAllowed,
      allowAiReply: () => aiAllowed,
      executeCommand: async (cmd, _args, userId) => `cmd:${cmd}:${userId}`,
      executeAi: async (userId, text) => `ai:${userId}:${text}`,
      send: async (jid, text) => { calls.push({ jid, text }); return { sent: true, queued: false }; },
    };

    // bound sender + command → routed
    const r1 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "!jadwal besok"));
    assert(r1 === "handled" && calls[0].text.startsWith("cmd:jadwal"), "bound sender + !jadwal → routed ke dispatcher");
    // bound sender + natural language → AI
    calls.length = 0;
    const r2 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "ada kelas besok?"));
    assert(r2 === "handled" && calls[0].text.startsWith("ai:"), "natural language → jalur AI");
    // unknown sender → panduan (maks 1/jam)
    calls.length = 0;
    userIdFor = null;
    const r3 = await processIncomingMessage(deps, msg("6289@s.whatsapp.net", "halo"));
    assert(r3 === "guide" && calls[0].text.includes("HUBUNGKAN"), "unknown sender → panduan hubungkan");
    // kedua kalinya dalam jam yang sama → rate-limited (tanpa balasan)
    guideAllowed = false;
    const r4 = await processIncomingMessage(deps, msg("6289@s.whatsapp.net", "halo lagi"));
    assert(r4 === "rate-limited" && calls.length === 1, "panduan kedua dalam 1 jam → rate-limited (maks 1/jam)");
    // group diabaikan
    guideAllowed = true; userIdFor = "u1";
    const r5 = await processIncomingMessage(deps, msg("123@g.us", "halo"));
    assert(r5 === "ignored", "pesan grup diabaikan");
    // broadcast/status diabaikan
    const r6 = await processIncomingMessage(deps, msg("status@broadcast", "halo"));
    assert(r6 === "ignored", "pesan broadcast/status diabaikan");
    // system/non-text (sticker, tanpa conversation) → ignored
    const r7 = await processIncomingMessage(deps, { key: { remoteJid: "6281@s.whatsapp.net" }, message: { stickerMessage: {} } } as any);
    assert(r7 === "ignored", "pesan non-teks diabaikan");
    // keamanan: spoof identity (remoteJid user valid tapi tidak ter-bound) → guide, TIDAK pernah command
    calls.length = 0;
    userIdFor = null;
    const r8 = await processIncomingMessage(deps, msg("628777@s.whatsapp.net", "!selesai 1"));
    assert(r8 === "guide" && calls[0].text.includes("HUBUNGKAN"), "spoof identity → panduan, command tidak dieksekusi");
    // rate limit pesan (20/menit) dilanggar → drop tanpa balasan
    calls.length = 0; userIdFor = "u1"; msgAllowed = false;
    const r9 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "!jadwal"));
    assert(r9 === "rate-limited" && calls.length === 0, "rate limit 20/menit → drop tanpa balasan");
    // interval AI 5 detik → pesan kedua ditolak
    calls.length = 0; msgAllowed = true; aiAllowed = false;
    const r10 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "ceritain dong"));
    assert(r10 === "rate-limited" && calls.length === 0, "interval AI 5 detik → pesan kedua ditolak");
  }

  // ===== F1 — Send service (queue D4) =====
  {
    class FakeManager {
      ready = false;
      sent: Array<{ jid: string; text: string }> = [];
      handlers: Record<string, (p: any) => void> = {};
      isReady() { return this.ready; }
      async sendText(jid: string, text: string) { this.sent.push({ jid, text }); return true; }
      on(ev: string, cb: (p: any) => void) { this.handlers[ev] = cb; }
    }
    const fm = new FakeManager() as any;
    const svc = new WaSendService(fm);
    assert(svc.isReady() === false, "send service: manager belum siap");
    const q1 = await svc.send("a@lid", "pesan 1");
    assert(q1.queued === true && svc.getQueueLength() === 1, "socket belum siap → pesan masuk queue");
    // kapasitas 50
    for (let i = 0; i < 49; i++) await svc.send("a@lid", `pesan ${i}`);
    const dropped = await svc.send("a@lid", "ke-51");
    assert(dropped.queued === false && dropped.sent === false && svc.getQueueLength() === 50, "queue maks 50 → ke-51 di-drop (caller terima failure)");
    // open → flush FIFO
    fm.ready = true;
    fm.handlers["open"]({ isNewLogin: false });
    await new Promise((r) => setTimeout(r, 10));
    assert(fm.sent.length === 50 && fm.sent[0].text === "pesan 1" && svc.getQueueLength() === 0, "open → queue di-flush FIFO (50 pesan, urutan lama dulu)");
    // sendStrict tanpa siap → failure seketika
    fm.ready = false;
    const strict = await svc.sendStrict("a@lid", "reminder");
    assert(strict.sent === false && strict.queued === false && svc.getQueueLength() === 0, "sendStrict gagal → tanpa antrean (hindari dobel dengan web push)");
  }
```

- [ ] **Step 8: Run + commit**

Run: `npm test` + `npm run typecheck` (semua assert hijau). Pastikan `and` ter-import di tugas.ts.

```bash
git add src/lib/wa/executors src/lib/wa/ai.ts src/lib/wa/send.ts src/lib/wa/pipeline.ts src/lib/wa/commands.ts src/lib/wa/client-manager.ts src/tests/wa.test.ts
git commit -m "feat: wa executors + dispatcher, AI natural language, send queue, pipeline pesan"
```

---

### Task 6: Worker notifikasi — sendReminder channel routing + fallback

**Files:**
- Modify: `src/lib/notifications/worker.ts`
- Test: `src/tests/wa.test.ts` (notification decision pure)

**Interfaces:**
- Consumes: `resolveWhatsAppTarget` (Task 4), `getWaSendService` (Task 5), `formatKuliahReminder`/`formatTugasReminder` (Task 4), `waBindings` schema (Task 1).
- Produces: `decideDeliveryChannel(waSent, pushSent)` pure; `sendReminder(userId, payload)` → `{ sentCount, channel }` (dipakai blok class & task worker).

- [ ] **Step 1: Test decision pure (failing)**

**Imports (header):** `import { decideDeliveryChannel } from "../lib/notifications/worker";`

```ts

  // ===== F1 — Notification decision (pure) =====
  {
    assert(decideDeliveryChannel(true, 0) === "whatsapp", "WA sukses → channel whatsapp");
    assert(decideDeliveryChannel(false, 2) === "web_push", "WA gagal + push sukses → fallback web_push");
    assert(decideDeliveryChannel(false, 0) === "none", "WA gagal + tanpa push → none");
    assert(decideDeliveryChannel(true, 0) === "whatsapp", "WA sukses → TIDAK dobel kirim web push");
  }
```

- [ ] **Step 2: worker.ts — sendReminder + refactor blok**

Tambah import di `src/lib/notifications/worker.ts`:

```ts
import { waBindings } from "../db";
import { getWaSendService } from "../wa/send";
import { resolveWhatsAppTarget } from "../wa/identity";
import { formatKuliahReminder, formatTugasReminder } from "../wa/format";
```

Tambah fungsi di bagian atas file (setelah `cleanupOldUsage`):

```ts
/**
 * Routing channel notifikasi (D1): binding WA active → WhatsApp;
 * gagal → fallback web push. WA sukses → TIDAK dobel kirim push.
 */
export function decideDeliveryChannel(waSent: boolean, pushSent: number): "whatsapp" | "web_push" | "none" {
  if (waSent) return "whatsapp";
  if (pushSent > 0) return "web_push";
  return "none";
}

export interface ReminderPayload {
  push: { title: string; body: string; data: Record<string, string> };
  waText: string;
}

export async function sendReminder(
  userId: string,
  payload: ReminderPayload
): Promise<{ sentCount: number; channel: "whatsapp" | "web_push" | "none" }> {
  const binding = await db.query.waBindings.findFirst({
    where: and(eq(waBindings.userId, userId), eq(waBindings.status, "active")),
  });

  let waSent = false;
  if (binding) {
    const target = resolveWhatsAppTarget(binding);
    if (target) {
      // sendStrict: tanpa queue — gagal lama/cepat sama-sama failure seketika
      // (hindari pesan tertunda yang jadi dobel dengan fallback web push)
      const res = await getWaSendService().sendStrict(target, payload.waText);
      waSent = res.sent;
    }
  }

  let pushSent = 0;
  if (!waSent) {
    const res = await sendPushToUser(userId, payload.push);
    pushSent = res.sentCount;
  }
  return { sentCount: waSent ? 1 : pushSent, channel: decideDeliveryChannel(waSent, pushSent) };
}
```

Refactor blok **class** (ganti `sendPushToUser` — worker.ts baris lama `const res = await sendPushToUser(userId, {...})` + insert delivery):

```ts
            const waText = formatKuliahReminder(item.courseName, item.room, item.startTime, minutesUntilClass, isPrimary);
            const res = await sendReminder(userId, {
              push: {
                title,
                body,
                data: { url: "/jadwal", entityType: "class", entityId: item.scheduleId },
              },
              waText,
            });

            if (res.sentCount > 0) {
              notificationsSent += res.sentCount;
              await db.insert(notificationDeliveries).values({
                id: crypto.randomUUID(),
                userId,
                entityType: "class",
                entityId: item.scheduleId,
                occurrenceAt: new Date(occurrenceAt),
                offsetMinutes: offset,
                channel: res.channel,
                status: "SENT",
                sentAt: new Date(),
              });
              classSentKeys.add(sentKey);
            }
```

Refactor blok **task** (ganti blok `sendPushToUser` task + insert):

```ts
            const waText = formatTugasReminder(task.title, offsetLabel);
            const res = await sendReminder(userId, {
              push: {
                title,
                body,
                data: { url: "/tugas", entityType: "task", entityId: task.id },
              },
              waText,
            });

            if (res.sentCount > 0) {
              notificationsSent += res.sentCount;
              await db.insert(notificationDeliveries).values({
                id: crypto.randomUUID(),
                userId,
                entityType: "task",
                entityId: task.id,
                occurrenceAt: new Date(dueTimestamp),
                offsetMinutes: offset,
                channel: res.channel,
                status: "SENT",
                sentAt: new Date(),
              });
              taskSentKeys.add(sentKey);
            }
```

- [ ] **Step 3: Run + commit**

Run: `npm test` (176 existing + decision 4× — reminder tests existing tetap hijau), `npm run typecheck`.

```bash
git add src/lib/notifications/worker.ts src/tests/wa.test.ts
git commit -m "feat: wa notifikasi — sendReminder routing WA + fallback web push"
```

---

### Task 7: Route API WA + pairing.ts + WhatsAppCard

**Files:**
- Create: `src/lib/wa/pairing.ts`
- Create: `src/app/api/wa/status/route.ts`, `src/app/api/wa/otp/request/route.ts`, `src/app/api/wa/otp/verify/route.ts`, `src/app/api/wa/unlink/route.ts`, `src/app/api/wa/pairing/route.ts`
- Create: `src/components/wa/WhatsAppCard.tsx`
- Modify: `src/app/pengaturan/page.tsx` (render WhatsAppCard)
- Test: `src/tests/wa.test.ts` (pairing state machine pure)

**Interfaces:**
- Consumes: `getWaClientManager`/`WaClientManager` (Task 3), `getHealthIndicators`/`computeHealth` (Task 3), `normalizePhone`/`maskPhone` (Task 4), `getWaSendService` (Task 5), `formatOtpMessage` (Task 4), `waBindings` (Task 1).
- Produces: `PairingState`, `PairingRecord`, `nextPairingState(current, event)` pure, `getPairingState()`, `setPairingState(rec)`, `registerPairingHooks(manager)`, `PAIRING_EXPIRY_MS`.

- [ ] **Step 1: Test pairing state machine (failing)**

**Imports (header):** `import { nextPairingState } from "../lib/wa/pairing";`

```ts

  // ===== F1 — Pairing state machine (pure, A7) =====
  {
    assert(nextPairingState("pairing_not_started", "request") === "pairing_code_requested", "start → request → code_requested");
    assert(nextPairingState("pairing_code_requested", "code_received") === "waiting_for_phone", "code_received → waiting_for_phone");
    assert(nextPairingState("waiting_for_phone", "linked") === "pairing_success", "linked → pairing_success");
    assert(nextPairingState("waiting_for_phone", "expired") === "pairing_failed", "expired → pairing_failed");
    assert(nextPairingState("waiting_for_phone", "timeout_408") === "pairing_failed", "408 selama menunggu → pairing_failed");
    assert(nextPairingState("waiting_for_phone", "logged_out_401") === "pairing_failed", "401 selama menunggu → pairing_failed");
    assert(nextPairingState("pairing_failed", "request") === "pairing_code_requested", "failed → request (minta kode baru)");
    assert(nextPairingState("pairing_success", "request") === "pairing_code_requested", "re-pair dari success → request");
    assert(nextPairingState("pairing_success", "linked") === "pairing_success", "event tak relevan → state tetap");
  }
```

- [ ] **Step 2: pairing.ts**

```ts
// src/lib/wa/pairing.ts — A7: pairing state machine; state persist di
// app_config key "wa_pairing" (survive restart). requestPairingCode tetap
// dipakai, tetapi endpoint pairing TIDAK memanggilnya tanpa state tracking.
import { eq } from "drizzle-orm";
import { db, appConfig } from "@/lib/db";
import type { WaClientManager } from "./client-manager";

export type PairingState =
  | "pairing_not_started" | "pairing_code_requested" | "waiting_for_phone"
  | "pairing_success" | "pairing_failed";

export type PairingEvent = "request" | "code_received" | "linked" | "expired" | "timeout_408" | "logged_out_401";

export interface PairingRecord {
  state: PairingState;
  code?: string;
  requestedAt?: number; // ms
  updatedAt: number;
}

export const PAIRING_KEY = "wa_pairing";
export const PAIRING_EXPIRY_MS = 5 * 60_000; // safety net aplikasi; 408/401 path menangani failure nyata

/** Pure — transisi; event tak relevan → state tetap. */
export function nextPairingState(current: PairingState, event: PairingEvent): PairingState {
  switch (event) {
    case "request": // re-request membatalkan yang sebelumnya (A7)
      return "pairing_code_requested";
    case "code_received":
      return current === "pairing_code_requested" ? "waiting_for_phone" : current;
    case "linked":
      return current === "waiting_for_phone" ? "pairing_success" : current;
    case "expired":
    case "timeout_408":
    case "logged_out_401":
      return current === "waiting_for_phone" ? "pairing_failed" : current;
    default:
      return current;
  }
}

export async function getPairingState(): Promise<PairingRecord> {
  const row = await db.select().from(appConfig).where(eq(appConfig.key, PAIRING_KEY)).limit(1).then((r) => r[0]);
  if (!row) return { state: "pairing_not_started", updatedAt: 0 };
  try { return JSON.parse(row.value) as PairingRecord; }
  catch { return { state: "pairing_not_started", updatedAt: 0 }; }
}

export async function setPairingState(rec: PairingRecord): Promise<PairingRecord> {
  const value = JSON.stringify(rec);
  await db.insert(appConfig).values({ key: PAIRING_KEY, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } });
  return rec;
}

let hooksRegistered = false;
/** Wire transisi via event manager (dipanggil client-manager via import
 *  dinamis saat socket dibuat). pairing_success = open + isNewLogin. */
export function registerPairingHooks(manager: WaClientManager): void {
  if (hooksRegistered) return;
  hooksRegistered = true;
  manager.on("open", async ({ isNewLogin }) => {
    const rec = await getPairingState();
    if (isNewLogin && (rec.state === "waiting_for_phone" || rec.state === "pairing_code_requested")) {
      await setPairingState({ ...rec, state: "pairing_success", updatedAt: Date.now() });
      await manager.clearAuthInvalidFlag();
    }
  });
  manager.on("close", async ({ classification, statusCode }) => {
    const rec = await getPairingState();
    if (rec.state !== "waiting_for_phone") return;
    if (classification === "logged_out" || statusCode === 408) {
      await setPairingState({ ...rec, state: "pairing_failed", updatedAt: Date.now() });
    }
  });
}
```

- [ ] **Step 3: Route GET /api/wa/status**

```ts
// src/app/api/wa/status/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { getWaClientManager } from "@/lib/wa/client-manager";
import { computeHealth, getHealthIndicators } from "@/lib/wa/health";
import { maskPhone, normalizePhone } from "@/lib/wa/normalize";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const manager = getWaClientManager();
  const binding = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  const adminPhone = normalizePhone(serverEnv.WA_ADMIN_PHONE ?? "");
  const isOwner = !!adminPhone && !!binding && binding.phone === adminPhone && binding.status === "active";
  const indicators = getHealthIndicators();

  return NextResponse.json({
    socketState: manager.state,
    botConnected: manager.isReady(),
    botPhone: serverEnv.WA_BOT_PHONE ? maskPhone(serverEnv.WA_BOT_PHONE) : null,
    canPair: isOwner,
    health: { ...indicators, status: computeHealth(indicators) },
    myPhone: binding ? maskPhone(binding.phone) : null,
    myStatus: binding?.status ?? null,
  });
}
```

- [ ] **Step 4: Route POST /api/wa/otp/request**

```ts
// src/app/api/wa/otp/request/route.ts — B3: web-first OTP. OTP baru
// membatalkan OTP sebelumnya (overwrite + reset attempts).
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { normalizePhone } from "@/lib/wa/normalize";
import { formatOtpMessage } from "@/lib/wa/format";
import { getWaSendService } from "@/lib/wa/send";

export const runtime = "nodejs";

const OTP_TTL_MS = 10 * 60_000;
const OTP_REQUEST_LIMIT = { maxAttempts: 5, windowMs: 10 * 60_000 };

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { phone?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body tidak valid" }, { status: 400 }); }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "Format nomor tidak valid. Contoh: 081234567890" }, { status: 400 });

  // Guard: maks 5 request/10 menit per user DAN per nomor (B3)
  const rlUser = await checkRateLimit(`wa:otp:user:${user.id}`, OTP_REQUEST_LIMIT);
  if (!rlUser.allowed) return NextResponse.json({ error: rlUser.error }, { status: 429 });
  const rlPhone = await checkRateLimit(`wa:otp:phone:${phone}`, OTP_REQUEST_LIMIT);
  if (!rlPhone.allowed) return NextResponse.json({ error: rlPhone.error }, { status: 429 });

  if (!getWaSendService().isReady()) {
    return NextResponse.json({ error: "Bot WhatsApp belum online. Coba beberapa saat lagi." }, { status: 409 });
  }

  const own = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  if (own && own.status === "active") {
    return NextResponse.json({ error: "Akun sudah terhubung. Putuskan dulu (Pengaturan / !putuskan)." }, { status: 409 });
  }
  const byPhone = await db.query.waBindings.findFirst({ where: eq(waBindings.phone, phone) });
  if (byPhone && byPhone.userId !== user.id && byPhone.status === "active") {
    return NextResponse.json({ error: "Nomor ini sudah terhubung ke akun lain." }, { status: 409 });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpCode = crypto.createHash("sha256").update(otp).digest("hex");
  const otpExpiresAt = Date.now() + OTP_TTL_MS;
  const nowIso = new Date().toISOString();

  // Binding unlinked milik user lain → pindah kepemilikan; user punya baris
  // (pending/unlinked) → overwrite (invalidate previous OTP, reset attempts)
  if (byPhone && byPhone.userId !== user.id) {
    await db.delete(waBindings).where(eq(waBindings.id, byPhone.id));
  }
  const existing = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  if (existing) {
    await db.update(waBindings)
      .set({ phone, otpCode, otpExpiresAt, otpAttempts: 0, status: "pending", updatedAt: nowIso })
      .where(eq(waBindings.id, existing.id));
  } else {
    await db.insert(waBindings).values({ id: crypto.randomUUID(), userId: user.id, phone, otpCode, otpExpiresAt, otpAttempts: 0, status: "pending" });
  }

  // OTP dikirim ke raw phone (lid/jid kosong saat pending — B3)
  const res = await getWaSendService().sendStrict(`${phone}@s.whatsapp.net`, formatOtpMessage(otp));
  if (!res.sent) {
    return NextResponse.json({ error: "Kode dibuat tetapi gagal terkirim. Coba lagi." }, { status: 502 });
  }
  return NextResponse.json({ success: true, hint: "Kode OTP terkirim ke WhatsApp Anda. Berlaku 10 menit." });
}
```

- [ ] **Step 5: Route POST /api/wa/otp/verify + POST /api/wa/unlink**

```ts
// src/app/api/wa/otp/verify/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/wa/normalize";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { phone?: string; otp?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body tidak valid" }, { status: 400 }); }

  const phone = normalizePhone(body.phone ?? "");
  const otp = String(body.otp ?? "").trim();
  if (!phone || !otp) return NextResponse.json({ error: "Nomor dan kode diperlukan." }, { status: 400 });

  const binding = await db.query.waBindings.findFirst({
    where: and(eq(waBindings.userId, user.id), eq(waBindings.phone, phone)),
  });
  if (!binding) return NextResponse.json({ error: "Mulai lagi dari Pengaturan (minta kode baru)." }, { status: 404 });
  if (binding.status === "active") return NextResponse.json({ error: "Sudah terhubung." }, { status: 409 });
  if (binding.status === "unlinked") return NextResponse.json({ error: "Sesi kedaluwarsa. Minta kode baru." }, { status: 409 });
  if (!binding.otpCode || !binding.otpExpiresAt) return NextResponse.json({ error: "Belum ada kode. Minta kode baru dulu." }, { status: 409 });
  if (Date.now() > binding.otpExpiresAt) return NextResponse.json({ error: "Kode kedaluwarsa. Minta kode baru." }, { status: 410 });
  if (binding.otpAttempts >= 3) return NextResponse.json({ error: "Terlalu banyak percobaan. Minta kode baru." }, { status: 429 });

  const matches = crypto.createHash("sha256").update(otp).digest("hex") === binding.otpCode;
  if (!matches) {
    await db.update(waBindings)
      .set({ otpAttempts: binding.otpAttempts + 1, updatedAt: new Date().toISOString() })
      .where(eq(waBindings.id, binding.id));
    return NextResponse.json({ error: `Kode salah. Sisa ${Math.max(0, 2 - binding.otpAttempts)} percobaan.` }, { status: 400 });
  }

  await db.update(waBindings)
    .set({ status: "active", otpCode: null, otpExpiresAt: null, otpAttempts: 0, updatedAt: new Date().toISOString() })
    .where(eq(waBindings.id, binding.id));
  return NextResponse.json({ success: true, message: "WhatsApp terhubung! Notifikasi akan dikirim ke chat ini." });
}
```

```ts
// src/app/api/wa/unlink/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const binding = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  if (!binding) return NextResponse.json({ error: "Tidak ada koneksi WhatsApp." }, { status: 404 });
  await db.update(waBindings)
    .set({ status: "unlinked", otpCode: null, otpExpiresAt: null, otpAttempts: 0, updatedAt: new Date().toISOString() })
    .where(eq(waBindings.id, binding.id));
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Route GET /api/wa/pairing (pemilik + state tracking)**

```ts
// src/app/api/wa/pairing/route.ts — A7: request kode + state tracking.
// Hanya pemilik WA_ADMIN_PHONE (via binding aktif dengan nomor admin).
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { getWaClientManager } from "@/lib/wa/client-manager";
import { normalizePhone } from "@/lib/wa/normalize";
import { getPairingState, setPairingState, nextPairingState, PAIRING_EXPIRY_MS } from "@/lib/wa/pairing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminPhone = normalizePhone(serverEnv.WA_ADMIN_PHONE ?? "");
  if (!adminPhone) return NextResponse.json({ error: "WA_ADMIN_PHONE belum dikonfigurasi." }, { status: 500 });
  const adminBinding = await db.query.waBindings.findFirst({
    where: and(eq(waBindings.phone, adminPhone), eq(waBindings.status, "active")),
  });
  if (!adminBinding || adminBinding.userId !== user.id) {
    return NextResponse.json({ error: "Hanya pemilik bot yang dapat melakukan pairing." }, { status: 403 });
  }

  const manager = getWaClientManager();
  const action = req.nextUrl.searchParams.get("action");

  let rec = await getPairingState();
  if (manager.isReady()) {
    if (rec.state === "waiting_for_phone" || rec.state === "pairing_code_requested") {
      rec = await setPairingState({ ...rec, state: "pairing_success", updatedAt: Date.now() });
    }
    return NextResponse.json({ state: "pairing_success", linked: true });
  }

  // Safety net: kode kedaluwarsa (A7 — kasus kode dibuat tapi link 408/expired)
  if (rec.state === "waiting_for_phone" && rec.requestedAt && Date.now() - rec.requestedAt > PAIRING_EXPIRY_MS) {
    rec = await setPairingState({ ...rec, state: nextPairingState(rec.state, "expired"), updatedAt: Date.now() });
  }

  if (action === "request") {
    const botPhone = normalizePhone(serverEnv.WA_BOT_PHONE ?? "");
    if (!botPhone) return NextResponse.json({ error: "WA_BOT_PHONE belum dikonfigurasi." }, { status: 500 });
    await manager.ensureWaClient();
    const code = await manager.requestPairingCode(botPhone);
    // Transisi via state machine (A7): request membatalkan state sebelumnya
    rec = await setPairingState({ ...rec, state: nextPairingState(rec.state, "request"), code, requestedAt: Date.now(), updatedAt: Date.now() });
  }

  return NextResponse.json({
    state: rec.state,
    code: rec.state === "waiting_for_phone" && rec.code ? rec.code : null,
    requestedAt: rec.requestedAt ?? null,
  });
}
```

Catatan: baris expiry di atas bisa disederhanakan saat implementasi — `const failed = nextPairingState(rec.state, "expired"); if (failed !== rec.state) rec = await setPairingState({ ...rec, state: failed, updatedAt: Date.now() });`.

- [ ] **Step 7: WhatsAppCard + pasang di Pengaturan**

`src/components/wa/WhatsAppCard.tsx` (client — polling 10s; status bot, pairing owner, binding user):

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface WaStatus {
  socketState: string;
  botConnected: boolean;
  botPhone: string | null;
  canPair: boolean;
  health: { status: string; lastMessageEvent: number | null };
  myPhone: string | null;
  myStatus: string | null;
}

const BOT_LABEL: Record<string, string> = {
  open: "🟢 Online",
  starting: "🟡 Menghubungkan…",
  connecting: "🟡 Menghubungkan…",
  reconnecting: "🟡 Reconnecting…",
  closing: "🟡 Menutup…",
  logged_out: "🔴 Perlu pairing ulang",
  error: "🔴 Error — pairing ulang",
  stopped: "⚪ Offline",
};

function formatSilent(minutes: number): string {
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.round(minutes / 60)} jam`;
}

export default function WhatsAppCard() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"idle" | "otp">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairState, setPairState] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/wa/status");
      if (res.ok) setStatus(await res.json());
    } catch { /* server belum siap — polling berikutnya */ }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const timer = setInterval(() => void fetchStatus(), 10_000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Semua endpoint WA = POST (termasuk tanpa body — unlink & pairing action);
  // fetch() default GET tidak akan sampai ke route POST.
  async function api(path: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Gagal (${res.status})`);
      return data;
    } finally { setBusy(false); }
  }

  async function requestOtp() {
    try {
      await api("/api/wa/otp/request", { phone });
      setStep("otp");
    } catch (e: any) { setError(e.message); }
  }

  async function verifyOtp() {
    try {
      await api("/api/wa/otp/verify", { phone, otp });
      setStep("idle"); setPhone(""); setOtp("");
      await fetchStatus();
    } catch (e: any) { setError(e.message); }
  }

  async function unlink() {
    if (!window.confirm("Putuskan koneksi WhatsApp?")) return;
    try { await api("/api/wa/unlink"); await fetchStatus(); }
    catch (e: any) { setError(e.message); }
  }

  async function requestPair() {
    try {
      const data = await api("/api/wa/pairing?action=request");
      setPairCode(data.code ?? null);
      setPairState(data.state);
    } catch (e: any) { setError(e.message); }
  }

  const health = status?.health;
  // A6: possibly_silent ≠ unhealthy — tampilkan fakta, bukan alarm;
  // lastMessageEvent null segera setelah connect → basis sehat (lastConnectionUpdate)
  const silentMinutes = health?.lastMessageEvent
    ? Math.floor((Date.now() - health.lastMessageEvent) / 60_000)
    : null;
  const botLabel = status ? BOT_LABEL[status.socketState] ?? status.socketState : "Memuat…";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold">Asisten WhatsApp</CardTitle>
        <CardDescription>Notifikasi & chat asisten via WhatsApp (nomor bot terpusat).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status bot */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{botLabel}</p>
            <p className="text-xs text-muted-foreground">
              {status?.botPhone ? `Nomor bot: ${status.botPhone}` : "Bot belum dipasangkan"}
              {health?.status === "possibly_silent" && silentMinutes != null
                ? ` · online, tak ada pesan masuk sejak ${formatSilent(silentMinutes)}`
                : ""}
            </p>
          </div>
          {status?.canPair && !status.botConnected && (
            <Button size="sm" onClick={requestPair} disabled={busy}>Tampilkan kode</Button>
          )}
        </div>
        {pairCode && (
          <div className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-mono text-lg font-bold tracking-widest">{pairCode}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buka WhatsApp di HP → Perangkat tertaut → Tautkan perangkat → masukkan kode ini.
              {pairState === "pairing_failed" ? " Kode kedaluwarsa — minta kode baru." : ""}
            </p>
          </div>
        )}

        {/* Binding user */}
        {status?.myStatus === "active" && status.myPhone ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-sm">Terhubung: <span className="font-medium">{status.myPhone}</span></p>
            <Button size="sm" variant="outline" onClick={unlink} disabled={busy}>Putuskan</Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm">
              {status?.myStatus === "pending"
                ? "Masukkan kode OTP yang dikirim ke nomor kamu."
                : "Hubungkan nomor WhatsApp kamu untuk notifikasi di chat."}
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="08xxxxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={step === "otp" || busy}
              />
              {step === "otp" ? (
                <>
                  <Input
                    placeholder="6 digit kode"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    disabled={busy}
                    className="w-32"
                  />
                  <Button onClick={verifyOtp} disabled={busy}>Verifikasi</Button>
                </>
              ) : (
                <Button onClick={requestOtp} disabled={busy || !phone.trim()}>Kirim kode</Button>
              )}
            </div>
            {step === "otp" && (
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => { setStep("idle"); setPhone(""); setOtp(""); }}
              >
                Batalkan / ganti nomor
              </button>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

Catatan: path komponen UI terverifikasi (pengaturan page memakai `@/components/ui/Card`; `Button` variant primary/secondary/outline/ghost + size sm ada; `Input` diekspor). `CardDescription` diekspor oleh Card.tsx.

`src/app/pengaturan/page.tsx` — render card: cari blok `{/* Web Push Notification Settings */}` (sekitar L363); import `WhatsAppCard` di atas dan render tepat SEBELUM blok web push:

```tsx
      <WhatsAppCard />
```

(dengan `import WhatsAppCard from "@/components/wa/WhatsAppCard";` di header import).

- [ ] **Step 8: Run + commit**

Run: `npm test` (pairing 9× + semua hijau), `npm run typecheck`, `npm run lint`.

```bash
git add src/lib/wa/pairing.ts src/app/api/wa src/components/wa/WhatsAppCard.tsx src/app/pengaturan/page.tsx src/tests/wa.test.ts
git commit -m "feat: wa route API (status/otp/unlink/pairing) + pairing state machine + WhatsAppCard"
```

---

### Task 8: Tes lengkap F1 + acceptance + verifikasi penuh

**Files:**
- Test: `src/tests/wa.test.ts` (sweep F1 lengkap)
- Verify: `npm run quality`, `npm run build`, `npm ls`

**Interfaces:**
- Consumes: semua modul Task 1–7.

- [ ] **Step 1: Audit cakupan F1 — tambah assert yang kurang**

Periksa `src/tests/wa.test.ts` terhadap 8 kelompok F1 spec; untuk setiap celah tambahkan assert (pola sudah ada di Task 2–7):

1. Auth state — 7 assert ✓ (Task 2). Tambahkan bila belum: "restart" round-trip creds (bukan hanya keys): `const store3 = new WaSessionStore(memDb); const c3 = await store3.loadAuthState(); assert(c3.creds.me.id === "62812@lid", ...)`.
2. Socket manager — ✓ (Task 3).
3. Identity resolver — ✓ (Task 4). Tambahkan bila belum: mapping refresh (getPNForLID dipanggil ulang → hasil baru) dan "restart preserves mapping (keystore round-trip)" — sudah terwakili tes keystore Task 2 + identity Task 4; tambahkan assert backfill: binding ditemukan via phone + lid kosong → `backfillBinding` dipanggil dengan patch lid.
4. Health — ✓ (Task 3).
5. Messaging — ✓ (Task 5).
6. Security — ✓ (Task 5).
7. Pairing — ✓ (Task 7).
8. Notification — ✓ (Task 6).

Tambahkan assert backfill + creds restart ke wa.test.ts sekarang:

```ts
    // backfill non-destruktif: match via phone, lid kosong → patch lid dikirim
    let backfillPatch: any = null;
    const depsBf = {
      ...deps,
      findBindingByLid: async () => null,
      findBindingByPhone: async (p: string) => (p === "628111111111" ? ({ id: "b3", userId: "u3", phone: "628111111111", lid: null, jid: null, status: "active", otpCode: null, otpExpiresAt: null, otpAttempts: 0, createdAt: "", updatedAt: "" } as WaBindingRow) : null),
      backfillBinding: async (_id: string, patch: any) => { backfillPatch = patch; },
    };
    const resBf = await resolveWhatsAppIdentity({ remoteJid: "lidA@lid" } as any, depsBf);
    assert(resBf.userId === "u3" && backfillPatch?.lid === "lidA", "backfill binding: lid diisi saat binding lama hanya punya phone");
```

- [ ] **Step 2: Verifikasi penuh (F3)**

```bash
npm run quality          # lint + typecheck + tes — semua hijau (176 existing + kelompok F1 ~40)
npm run build            # production build OK; import ESM Baileys tanpa interop error
npm ls @whiskeysockets/baileys   # satu baris 7.0.0-rc14, tanpa transitive duplicate
```

Bila build gagal dengan CJS/ESM interop: periksa apakah `next.config` perlu `serverExternalPackages` untuk `@whiskeysockets/baileys` (Next 15 — opsi valid; tambahkan hanya bila terbukti diperlukan, catat di report).

- [ ] **Step 3: Checklist acceptance F2 — dokumen manual E2E**

Buat `docs/WA_ACCEPTANCE.md` (checklist 15 item F2 untuk verifikasi manual dengan nomor bot nyata — dijalankan user/agent live; automated subset sudah ditutup tes):

```markdown
# WhatsApp Assistant — Acceptance Checklist (F2, manual E2E)

Prasyarat: `WA_BOT_PHONE` + `WA_ADMIN_PHONE` di env; migrasi 0004 applied; bot nomor khusus.

1. [ ] Fresh pairing: kode → linked (state: code generated → waiting → linked)
2. [ ] OTP bind account (kirim kode → verify sukses)
3. [ ] Incoming message via PN → balasan perintah
4. [ ] Incoming message via LID (bila applicable di WA)
5. [ ] Command response (!jadwal, !tugas, !selesai, !nilai, !insight, !help)
6. [ ] AI response (tanpa prefix !)
7. [ ] Notification delivery (reminder kuliah/tugas sampai di chat WA)
8. [ ] Disconnect (simulasi jaringan) → auto-reconnect
9. [ ] Automatic reconnect (tanpa interaksi)
10. [ ] Process restart (redeploy Koyeb) → reconnect otomatis
11. [ ] Restore auth state (tanpa scan ulang)
12. [ ] Send message after restart
13. [ ] Receive message after restart
14. [ ] Unlink (!putuskan ya / tombol di Pengaturan)
15. [ ] Re-pair (pairing ulang setelah unlink/logged_out)

Plus: `npm run quality` hijau, `npm run build` OK, `npm ls` satu versi rc14.
```

- [ ] **Step 4: Run + commit**

```bash
git add src/tests/wa.test.ts docs/WA_ACCEPTANCE.md
git commit -m "feat: wa tes F1 lengkap + acceptance checklist + verifikasi build"
```

---

### Task 9: Review mandiri + serahkan ke user

**Files:** — (tidak ada file baru)

- [ ] **Step 1: Whole-branch review**

```bash
git log --oneline $(git merge-base HEAD master)..HEAD
git diff --stat $(git merge-base HEAD master)..HEAD
```

(Pakai `master` lokal sebagai base — branch ini forked dari master; `origin/master` dipakai hanya bila sudah ter-fetch.)

Periksa: 8 commit task; spec section 12 (hal yang TIDAK boleh diubah) tidak dilanggar; tidak ada rahasia (token/password/JWT) di commit — grep `gsk_|eyJ|SESSION_SECRET|password` pada diff; Global Constraints 1–22 terpenuhi.

- [ ] **Step 2: Ringkas untuk user**

Laporan akhir: ringkasan fitur, file, hasil tes (`npm run quality`, `npm run build`), sisa yang butuh tindakan user (deploy env `WA_ADMIN_PHONE`/`WA_BOT_PHONE` di Koyeb, `npm run db:migrate` terhadap Turso produksi, E2E F2 checklist), dan langkah finishing-a-development-branch.
