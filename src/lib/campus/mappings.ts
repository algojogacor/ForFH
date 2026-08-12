// Pemetaan murni (tanpa IO) dari respons Kampus Kita & iCal HE-BAT ke bentuk
// tabel ForFH. Semua fungsi deterministic — diuji di src/tests/campus.test.ts.
// Konvensi field Kampus Kita: UPPERCASE_SNAKE (lihat src/lib/campus/rows.ts).
import { pick } from "./rows";
import type { IcsEvent } from "./hebat";

// ---- tanggal & waktu -------------------------------------------------------

// "20260814T050000Z" (UTC) atau "20260814T050000" (tanpa Z) -> ms
export function icsTimestampToMs(ts: string | undefined): number | null {
  if (!ts) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(ts);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

// "08:00" | "08.00" | "8:00" -> "08:00"; kosong kalau tidak bisa di-parse
export function normalizeTime(raw: string): string {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(raw.trim());
  if (!m) return "";
  return m[1].padStart(2, "0") + ":" + m[2];
}

// Senin=1 ... Sabtu=6, Minggu=0 (konvensi ForFH: 0 = Sunday)
export function dayOfWeekFromId(nama: string): number | null {
  const map: Record<string, number> = {
    Minggu: 0, Senin: 1, Selasa: 2, Rabu: 3, Kamis: 4, Jumat: 5, Sabtu: 6,
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  const v = map[nama.trim()];
  return v === undefined ? null : v;
}

// "A"->4, "A-"->3.75, "B+"->3.5, ... "E"->0; null kalau bukan huruf nilai
export function gradePointFromLetter(letter: string): number | null {
  const map: Record<string, number> = {
    "A": 4, "A-": 3.75, "A/B": 3.75,
    "B+": 3.5, "B": 3, "B-": 2.75, "B/A": 3.5,
    "C+": 2.5, "C": 2, "C-": 1.75, "C/B": 2.5,
    "D": 1, "E": 0,
  };
  const v = map[letter.trim().toUpperCase()];
  return v === undefined ? null : v;
}

// ---- HE-BAT iCal -> tasks --------------------------------------------------

export interface MappedTask {
  externalId: string;
  title: string;
  description: string;
  dueAt: number | null;
  courseCode: string;
  courseName: string;
}

// CATEGORIES Moodle: "2026Ganjil - FHK25601032 - Hak Asasi Manusia - S1 - Ilmu Hukum -"
// Segmen: [term, kode, nama, ...]. Ambil kode & nama MK.
export function courseFromCategories(categories: string | undefined): { code: string; name: string } {
  if (!categories) return { code: "", name: "" };
  const seg = categories.split(" - ").map((s) => s.trim()).filter(Boolean);
  return { code: seg[1] || "", name: seg[2] || "" };
}

// SUMMARY "Assessment HAM is due" -> "Assessment HAM"
export function titleFromSummary(summary: string | undefined): string {
  const s = (summary || "").trim();
  return s.replace(/ is due\s*$/i, "").trim() || "Tugas";
}

// DESCRIPTION iCal sering berisi HTML dari Moodle (<p>, <br>, entity HTML).
// Bersihkan menjadi teks polos: tag penutup/br jadi baris baru, tag lain
// dibuang, entity didecode. Murni regex (tanpa DOM) — aman dipakai di test
// runner yang tidak punya jsdom. Tanpa batas panjang: deskripsi bulat-bulat
// lewat modal edit, jadi memotong di sini = kehilangan data saat disimpan.
// Entity didecode SEKALI lintas (bukan loop) supaya "&amp;lt;" -> "&lt;",
// bukan decode ganda jadi "<".
const ENTITY_MAP: Record<string, string> = {
  "amp": "&",
  "lt": "<",
  "gt": ">",
  "quot": '"',
  "apos": "'",
  "nbsp": " ",
  "#39": "'",
  "#160": " ",
  // Titik kode non-ASCII yang umum di teks Moodle (en-dash, kutip, dst.)
  "#8211": "–",
  "#8212": "—",
  "#8220": "“",
  "#8221": "”",
  "#8230": "…",
  "#215": "×",
  "#169": "©",
  "#171": "«",
  "#187": "»",
};

export function descriptionToText(raw: string | undefined): string {
  if (!raw) return "";
  const s = raw
    .replace(/<br\s*\/?>/gi, "\n") // <br>, <br/>, <br />
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "") // tag utuh dibuang; "5 < 10" selamat
    .replace(/\r\n/g, "\n");
  const decoded = s.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);/g, (m, name: string) => {
    const direct = ENTITY_MAP[name.toLowerCase()];
    if (direct !== undefined) return direct;
    const num = name[0] === "#"
      ? (name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10))
      : NaN;
    if (Number.isFinite(num)) {
      if (num === 160) return " "; // &nbsp; numerik
      return num >= 32 && num <= 0xffff ? String.fromCodePoint(num) : m;
    }
    return m;
  });
  return decoded.replace(/\n{2,}/g, "\n").replace(/ {2,}/g, " ").trim();
}

