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
