# ForFH: Asisten WhatsApp (Baileys 7) — bot, notifikasi, dan binding multi-user

Tanggal: 2026-08-13 · Branch: `feat/wa-assistant` · Status: **Produk disetujui user; integration layer direvisi sesuai request changes Baileys 7.x (2026-08-13)**

## Context

- Web push sudah ada, tetapi banyak notif tidak sampai karena browser tidak terbuka.
- Web app berat dibuka dari HP saat sinyal lemah; chat WhatsApp teks jauh lebih ringan.
- User menyiapkan **nomor khusus bot** (terpisah dari nomor pribadi) dan ingin multi-user: satu nomor bot sentral, semua pengguna ForFH bisa menghubungkan nomor WA mereka ke akun.
- Keputusan channel (disetujui user): **Baileys** (`@whiskeysockets/baileys`), dijalankan **di deploy yang sama** dengan web — tanpa proses/deploy terpisah.
- **Revisi integration layer (request changes 2026-08-13)**: implementasi harus kompatibel **Baileys 7.x** — auth-state (`creds` + `keys`/`SignalKeyStore`), identity model **PN/LID**, lifecycle socket ber-state-machine, disconnect classification, dan persistence yang mendukung namespace `lid-mapping`, `device-list`, `tctoken`. Tujuan produk/UX yang sudah disetujui TIDAK berubah.

## Tujuan (success criteria)

1. Bot WA berjalan di deploy yang sama dengan web, online 24/7 dengan auto-reconnect **tanpa scan QR ulang** (auth state persist di Turso terenkripsi, kompatibel Baileys 7).
2. Binding multi-user: nomor WA → akun ForFH via OTP **web-first**; `phone` = verification identity, `lid`/`jid` = WhatsApp transport identity.
3. Asisten chat: perintah `!` (deterministik, instan) + bahasa natural via AI (bebas kuota 30/jam, dengan guard interval 5 detik per pengirim).
4. Notifikasi reminder (kuliah + deadline tugas) **menggantikan web push** bagi user yang sudah terhubung WA; web push tetap untuk yang belum; fallback otomatis bila WA gagal.
5. Identity resolution tidak bergantung pada parsing nomor mentah — pipeline memakai resolver PN/LID; mapping LID persist dan dipakai ulang setelah restart.
6. Socket lifecycle tervalidasi: state machine eksplisit, disconnect classification per `DisconnectReason`, reconnect dengan backoff + jitter (tanpa reconnect storm), dan observability silent-session.
7. Semua tes hijau (176 + kelompok tes baru), build OK; migrasi 0004 additive — data existing tidak berubah.

## Non-goals (tidak diimplementasi, dengan alasan)

- CRUD penuh web di chat (catatan markdown, file, eksplorasi perundang-undangan) — tetap di web; UX chat tidak cocok.
- Pesan grup — diabaikan di MVP (dokumentasikan sebagai batasan).
- Pembuatan akun ForFH via WA — tetap via login email kampus.
- Proses/deploy terpisah untuk bot — ditunda sampai benar-benar dibutuhkan.
- WhatsApp Cloud API — kandidat fallback bila nomor bot kena pembatasan atau bot tumbuh besar.
- Horizontal scaling / multi-instance socket — **dilarang untuk MVP** (lihat A7): 1 deployment, 1 instance, 1 socket, 1 bot account.

## 1. Keputusan dependency & version gate (deliverable: version decision)

**Keputusan (diverifikasi 2026-08-13):**

- Pin **`@whiskeysockets/baileys@7.0.0-rc14`** — dist-tag `latest` npm per 2026-08-13; `legacy` = 6.7.24. rc14 ≥ rc12 (patch keamanan CVE-2026-48063: forged `messages.upsert`, history sync spoofing, app-state corruption). Versi `< 7.0.0-rc12` / `6.7.22` DITOLAK.
- **Pin exact** di `package.json` (`"@whiskeysockets/baileys": "7.0.0-rc14"`, tanpa `^`/`~`) — build production/dev/CI dijamin versi sama.
- **Tidak hardcode protocol version WhatsApp** di source code: pakai default `version` yang di-set Baileys 7; hanya override bila verifikasi startup menunjukkan `405` (pola upstream). Jangan menyimpan angka versi WA manual kecuali dokumentasi upstream mengharuskannya.
- Acceptance: `npm ls @whiskeysockets/baileys` → satu baris rc14, tanpa transitive duplicate; versi dicatat di `docs/` (spec ini + BUILD_STATUS).
- **ESM compatibility gate** (Baileys 7 beralih ke ESM): sebelum coding verifikasi `package.json` `type`, `tsconfig` `module`/`moduleResolution`, pola import Next.js (dynamic vs static), dan interop CJS/ESM terhadap pola import existing di repo. Acceptance: `npm run build` → import Baileys sukses di production build, **tanpa CJS/ESM interop error**, socket dapat dibuat pada Node runtime. DILARANG pola lama `require(...)`/`const { default: makeWASocket } = require(...)` sebagai default implementation — gunakan import ESM yang sesuai.
- Konfigurasi socket yang dipakai (dari dokumentasi resmi): `auth` (wajib), `logger`, `markOnlineOnConnect: true`, `syncFullHistory: false`, `shouldIgnoreJid` (guard jid), `keepAliveIntervalMs` default 30_000, `connectTimeoutMs` default 20_000. Verifikasi ulang saat implementasi terhadap typings rc14.

