# Keputusan Arsitektur & Rekayasa (Architecture Decision Records) — ForFH Web & Backend

Dokumen ini mencatat seluruh keputusan teknis, perbaikan arsitektur sistem, investigasi *root cause*, dan modul baru pada platform Web, API, Bot WhatsApp, dan Notification Engine `ForFH`.

---

## ADR-001: Hybrid Token Parsing pada Autentikasi UNAIR KampusKita
* **Tanggal:** 19 Agustus 2026
* **Status:** Diterapkan
* **Konteks & Masalah:**
  Autentikasi mahasiswa ke endpoint `/api/auth/login` sempat mengembalikan status 500/401 padahal email dan password benar saat dicek ke server UNAIR.
* **Akar Masalah (*Root Cause*):**
  Server UNAIR (`apikampuskita-mahasiswa.unair.ac.id/auth/login`) mengirimkan JWT sesi di dua lokasi: header `Set-Cookie` dan isi body JSON `{"token": "..."}`. Pada runtime container Node.js / Next.js fetch di Koyeb, header cookie tidak selalu terekspos melalui `headers.get("set-cookie")`. Karena kode lama hanya membaca cookie via regex `setCookie.match(/token=([^;]+)/)`, token terbaca string kosong `""` dan memicu error parsing.
* **Solusi & Keputusan:**
  Di `src/lib/campus/kampuskita.ts`, sistem diubah menjadi metode hybrid: mengekstrak cookie via `getSetCookie()` / `get("set-cookie")` dengan fallback otomatis ke `bodyJson.token`.

---

## ADR-002: Kebijakan Rate Limiter & Mitigasi False Lockout
* **Tanggal:** 19 Agustus 2026
* **Status:** Diterapkan
* **Konteks & Masalah:**
  Pengguna sah terkunci dengan pesan *"Batas percobaan terlampaui / 429"* selama 15 menit akibat request gagal berulang saat proses restart server.
* **Akar Masalah (*Root Cause*):**
  Rate limit lokal di tabel `auth_rate_limits` (Turso SQLite) menerapkan limit 5 percobaan dengan durasi blokir 900 detik (15 menit). Saat terjadi bug parsing atau transisi server, percobaan gagal terakumulasi dan mengunci IP/akun secara permanen hingga batas waktu habis.
* **Solusi & Keputusan:**
  1. Hapus catatan blokir kadaluwarsa dari tabel `auth_rate_limits`.
  2. Hapus rate limit ganda lokal pada `/api/auth/login` karena server KampusKita UNAIR sendiri telah memiliki mekanisme *rate limiting* dan proteksi kredensial di sisi kampus.

---

## ADR-003: Evaluasi Target Notifikasi Terjadwal untuk Pengguna WhatsApp-Only
* **Tanggal:** 19 Agustus 2026
* **Status:** Diterapkan
* **Konteks & Masalah:**
  Bot WhatsApp merespons interaktif terhadap perintah chat (`!jadwal`, `!menu`), tetapi pengingat otomatis jadwal kuliah dan tenggat tugas tidak pernah terkirim ke WhatsApp.
* **Akar Masalah (*Root Cause*):**
  Fungsi evaluasi `processDueReminders()` di `src/lib/notifications/worker.ts` sebelumnya hanya mengambil daftar pengguna dari tabel `pushSubscriptions` (Web Push Browser):
  ```typescript
  // Kode lama:
  const activeUsers = await db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions);
  ```
  Jika mahasiswa hanya menghubungkan nomor WhatsApp via `wa_bindings` tanpa mengaktifkan Web Push di browser, `activeUsers` bernilai 0 (kosong), sehingga seluruh evaluasi jadwal kuliah dan tugas diabaikan.
* **Solusi & Keputusan:**
  Query di `worker.ts` diperluas untuk menggabungkan `pushSubscriptions` dan `waBindings` (`status = 'active'`). Pengguna yang hanya mengaktifkan WhatsApp kini 100% masuk dalam antrean evaluasi pengingat.

---

## ADR-004: In-Process 60-Second Background Reminder Loop di Koyeb
* **Tanggal:** 19 Agustus 2026
* **Status:** Diterapkan
* **Konteks & Masalah:**
  Notifikasi terjadwal membutuhkan pemicu periodik (cron). Sebelumnya sistem mengandalkan webhook eksternal (Upstash QStash) yang memanggil `/api/internal/reminders/process`. Jika cron QStash belum disetel di Koyeb, `processDueReminders()` tidak pernah dijalankan secara otomatis.
* **Solusi & Keputusan:**
  Ditambahkan fungsi `startInternalReminderLoop()` di `worker.ts` yang otomatis dipanggil saat bot WhatsApp terkoneksi di `client-manager.ts`. Interval ini berjalan mandiri setiap **60 detik** di dalam container Koyeb untuk memeriksa jadwal kuliah (H-4 jam, H-2 jam, H-1 jam, H-30m, H-20m) dan tenggat tugas tanpa tergantung layanan cron luar.

---

## ADR-005: Modul Riwayat Log Notifikasi & WhatsApp di Dashboard Web
* **Tanggal:** 19 Agustus 2026
* **Status:** Diterapkan
* **Konteks & Solusi:**
  Untuk transparansi pengiriman pesan dan memudahkan *debugging*, dibuat fitur pencatat log di web:
  1. **Endpoint `GET /api/notifications/logs`**: Mengembalikan 50 riwayat pengiriman notifikasi/pengingat untuk user yang sedang login, diperkaya dengan nama mata kuliah, ruangan, judul tugas, offset waktu, saluran (`whatsapp` / `web_push`), status (`SENT` / `FAILED`), dan timestamp.
  2. **Komponen `NotificationLogCard`**: Ditampilkan di halaman `/pengaturan` web dengan badge visual, indikator status, dan tombol *Segarkan* / auto-refresh 30 detik.
