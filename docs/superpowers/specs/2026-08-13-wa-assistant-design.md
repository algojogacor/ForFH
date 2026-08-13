# ForFH: Asisten WhatsApp (Baileys) — bot, notifikasi, dan binding multi-user

Tanggal: 2026-08-13 · Branch: `feat/wa-assistant` · Status: **Disetujui user**

## Context

- Web push sudah ada, tetapi banyak notif tidak sampai karena browser tidak terbuka.
- Web app berat dibuka dari HP saat sinyal lemah; chat WhatsApp teks jauh lebih ringan.
- User menyiapkan **nomor khusus bot** (terpisah dari nomor pribadi) dan ingin multi-user: satu nomor bot sentral, semua pengguna ForFH bisa menghubungkan nomor WA mereka ke akun.
- Keputusan channel (disetujui user): **Baileys** (`@whiskeysockets/baileys`, protokol WhatsApp Web), dijalankan **di deploy yang sama** dengan web — tanpa proses/deploy terpisah.

## Tujuan (success criteria)

1. Bot WA berjalan di deploy yang sama dengan web, online 24/7 dengan auto-reconnect **tanpa scan QR ulang** (kredensial sesi persist di Turso terenkripsi).
2. Binding multi-user: nomor WA → akun ForFH via OTP **web-first** (masukkan nomor di Pengaturan → bot kirim kode → verifikasi di web).
3. Asisten chat: perintah `!` (deterministik, instan) + bahasa natural via AI (bebas kuota 30/jam, dengan guard interval 5 detik per pengirim).
4. Notifikasi reminder (kuliah + deadline tugas) **menggantikan web push** bagi user yang sudah terhubung WA; web push tetap untuk yang belum.
5. Semua tes hijau (176 + baru), build OK; migrasi 0004 additive — data existing tidak berubah.

## Non-goals (tidak diimplementasi, dengan alasan)

- CRUD penuh web di chat (catatan markdown, file, eksplorasi perundang-undangan) — tetap di web; UX chat tidak cocok.
- Pesan grup — diabaikan di MVP (dokumentasikan sebagai batasan).
- Pembuatan akun ForFH via WA — tetap via login email kampus.
- Proses/deploy terpisah untuk bot (opsi C) — ditunda sampai benar-benar dibutuhkan.
- WhatsApp Cloud API — kandidat fallback bila nomor bot kena pembatasan atau bot tumbuh besar.

## A. Arsitektur & koneksi

### A1. Satu deploy, singleton

`src/lib/wa/client.ts` — singleton (guard `globalThis` untuk dev hot-reload):
`makeWASocket({ auth, syncFullHistory: false, ... })`. Versi baileys stabil terbaru diverifikasi saat implementasi (context7). Socket berjalan di proses Node yang sama dengan web.

### A2. Lifecycle

- `ensureWaClient()` — panggil dari: tick QStash existing (`POST /api/internal/reminders/process`), route API WA (`/api/wa/*`), dan event internal. Tidak ada cron baru.
- Socket dipertahankan hidup 24/7; `connection.update` → reconnect dengan backoff eksponensial (max ~5 menit), hingga terkoneksi.
- Redeploy/restart Koyeb: socket putus → saat proses baru boot dan tick/route pertama masuk, `ensureWaClient()` restore creds dari Turso → reconnect tanpa interaksi.

### A3. Persist kredensial sesi

`src/lib/wa/session-store.ts`:
- Creds + keys (SignalKeyStore) diserialisasi (pola `BufferJSON` Baileys) → `encryptText` (at-rest.ts, kunci dari SESSION_SECRET) → `app_config` key `wa_creds`.
- Restore sebelum connect; simpan saat `creds.update` event (jarang, bukan per pesan).
- Jika `wa_creds` kosong → bot belum pairing → UI menampilkan kode pairing (A5).

### A4. Keepalive & health

Tambahkan ke `POST /api/internal/reminders/process` (di samping `processDueReminders`/`syncDueUsers`/`cleanupOldUsage`, diproteksi QStash signature — pola yang sudah ada):
`await waKeepAlive()` — jika socket tidak aktif → `ensureWaClient()`; selalu return status ringkas. Tanpa jadwal QStash baru.

### A5. Pairing nomor bot (sekali, oleh pemilik)