**Fakta API Baileys 7 yang diverifikasi dari dokumentasi resmi (dipakai seluruh spec ini):**

- `AuthenticationState = { creds: AuthenticationCreds; keys: SignalKeyStore }`; `SignalKeyStore` interface: `get(type, ids) → { [id]: value }`, `set(data)` — `null` value = **delete**; ada varian `transaction` (`SignalKeyStoreWithTransaction`).
- Namespace keystore nyata: `lid-mapping` (nilai string; reverse key `<lid>_reverse` → pn, ditulis dalam transaksi), `tctoken` (nilai `{ token: Buffer, timestamp }`), plus prekeys/sessions/app-state dsb.
- `DisconnectReason` enum: `connectionClosed=428, connectionLost=408, timedOut=408, connectionReplaced=440, loggedOut=401, badSession=500, restartRequired=515, multideviceMismatch=411, forbidden=403, unavailableService=503`.
- `connection.update` → `{ connection: 'connecting'|'open'|'close', lastDisconnect: { error?, date }, qr, isNewLogin, isConnected, receivedPendingNotifications }`.
- Utilitas JID: `jidDecode(jid) → { user, device?, server }`, `isJidUser(jid)`, `isPnUser(jid)` (`@s.whatsapp.net`), `isLidUser(jid)` (`@lid`).
- `WAMessageKey` memuat field identity: `remoteJid`, `remoteJidAlt`, `remoteJidUsername`, `participant`, `participantAlt`, `participantUsername`, `server_id`, `addressingMode`.
- LID mapping internal: `LIDMappingStore` (`getLIDForPN(pn)`, `getPNForLID(lid)`, `storeLIDPNMappings`) — cache → DB keystore → USync fallback; `storeTcTokensFromIqResult` / `issuePrivacyTokens` untuk `tctoken`.
- Pairing: `requestPairingCode(phone)` masih tersedia.

## 2. A. Arsitektur & koneksi

### A1. Satu deploy, satu instance

`src/lib/wa/client-manager.ts` — **socket manager ber-state-machine** (bukan sekadar singleton):

```
stopped → starting → connecting → open
  ↑          ↓           ↓          ↓
  │        error       error      closing
  └────←────┴────←──────┴────←─────┘
states: stopped | starting | connecting | open | reconnecting | closing | logged_out | error
```

- Guard `globalThis` (dev hot-reload) — hanya mencegah duplikat per Node process.
- **Constraint deployment (wajib didokumentasikan di code)**: 1 deployment = 1 instance = 1 socket = 1 bot account. Horizontal scaling DILARANG (dua instance membaca auth state yang sama lalu login sebagai device yang sama = conflict). Distribusi socket antar instance (distributed lock) = non-goal MVP.

### A2. `ensureWaClient()` idempotent

- Jika state `starting`/`connecting`/`reconnecting` → **return startup promise yang sama** (shared promise disimpan di manager), bukan membuat socket baru.
- `ensureWaClient()` × N → tepat satu socket aktif. Verifikasi dalam tes (lihat F1).
- Jika state `open` → no-op.
- Jika `logged_out`/`error(fatal)` → return status error, TIDAK auto-recreate.

### A3. Lifecycle & reconnect policy

- Init: `makeWASocket({ auth: loadAuthState(), ... })` — auth dari Turso (section B2).
- `connection.update`:
  - `open` → state `open`, catat `lastConnectionUpdate`, `isNewLogin` → simpan creds.
  - `close` → klasifikasi `lastDisconnect.error` (matriks A4) → state machine.
- Tidak ada reconnect storm: backoff eksponensial **min 1s, max 60s, jitter ±20%**; batas upaya berurutan 10 → setelah itu tetap mencoba pada cap maksimum hanya bila penyebab temporary, dan selalu setelah state stabil (`reconnecting`, bukan loop ketat).
- Redeploy Koyeb: socket putus → saat proses baru boot, tick/route pertama memanggil `ensureWaClient()` → restore auth dari Turso → reconnect tanpa interaksi.

### A4. Matriks disconnect (deliverable: disconnect handling matrix)

