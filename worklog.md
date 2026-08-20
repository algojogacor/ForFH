# Worklog — ForFH Web Companion

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
