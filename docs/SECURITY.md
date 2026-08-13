# ForFH V4 - Security Architecture & Hardening Guide

## 0. Campus Authentication (Kampus Kita UNAIR)

ForFH V4 mengganti login username/password internal dengan **login email kampus**
(`@student.unair.ac.id` + password), diverifikasi ke server Kampus Kita UNAIR
(`apikampuskita-mahasiswa.unair.ac.id`). Prinsip keamanan:

- **Password tidak pernah disimpan** — hanya hasil login yang disimpan: JWT Kampus
  Kita dan authtoken kalender HE-BAT (Moodle UNAIR).
- **Nilai tersimpan = nilai asli (tanpa enkripsi at-rest)** — token disimpan apa
  adanya di `campus_accounts` (`jwt`, `hebat_authtoken`). Keputusan app pribadi:
  tidak ada transformasi antara nilai asli dan isi DB. Data lama berformat `v1:`
  (AES-256-GCM versi lama) di-decrypt sekali jalan saat dipakai
  (`src/lib/crypto/legacy-v1.ts`), lalu ditulis ulang plaintext.
- **Kredensial tidak pernah di-log** — logger global meredaksi password & token;
  client `src/lib/campus/*` tidak menulis token ke log.
- **`campus_data` plaintext non-rahasia** — rekap presensi & info kampus disimpan
  apa adanya (data mahasiswa sendiri, mirip courses/grades); token juga plaintext.
- **Rate limiting** — login kampus & reconnect HE-BAT dibatasi 5 percobaan / 5 menit
  dengan lockout 15 menit (`checkRateLimit`), mencegah brute force.
- **Anti-enumerasi** — semua kegagalan login kampus (401/404/422) dikembalikan
  sebagai 401 generik; 404 "username is not exist" dari server UNAIR tidak
  diteruskan ke klien (mencegah pengecekan keberadaan email).
- **Sesi ForFH** — token sesi 32-byte acak (64 hex), disimpan apa adanya di
  `sessions.token` (nilai tersimpan = nilai asli), cookie HttpOnly + Secure +
  SameSite=Lax + `__Host-` di production. Login ulang diperlukan sekali setelah
  migrasi ini (token lama ber-hash tidak bisa di-reverse).
- **Fire-and-forget sync** — sync awal tidak memblokir respons login; error sync
  hanya dicatat (never exposed ke log dengan isi token).
- **Non-goals (sengaja tidak dilakukan)**: tidak ada enumerasi akun, tidak ada
  akses tanpa izin pemilik akun, presensi Kampus Kita bersifat agregat per MK
  sehingga tidak disinkronkan (tetap manual).

## 1. Authentication & Credential Storage

### 1.1 Password Handling
- **Password tidak pernah disimpan** — login hanya memverifikasi email + password
  ke Kampus Kita UNAIR (server UNAIR yang memeriksa). Kolom `users.password`
  nullable tidak terpakai (scrypt/hashing/pepper dihapus 2026-08 — app pribadi,
  tanpa transformasi nilai antara asli dan penyimpanan).

### 1.2 Session Security
- **Session Tokens**: 32 random bytes (64 hex characters) generating 256 bits of entropy.
- **Raw Storage**: token sesi disimpan apa adanya di `sessions.token` (nilai asli
  = nilai tersimpan, tanpa hashing). Trade-off: kebocoran DB memperlihatkan
  token; diterima untuk app pribadi (keputusan 2026-08).
- **Cookie Flags**:
  - `HttpOnly`: Mitigates XSS token exfiltration.
  - `Secure`: Transmitted strictly over HTTPS in production.
  - `SameSite=Lax`: Mitigates CSRF exploits on navigation.
  - `__Host-` prefix enforced in production (`__Host-forfh-session`).

---

## 2. Multi-Tenant & Cross-User Authorization

### 2.1 Identity Derivation
Every API route strictly extracts identity from the verified session cookie via `getSessionUser()`. The client cannot pass a `userId` in the body or query parameter to impersonate another user.

### 2.2 Strict Database Scoping
Every mutation (`INSERT`, `UPDATE`, `DELETE`) and read query (`SELECT`) enforces tenant boundaries:
```sql
WHERE id = ? AND user_id = ?
```

### 2.3 Parent Entity Ownership Enforcement
When creating child entities (tasks, subtasks, notes, readings, exams, attendance, grades, files, bookmarks), the application verifies that the parent entity belongs to the authenticated user before insertion:

| Target Resource | Parent Field | Enforcement Check |
|---|---|---|
| `/api/courses` | `academicTermId` | `WHERE id = academicTermId AND userId = authUser.id` |
| `/api/tasks` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |
| `/api/notes` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |
| `/api/exams` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |
| `/api/attendance` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |
| `/api/grades` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |
| `/api/readings` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |
| `/api/files/record` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |
| `/api/legal/bookmarks` | `courseId` | `WHERE id = courseId AND userId = authUser.id` |

---

## 3. Storage & Upload Security

### 3.1 Filename & Path Traversal Sanitization
All filenames undergo strict sanitization via `sanitizeFilename()`:
- Path separators (`/`, `\`) and control characters are stripped.
- Filename length is constrained between 1 and 255 characters.
- Executable extensions are rejected: `.exe`, `.bat`, `.cmd`, `.sh`, `.vbs`, `.ps1`, `.msi`, `.dll`, `.com`, `.jar`, `.jsp`, `.php`, `.asp`.

### 3.2 Server-Side Verification Before DB Insertion
Client-reported metadata is never trusted blindly. `/api/files/record` invokes Google Drive's API directly from the server to verify:
1. File exists and is accessible by the application service account.
2. File is not marked as trashed.
3. Actual byte size and MIME type match verified metadata.

---

## 4. Webhook & Background Worker Security

### 4.1 Fail-Closed QStash Webhook
- In production, `/api/internal/reminders/process` rejects all unsigned requests (`401 Unauthorized`).
- Upstash signatures are verified using `@upstash/qstash` `Receiver` with dual signing key support (`QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY`).

### 4.2 Web Push Key Security
- VAPID private keys are loaded from environment variables and never logged or serialized to the client.
- Dead subscriptions returning `404 Not Found` or `410 Gone` are immediately pruned from the database.

---

## 5. Secret Redaction & Logging Safeguards

The centralized logging utility `src/lib/logger.ts` filters log output across all log levels (`info`, `warn`, `error`, `debug`) using comprehensive regex redaction patterns:
- Bearer tokens & Authorization headers
- Turso auth tokens
- Groq / Ollama API keys
- QStash signing keys & tokens
- Google OAuth secrets & refresh tokens
- User passwords & cookie strings

---

## 6. HTTP Security Headers

Configured in `next.config.ts`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