| `DisconnectReason` (code) | Klasifikasi | Kebijakan |
|---|---|---|
| `connectionLost` (408) / `timedOut` (408) / `connectionClosed` (428) | temporary loss | exponential backoff + jitter → reconnect |
| `restartRequired` (515) | recreate | tutup socket lama → init ulang (auth sama) |
| `loggedOut` (401) | fatal | **stop auto-reconnect**; tandai auth invalid di DB; UI wajib pairing ulang |
| `connectionReplaced` (440) | fatal / review | stop; tandai error actionable ("sesi digantikan perangkat lain"); jangan reconnect buta |
| `badSession` (500) | fatal | tandai auth invalid; surface error actionable (pairing ulang) |
| `multideviceMismatch` (411) | fatal | log + pairing ulang |
| `forbidden` (403) | fatal | log; tidak reconnect |
| `unavailableService` (503) | transient terbatas | backoff, maks 3 upaya; setelah itu stop + log |
| tidak ada `error` di `lastDisconnect` | unknown | backoff terbatas (sama temporary), log warn |

- `loggedOut` juga menghapus/tidak memakai lagi creds tersimpan (auth invalid flag di app_config `wa_auth_invalid`).
- `connectionReplaced` tidak pernah auto-reconnect (infinite loop saat device diambil alih = bahaya).
- **Klasifikasi diimplementasikan sebagai pure function `classifyDisconnect(statusCode)`** — mudah dites; callback socket hanya memanggil classifier, logika klasifikasi TIDAK ditanam di callback.

### A5. Keepalive (peran sebenarnya)

`waKeepAlive()` dipanggil dari tick QStash existing (`POST /api/internal/reminders/process`, diproteksi signature — pola existing):

```
if state == open          → return healthy
if socket missing/dead    → ensureWaClient()
if auth invalid           → return auth-invalid (tanpa recreate)
```

- QStash = **health/recovery trigger**, BUKAN pengganti persistent socket. Tidak pernah recreate socket setiap tick.

### A6. Observability silent-session

Health module `src/lib/wa/health.ts` mencatat (in-memory, diekspos via `GET /api/wa/status`):

```
socketState | lastConnectionUpdate | lastMessageEvent | lastSendAttempt
lastSuccessfulSend | lastSuccessfulReceive | lastAuthPersistence
```

- Tujuan observability, **bukan aggressive probing — dan tanpa false alarm**: `lastMessageEvent` basi TIDAK berarti socket rusak (bot boleh saja tidak menerima pesan berjam-jam). Model status:

```
healthy | degraded | possibly_silent | disconnected | auth_invalid
```

- `possibly_silent` = state `open` + tidak ada inbound events (`lastMessageEvent`, `lastSuccessfulReceive`) > 15 menit — **bukan** `healthy=false`; UI menampilkan "Online · tidak ada pesan masuk sejak 22 menit" alih-alih "UNHEALTHY".
- `degraded` = indikator lain bermasalah (mis. `lastSendAttempt` gagal berulang, `lastConnectionUpdate` basi).
- Health = **fungsi gabungan indikator** (bukan satu pencatat waktu): `socketState | lastConnectionUpdate | lastMessageEvent | lastSendAttempt | lastSuccessfulSend | lastSuccessfulReceive | lastAuthPersistence`.
- Catatan: connection "terlihat hidup" tetapi `messages.upsert` berhenti adalah insiden yang dilaporkan di 2026 — pencatatan inilah mitigasinya.

### A7. Pairing state machine

`src/lib/wa/pairing.ts` + state dipersist di `app_config` key `wa_pairing` (survive restart):

```
pairing_not_started → pairing_code_requested → waiting_for_phone
       ↑                      ↑                        │
       │                      │                        ├─→ pairing_success (open + isNewLogin)
       └──────────────────────┴── pairing_failed ←─────┘  (expired / 408 / 401 selama menunggu)
```

- `sock.requestPairingCode(phoneBot)` **tetap dipakai** (tersedia di Baileys 7), tetapi endpoint pairing TIDAK memanggilnya tanpa state tracking.
- Jangan asumsikan kode → link pasti berhasil: kasus kode dibuat tetapi linking berakhir `408`/expired (dilaporkan 2026) → state `pairing_failed`, UI menawarkan "Minta kode baru".
- UI membedakan: `code generated` / `waiting for link` / `linked` / `failed|expired`.
- `pairing_success` dicapai saat `connection.update` memberi `isNewLogin` atau state `open` + creds tersimpan.

### A8. Runtime & version

- Semua route WA: `export const runtime = "nodejs"` (Baileys butuh Node).
- `version` WA: default Baileys 7; cek startup log untuk `405`; tanpa hardcode manual.

## 3. B. Data, auth-state storage & keamanan

### B1. Migrasi 0004 (via `npm run db:generate`)

**Tabel `wa_bindings`** (revisi: tambah identity transport):