export function icsToTask(ev: IcsEvent): MappedTask {
  const { code, name } = courseFromCategories(ev.CATEGORIES);
  return {
    externalId: (ev.UID || "").trim() || `ics-${ev.SUMMARY}-${ev.DTSTART}`,
    title: titleFromSummary(ev.SUMMARY),
    description: descriptionToText(ev.DESCRIPTION),
    dueAt: icsTimestampToMs(ev.DTSTART),
    courseCode: code,
    courseName: name,
  };
}

// ---- Kampus Kita jadwal-kuliah -> courses + class_schedules ----------------

export interface MappedSchedule {
  externalId: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  room: string;
  lecturer: string;
  className: string;
  credits: number | null;
  courseCode: string;
  courseName: string;
}

export function jadwalToSchedules(rows: Record<string, unknown>[]): MappedSchedule[] {
  const out: MappedSchedule[] = [];
  for (const r of rows) {
    const dayRaw = pick(r, ["NM_JADWAL_HARI", "hari", "nama_hari"]);
    const day = dayOfWeekFromId(dayRaw);
    const jam = pick(r, ["JAM", "jam", "waktu"]).split("-");
    const start = normalizeTime(pick(r, ["WAKTU_MULAI", "jam_mulai", "mulai"]) || jam[0] || "");
    const end = normalizeTime(pick(r, ["WAKTU_SELESAI", "jam_selesai", "selesai"]) || jam[1] || "");
    const code = pick(r, ["KD_MATA_KULIAH", "kode_mk"]);
    const name = pick(r, ["NM_MATA_KULIAH", "nama_mk", "mata_kuliah"]);
    if (!code && !name) continue;
    const room = [pick(r, ["NM_RUANGAN", "ruang", "ruangan"]), pick(r, ["NM_GEDUNG"])].filter(Boolean).join(" ");
    const creditsRaw = pick(r, ["KREDIT_SEMESTER", "sks", "SKS"]);
    const credits = creditsRaw ? Number(creditsRaw) : null;
    out.push({
      externalId: [code || name, dayRaw, start, end].filter(Boolean).join("|"),
      dayOfWeek: day,
      startTime: start,
      endTime: end,
      room,
      lecturer: pick(r, ["NM_DOSEN", "dosen", "nama_dosen"]),
      className: pick(r, ["NAMA_KELAS", "kelas"]),
      credits: credits && Number.isFinite(credits) ? credits : null,
      courseCode: code,
      courseName: name,
    });
  }
  return out;
}

// ---- riwayat-khs -> grades -------------------------------------------------

export interface MappedGrade {
  externalId: string;
  componentName: string; // "KHS <tahun ajaran> <semester>"
  score: number | null;
  letterGrade: string;
  gradePoint: number | null;
  courseCode: string;
  courseName: string;
  sks: number | null;
}

export function khsToGrades(rows: Record<string, unknown>[], semesterLabel: string, semesterId: string): MappedGrade[] {
  const out: MappedGrade[] = [];
  for (const r of rows) {
    const code = pick(r, ["KODE", "KD_MATA_KULIAH"]);
    const name = pick(r, ["NAMA", "NM_MATA_KULIAH"]);
    if (!code && !name) continue;
    const letter = pick(r, ["NILAI_HURUF"]).trim().toUpperCase();
    const scoreRaw = pick(r, ["NILAI"]);
    const score = scoreRaw && Number(scoreRaw) ? Number(scoreRaw) : null;
    const sksRaw = pick(r, ["SKS"]);
    const sks = sksRaw ? Number(sksRaw) : null;
    out.push({
      externalId: `${semesterId}|${code || name}`,
      componentName: "KHS " + semesterLabel,
      score,
      letterGrade: letter,
      gradePoint: gradePointFromLetter(letter),
      courseCode: code,
      courseName: name,
      sks: sks && Number.isFinite(sks) ? sks : null,
    });
  }
  return out;
}