- Sebelum bot connect, `sock.requestPairingCode(phoneBot)` (dari env `WA_BOT_PHONE`) → kode 8 digit (berlaku beberapa menit, regenerate per permintaan).
- Flow: Pengaturan (pemilik) → tombol "Tampilkan kode" → HP dengan nomor bot: WhatsApp → Perangkat tertaut → Hubungkan perangkat → **"Tautkan dengan nomor telepon saja"** → masukkan kode.
- Identitas pemilik: `WA_ADMIN_PHONE` env; hanya user yang nomor WA-nya terhubung == `WA_ADMIN_PHONE` yang bisa melihat kode.
- **Urutan wajib: pairing dulu → baru binding.** OTP dikirim via bot, jadi bot harus online (pairing selesai) sebelum siapa pun — termasuk pemilik — bisa menghubungkan akun. Tidak ada jalur bind tanpa bot online.
- Setelah connect, `creds.update` tersimpan → scan ulang tidak pernah dibutuhkan lagi.

### A6. Runtime

Semua route WA (`/api/wa/*`, `/api/internal/wa/*`): `export const runtime = "nodejs"` — Baileys butuh Node (kriptografi libsignal).

## B. Data & keamanan

### B1. Migrasi 0004 (via `npm run db:generate`, bukan tulis manual)

Tabel `wa_bindings`:

| kolom | tipe | ket |
|---|---|---|
| id | text PK | uuid |
| userId | text FK users cascade | **UNIQUE** — 1 akun ↔ 1 nomor |
| phone | text | **UNIQUE** — 1 nomor ↔ 1 akun; format E.164 tanpa `+` (`628…`) |
| status | text default 'pending' | 'pending' \| 'active' \| 'unlinked' |
| otpCode | text null | sha256 hex |
| otpExpiresAt | integer null | ms |
| otpAttempts | integer default 0 | |
| createdAt / updatedAt | text | `strftime` default (pola repo) |

DDL dev di-`mirror` ke `src/lib/db/init.ts`; migrasi Turso produksi dijalankan saat deploy (pola 0003).

### B2. Enkripsi

Kredensial sesi bot (`app_config.wa_creds`) dienkripsi `encryptText` (AES-256-GCM, kunci HKDF dari SESSION_SECRET — `crypto/at-rest.ts`). Tidak pernah plaintext. OTP disimpan **hash sha256**, bukan plaintext.

### B3. Alur hubungkan (web-first OTP)

1. Pengaturan → "Hubungkan WhatsApp" → masukkan nomor (`08xx` / `628xx`) → `POST /api/wa/otp/request`
   - Guard: maks 5 request / 10 menit per user **dan** per nomor — pakai pola tabel `auth_rate_limits` yang dipakai route login existing.
   - Bot kirim kode 6 digit ke nomor tersebut.
2. User masukkan kode di web → `POST /api/wa/otp/verify`
   - `sha256(input) === otpCode` && `now < otpExpiresAt` (10 menit) && `otpAttempts < 3` → status 'active', `otpCode=null`.
   - Salah kode → `otpAttempts += 1`; 3× gagal → harus request ulang.
3. Nomor yang sudah terikat akun lain ditolak (UNIQUE phone); akun yang sudah punya binding aktif ditolak (UNIQUE userId) kecuali `!putuskan` dulu.

### B4. Guard bot (message pipeline)

- Hanya `messages.upsert` tipe `notify`; pesan non-user (status/broadcast) dan pesan grup diabaikan.
- Sender belum terhubung (nomor tidak ada di `wa_bindings` status active): balas panduan hubungkan — **maks 1 balasan per sender per jam** (hindari jadi target spam).
- Rate limit per sender: 20 pesan/menit (in-memory Map, pola mem-cache) → balasan "santai dulu, coba lagi sebentar".
- AI natural language: **bebas kuota 30/jam** (keputusan user), tetapi interval 5 detik antar pesan AI per sender + cap panjang input (mis. 500 char).

### B5. Lingkup data

Bot hanya membaca **data user sendiri** dari DB ForFH (tabel tersinkron). Tidak pernah memanggil Kampus Kita/HE-BAT. Identitas = nomor pengirim yang sudah diverifikasi OTP.

## C. Alur pesan & perintah

### C1. Pipeline

```
messages.upsert (notify)
 → normalisasi jid sender (phone)
 → lookup wa_bindings (phone → userId)
 → router:
     prefix "!"   → parse command → executor (query DB) → formatter → send
     tanpa prefix → AI path (data ringkas user) → send
     sender belum terhubung → panduan hubungkan
```