| kolom | tipe | ket |
|---|---|---|
| id | text PK | uuid |
| userId | text FK users cascade | **UNIQUE** — 1 akun ↔ 1 nomor |
| phone | text | **UNIQUE** — verification identity, E.164 tanpa `+` (`628…`) |
| lid | text null | **UNIQUE** — transport identity (user part `@lid`) |
| jid | text null | **UNIQUE** — transport JID siap kirim (PN atau LID jid) |
| status | text default 'pending' | 'pending' \| 'active' \| 'unlinked' |
| otpCode | text null | sha256 hex |
| otpExpiresAt | integer null | ms |
| otpAttempts | integer default 0 | |
| createdAt / updatedAt | text | `strftime` default (pola repo) |

**Tabel `wa_signal_keys`** (auth-state storage):

| kolom | tipe | ket |
|---|---|---|
| type | text | namespace Baileys: `lid-mapping`, `tctoken`, `device-list`, `session-*`, `pre-key-*`, `app-state-*`, dll. |
| key | text | id dalam namespace |
| value | text | **terenkripsi** (`encryptText`), base64 JSON/Buffer |
| updatedAt | text | strftime |
| PK | | `(type, key)` |

- Backward compatibility: binding lama `userId + phone` (tanpa lid/jid) tetap valid; lid/jid diisi saat WhatsApp mengirim mapping — **tanpa migrasi destruktif**.
- DDL dev di-`mirror` ke `src/lib/db/init.ts`; migrasi Turso produksi saat deploy (pola 0003).

### B2. Auth-state storage design (deliverable: auth-state storage design)

Dua lapis, dipisah secara konseptual (BUKAN satu blob tulis-ulang):

```
WA auth state
├── creds        → 1 baris terenkripsi (app_config key `wa_creds`)
└── keys         → tabel `wa_signal_keys` (namespace, key, value terenkripsi)
    └── SignalKeyStore adapter: get(type, ids) / set(data) / transaction()
```

- `src/lib/wa/session-store.ts` mengimplementasikan interface `SignalKeyStore` di atas Turso (via drizzle):
  - `get(type, ids)` → batch SELECT `WHERE type=? AND key IN (...)`, decrypt, return `{ [id]: value }` (value hilang = tidak ada).
  - `set(data)` → upsert per `(type, key)`; `value === null` → **DELETE** (semantik Baileys).
  - `transaction(fn, type)` → pola transaksi keystore (dipakai `lid-mapping`).
- **Kedua sumber perubahan ditangani**: `creds.update` event → simpan creds; `keys.set/get` dipanggil Baileys sendiri kapan saja (lid-mapping, tctoken, device-list, dsb.) — tidak ada asumsi "creds.update satu-satunya event persistence".
- Semua data auth **encrypted at rest** (AES-256-GCM, kunci dari SESSION_SECRET — `crypto/at-rest.ts`), termasuk setiap nilai keystore.
- Acceptance test storage (F1): save/load creds; save/load key; update key → load updated; delete key → absent; "restart" (buat instance baru dari store yang sama) → restore → connect sukses.

### B3. Alur hubungkan (web-first OTP) — revisi

1. Pengaturan → "Hubungkan WhatsApp" → masukkan nomor (`08xx` / `628xx`) → `POST /api/wa/otp/request`
   - Guard: maks 5 request / 10 menit per user **dan** per nomor — pola `auth_rate_limits` existing.
   - **OTP baru membatalkan OTP sebelumnya** (overwrite `otpCode`/`otpExpiresAt`, reset `otpAttempts=0`).
   - Bot kirim kode 6 digit ke nomor tersebut (melalui `resolveWhatsAppTarget`-able binding pending? Tidak — kirim ke raw phone + lid/jid kosong; outbound langsung ke `${phone}@s.whatsapp.net`).
2. User masukkan kode di web → `POST /api/wa/otp/verify`
   - `sha256(input) === otpCode` && `now < otpExpiresAt` (10 menit) && `otpAttempts < 3` → status `'active'`; **reset `otpCode=null, otpExpiresAt=null, otpAttempts=0`**.
   - Salah kode → `otpAttempts += 1`; 3× gagal → harus request ulang.
3. Nomor yang sudah terikat akun lain ditolak (UNIQUE phone); akun yang sudah punya binding aktif ditolak (UNIQUE userId) kecuali `!putuskan` dulu.
4. Setelah binding aktif, saat WhatsApp mengirim identity mapping (PN/LID) untuk nomor itu → **backfill** `lid`/`jid` di binding (non-destruktif).

### B4. Guard bot (message pipeline)

- Event validation (lihat C1): hanya `messages.upsert` type `notify`; group/status/broadcast/newsletter/system non-user diabaikan.
- Sender belum terhubung: balas panduan hubungkan — **maks 1 balasan per sender per jam**.
- Rate limit per sender (20 pesan/menit): **key dari resolved identity** — prioritas ForFH `userId` bila ter-resolve; fallback JID/LID stabil (bukan substring phone).
- AI: bebas kuota 30/jam (keputusan user), interval 5 detik antar pesan AI per sender, cap input 500 char.
- **Keamanan event**: tidak memproses event blind; jangan menonaktifkan security safeguard Baileys; tidak menambahkan custom workaround yang menurunkan keamanan; versi dependency dijamin patched (rc14).

