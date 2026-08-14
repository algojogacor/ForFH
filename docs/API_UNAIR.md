# API & Portal UNAIR — Peta Integrasi ForFH

Dokumen ini adalah satu-satunya sumber kebenaran tentang portal/API UNAIR yang
sudah dieksplorasi ForFH: endpoint, alur autentikasi, quirk, dan status
integrasi di wrapper. Terakhir diperbarui: **2026-08-15**.

## Peta portal

| Portal | URL | Autentikasi | Status di ForFH |
|---|---|---|---|
| **Kampus Kita** | `apikampuskita-mahasiswa.unair.ac.id` | email kampus + password → JWT | ✅ Ter-wrap penuh (14 endpoint) |
| **HE-BAT** (Moodle) | `hebat.elearning.unair.ac.id` | NIM + password (form Moodle) → authtoken iCal | ✅ Ter-wrap (ICS + instruksi tugas) |
| **Kube** (portal lama) | `mahasiswa.unair.ac.id` | NIM + password + **CAPTCHA** → `PHPSESSID` | 🔍 Discovery selesai (#39), integrasi pending (#40) |
| **unairsatu** | `unairsatu.unair.ac.id/site/login` | belum diselidiki | ⏳ Belum tersentuh |

Catatan: untuk ketiga portal yang terverifikasi, **password yang dipakai sama
dengan password Kampus Kita** (email lokal / NIM yang bersangkutan).

---

## 1. Kampus Kita — `apikampuskita-mahasiswa.unair.ac.id`

Backend aplikasi mobile mahasiswa (dulu "Pasal"). JSON. Satu-satunya portal
yang memakai email (bukan NIM) sebagai username.

### 1.1 Alur autentikasi

1. `POST /auth/login` dengan body form `email` + `password`.
2. Sukses → JWT dikembalikan lewat header **`Set-Cookie: token=<jwt>; ...`**
   (HttpOnly, `domain=localhost` — bug config UNAIR; token tidak dipakai
   sebagai cookie oleh ForFH, diambil dari header saja).
3. JWT berisi payload `{ IDMhs, IDPengguna, exp, username }` — `username`
   adalah **NIM**. Masa berlaku ±1 tahun.
4. Untuk semua endpoint lain: `Authorization: Bearer <jwt>` **dan**
   `?token=<jwt>` sebagai query param (keduanya wajib).

### 1.2 Daftar endpoint (terverifikasi)

Semua dipanggil dari `src/lib/campus/kampuskita.ts` (`KampusKitaClient`).
Respons = JSON; `rowsFrom()` mengambil array baris datanya.

| Endpoint | Method | Param | Fungsi | Dipakai ForFH untuk |
|---|---|---|---|---|
| `/auth/login` | POST | `email`, `password` | Terbitkan JWT | login ForFH, bootstrap |
| `/akademik/jadwal-kuliah` | POST | — | Jadwal kuliah | `courses` / `class_schedules` |
| `/kemahasiswaan/presensi-kuliah` | GET | — | Presensi per MK | rekap `campus_data` |
| `/akademik/semester-khs` | POST | — | Daftar semester | pilihan KHS |
| `/kemahasiswaan/riwayat-khs` | POST | `semester` (id) | KHS per semester | `grades` |
| `/akademik/status-mhs` | GET | — | Status mahasiswa | `campus_data` |
| `/akademik/peserta-mata-kuliah` | GET | — | Peserta MK | `campus_data` |
| `/akademik/kalender-akademik` | GET | — | Kalender akademik | `campus_data` |
| `/kemahasiswaan/pembayaran` | GET | — | Info pembayaran/UKT | `campus_data` |
| `/akademik/dosen-wali` | GET | — | Dosen wali | `campus_data` |
| `/akademik/masa-studi` | GET | — | Masa studi | `campus_data` |
| `/akademik/sks-aktif` | GET | — | SKS aktif | `campus_data` |
| `/kemahasiswaan/hist-her` | GET | — | Riwayat HER | `campus_data` |
| `/kemahasiswaan/penyerahan-ktm` | GET | — | Status KTM | `campus_data` |

### 1.3 Quirk yang wajib diingat

- **Metode campur**: `jadwal-kuliah` dan `semester-khs` adalah POST tanpa
  body; `riwayat-khs` POST dengan param. Sisanya GET. Jangan "menyeragamkan".
- **Timeout 15 detik** (AbortController). Timeout → `KampusKitaError(0,
  "Server UNAIR tidak merespons (timeout).")`; error jaringan → `"Gagal
  menghubungi server UNAIR: <msg>"`.
- **`redirect: "manual"`** — kode 3xx tidak diikuti.
- **User-Agent wajib** `Dart/3.3 (dart:io)`.
- **Anti-enumerasi**: login gagal dengan 401/404/422 semuanya dibungkus jadi
  `401 "Email atau password salah…"` — jangan pernah menembuskan kode HTTP
  aslinya ke klien (404 berarti "username is not exist").
- `GET` dengan token mendapat `401` saat JWT kedaluwarsa → "Sesi Kampus Kita
  kedaluwarsa. Silakan login ulang."
- **JWT tidak pernah di-log** (redaction di `logger.ts`).

---

## 2. HE-BAT (Moodle) — `hebat.elearning.unair.ac.id`

Moodle kustom ("HE-BAT" = nama platform e-learning UNAIR). Bukan API
webservice — jalur token webservice **tertutup** untuk akun mahasiswa (lihat
§2.3), jadi ForFH memakai form login + export iCal + scrape halaman kursus.

### 2.1 `connectHebat(nim, password)` → `{ userid, authtoken, sessionCookie }`

1. `GET /login/index.php` → ambil `logintoken` + cookie `jar` (MoodleSession).
2. `POST /login/index.php` body `username`(NIM) + `password` + `logintoken`.
3. `GET /calendar/export.php` → scrape `#calendarexporturl` (userid, authtoken).
4. `POST /calendar/export.php` (form generate) → authtoken permanen.

`sessionCookie` hanya di memori (tidak disimpan) — dipakai untuk crawl
instruksi tugas.

### 2.2 Endpoint terverifikasi

| Endpoint | Method | Fungsi |
|---|---|---|
| `/login/index.php` | GET/POST | Form login Moodle (logintoken) |
| `/calendar/export.php` | GET/POST | Ambil/generate authtoken iCal |
| `/calendar/export_execute.php?userid=&authtoken=&preset_what=all&preset_time=custom&starttime=&endtime=` | GET | **Feed iCal** → tugas ForFH (`fetchIcs` + `parseIcs`) |
| `/calendar/view.php?view=upcoming` / `view=month` | GET | Daftar id kursus per event (dengan sesi) |
| `/course/view.php?id=<id>` | GET | Halaman kursus → instruksi tugas (scrape `div.summarytext` per section) |

**Limitasi feed iCal**: `DESCRIPTION` selalu **kosong (0 char)** — instruksi
tidak pernah ada di rekaman event kalender. Instruksi asli = *section
summary* di halaman kursus; itulah yang di-crawl (`fetchCourseInstructions`,
paralel chunk-4, cap 30 kursus, deadline 40 s).

### 2.3 Jalur yang TERBUKTI TERTUTUP (jangan dicoba ulang tanpa perubahan di sisi UNAIR)

- `GET /user/managetoken.php` — Security keys kosong, tanpa form "Create token".
- `POST /login/token.php` — `invalidlogin` walau kredensial valid.
- `GET /tool/mobile/launch.php` — 404.
- `POST /lib/ajax/service.php?sesskey=` — `servicenotavailable` untuk
  `core_course_get_courses_by_field`, `core_enrol_get_users_courses`.

### 2.4 Pengamanan sesi

`assertCalendarSessionAlive()`: sesi dianggap mati bila URL final mengarah ke
`/login/index.php` (primer) atau teks `logintoken` muncul (sekunder). Route
`/api/campus/hebat` punya rate limit **5 percobaan / 5 menit**; hasil crawl
yang `sections.length === 0` di-skip (soft-redirect login).

---

## 3. Kube (portal lama) — `mahasiswa.unair.ac.id`

"Kube Cyber Campus": portal PHP klasik (bukan API JSON — respons berupa
**HTML tabel**). **KRS/KPRS tidak ada di Kampus Kita** — satu-satunya sumber
resmi pengambilan MK adalah portal ini. Discovery selesai **2026-08-12**
(task #39), pakai akun sendiri, read-only.

### 3.1 Autentikasi

1. `GET /login.php` → halaman login + **CAPTCHA** (gambar).
2. `POST /login.php` body `username`(**NIM**) + `password` + jawaban captcha.
3. Sukses → cookie **`PHPSESSID`**. `/modul/mhs/` tanpa sesi → `302 /logout.php`.

### 3.2 Route KRS/KPRS terverifikasi (fakultas FH → suffix `_hukum`)

| Route (di `/modul/mhs/proses/`) | Body | Fungsi |
|---|---|---|
| `POST _akademik-kprs_dilihat_hukum.php` | `aksi=tampil` | Tabel **MA Terambil** (kode, nama, SKS, kelas, status Approved) |
| `POST _akademik-krs_dilihat_hukum.php` | `aksi=tampil` | MK Terambil (ringkas) |
| `POST _akademik-krs_hapus_hukum.php` | `aksi=tampil` | MK Terambil lengkap + jadwal + pesan dosen |
| `POST _akademik-krs_hapus_hukum.php` | `aksi=hapus&pengambilan_mk=<id>` | **HAPUS MK — aksi nyata, JANGAN dipanggil otomatis** |
| `GET /modul/mhs/akademik-kprs.php` / `akademik-krs.php` | — | **Penawaran MA/MK** semester aktif (render server-side) |
| `GET /modul/mhs/proses/_akademik-krs_cetak.php` | — | Cetak KRS (`window.open`) |

Catatan:

- Suffix `_hukum` = fakultas **FH** (milik pengguna akun ini). Fakultas lain
  kemungkinan memakai suffix berbeda — perlu discovery terpisah.
- Penawaran MK hanya di-render **saat jendela KRS/KPRS terbuka**; di luar
  jendela panel `#krs_ditambah` kosong.
- Route "ambil MK" hanya muncul di panel itu saat jendela terbuka.
- **Jadwal 2026 (dari modul)**: KRS `03–07 Agu 2026`; **KPRS
  `24–26 Agu 2026, 08:00–16:00 WIB`**.

### 3.3 Status integrasi

- Discovery #39 selesai; **integrasi ForFH di-skip** oleh user saat itu
  (task #40 pending): rencana = simpan `PHPSESSID` → route read-only
  `/api/campus/kprs` → halaman KRS (countdown + daftar MK + kuota), submit
  tetap manual oleh user.
- **Tes live terencana saat jendela KPRS 24–26 Agu 2026** (task #41).

---

## 4. unairsatu — `unairsatu.unair.ac.id/site/login` (UNAIR SATU)

Discovery pasif selesai **2026-08-15** (subagent Explore). **Verdict: tidak
ada data yang relevan untuk ForFH — tidak direncanakan integrasi.**

- **Fungsi**: "SSO - Universitas Airlangga" — gateway Single Sign-On UNAIR
  (Yii2 PHP, `v1.2.4`). Login sekali (NIM/NIP/NIK + password Cybercampus)
  untuk mengakses layanan: Cybercampus V2, logbook Pengmas/SPTJM, VPN kampus.
- **Fingerprint**: Yii2 (route `/site/login` = default Yii2), CAPTCHA di
  `/site/gambar-captcha`, HTML server-rendered (bukan SPA), `robots.txt`
  membolehkan semua path di-crawl. Header HTTP tidak bisa dicek via fetch
  publik (hanya markdown).
- **Form login**: username + password + CAPTCHA. **Tidak ada OAuth**
  (Google/Facebook) — murni kredensial internal.
- **Endpoint publik**: tidak ada yang terkonfirmasi — `/site/register`,
  `/user/register`, `/api`, dan path acak semuanya balas HTTP 500 (error
  handler Yii2 menutup 404 sebagai 500), jadi keberadaan route tidak bisa
  dibedakan dari luar.
- **Model kredensial**: NIM/NIP/NIK + password Cybercampus berlaku lintas
  layanan UNAIR — konsisten dengan temuan portal lain (password sama di
  Kampus Kita, HE-BAT, Kube).

---

## 5. Kebijakan penyimpanan kredensial

Prinsip **"nilai tersimpan = nilai asli"** (tanpa transformasi):

- **Password kampus**: plaintext di `users.password`, ditulis **SETELAH
  verifikasi login Kampus Kita sukses** (route `/api/auth/login`). Tidak
  pernah di-hash, tidak pernah dihapus.
- **JWT Kampus Kita**: plaintext di `campus_accounts.token`.
- **Authtoken HE-BAT**: plaintext di `campus_accounts` (jalur route
  `/api/campus/hebat` — password dari jalur itu tidak disimpan).
- **PHPSESSID Kube**: belum disimpan (integrasi pending).
- Semua enkripsi at-rest (AES-256-GCM + `SESSION_SECRET`) sudah **dihapus**
  dari codebase dan env (task #81–#87). Konsekuensi keamanan tercatat di
  `docs/SECURITY.md` dan `docs/HARDENING_AUDIT.md`.

## 6. Wrapper ForFH

| File | Isi |
|---|---|
| `src/lib/campus/kampuskita.ts` | Client Kampus Kita: `loginCampus`, `KampusKitaClient` (14 endpoint), `KampusKitaError` |
| `src/lib/campus/hebat.ts` | `connectHebat`, `fetchIcs`, `parseIcs`, `assertCalendarSessionAlive`, `fetchCourseInstructions` |
| `src/lib/campus/sync.ts` | `runCampusSync` (jadwal+KHS+ICS paralel; info kampus toleran per jenis; lock anti-race) |
| `src/lib/campus/mappings.ts` | Normalisasi ke tabel ForFH, `descriptionToText`, `presensiToRecap` |

Route API yang memakainya: `/api/auth/login`, `/api/campus/sync`,
`/api/campus/sync-status`, `/api/campus/status`, `/api/campus/info`,
`/api/campus/hebat`.

## 7. Aturan untuk pengembangan berikutnya

1. **Jangan pernah** memanggil aksi destruktif portal UNAIR otomatis (contoh:
   `aksi=hapus` KRS). Baca-saja untuk integrasi; aksi tetap manual oleh user.
2. Jangan menembuskan kode HTTP asli/header autentikasi portal ke klien.
3. Semua fetch server-side wajib timeout + User-Agent + redirection manual.
4. Discovery baru (unairsatu, suffix fakultas lain) → catat hasilnya di
   dokumen ini sebelum integrasi.
5. Tes live hanya di jendela resmi (KPRS 24–26 Agu 2026) dan dengan akun
   sendiri.
