# Worklog — ForFH Web Companion

## [2026-08-20] Implementasi Tiered Syncing & Cache Tuning (Kampus Kita & HE-BAT)
- **Latar Belakang & Masalah**: Instance Koyeb Free Tier (0.1 vCPU) terbebani oleh cron seragam 30 menit yang mengeksekusi 19 HTTP request per user per siklus ke server UNAIR (14 endpoint Kampus Kita + KHS multi-semester + HE-BAT feed), meskipun data jadwal kuliah, riwayat KHS lama, kalender akademik, dan info mahasiswa nyaris tidak pernah berubah.
- **Implementasi**:
  1. **Tiered Syncing Engine (`src/lib/campus/sync.ts`)**:
     - **Tier 1 (Dinamis - 30 Menit)**: Feed tugas iCal HE-BAT (`fetchIcs`) & Rekap Presensi (`client.presensi()`) — selalu dieksekusi tiap siklus cron 30 menit.
     - **Tier 2 (Statis Harian - 24 Jam)**: 9 kategori `campus_data` (`kalender_akademik`, `status_mhs`, `dosen_wali`, `masa_studi`, `sks_aktif`, `pembayaran`, `hist_her`, `penyerahan_ktm`, `peserta_mk`) + KHS semester aktif — hanya di-fetch jika `updatedAt` > 24 jam yang lalu atau saat force manual.
     - **Tier 3 (Semesteran - On-demand / Initial Login)**: Jadwal kuliah (`client.jadwal()`) dan riwayat KHS semester lama (maks 6 semester) — dilewati sepenuhnya saat cron rutin jika sudah ada data tersimpan di DB, hanya dieksekusi saat initial login bootstrap atau tombol "Sync sekarang" manual.
     - **Course Mapping Resilience**: Muat `existingCourses` dari DB ke `courseIdsByCode` map agar relasi tugas iCal & KHS ke `courseId` tetap terjaga saat jadwal di-skip di cron.
  2. **Exponential Backoff & Network Resilience**:
     - Ditambahkan retry loop dengan exponential backoff dan jitter acak (1s, 2s + random 0–250ms, maks 2 retries) pada `kkFetch` (`src/lib/campus/kampuskita.ts`) dan `fetchIcs` (`src/lib/campus/hebat.ts`) untuk menangani transient error (502, 503, 504, network timeout) dari server UNAIR tanpa membebani CPU instance Koyeb.
  3. **Cache Tuning (Server & Client Layer)**:
     - Server memory cache (`/api/campus/info`): TTL dinaikkan dari 60 detik menjadi 1 jam (`3_600_000` ms) dengan auto-invalidation (`memDel`) saat sync selesai.
     - Client cache (`client-cache.ts`): Menambahkan tier-aware TTL resolution (1 jam untuk info kampus, 10 menit untuk jadwal/courses/ujian, 30–60 detik untuk tugas dan presensi).
  4. **Login Bootstrap & Settings Manual Sync**:
     - `bootstrapCampus` di `src/app/api/auth/login/route.ts` dan tombol sync manual di `/api/campus/sync` menggunakan parameter `force: true` sehingga seluruh tier 1, 2, dan 3 tetap dapat diperbarui on-demand.
- **Dampak Pengurangan Request & Compute**:
  - **Sebelum Tiering**: 19 request / user / 30 menit = **912 request / user / hari**.
  - **Setelah Tiering (Cron Rutin 30m)**: 2 request / user / 30 menit (pengurangan **~89.5% request** per siklus cron).
  - **Total 24 Jam**: 48 siklus × 2 req (Tier 1) + 1 × 11 req (Tier 2) = **107 request / user / hari** (pengurangan **~88.3% request total harian**).
  - Beban komputasi JSON parsing, crypto readToken, dan DB query per siklus cron turun drastis di instance 0.1 vCPU Koyeb.
- **Status Verifikasi**:
  - `npm run quality` (ESLint + TypeScript typecheck + 369 unit test): 100% lulus, 0 failure.
  - `npm run build`: 66/66 route Next.js ter-compile sukses.

---