### B5. Lingkup data

Bot hanya membaca **data user sendiri** dari DB ForFH. Tidak pernah memanggil Kampus Kita/HE-BAT. Identity = resolved (PN/LID) dari pengirim yang sudah diverifikasi OTP.

## 4. C. Message pipeline & identity resolver (deliverable: identity resolver design)

### C1. Pipeline (revisi)

```
messages.upsert
 → validate event (type notify, bukan group/broadcast/status/newsletter/system)
 → extract message identity (WAMessageKey: remoteJid, participant, *Alt, *Username, addressingMode)
 → resolveWhatsAppIdentity(msg)          → { userId | null, identity { lid?, phone?, jid? } }
 → resolve ForFH user (userId) atau status belum-terhubung
 → router:
     prefix "!"   → parse command → executor (query DB) → formatter → send
     tanpa prefix → AI path (data ringkas user) → send
     sender belum terhubung → panduan (maks 1/jam)
```

- JANGAN mengasumsikan semua identity berupa `628...@s.whatsapp.net`. Semua konversi lewat resolver.

### C2. `resolveWhatsAppIdentity(message)` — `src/lib/wa/identity.ts`

1. Kumpulkan kandidat JID dari `key.remoteJid` (1:1 = sender), `key.participant`, `key.remoteJidAlt`, `key.participantAlt`, `key.remoteJidUsername`/`participantUsername` (prefix yang memadai) — dedupe, urutkan: explicit participant > remoteJid > alternates.
2. Untuk tiap kandidat:
   - `isLidUser(jid)` → coba `getPNForLID(lid)` (mapping internal Baileys: cache → `wa_signal_keys['lid-mapping']` → USync fallback). Dapat PN → lanjut lookup; tidak → simpan sebagai identitas lid saja.
   - `isPnUser(jid)` → phone = `jidDecode(jid).user`.
3. Lookup binding: `lid = <user part>` OR `jid = normalized` OR `phone = phone` (prioritas lid → jid → phone).
4. Kembalikan `{ userId?, identity }`; bila cocok via lid/jid dan `binding.lid/jid` kosong → backfill (non-destruktif).
5. Tidak cocok → `userId = null` → jalur panduan.

- Mapping LID persist otomatis oleh keystore Baileys (`lid-mapping` + `_reverse` di `wa_signal_keys`) — jangan buat mapping LID kustom yang konflik dengan internal Baileys. Application layer hanya menjawab: *given WhatsApp identity → which ForFH user?*

### C3. Perintah MVP (`src/lib/wa/commands.ts` — pure)

| Perintah | Aksi |
|---|---|
| `!hubungkan` | panduan cara link akun |
| `!jadwal [hari ini\|besok\|minggu ini\|senin..minggu]` | default hari ini |
| `!tugas [n]` | default 5 tugas terdekat, bernomor urut `[1]..[n]` |
| `!selesai <nomor>` | toggle tugas done — nomor = urutan output `!tugas` |
| `!nilai` | ringkasan nilai per mata kuliah |
| `!insight` | daily insight (reuse cache AI 24 jam) |
| `!help` / `!menu` | daftar lengkap / ringkas |
| `!putuskan` | unlink (konfirmasi sekali) |
| tidak dikenal | `!help` singkat |

### C4. Format output (`src/lib/wa/format.ts` — pure)

Pola konsisten semua balasan — header emoji + bold, divider, baris rapi:

```
📅 *JADWAL HARI INI — Kamis, 13 Agustus*
──────────────────────
🕐 08:00–09:40 · Hukum Pidana
   Ruang A-203
──────────────────────
3 kelas · ketik !jadwal besok utk besok
```

- ≤ ~3500 char (application UX/safety limit — keputusan aplikasi, bukan hard limit WhatsApp); lebih → ringkas + "…ketik !x utk lengkap".
- Waktu lokal **Asia/Jakarta** (pola daily-insight).
- `!tugas` menyertakan status ✅/⏳ + tenggat; `!nilai` per MK.

### C5. AI natural language (`src/lib/wa/ai.ts`)

- Pesan tanpa `!` → `executeAIRequest` (router AI existing: deadline 35s, fallback berantai) **tanpa** `checkRateLimit('ai', ...)`.
- Prompt: data ringkas user (jadwal minggu ini, 5 tugas terdekat, ringkasan nilai) + instruksi jawab singkat Bahasa Indonesia.
- Keluaran = balasan langsung (teks polos, emoji/bold WA).
- `aiEnabled` mati → graceful: "AI nonaktif — ketik !help untuk perintah."

## 5. D. Notifikasi (channel switching) — revisi

### D1. Worker (`src/lib/notifications/worker.ts`)

Ganti pemanggil `sendPushToUser` (blok class & task) dengan `sendReminder(userId, payload)`:

