# Laporan Audit Caching & Integrasi Data Eksternal (Kampus Kita & HE-BAT)

**Proyek:** ForFH Companion Web (Next.js App Router)  
**Tanggal Audit:** 20 Agustus 2026  
**Status:** Selesai (Audit Murni — Tanpa Perubahan Kode)  
**Tujuan:** Menginvestigasi seluruh fetch point ke API Kampus Kita / HE-BAT, menganalisis lapisan caching, mekanisme sync timestamp, serta memetakan karakter update data untuk optimasi di sesi berikutnya.

---

## 1. Ringkasan Eksekutif

Aplikasi **ForFH** mengintegrasikan dua sumber data eksternal utama milik Universitas Airlangga (UNAIR):
1. **API Kampus Kita** (`https://apikampuskita-mahasiswa.unair.ac.id`) — REST API backend aplikasi mobile mahasiswa untuk data akademik, profil, jadwal, nilai, dan rekap kemahasiswaan.
2. **HE-BAT Moodle** (`https://hebat.elearning.unair.ac.id`) — LMS perkuliahan untuk feed kalender iCal tugas/deadline dan instruksi tugas.

### Temuan Kunci Audit:
- **Arsitektur Pengambilan Data:** Tidak ada halaman di frontend ForFH yang melakukan direct request ke API Kampus Kita saat user membuka halaman. Seluruh konsumsi data oleh user membaca dari **database internal Turso (SQLite)** atau in-memory cache lokal.
- **Lapisan Caching:** Terdapat **3 lapisan caching**:
  1. *Database Persistence* di Turso (tabel `campus_data`, `courses`, `class_schedules`, `tasks`, `grades`).
  2. *Server In-Memory TTL Cache* (`src/lib/cache/mem-cache.ts` — TTL 30–60 detik).
  3. *Client Memory SWR-ish Cache* (`src/lib/client-cache.ts` — TTL 60 detik).
- **Mekanisme Sync Timestamp:** Timestamp `"sinkron [tanggal]"` di UI Info Kampus, Kehadiran, Profil, dan Pengaturan **murni berasal dari rekaman waktu database (`campus_accounts.last_sync_at` dan `campus_data.updated_at`)**, BUKAN timestamp yang di-refresh tiap HTTP request. Ini adalah bukti sahih bahwa data memang di-cache dan dipersistensi di database internal.
- **Jadwal Eksekusi (Scheduling):**
  - Background Cron: Dipicu berkala oleh QStash (`POST /api/internal/reminders/process` -> `syncDueUsers()`) tiap **30 menit** untuk akun yang intervalnya sudah lewat.
  - On-Demand Trigger: Saat login pertama (`POST /api/auth/login`), saat tombol manual "Sync sekarang" ditekan (`POST /api/campus/sync`), dan saat reconnect HE-BAT (`POST /api/campus/hebat`).
- **Throttling & Locks:** Terdapat atomic lock berbasis conditional UPDATE (`syncState: 'running'`), staleness guard 10 menit, default sync interval threshold 30 menit, dan concurrency limit (3 concurrent users, max 20 users per cron tick).

---

## 2. Daftar Lengkap Fetch Point ke Sumber Eksternal