## [2026-08-20] Audit Caching & Integrasi Data Eksternal Kampus Kita & HE-BAT
- **Aktivitas**: Audit menyeluruh (investigasi murni tanpa perubahan kode) terhadap seluruh titik fetch data eksternal ke API Kampus Kita dan platform HE-BAT Moodle UNAIR.
- **Hasil & Temuan Audit**:
  - Telah dipetakan **14 endpoint API Kampus Kita** dan **3 alur integrasi HE-BAT Moodle** berserta handler dan tabel database tujuannya.
  - Diverifikasi arsitektur caching 3-lapis: Database persistence (Turso LibSQL SQLite), Server in-memory TTL cache (`mem-cache.ts` TTL 30–60s), dan Client-side in-memory cache (`client-cache.ts` TTL 60s).
  - Dikonfirmasi bahwa timestamp *"sinkron [tanggal]"* di antarmuka UI adalah timestamp riil dari rekaman database (`campus_accounts.last_sync_at` dan `campus_data.updated_at`), bukan timestamp on-the-fly tiap request.
  - Dikonfirmasi pemisahan kepemilikan data: data tugas mandiri dan catatan presensi harian per tanggal adalah data internal ForFH, sedangkan rekap presensi agregat dan tugas HE-BAT tersinkron otomatis dari eksternal.
- **Lokasi Laporan Lengkap**: [`docs/caching-audit.md`](docs/caching-audit.md).

---

## [2026-08-20] Mobile Navigation Overhaul & Visual Hierarchy Polish

### 1. Mobile Menu Drawer Overhaul
- **Masalah**: Tombol "Menu" pada Bottom Navigation mobile sebelumnya hanya membuka dialog CommandMenu (pencarian), tanpa struktur menu komprehensif yang mereplikasi sidebar desktop.
- **Solusi**:
  - Dibuat komponen baru [`MobileMenuDrawer`](src/components/layout/MobileMenuDrawer.tsx) berformat Bottom Sheet dengan animasi `slide-up` dan drag handle.
  - Menu dikelompokkan secara persis ke dalam **3 Group berlabel** sesuai sidebar desktop:
    1. **UTAMA**: Beranda (`Home`), Kalender (`Calendar`), Tugas (`CheckSquare`).
    2. **AKADEMIK**: Mata Kuliah (`GraduationCap`), Catatan (`FileText`), Bahan Bacaan (`BookOpen`), Jadwal Ujian (`Clock`), Info Kampus (`Building2`).
    3. **PERANGKAT**: Riset Hukum (`Scale`), Presensi (`UserCheck`), Nilai & IPK (`Award`), Berkas (`FolderLock`), Unduh APK (`Download`).
    4. **PENGATURAN & AKUN**: Pengaturan (`Settings`), profil avatar & nama user, toggle tema (Dark/Light), dan tombol Logout.
  - **Aksesibilitas & Standar Apple HIG / Material Design**:
    - Seluruh item navigasi dan tombol memiliki target sentuh minimal **44×44px** (`min-h-[44px]`).
    - Tombol Close (X) jelas di pojok kanan atas dengan tap target 44×44px.
    - Drawer otomatis tertutup saat: tap salah satu item menu, tap backdrop overlay, tap tombol close (X), atau menekan tombol `Escape`.

### 2. Mobile Visual Polish & Hierarki Tipografi
- **Padding Horizontal Mobile**:
  - Diperbarui padding container utama di [`AppShell`](src/components/layout/AppShell.tsx) dari `p-3` (12px) menjadi `px-4 py-4 sm:p-5 md:p-6` (minimal 16px horizontal) agar card tidak mepet ke tepi layar.
- **Above-the-Fold Optimization (~390px Viewport)**:
  - Header sapaan dan tanggal di [`DashboardClientView`](src/components/dashboard/DashboardClientView.tsx) ditata lebih ringkas.
  - Elemen **"Progres Semester"** ditampilkan berdampingan secara responsif dengan tombol **"+ Tambah Tugas"** dalam satu baris fleksibel (`flex items-center justify-between sm:justify-end gap-3`), sehingga informasi penting tidak terdorong ke bawah fold pada layar 375px–430px.
- **Hierarki Tipografi**:
  - Mempertegas hierarki visual: Header sapaan tetap menjadi fokus primer (`font-editorial italic text-2xl sm:text-4xl`), sedangkan label section ("TENGGAT WAKTU & PRIORITAS", "KULIAH BERIKUTNYA", "JADWAL HARI INI", "KEMAJUAN SEMESTER") menggunakan gaya sekunder yang tenang (`text-[11px] font-mono font-medium uppercase tracking-wider text-muted-foreground`).

### 3. WhatsApp Assistant Stability Hardening
- Mengubah mekanisme pairing WhatsApp ke **QR Code** native Baileys 7.
- Menambahkan auto-clear kredensial mati pada event `logged_out` (401) / `bad_session` (500) dan saat pairing di-request ulang.
- Hardening socket Baileys: `keepAliveIntervalMs: 15_000` (15 detik), `connectTimeoutMs: 60_000`, desktop browser signature `["ForFH Assistant", "Chrome", "131.0.0.0"]`, dan integrasi self-healing loop 60s di background worker.