1. `findFirst` `wa_bindings` status active → **`resolveWhatsAppTarget(binding)`** → `WaClientManager.sendText(target, text)`.
2. Gagal (socket tidak siap setelah retry singkat / queue drop) → **caller menerima failure** → fallback web push bila ada subscription → record `notificationDeliveries` `channel: 'whatsapp'` | `'web_push'`.
3. Tidak ada binding → web push seperti sekarang.
4. Dedupe key existing (`entityId|occurrenceAt|offset`) tidak berubah.

### D2. `resolveWhatsAppTarget(binding)` — `src/lib/wa/identity.ts`

Pilih identity outbound valid. **Prinsip: prefer LID sebagai transport identity — jangan pernah otomatis mengembalikan LID → PN hanya karena PN tersedia, dan JANGAN PERNAH membuat `${lid}@s.whatsapp.net`** (`@lid` dan `@s.whatsapp.net` adalah dua identity berbeda; upstream mendorong migrasi aplikasi ke LID, bukan memaksa LID kembali ke PN).

1. `binding.jid` valid → gunakan apa adanya (transport jid tersimpan — PN atau LID).
2. `binding.lid` tersedia → target LID: `${lid}@lid`, atau API internal Baileys yang sesuai bila diperlukan untuk menghasilkan target LID valid (migration guide: `sock.signalRepository.lidMapping` — `getLIDForPN`, `getPNForLID`, `storeLIDPNMappings`).
3. Hanya `phone` tersedia → `${phone}@s.whatsapp.net` sebagai **fallback** untuk binding yang belum memiliki transport identity.

`phone` TETAP dipertahankan sebagai verification/UI identity; application layer hanya menjawab *ForFH user ↔ WhatsApp target* — bukan implementasi kedua dari LID protocol.

### D3. Format notif WA

```
⏰ *Kuliah 30 menit lagi*
Hukum Pidana · Ruang A-203 · 08:00
```

### D4. Queue (semantics revisi)

- In-memory queue maks 50, FIFO — hanya menampung pesan selama **short reconnect**.
- Socket gagal lama → **drop pesan, caller menerima failure** (bukan delivery terjamin) → notification worker melakukan fallback web push.
- Tidak pernah mengandalkan in-memory queue untuk guaranteed delivery.

## 6. E. UI & setup — revisi (pairing states + status bot)

### E1. `src/components/wa/WhatsAppCard.tsx` (client) — Pengaturan

- Status bot: dari state machine — `offline (stopped)` / `menghubungkan…` / `online` / `reconnecting…` / `logged_out (butuh pairing ulang)` / `error (aksi yang jelas)`.
- Pairing (hanya pemilik `WA_ADMIN_PHONE` & bot belum online): tombol "Tampilkan kode" → status: `code generated` → `waiting for link` → `linked` / `failed|expired` (tombol "Minta kode baru").
- Status binding user: `628xxx****xx` / belum; form hubungkan (input nomor → OTP → kode → verifikasi); tombol putuskan (konfirmasi).

### E2. Route API (semua `runtime = "nodejs"`, semua butuh sesi — pola `getSessionUser`)

| Route | Aksi |
|---|---|
| `GET /api/wa/status` | `{ socketState, botConnected, botPhone?, health (observability fields), myPhone?, myStatus? }` |
| `POST /api/wa/otp/request` | `{ phone }` — guard rate limit; OTP baru invalidasi lama; kirim via bot |
| `POST /api/wa/otp/verify` | `{ phone, otp }` — bind; reset fields |
| `POST /api/wa/unlink` | putuskan binding user |
| `GET /api/wa/pairing` | pemilik; request kode + state tracking (pairing state machine A7) |

## 7. F. Testing & risiko (deliverable: testing matrix)

### F1. Kelompok tes baru — `src/tests/wa.test.ts` (Baileys di-mock; tanpa jaringan eksternal)

**Auth state (storage adapter)** — memakai libsql `:memory:` (via drizzle, inisialisasi schema di tes — pola baru, aman; tanpa menyentuh DB dev/produksi):

- save creds → load creds (round-trip terenkripsi)
- save key → load key (per namespace)
- update existing key → load updated
- delete key (`null`) → load → absent
- "restart" = instance store baru dari data yang sama → restore → data utuh
- persist `lid-mapping` (termasuk `_reverse`) & `tctoken` namespace

**Socket manager** (Baileys di-mock):

- `ensureWaClient()` idempoten: 3× panggilan berurutan + panggilan saat `starting`/`connecting` → tepat 1 socket (shared startup promise)
- connect → open; disconnect temporary → reconnect (backoff); loggedOut → stop, auth invalid; connectionReplaced → stop, tidak reconnect; restartRequired → recreate
- `waKeepAlive()`: open → healthy; dead → ensure; auth-invalid → auth-invalid (tanpa recreate)
- `classifyDisconnect(statusCode)` pure: semua nilai enum → klasifikasi benar (temporary/restart/loggedOut/replaced/badSession/mismatch/forbidden/unavailable/unknown)

