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