### C2. Perintah MVP (`src/lib/wa/commands.ts` — pure, tanpa DB)

| Perintah | Aksi |
|---|---|
| `!hubungkan` | panduan cara link akun |
| `!jadwal [hari ini\|besok\|minggu ini\|senin..minggu]` | default hari ini |
| `!tugas [n]` | default 5 tugas terdekat, bernomor urut `[1]..[n]` |
| `!selesai <nomor>` | toggle tugas done — nomor = urutan dari output `!tugas` (bukan UUID) |
| `!nilai` | ringkasan nilai per mata kuliah |
| `!insight` | daily insight (reuse cache AI 24 jam — tanpa AI call baru bila cache ada) |
| `!help` | daftar lengkap + contoh |
| `!menu` | daftar ringkas |
| `!putuskan` | unlink (konfirmasi sekali) |
| tidak dikenal | `!help` singkat |

### C3. Format output (`src/lib/wa/format.ts` — pure)

Pola konsisten semua balasan — header emoji + bold, divider, baris rapi, mudah dipindai:

```
📅 *JADWAL HARI INI — Kamis, 13 Agustus*
──────────────────────
🕐 08:00–09:40 · Hukum Pidana
   Ruang A-203
──────────────────────
3 kelas · ketik !jadwal besok utk besok
```

- Balasan ≤ ~3500 char (batas WA); lebih → ringkas + "…ketik !x utk lengkap".
- Waktu lokal **Asia/Jakarta** (pola daily-insight existing).
- `!tugas` menyertakan status ✅/⏳ + tenggat; `!nilai` per MK (kode, nama, nilai, SKS).

### C4. AI natural language (`src/lib/wa/ai.ts`)

- Pesan tanpa `!` → reuse `executeAIRequest` (router AI existing: deadline 35s, fallback berantai) **tanpa** `checkRateLimit('ai', ...)`.
- Prompt berisi data ringkas user (jadwal minggu ini, 5 tugas terdekat, ringkasan nilai) + instruksi menjawab singkat dalam Bahasa Indonesia.
- Keluaran AI = balasan langsung (teks polos, boleh emoji/bold WA).
- `aiEnabled` mati di Pengaturan → jawab graceful: "AI nonaktif — ketik !help untuk perintah."

## D. Notifikasi (channel switching)

### D1. Worker (`src/lib/notifications/worker.ts`)

Ganti pemanggil `sendPushToUser` di kedua blok (class & task) dengan `sendReminder(userId, payload)`:

1. `findFirst` `wa_bindings` status active → `sendWaText(phone, text)`.
   - Socket tidak siap → retry 2× singkat → tetap gagal → **fallback web push** bila ada subscription.
   - Sukses → record `notificationDeliveries` `channel: 'whatsapp'`; fallback → `'web_push'`.
2. Tidak ada binding → web push seperti sekarang.
3. Dedupe key existing (`entityId|occurrenceAt|offset`) tidak berubah — tetap mencegah dobel.

### D2. Format notif WA

Singkat & actionable, dari title/body worker existing yang dirapikan:

```
⏰ *Kuliah 30 menit lagi*
Hukum Pidana · Ruang A-203 · 08:00
```

### D3. `src/lib/wa/send.ts`

`sendWaText(phone, text)`:
- jid = `<phone>@s.whatsapp.net`; socket ready check (`ws.readyState` / `connection.readyState === 'open'`).
- Antrean in-memory kecil (maks ~50 pesan) — saat socket reconnect, antrean terkirim berurutan; penuh → drop + log (web push fallback ditangani pemanggil).

## E. UI & setup

### E1. `src/components/wa/WhatsAppCard.tsx` (client) — dipasang di Pengaturan

- Status bot: terhubung ke nomor bot / belum pairing (arahkan ke tombol pairing) / offline.
- Status binding user: terhubung ke `628xxx****xx` / belum.
- Form hubungkan: input nomor → kirim OTP → input kode → verifikasi; tombol putuskan (konfirmasi).
- Section pairing (hanya pemilik `WA_ADMIN_PHONE` & bot belum connect): tombol "Tampilkan kode" → kode 8 digit + langkah-langkah.

### E2. Route API (semua `runtime = "nodejs"`, semua butuh sesi login — pola `getSessionUser`)