**Identity resolver** (pure):

- PN identity → userId; LID identity → userId (via mapping); alternate identity; unknown → null; mapping refresh; restart preserves mapping (keystore round-trip)
- `resolveWhatsAppTarget(binding)`: jid prioritas dipakai apa adanya; lid → `${lid}@lid` (TANPA `${lid}@s.whatsapp.net`); hanya phone → `${phone}@s.whatsapp.net` fallback

**Health model** (pure):

- state `open` + lastMessageEvent basi > 15 menit → `possibly_silent`, BUKAN unhealthy; indikator lain gagal → `degraded`; kombinasi indikator → health yang tepat

**Messaging** (pure, event mock):

- incoming text (bound sender) → routed; unknown sender → panduan; group diabaikan; broadcast/status diabaikan; system message diabaikan

**Security**:

- malformed/untrusted events (fake `messages.upsert`, identity asing) tidak lolos ke identity check aplikasi (tetap null / panduan); tidak bypass rate limit

**Pairing** (state machine pure):

- request code → waiting → success (isNewLogin); expired → failed → re-request; 408 selama menunggu → failed

**Notification** (pure):

- decision: WA binding active → wa; WA gagal → push fallback; tanpa binding → push; no duplicate delivery (dedupe key tetap)

### F2. Acceptance test wajib (sebelum dianggap selesai)

```
1. Fresh pairing (pairing state machine, kode → linked)
2. OTP bind account
3. Incoming message via PN
4. Incoming message via LID (bila applicable di WA)
5. Command response
6. AI response
7. Notification delivery
8. Disconnect (simulasi jaringan)
9. Automatic reconnect
10. Process restart (restart app; bukan restart bot manual)
11. Restore auth state (tanpa scan ulang)
12. Send message after restart
13. Receive message after restart
14. Unlink
15. Re-pair
```

Plus: `npm run quality` (176 + baru hijau) dan `npm run build` sukses.

### F3. Verifikasi penuh

- `npm run quality` — 176 tes tetap hijau + kelompok F1.
- `npm run build` — sukses, standalone OK.
- `npm ls @whiskeysockets/baileys` → satu versi rc14, tanpa transitive duplicate.
- E2E manual (WebBridge bila perlu): checklist F2.

### F4. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Nomor bot kena pembatasan WhatsApp (library tidak resmi) | Nomor khusus bot; fallback: pairing ulang / ganti nomor / upgrade Cloud API |
| Socket putus saat Koyeb redeploy | Auto-reconnect (matriks A4) + auth di Turso → tanpa scan ulang; keepalive QStash sebagai health trigger |
| Sesi "terlihat hidup" tapi pesan berhenti (silent-session 2026) | Observability A6: lastMessageEvent dll. + status UI |
| Pairing code gagal walau kode dibuat (regression 2026, `408`) | Pairing state machine A7 + tombol "Minta kode baru" |
| Dua instance baca auth state sama | Constraint A1: horizontal scaling dilarang; didokumentasikan di code |
| AI natural language disalahgunakan | Interval 5 detik/pengirim, rate limit 20/menit, hanya nomor terhubung |
| Pesan asing jadi spam target | 1 balasan/jam per sender belum terhubung |
| Turso hot path | Keystore batch get/set (bukan per-char); creds update jarang |

## 8. Daftar file yang diubah/dibuat (deliverable: file list)

**Baru:**
- `src/lib/wa/client-manager.ts` — state machine socket + `ensureWaClient()` + disconnect matrix + reconnect policy (A1–A4)
- `src/lib/wa/session-store.ts` — `SignalKeyStore` adapter Turso (`get`/`set`/`transaction`) + creds load/save terenkripsi (B2)
- `src/lib/wa/identity.ts` — `resolveWhatsAppIdentity(msg)` + `resolveWhatsAppTarget(binding)` + wrapper PN/LID/JID (C2, D2)
- `src/lib/wa/pairing.ts` — pairing state machine (A7)
- `src/lib/wa/health.ts` — observability silent-session (A6)
- `src/lib/wa/send.ts` — `WaClientManager.isReady()/sendText()` abstraction + queue (D4)
- `src/lib/wa/normalize.ts` — normalize phone (verification identity)
- `src/lib/wa/format.ts` — formatter balasan (C4)
- `src/lib/wa/commands.ts` — parser `!` + dispatcher (C3)
- `src/lib/wa/rate-limit.ts` — rate limit per resolved identity (B4)
- `src/lib/wa/ai.ts` — natural language path (C5)
- `src/lib/wa/executors/` — jadwal.ts, tugas.ts, selesai.ts, nilai.ts, insight.ts (query DB)
- `src/app/api/wa/status/route.ts`, `otp/request/route.ts`, `otp/verify/route.ts`, `unlink/route.ts`, `pairing/route.ts` (E2)
- `src/components/wa/WhatsAppCard.tsx` (E1)
- `src/tests/wa.test.ts` (F1)