---
**Status Verifikasi**:
- `npm run quality`: 360/360 tes berhasil, 0 error ESLint/TypeScript.
- `npm run build`: 65/65 route Next.js ter-compile sukses.

---

## [2026-08-20] Polish Visual & Spacing Mobile Menu Drawer

### 1. Kepadatan Visual / Breathing Room
- Menambah vertical padding pada tiap baris item navigasi menjadi `py-3 px-3.5 min-h-[48px]` (sebelumnya `min-h-[44px] py-2`) serta gap antar icon-text `gap-3.5`.
- Mengatur container scrollable dengan padding `px-4 pt-3 pb-5 space-y-5` agar navigasi terasa luas, nyaman dibaca, dan mudah disentuh di layar kecil.

### 2. Peningkatan Kontras Item Aktif
- Mengganti styling state aktif dari abu-abu gelap `bg-surface-2` menjadi warna aksen primer (`bg-primary/10 text-primary font-semibold border-l-4 border-l-primary shadow-xs`).
- Icon dan teks item aktif berwarna `text-primary` konsisten dengan warna aksen "+ Tambah Tugas" / Paper & Ink identity (Dusty Navy di Light Mode & Glowing Cobalt di Dark Mode), menghasilkan kontras tinggi yang langsung terbaca.

### 3. Pemisah Antar-Group yang Tegas
- Menambahkan garis pemisah halus (`border-t border-border-default/60 pt-4`) di atas setiap group baru (AKADEMIK, PERANGKAT, PENGATURAN & AKUN).
- Mempertegas label section dengan gaya `text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground/80`.

### 4. Safe-Area Padding pada Footer Profil
- Memperbaiki padding footer profil menjadi `px-4 py-3.5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))]`.
- Menjamin ruang minimal 20px pada perangkat standar (Android lama) dan ruang bebas aman dari home indicator bar pada iPhone berponi/notch (iPhone X–16).

---
**Status Verifikasi**:
- `npm run quality`: 360/360 tes berhasil, 0 error ESLint/TypeScript.
- `npm run test`: 360/360 lolos.

---

## [2026-08-20] Pembuatan Halaman /profil & Pemisahan Identitas Personal Mahasiswa

### 1. Halaman Baru: `/profil` (`src/app/profil/page.tsx`)
- **Data Diri Mahasiswa**:
  - Menampilkan kartu identitas mahasiswa terverifikasi dari Kampus Kita (NIM, Tahun Angkatan, Jenjang, Program Studi, Status Akademik, Fakultas, Dosen Wali, serta metadata tambahan jika ada).
  - Sinkron otomatis dari sumber yang sama (`/api/campus/info` & `/api/auth/me`).
- **Preferensi Tampilan & Tema**:
  - Pilihan visual interaktif antara **Paper & Ink (Mode Terang)** dan **Warm Charcoal (Mode Gelap)** yang tersinkron langsung dengan `localStorage` dan class HTML tanpa perlu reload.
  - Link ringkas ke halaman `/pengaturan` untuk pengaturan sistem lanjutan (WhatsApp Assistant, Web Push, AI ForFH, Zona Waktu) guna mencegah duplikasi kontrol.
- **Sesi & Keamanan**:
  - Menampilkan status akun dan tombol **Keluar dari Akun (Logout)** yang membersihkan sesi server, token autentikasi, serta cache IndexedDB lokal.

### 2. Pembersihan Halaman `/info-kampus`
- Menghapus item `status_mhs` dari [`CAMPUS_JENIS_META`](src/components/campus/campusMeta.ts) sehingga section "Status Mahasiswa" tidak lagi ditampilkan di `/info-kampus`.
- Seluruh section aktivitas & akademik lainnya (Rekap Kehadiran, Kalender Akademik, Dosen Wali, Masa Studi, SKS Aktif, Peserta Mata Kuliah, Riwayat HER, Penyerahan KTM, Pembayaran) tetap utuh.

### 3. Interaktivitas Footer Drawer & Sidebar
- **[`MobileMenuDrawer`](src/components/layout/MobileMenuDrawer.tsx)**: Footer profil (avatar + nama mahasiswa) kini berupa link tappable ke `/profil` dengan indikator panah, padding safe-area yang lega, dan otomatis menutup drawer saat di-tap.
- **[`Sidebar`](src/components/layout/Sidebar.tsx)**: Baris profil desktop kini juga menjadi tautan aktif ke `/profil`.

---
**Status Verifikasi**:
- `npm run quality`: 360/360 tes berhasil, 0 error ESLint/TypeScript.
- `npm run build`: 66/66 route Next.js (termasuk `/profil`) ter-compile sukses.