// ---- presensi-kuliah -> rekap per MK ---------------------------------------

export interface CourseRecap {
  code: string;
  name: string;
  tm: number | null; // total pertemuan (minggu)
  hadir: number | null; // jumlah hadir
  persen: number | null; // persentase hadir 0–100 (server atau hasil hitung)
}

function toNumber(v: string): number | null {
  if (v.trim() === "") return null; // Number("") === 0, bukan null
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Data presensi KK agregat per MK (tanpa tanggal) — dipakai untuk rekap
// otomatis; catatan per tanggal tetap manual di tabel attendance.
export function presensiToRecap(rows: Record<string, unknown>[]): CourseRecap[] {
  const out: CourseRecap[] = [];
  for (const r of rows) {
    const code = pick(r, ["KD_MATA_KULIAH", "KODE_MK", "KODE", "kode_mk"]);
    const name = pick(r, ["NM_MATA_KULIAH", "NAMA_MK", "NAMA", "nama_mk"]);
    if (!code && !name) continue;
    const tm = toNumber(pick(r, ["TOTAL_TM", "TOTAL_PERTEMUAN", "JUMLAH_TM", "TM"]));
    const hadir = toNumber(pick(r, ["JML_HADIR", "TOTAL_HADIR", "JUMLAH_HADIR", "HADIR"]));
    let persen = toNumber(pick(r, ["PERSEN", "PERSENTASE", "PERSEN_HADIR"]));
    if (persen === null && tm && hadir !== null) {
      persen = Math.min(100, Math.max(0, Math.round((hadir / tm) * 100)));
    }
    out.push({ code, name, tm, hadir, persen });
  }
  return out;
}

// ---- guard kelas (praktik kk_lite) -----------------------------------------
// Untuk tugas iCal: kalau CATEGORIES mengandung kelas (mis. "C-2"), hanya
// tampilkan kalau cocok dengan kelas kursus ForFH. Kode MK adalah penanda utama.
export function classNameFromCategories(categories: string | undefined): string {
  if (!categories) return "";
  const seg = categories.split(" - ").map((s) => s.trim()).filter(Boolean);
  // Kelas biasanya segmen terakhir berbentuk huruf-angka seperti "A-2", "C-2"
  for (let i = seg.length - 1; i >= 0; i--) {
    if (/^[A-C]-[1-9]$/.test(seg[i])) return seg[i];
  }
  return "";
}

// ---- instruksi tugas HE-BAT (section summary halaman kursus) ----------------
// Feed iCal HE-BAT punya DESCRIPTION kosong; instruksi asli ada di section
// summary tiap kursus. Crawl saat connect (sesi aktif) dan simpan di
// campus_data jenis "instruksi_tugas" — matching tugas dilakukan by nama
// aktivitas (data-activityname) di section yang sama.

// Decode entity HTML dasar (sama pola dengan descriptionToText) — dipakai saat
// collect data-activityname supaya nilai tersimpan bersih (sekali lintas,
// bukan di normalizeTaskText).
function decodeBasicEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#160);/gi, (m, name: string) => {
    const direct = ENTITY_MAP[name.toLowerCase()];
    return direct !== undefined ? direct : m;
  });
}

