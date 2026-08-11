export const APP_NAME = "ForFH";
export const APP_TAGLINE = "Academic Operating System untuk Mahasiswa Hukum & Universitas";

export const TASK_TYPES = [
  { value: "assignment", label: "Tugas", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { value: "essay", label: "Esai", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  { value: "paper", label: "Makalah", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  { value: "presentation", label: "Presentasi", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { value: "reading", label: "Bacaan", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  { value: "quiz", label: "Kuis", color: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
  { value: "practice", label: "Praktikum / Simulasi", color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
  { value: "administrative", label: "Administrasi", color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
  { value: "other", label: "Lainnya", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
] as const;

export const TASK_PRIORITIES = [
  { value: "low", label: "Rendah", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  { value: "medium", label: "Sedang", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { value: "high", label: "Tinggi", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { value: "urgent", label: "Mendesak", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
] as const;

export const TASK_STATUSES = [
  { value: "NOT_STARTED", label: "Belum Mulai", color: "text-slate-400 bg-slate-500/10" },
  { value: "IN_PROGRESS", label: "Sedang Dikerjakan", color: "text-amber-400 bg-amber-500/10" },
  { value: "REVISION", label: "Revisi", color: "text-purple-400 bg-purple-500/10" },
  { value: "DONE", label: "Selesai", color: "text-emerald-400 bg-emerald-500/10" },
  { value: "OVERDUE", label: "Terlambat", color: "text-rose-400 bg-rose-500/10" },
] as const;

export const EXAM_TYPES = [
  { value: "UTS", label: "Ujian Tengah Semester (UTS)", color: "bg-amber-500/10 text-amber-500" },
  { value: "UAS", label: "Ujian Akhir Semester (UAS)", color: "bg-rose-500/10 text-rose-500" },
  { value: "QUIZ", label: "Kuis / Responsi", color: "bg-blue-500/10 text-blue-500" },
  { value: "OTHER", label: "Ujian Lainnya", color: "bg-zinc-500/10 text-zinc-500" },
] as const;

export const ATTENDANCE_STATUSES = [
  { value: "PRESENT", label: "Hadir", short: "H", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  { value: "PERMIT", label: "Izin", short: "I", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  { value: "SICK", label: "Sakit", short: "S", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  { value: "ABSENT", label: "Alpha", short: "A", color: "bg-rose-500/10 text-rose-500 border-rose-500/30" },
] as const;

export const READING_TYPES = [
  { value: "book", label: "Buku Teks / Literatur", icon: "BookOpen" },
  { value: "journal", label: "Jurnal Ilmiah", icon: "FileText" },
  { value: "law", label: "Peraturan Perundang-undangan", icon: "Scale" },
  { value: "case", label: "Putusan / Yurisprudensi", icon: "Gavel" },
  { value: "module", label: "Modul Diktat", icon: "Layers" },
  { value: "ppt", label: "Slide Presentasi Dosen", icon: "Presentation" },
  { value: "other", label: "Lainnya", icon: "File" },
] as const;

export const READING_STATUSES = [
  { value: "NOT_STARTED", label: "Belum Dibaca" },
  { value: "READING", label: "Sedang Dibaca" },
  { value: "DONE", label: "Selesai" },
] as const;

export const FILE_CATEGORIES = [
  { value: "assignment", label: "Tugas & Makalah" },
  { value: "note", label: "Catatan Kuliah" },
  { value: "reading", label: "Bahan Bacaan & Jurnal" },
  { value: "course_material", label: "Materi Kuliah & Slide" },
  { value: "other", label: "Lain-lain" },
] as const;

export const DEFAULT_CLASS_REMINDER_OFFSETS = [120, 90, 60, 30, 20] as const;
export const DEFAULT_PRIMARY_CLASS_WARNING_MINUTES = 240; // 4 hours

export const DEFAULT_TASK_REMINDER_OFFSETS = [
  10080, // 7 days
  4320,  // 3 days
  1440,  // 1 day
  360,   // 6 hours
  60,    // 1 hour
] as const;

export const PASAL_REGULATION_TYPES = [
  { code: "UUD", label: "Undang-Undang Dasar 1945" },
  { code: "TAP_MPR", label: "Ketetapan MPR" },
  { code: "UU", label: "Undang-Undang" },
  { code: "PERPPU", label: "Peraturan Pemerintah Pengganti Undang-Undang" },
  { code: "KUHPERDATA", label: "Kitab Undang-Undang Hukum Perdata" },
  { code: "PP", label: "Peraturan Pemerintah" },
  { code: "PERPRES", label: "Peraturan Presiden" },
  { code: "KEPPRES", label: "Keputusan Presiden" },
  { code: "INPRES", label: "Instruksi Presiden" },
  { code: "PENPRES", label: "Penetapan Presiden" },
  { code: "PERMEN", label: "Peraturan Menteri" },
  { code: "PERMENKUMHAM", label: "Peraturan Menteri Hukum dan HAM" },
  { code: "PERMENKUM", label: "Peraturan Menteri Hukum" },
  { code: "PERBAN", label: "Peraturan Badan / Lembaga" },
  { code: "PERDA", label: "Peraturan Daerah" },
  { code: "PERDA_PROV", label: "Peraturan Daerah Provinsi" },
  { code: "PERDA_KAB", label: "Peraturan Daerah Kabupaten/Kota" },
  { code: "KEPMEN", label: "Keputusan Menteri" },
  { code: "SE", label: "Surat Edaran" },
  { code: "PERMA", label: "Peraturan Mahkamah Agung" },
  { code: "PBI", label: "Peraturan Bank Indonesia" },
  { code: "UUDRT", label: "Undang-Undang Darurat" },
  { code: "UUDS", label: "UUDS 1950" },
  { code: "PMK", label: "Peraturan Menteri Keuangan" },
  { code: "PUTUSAN_MK", label: "Putusan Mahkamah Konstitusi" },
  { code: "PERKETUA_MK", label: "Peraturan Ketua Mahkamah Konstitusi" },
  { code: "PERSEKJEN_MK", label: "Peraturan Sekretaris Jenderal Mahkamah Konstitusi" },
  { code: "POJK", label: "Peraturan Otoritas Jasa Keuangan" },
  { code: "PERGUB", label: "Peraturan Gubernur" },
  { code: "PERBUP", label: "Peraturan Bupati" },
  { code: "PERWALI", label: "Peraturan Walikota" },
  { code: "QANUN", label: "Qanun Aceh" },
  { code: "PERDASUS", label: "Peraturan Daerah Khusus Papua" },
  { code: "PERDAIS", label: "Peraturan Daerah Istimewa Yogyakarta" },
] as const;

export const DEFAULT_GRADE_POINTS: Record<string, number> = {
  "A": 4.0,
  "A-": 3.75,
  "B+": 3.5,
  "B": 3.0,
  "B-": 2.75,
  "C+": 2.5,
  "C": 2.0,
  "D": 1.0,
  "E": 0.0,
};