**Diubah:**
- `package.json` — `@whiskeysockets/baileys@7.0.0-rc14` (pin exact)
- `src/lib/db/schema.ts` + `drizzle` migrasi 0004 + `src/lib/db/init.ts` — `wa_bindings` + `wa_signal_keys` (B1)
- `src/lib/notifications/worker.ts` — `sendReminder` channel routing (D1)
- `src/app/api/internal/reminders/process/route.ts` — panggil `waKeepAlive()` (A5)
- `src/app/pengaturan/page.tsx` — pasang `WhatsAppCard`
- `src/tests/run-tests.ts` — registrasi `runWaTests`
- `docs/BUILD_STATUS.md` — catatan versi Baileys + fitur (version gate acceptance)

## 9. Verifikasi (checklist akhir)

1. Migrasi 0004 applied lokal + Turso produksi (saat deploy).
2. `npm ls @whiskeysockets/baileys` → rc14 tunggal; BUILD_STATUS mencatat versi.
3. Pairing: state `code generated → waiting → linked`; gagal/expired → tombol baru.
4. Binding: OTP terkirim, verify sukses; salah 3× ditolak; OTP expired ditolak; OTP baru invalidasi lama; setelah verify fields di-reset.
5. Perintah: semua `!command` benar; unknown → `!help`; natural language → AI; `aiEnabled` off → graceful.
6. Notif: user terhubung WA terima di WA (tanpa dobel); WA gagal → web push; tanpa binding → web push.
7. Grup & pesan non-user diabaikan; nomor asing dapat panduan (maks 1/jam).
8. Redeploy/restart → reconnect tanpa scan; `GET /api/wa/status` menampilkan health fields.
9. Disconnect matrix: simulasikan temporary (reconnect), loggedOut (stop + pairing ulang).
10. `npm run quality` hijau + `npm run build` sukses + acceptance 15 item (F2) lolos.

## 10. Urutan implementasi (commit per langkah)

1. Deps (pin rc14) + migrasi 0004 (`wa_bindings` + `wa_signal_keys`) + init.ts.
2. `session-store.ts` (SignalKeyStore adapter + creds) — dengan tes auth-state (F1).
3. `client-manager.ts` (state machine, disconnect matrix, ensureWaClient) + `waKeepAlive` di tick QStash — dengan tes socket (mock).
4. `identity.ts` (resolver PN/LID) + `normalize.ts` + `format.ts` + `commands.ts` + `rate-limit.ts` — tes pure.
5. Executors (jadwal/tugas/selesai/nilai/insight) + `ai.ts` + `send.ts`.
6. Worker routing notif (D1-D2) — tes decision pure.
7. Route API WA (E2) + `pairing.ts` + `health.ts` + `WhatsAppCard` (E1).
8. Kelompok tes lengkap F1 + acceptance F2 + `npm run quality` + `npm run build`.
9. Review mandiri → serahkan ke user.

## 11. Catatan compatibility Baileys 7.x (deliverable: compatibility notes)

- Auth: `{ creds, keys }` dengan `SignalKeyStore` adapter Turso — mendukung semua namespace (terverifikasi: `lid-mapping`, `tctoken`, `device-list`; sisanya generik).
- Identity: PN (`@s.whatsapp.net`) vs LID (`@lid`) dibedakan via `isPnUser`/`isLidUser`; mapping dipelihara internal Baileys di keystore `lid-mapping` — application layer hanya resolver.
- `DisconnectReason` enum & `connection.update` sesuai Baileys 7 (nilai numerik terverifikasi).
- `requestPairingCode` tersedia; dipakai dengan state machine (regression 408/expired diakui).
- `version` WA: default library; tanpa hardcode manual.
- Batas: 1 instance/1 socket; scaling memerlukan redesign distributed (non-goal MVP).

## 12. Hal yang TIDAK BOLEH diubah (keputusan produk tetap)

- satu nomor bot · web-first OTP · user binding · `!command` deterministic path · natural-language AI path · notification channel switching · web push fallback · group ignored untuk MVP · akun ForFH tetap via email kampus · tidak ada CRUD penuh via WhatsApp · tidak ada deployment terpisah untuk MVP

## Prasyarat

- PR #3 (perf overhaul) sudah di-merge ke master (`4c46f2b`) ✓ — `ai_cache`, router deadline 35s, `mapLimit`, mem-cache tersedia.
- Env baru saat deploy: `WA_ADMIN_PHONE` (pemilik, E.164) dan `WA_BOT_PHONE` (nomor bot, E.164 — dipakai `requestPairingCode`).
- QStash tick existing (`internal/reminders/process`) sudah berjalan — keepalive bot ditumpang di sana.
- Baileys `7.0.0-rc14` (latest npm per 2026-08-13; ≥ rc12 patch CVE-2026-48063).