### A. API Kampus Kita (`https://apikampuskita-mahasiswa.unair.ac.id`)
Client wrapper: [`src/lib/campus/kampuskita.ts`](file:///d:/Projects/ForFH/src/lib/campus/kampuskita.ts)  
Konfigurasi: `User-Agent: Dart/3.3 (dart:io)`, `Timeout: 15.000 ms` via `AbortController`, `redirect: manual`.

| No | Endpoint | Method | Parameter / Payload | Fungsi Data | Handler di ForFH | Destinasi Tabel DB |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | `/auth/login` | `POST` | Body form: `email`, `password` | Verifikasi kredensial & penerbitan JWT (~1 th) | `loginCampus()` di [`login/route.ts`](file:///d:/Projects/ForFH/src/app/api/auth/login/route.ts) | `users`, `campus_accounts` |
| 2 | `/akademik/jadwal-kuliah` | `POST` | None (Bearer JWT + `?token=`) | Jadwal kuliah semester aktif | `client.jadwal()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `courses`, `class_schedules` |
| 3 | `/kemahasiswaan/presensi-kuliah` | `GET` | None (Bearer JWT + `?token=`) | Rekap agregat presensi per MK (hadir, total TM, %) | `client.presensi()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "presensi"`) |
| 4 | `/akademik/semester-khs` | `GET` | None (Bearer JWT + `?token=`) | Daftar ID & nama semester KHS yang tersedia | `client.semesters()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | Memori sync (iterasi semester KHS) |
| 5 | `/kemahasiswaan/riwayat-khs` | `POST` | Body/Query: `semester: <id>` | Rincian nilai huruf & angka per semester | `client.khs(semId)` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `grades` |
| 6 | `/akademik/status-mhs` | `GET` | None (Bearer JWT + `?token=`) | Data profil mahasiswa (NIM, Nama, Prodi, Jenjang, Status) | `client.status()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) & [`login/route.ts`](file:///d:/Projects/ForFH/src/app/api/auth/login/route.ts) | `campus_data` (`status_mhs`), `users.displayName` |
| 7 | `/akademik/peserta-mata-kuliah` | `GET` | None (Bearer JWT + `?token=`) | Daftar mata kuliah yang diambil & nama dosen pengampu | `client.pesertaMataKuliah()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "peserta_mk"`) |
| 8 | `/akademik/kalender-akademik` | `GET` | None (Bearer JWT + `?token=`) | Agenda & tanggal penting universitas per semester | `client.kalenderAkademik()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "kalender_akademik"`) |
| 9 | `/kemahasiswaan/pembayaran` | `GET` | None (Bearer JWT + `?token=`) | Riwayat tagihan, nominal, bank, & status bayar UKT | `client.pembayaran()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "pembayaran"`) |
| 10 | `/akademik/dosen-wali` | `GET` | None (Bearer JWT + `?token=`) | Nama, NIP/NIDN, email, kontak dosen wali | `client.dosenWali()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "dosen_wali"`) |
| 11 | `/akademik/masa-studi` | `GET` | None (Bearer JWT + `?token=`) | Informasi semester awal, batas studi, & sisa masa tempuh | `client.masaStudi()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "masa_studi"`) |
| 12 | `/akademik/sks-aktif` | `GET` | None (Bearer JWT + `?token=`) | SKS aktif semester berjalan & total SKS tempuh | `client.sksAktif()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "sks_aktif"`) |
| 13 | `/kemahasiswaan/hist-her` | `GET` | None (Bearer JWT + `?token=`) | Riwayat ujian perbaikan / her registrasi nilai | `client.histHer()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "hist_her"`) |
| 14 | `/kemahasiswaan/penyerahan-ktm` | `GET` | None (Bearer JWT + `?token=`) | Riwayat verifikasi & status penyerahan fisik KTM | `client.penyerahanKtm()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `campus_data` (`jenis: "penyerahan_ktm"`) |

---

### B. HE-BAT Moodle E-Learning (`https://hebat.elearning.unair.ac.id`)
Client wrapper: [`src/lib/campus/hebat.ts`](file:///d:/Projects/ForFH/src/lib/campus/hebat.ts)  
Konfigurasi: `User-Agent: forfh-sync/1.0`, `CookieJar` manual.

| No | Endpoint / Path | Method | Kredensial / Mekanisme | Fungsi Data | Handler di ForFH | Destinasi Tabel DB |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | `/login/index.php` & `/calendar/export.php` | `GET` & `POST` | Form scraping dengan `logintoken` (CSRF) + NIM & Password | Mendapatkan `userid` & `authtoken` permanen kalender iCal | `connectHebat()` di [`login/route.ts`](file:///d:/Projects/ForFH/src/app/api/auth/login/route.ts) & [`hebat/route.ts`](file:///d:/Projects/ForFH/src/app/api/campus/hebat/route.ts) | `campus_accounts.hebat_authtoken`, `campus_accounts.hebat_userid` |
| 2 | `/calendar/export_execute.php` | `GET` | Query params: `userid`, `authtoken`, rentang -90 s/d +490 hari | Feed iCal (.ics) tugas kuliah & deadline aktif | `fetchIcs()` di [`sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts) | `tasks` (`source: "campus"`, `external_id: UID`) |
| 3 | `/calendar/view.php` & `/course/view.php` | `GET` | Cookie sesi aktif (`MoodleSession`) saat koneksi | Crawl section summary kursus untuk mengambil teks instruksi tugas | `fetchCourseInstructions()` di [`hebat/route.ts`](file:///d:/Projects/ForFH/src/app/api/campus/hebat/route.ts) | `campus_data` (`jenis: "instruksi_tugas"`) |

---

## 3. Analisis Layer Caching, TTL, Trigger, & Throttling

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND BROWSER (UI)                           │
│  Halaman: /info-kampus, /kehadiran, /jadwal, /tugas, /nilai, /profil   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ cachedFetch() (TTL 60s)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS API ROUTES                              │
│  /api/campus/info, /api/tasks, /api/schedules, /api/grades, etc.       │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
        memGet()    │ TTL 30-60s                     │ db.select()
        (Mem Cache) │ (mem-cache.ts)                 │
                    ▼                                ▼
┌───────────────────────────────────┐    ┌───────────────────────────────┐
│     SERVER MEMORY PROCESS MAP     │    │       TURSO SQLITE DB         │
│     (Node.js runtime instance)    │    │  campus_data, tasks, courses, │
│                                   │    │  class_schedules, grades      │
└───────────────────────────────────┘    └───────────────▲───────────────┘
                                                         │
                                  runCampusSync()        │ Upsert data &
                                  (Background Worker)    │ update lastSyncAt
                                                         │
                    ┌────────────────────────────────────┴───────────────┐
                    │                                                    │
                    ▼                                                    ▼
        ┌───────────────────────┐                            ┌───────────────────────┐
        │   API KAMPUS KITA     │                            │     HE-BAT MOODLE     │
        │  apikampuskita.unair  │                            │  hebat.elearning.unair│
        └───────────────────────┘                            └───────────────────────┘
```

### a) Di Mana Caching Terjadi?
1. **Layer Database (Turso LibSQL)**:
   - Data eksternal tidak pernah di-fetch ulang saat user membuka/merefresh halaman UI.
   - Hasil fetch disimpan permanen di database lokal:
     - `campus_data`: Berisi 11 record JSON per user (presensi, kalender akademik, pembayaran, dosen wali, masa studi, SKS, HER, KTM, status mahasiswa, peserta MK, instruksi tugas).
     - `courses` & `class_schedules`: Di-upsert berdasarkan kode MK & jadwal.
     - `tasks`: Di-upsert berdasarkan UID iCal HE-BAT.
     - `grades`: Di-upsert berdasarkan semester dan kode MK.
2. **Layer Server In-Memory Cache ([`src/lib/cache/mem-cache.ts`](file:///d:/Projects/ForFH/src/lib/cache/mem-cache.ts))**:
   - Modul `Map<string, { expiresAt, value }>` pada runtime server Node.js.
   - Endpoint `/api/campus/info` di-cache dengan key `campus-info:${userId}`.
   - Endpoint `/api/tasks` di-cache dengan key `tasks:${userId}`.
   - Cache ini di-invalidasi seketika (`memDel`) saat proses sync berhasil atau mutasi dilakukan.
3. **Layer Client-Side In-Memory Cache ([`src/lib/client-cache.ts`](file:///d:/Projects/ForFH/src/lib/client-cache.ts))**:
   - Fungsi `cachedFetch(url, ttlMs)` menyimpan promise fetch di memory browser client.
   - Mencegah browser melakukan request ulang ke server Next.js jika user berpindah-pindah tab dalam jendela waktu 60 detik.
   - Di-clear seketika via `invalidateClientCache()` saat aksi mutasi (tambah tugas, quick log presensi, sync manual, logout).

### b) Berapa TTL / Revalidate Interval Saat Ini?
- **Interval Sync Background (Cron):** `FORFH_SYNC_INTERVAL_MIN` = **30 menit** (default). Akun dengan `lastSyncAt < 30 menit` akan di-skip oleh cron.
- **Server In-Memory Cache (`mem-cache.ts`):**
  - `/api/campus/info`: **60.000 ms (60 detik / 1 menit)**.
  - `/api/tasks`: **30.000 ms (30 detik)**.
- **Client-Side Cache (`client-cache.ts`):** **60.000 ms (60 detik / 1 menit)**.
- **Next.js Native Fetch Cache:**
  - Route handler menggunakan request dinamis (membaca cookie session user).
  - Panggilan `fetch()` di client memakai `{ cache: "no-store" }` untuk status polling & sync routes.

### c) Kapan Fetch ke Kampus Kita Terjadi (Trigger Execution)?
| Pemicu (Trigger) | Tipe | Mekanisme |
|:---|:---|:---|
| **1. User Login Pertama / Relogin** | *On-Demand* | `POST /api/auth/login` memvalidasi akun ke UNAIR, lalu menjalankan background fire-and-forget `bootstrapCampus()` untuk menarik data awal. |
| **2. Tombol "Sync sekarang" di Pengaturan** | *On-Demand (Client-Triggered)* | `POST /api/campus/sync` memicu `runCampusSync(userId, { force: true })` di background; client memantau progres via `/api/campus/sync-status`. |
| **3. Tombol "Hubungkan ulang" HE-BAT** | *On-Demand (Client-Triggered)* | `POST /api/campus/hebat` mengautentikasi ulang Moodle dan meng-crawl instruksi tugas. |
| **4. QStash Cron Reminders/Sync Worker** | *Background Scheduled (Cron)* | Webhook `POST /api/internal/reminders/process` memanggil `syncDueUsers()` untuk memproses akun yang `lastSyncAt` telah melampaui 30 menit. |
| **5. User Membuka Halaman (Navigasi)** | *Tidak Pernah Fetch ke UNAIR* | Hanya membaca DB internal Turso & in-memory cache. |

### d) Apakah Ada Rate Limiting / Throttling?
1. **Per-User Atomic Lock (`runCampusSync`)**:
   - Menggunakan conditional update pada database:
     ```typescript
     db.update(campusAccounts).set({ syncState: "running", syncStartedAt: new Date() })
       .where(and(eq(userId), or(ne(syncState, "running"), lt(syncStartedAt, now - 10_min))))
     ```
   - Jika ada sync lain yang sedang berjalan untuk user tersebut dalam rentang < 10 menit, eksekusi kedua akan di-skip (`reason: "in_progress"`).
2. **Interval Throttle**:
   - Jika `!opts.force` dan selisih waktu `Date.now() - lastSyncAt < 30 menit`, sync otomatis dilewati (`reason: "throttled"`).
3. **Cron Batching & Concurrency Limiting**:
   - `syncDueUsers()` membatasi maksimal **20 pengguna** per tick cron (`.limit(20)`).
   - Menjalankan sync secara paralel terbatas maksimal **3 pengguna sekaligus** (`mapLimit(due, 3, ...)`).
4. **HE-BAT Crawl Throttling**:
   - Batas maksimal crawl kursus: `CRAWL_COURSE_CAP = 30` kursus.
   - Batch paralel: 4 request halaman kursus per batch.
   - Batas waktu total: `CRAWL_DEADLINE_MS = 40.000 ms` (40 detik timeout).
5. **Endpoint Rate Limiting (Klien ke ForFH)**:
   - `POST /api/campus/hebat` dibatasi maksimal 5 percobaan per 5 menit per IP+User (blokir 15 menit jika terlampaui).

---

## 4. Investigasi Mekanisme "Sync Timestamp" di Turso Database

### Temuan Sumber Data Timestamp:
Di antarmuka Info Kampus (`/info-kampus`), Kehadiran (`/kehadiran`), Profil (`/profil`), dan Pengaturan (`/pengaturan`), terdapat label seperti *"sinkron 20/8/2026, 22:00:27"* atau *"Sync Kampus Kita: ..."*.

1. **Header Info Kampus & Profil**:
   - Berasal dari kolom `campus_accounts.last_sync_at` (tipe integer ms di Turso SQLite).
   - Nilai ini di-update oleh `runCampusSync()` di [`src/lib/campus/sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts#L401) hanya saat seluruh tahapan sync selesai dengan sukses (`lastSyncAt: new Date()`).
2. **Footer Tiap Kartu Kategori Info Kampus (`CampusDataCard.tsx`)**:
   - Berasal dari kolom `campus_data.updated_at`.
   - Di-update oleh fungsi `upsertCampusData()` di [`src/lib/campus/sync.ts`](file:///d:/Projects/ForFH/src/lib/campus/sync.ts#L111) saat payload JSON kategori tersebut disimpan.
3. **Rekap Kehadiran di `/kehadiran`**:
   - Mengambil field `updatedAt` dari entri `campus_data` dengan `jenis = "presensi"`.

### Kesimpulan Verifikasi:
> **Konfirmasi:** Timestamp tersebut adalah **BUKTI PASTI BAHWA DATA DI-CACHE DAN DISIMPAN DI DATABASE**. Timestamp tersebut **tidak pernah di-refresh tiap kali halaman dibuka**, melainkan merefleksikan tanggal dan jam presisi ketika cron job atau tombol sync manual terakhir kali sukses berkomunikasi dengan API UNAIR dan memperbarui baris data di Turso.

---

## 5. Kategorisasi Data, Sumber Kepemilikan, & Karakteristik Update

| Kategori Data | Karakteristik Update di Dunia Nyata | Sumber Data Utama (Data Ownership) | Kebutuhan Sync / Caching | Catatan & Perilaku Saat Ini |
|:---|:---|:---|:---|:---|
| **1. Jadwal Kuliah & Ruangan** | **Sangat Statis** (berubah per semester; jarang sekali berubah di tengah semester) | **Kampus Kita** (`/akademik/jadwal-kuliah`) & **Manual ForFH** | Perlu Caching Panjang (Hemat Sync) | Di-sync ke tabel `courses` & `class_schedules`. Mahasiswa juga dapat menambah/mengedit jadwal manual di ForFH. |
| **2. Kalender Akademik** | **Sangat Statis** (ditetapkan 1x per tahun ajaran/semester oleh rektorat) | **Kampus Kita** (`/akademik/kalender-akademik`) | Perlu Caching Panjang (Hemat Sync) | Disimpan di `campus_data` (`kalender_akademik`). Sync 30 menit saat ini sangat berlebihan untuk data ini. |
| **3. Data Diri & Status Mhs** (NIM, Prodi, Dosen Wali, Masa Studi, SKS Aktif) | **Sangat Statis** (statis per semester; update hanya saat pergantian semester / kelulusan) | **Kampus Kita** (`status-mhs`, `dosen-wali`, `masa-studi`, `sks-aktif`, dll.) | Perlu Caching Panjang (Hemat Sync) | Disimpan di `campus_data` dan `users.displayName`. Ditampilkan di halaman `/profil` dan `/info-kampus`. |
| **4. Pembayaran UKT & Riwayat HER** | **Jarang Berubah** (hanya berubah pada jendela awal semester saat pembayaran UKT) | **Kampus Kita** (`/kemahasiswaan/pembayaran`, `/kemahasiswaan/hist-her`) | Perlu Caching Panjang (Hemat Sync) | Disimpan di `campus_data` (`pembayaran`, `hist_her`). |
| **5. Nilai & KHS** | **Jarang Berubah** (hanya aktif diupdate dosen pada akhir semester saat masa entri nilai / KHS) | **Kampus Kita** (`/kemahasiswaan/riwayat-khs`) & **Manual ForFH** | Caching Sedang (Kecuali periode akhir semester) | Di-sync ke tabel `grades` (dengan `external_id`). Pengguna juga bisa memasukkan komponen nilai simulasi manual untuk kalkulator IPK di `/nilai`. |
| **6. Kehadiran / Presensi Kuliah** | **Berubah Harian / Mingguan** (bertambah tiap ada perkuliahan yang diabsen dosen) | **Kombinasi:**<br>• Rekap Agregat dari **Kampus Kita** (`/kemahasiswaan/presensi-kuliah`)<br>• Log Harian dari **Internal ForFH** (`POST /api/attendance`) | Caching Sedang (Harian) | **Konfirmasi:** API Kampus Kita **TIDAK** menyediakan tanggal pertemuan presensi (hanya agregat: total TM, hadir, %). Oleh karena itu, ForFH menyimpan rekap agregat di `campus_data` dan menyediakan fitur log harian manual per tanggal di tabel `attendance`. |
| **7. Tugas & Tenggat Waktu (Deadlines)** | **Dinamis / Sering Berubah** (dosen bisa posting tugas kapan saja di Moodle; mahasiswa input tugas harian) | **Kombinasi:**<br>• Tugas Moodle dari **HE-BAT iCal** (`source: 'campus'`)<br>• Tugas Mandiri dari **Internal ForFH** (`source: 'manual'`, `'ai'`, `'quick_capture'`) | Caching Pendek / Dinamis | **Konfirmasi:** Tugas di ForFH memiliki dua sumber: tugas HE-BAT otomatis tersinkron via feed iCal, sedangkan tugas kelompok/offline diinput manual oleh mahasiswa. Upsert iCal menjaga agar deskripsi dan kustomisasi tugas yang dibuat user tidak tertimpa. |

---

## 6. Matriks Rekapitulasi Audit

| Aspek Audit | Status Saat Ini | Detail Teknis / Lokasi Kode |
|:---|:---|:---|
| **Jumlah Endpoint Kampus Kita** | 14 Endpoint | [`src/lib/campus/kampuskita.ts`](file:///d:/Projects/ForFH/src/lib/campus/kampuskita.ts) |
| **Integrasi HE-BAT Moodle** | Feed iCal + Crawl Instruksi | [`src/lib/campus/hebat.ts`](file:///d:/Projects/ForFH/src/lib/campus/hebat.ts) |
| **Caching Database (Turso)** | Aktif (Semua entitas) | Tabel `campus_data`, `courses`, `class_schedules`, `tasks`, `grades` |
| **Caching In-Memory Server** | Aktif (TTL 30–60s) | [`src/lib/cache/mem-cache.ts`](file:///d:/Projects/ForFH/src/lib/cache/mem-cache.ts) |
| **Caching Memory Client (SWR-ish)** | Aktif (TTL 60s) | [`src/lib/client-cache.ts`](file:///d:/Projects/ForFH/src/lib/client-cache.ts) |
| **Sync On-Demand (User-Triggered)** | Aktif | Login (`/api/auth/login`), Manual (`/api/campus/sync`), Reconnect (`/api/campus/hebat`) |
| **Sync Terjadwal (Cron)** | Aktif (Tiap 30 Menit) | QStash Webhook (`/api/internal/reminders/process`) -> `syncDueUsers()` |
| **Concurrency & Lock Guard** | Aktif (Atomic DB Lock) | `campusAccounts.syncState = 'running'`, max concurrency 3 users, cap 20 users/tick |
| **Sync Timestamp di UI** | Real DB Timestamp | Berasal dari `campus_accounts.last_sync_at` dan `campus_data.updated_at` |
| **Data Tugas Mandiri** | Milik Internal ForFH | Tabel `tasks` dengan `source: "manual" \| "ai" \| "quick_capture"` |
| **Data Presensi Harian** | Milik Internal ForFH | Tabel `attendance` (input manual per tanggal pertemuan) |

---

## 7. Rekomendasi untuk Sesi Berikutnya (Non-Breaking)

1. **Diferensiasi Interval Sinkronisasi per Kategori (Tiered Syncing):**
   - Saat ini seluruh 14 endpoint Kampus Kita dan feed iCal dipanggil bersamaan tiap 30 menit.
   - *Rekomendasi:* Pisahkan siklus sync:
     - **Tier Dinamis (Tiap 30–60 menit):** Feed Tugas iCal HE-BAT & Rekap Presensi (`presensi-kuliah`).
     - **Tier Statis (1x per hari atau on-demand manual):** Kalender akademik, data diri/status mahasiswa, dosen wali, masa studi, SKS aktif, pembayaran, HER, dan KTM.
     - **Tier Semesteran (Saat awal/akhir semester atau manual):** Jadwal kuliah & riwayat KHS.
2. **Penyederhanaan Payload KHS:**
   - Pembatasan `MAX_KHS_SEMESTERS = 6` sudah bagus, namun riwayat semester lama yang sudah selesai bersifat immutable sehingga tidak perlu di-fetch ulang tiap siklus sync.
3. **Resilience & Retry Backoff:**
   - Menambahkan mekanisme exponential backoff jika server UNAIR mengembalikan error 502/503/timeout agar tidak membebani server kampus saat jam sibuk KRS.

---
*Laporan audit ini disusun sebagai referensi arsitektural dan dokumentasi resmi sebelum implementasi optimasi caching.*