// Ambil isi div.summarytext dengan pencocokan tag div BERIMBANG (depth).
// Regex non-greedy lama berhenti di </div> pertama — summarytext Moodle sering
// berisi div bersarang (no-overflow, alert, tabel) sehingga instruksi
// terpotong. Pembuka dicari longgar (toleran class tambahan); tag <div ... />
// self-closing diabaikan. Murni regex, tanpa DOM.
function extractSummaryText(block: string): string {
  const open = /<div[^>]*class="[^"]*summarytext[^"]*"[^>]*>/i.exec(block);
  if (!open) return "";
  let depth = 1; // pembuka summarytext ikut dihitung — </div> pertama = penutupnya
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = open.index + open[0].length;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block))) {
    const tag = m[0];
    if (tag.startsWith("</")) depth--;
    else if (!/\/>$/.test(tag)) depth++; // <div ... /> self-closing diabaikan
    if (depth === 0) return block.slice(open.index + open[0].length, m.index);
  }
  return ""; // pembuka tanpa penutup (HTML terpotong) — jangan potong blok
}

export interface HebatSection {
  sectionId: string; // data-id <li id="section-..."> (id section Moodle)
  sectionName: string; // data-sectionname (judul section)
  summary: string; // HTML mentah div.summarytext ("" kalau tidak ada)
  assignments: string[]; // semua data-activityname dalam section, urut kemunculan
}

export interface HebatCourseInstructions {
  courseId: string;
  shortname: string; // segmen ke-2 dari fullname H1
  fullname: string;
  sections: HebatSection[];
}

// Halaman /course/view.php?id=N. H1 = fullname ("2026Ganjil - FHK... - Nama MK -
// ..."), shortname = segmen ke-2 split " - ". Section dipotong per
// <li id="section-..."> (blok section; aktivitas <li class="activity"> bukan
// <li id="section-"> jadi tidak ikut terpotong). Urutan section dipertahankan.
export function parseCoursePage(html: string, courseId: string): HebatCourseInstructions {
  // H1 bisa memuat tag inline (<span>) — strip dulu sebelum split segmen
  const fullname = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || "").replace(/<[^>]+>/g, "").trim();
  const shortname = fullname.split(" - ")[1] || "";
  const sections: HebatSection[] = [];
  const marker = '<li id="section-';
  let start = html.indexOf(marker);
  while (start >= 0) {
    const next = html.indexOf(marker, start + marker.length);
    const block = next >= 0 ? html.slice(start, next) : html.slice(start);
    const head = block.slice(0, 500);
    const sectionId = /data-id="(\d+)"/.exec(head)?.[1] || "";
    if (sectionId) {
      const sectionName = /data-sectionname="([^"]*)"/.exec(head)?.[1] || "";
      // Ambil summarytext pertama dalam blok — div berimbang (HTML mentah,
      // dibersihkan nanti via descriptionToText)
      const summary = extractSummaryText(block);
      const assignments: string[] = [];
      const actRe = /data-activityname="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = actRe.exec(block))) assignments.push(decodeBasicEntities(m[1]));
      sections.push({ sectionId, sectionName, summary, assignments });
    }
    if (next < 0) break;
    start = next;
  }
  return { courseId, shortname, fullname, sections };
}

// Normalisasi teks untuk pencocokan nama (case-insensitive, whitespace
// beruntun jadi satu spasi) — dipakai mencocokkan title tugas dengan
// data-activityname di halaman kursus.
export function normalizeTaskText(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Cari instruksi untuk satu tugas: cocokkan kursus (shortname == courseCode,
// atau fullname memuat courseName), lalu section yang berisi aktivitas
// bernama task.title. Kembalikan teks instruksi (HTML dibersihkan), null
// kalau kursus/section tidak ditemukan atau summary kosong.
// Pencocokan dipersempit: shortname HANYA saat courseCode non-kosong, fallback
// fullname HANYA saat courseCode kosong (supaya kode yang salah arah tidak
// menimpa pencocokan by kode MK).
export function instructionFor(
  instructions: HebatCourseInstructions[],
  task: { courseCode: string; courseName: string; title: string }
): string | null {
  if (!task.title) return null;
  const entry = instructions.find(
    (e) =>
      (!!task.courseCode && e.shortname === task.courseCode) ||
      (!task.courseCode && !!task.courseName && normalizeTaskText(e.fullname).includes(normalizeTaskText(task.courseName)))
  );
  if (!entry) return null;
  const target = normalizeTaskText(task.title);
  const section = entry.sections.find((s) =>
    s.assignments.some((a) => normalizeTaskText(a) === target)
  );
  if (!section || !section.summary) return null;
  return descriptionToText(section.summary);
}