| Route | Aksi |
|---|---|
| `GET /api/wa/status` | `{ botConnected, botPhone?, myPhone?, myStatus? }` |
| `POST /api/wa/otp/request` | `{ phone }` — guard rate limit, kirim OTP via bot |
| `POST /api/wa/otp/verify` | `{ phone, otp }` — bind akun |
| `POST /api/wa/unlink` | putuskan binding user |
| `GET /api/wa/pairing` | pemilik; kode pairing baru per panggilan (Baileys expire ~menit) |

## F. Testing & risiko

### F1. Unit (`src/tests/wa.test.ts` — pure, tanpa jaringan/DB, Baileys di-mock)

- `normalizePhone`: `08xx` → `628xx`, strip spasi/`+`/dash, input invalid → null.
- `parseCommand`: `!jadwal`, `!jadwal besok`, `!selesai 3`, `!help`, unknown → intent benar.
- Formatter `jadwal`/`tugas`/`nilai`: input contoh → output memenuhi pola (header, divider, urutan).
- OTP helper pure `verifyOtp(code, storedHash, expiresAt, attempts)`: cocok/expired/over-attempt.
- Channel decision `chooseChannel(binding, hasPushSub)`: wa / push / fallback.

### F2. Verifikasi penuh

- `npm run quality` — 176 tes tetap hijau + tes baru.
- `npm run build` — sukses, standalone OK.
- E2E manual (dev, WebBridge bila perlu): pairing → hubungkan akun sendiri → semua perintah → AI natural language → notif saat offset tercapai → putuskan.

### F3. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Nomor bot kena pembatasan WhatsApp (library tidak resmi) | Nomor khusus bot (dampak terbatas); fallback: scan ulang / ganti nomor / upgrade ke WhatsApp Cloud API |
| Socket putus saat Koyeb redeploy/restart | Auto-reconnect + creds di Turso → tanpa scan ulang; keepalive QStash ≤ 5 menit |
| AI natural language disalahgunakan (bebas kuota) | Interval 5 detik/pengirim, rate limit 20 pesan/menit, hanya untuk nomor terhubung |
| Pesan asing jadi spam target | 1 balasan/jam per sender belum terhubung |
| Turso jadi hot path | Creds update jarang (bukan per pesan); binding lookup 1 query/pesan — fine |

## Verifikasi (checklist akhir)

1. Migrasi 0004 applied di DB lokal + Turso produksi (saat deploy).
2. Pairing: kode tampil di Pengaturan (pemilik saja), link sukses dari HP, `botConnected: true`.
3. Binding: OTP terkirim ke nomor, verify sukses; kode salah 3× ditolak; OTP expired ditolak.
4. Perintah: semua `!command` benar; unknown → `!help`; natural language → AI jawab; `aiEnabled` off → graceful.
5. Notif: user terhubung WA menerima di WA (tanpa web push dobel); user tanpa binding tetap web push.
6. Grup & pesan non-user diabaikan; nomor asing dapat panduan (maks 1/jam).
7. Redeploy → reconnect otomatis tanpa scan (cek status + log).
8. `npm run quality` hijau + `npm run build` sukses.

## Urutan implementasi (commit per langkah)

1. Migrasi 0004 (`wa_bindings`) + init.ts + deps Baileys + `session-store.ts`.
2. `client.ts` lifecycle (connect/reconnect/persist/events) + `waKeepAlive` di tick QStash existing.
3. Pure: `normalize.ts`, `format.ts`, `commands.ts` (parser), `rate-limit.ts`.
4. Executors: `jadwal`, `tugas`, `selesai`, `nilai`, `insight`.
5. AI path (`ai.ts`) + `send.ts`.
6. Worker routing notif (D1-D2).
7. Route API WA (E2) + `WhatsAppCard` UI (E1).
8. Tes `wa.test.ts` + `npm run quality` + `npm run build`.
9. Review mandiri → serahkan ke user.

## Prasyarat

- PR #3 (perf overhaul) **sudah di-merge ke master** (`4c46f2b`) ✓ — `ai_cache`, router deadline 35s, `mapLimit`, mem-cache tersedia.
- Env baru saat deploy: `WA_ADMIN_PHONE` (nomor WhatsApp pemilik, E.164 `628…`) dan `WA_BOT_PHONE` (nomor bot, E.164) — dipakai `requestPairingCode`.
- QStash tick existing (`internal/reminders/process`) sudah berjalan — keepalive bot ditumpang di sana.
