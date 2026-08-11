import { z } from "zod";

// 1. Quick Capture Parser Schema
export const QuickCaptureSchema = z.object({
  title: z.string().describe("Judul tugas yang jelas dan padat"),
  courseGuess: z
    .string()
    .nullable()
    .describe("Nama mata kuliah jika terdeteksi dari input, atau null"),
  type: z
    .enum([
      "assignment",
      "essay",
      "paper",
      "presentation",
      "reading",
      "quiz",
      "practice",
      "administrative",
      "other",
    ])
    .default("assignment")
    .describe("Jenis tugas akademis"),
  dueDate: z
    .string()
    .nullable()
    .describe("Tanggal deadline format YYYY-MM-DD jika disebutkan, atau null"),
  dueTime: z
    .string()
    .nullable()
    .describe("Waktu deadline format HH:MM (24 jam) jika disebutkan, e.g. 23:59 atau 09:00"),
  priority: z
    .enum(["low", "medium", "high", "urgent"])
    .default("medium")
    .describe("Tingkat prioritas berdasarkan urgensi waktu atau bobot"),
  estimatedMinutes: z
    .number()
    .nullable()
    .describe("Estimasi waktu pengerjaan dalam menit, atau null jika tidak tahu"),
  notes: z
    .string()
    .nullable()
    .describe("Detail atau instruksi tambahan yang terdeteksi, atau null"),
});

export type QuickCaptureOutput = z.infer<typeof QuickCaptureSchema>;

// 2. Task Breakdown Schema
export const TaskBreakdownSchema = z.object({
  overview: z.string().describe("Ringkasan singkat tahapan pengerjaan tugas"),
  subtasks: z.array(
    z.object({
      title: z.string().describe("Langkah tindakan konkret yang dapat diselesaikan"),
      estimatedMinutes: z.number().describe("Estimasi pengerjaan dalam menit"),
      orderIndex: z.number().describe("Urutan pengerjaan mulai dari 1"),
    })
  ),
});

export type TaskBreakdownOutput = z.infer<typeof TaskBreakdownSchema>;

// 3. Smart Deadline Planner Schema
export const SmartDeadlineSchema = z.object({
  overview: z.string().describe("Strategi pengerjaan bertahap sebelum deadline"),
  internalTargetDate: z
    .string()
    .describe("Tanggal target internal (safety buffer) format YYYY-MM-DD HH:MM"),
  bufferHours: z.number().describe("Jumlah jam buffer sebelum hard deadline"),
  milestones: z.array(
    z.object({
      title: z.string().describe("Judul tahapan/milestone"),
      scheduledDate: z.string().describe("Tanggal jadwal format YYYY-MM-DD"),
      scheduledTime: z.string().nullable().describe("Waktu yang disarankan e.g. 19:00"),
      estimatedMinutes: z.number().describe("Durasi pengerjaan (menit)"),
      phase: z.string().describe("Fase e.g. Riset, Draft, Analisis, Revisi, Finalisasi"),
    })
  ),
});

export type SmartDeadlineOutput = z.infer<typeof SmartDeadlineSchema>;

// 4. Note Summarizer & Study Assistant Schema
export const NoteSummarySchema = z.object({
  summary: z.string().describe("Ringkasan komprehensif materi dalam Bahasa Indonesia"),
  keyPoints: z.array(z.string()).describe("Poin-poin penting / asas hukum / doktrin"),
  legalTerms: z
    .array(
      z.object({
        term: z.string().describe("Istilah atau asas hukum (e.g. Pacta Sunt Servanda)"),
        definition: z.string().describe("Penjelasan ringkas makna istilah tersebut"),
      })
    )
    .default([]),
  reviewQuestions: z
    .array(z.string())
    .describe("Pertanyaan uji pemahaman / evaluasi untuk persiapan ujian"),
});

export type NoteSummaryOutput = z.infer<typeof NoteSummarySchema>;

// 5. Legal Explainer Schema
export const LegalExplainerSchema = z.object({
  regulationTitle: z.string().describe("Judul peraturan yang dianalisis"),
  summary: z.string().describe("Penjelasan substansi pasal dalam bahasa yang mudah dipahami"),
  articleBreakdown: z.array(
    z.object({
      articleNumber: z.string().describe("Nomor pasal/ayat"),
      explanation: z.string().describe("Makna hukum dan unsur-unsurnya"),
      practicalContext: z.string().describe("Contoh penerapan dalam kasus nyata"),
    })
  ),
  keyTakeaway: z.string().describe("Intisari / kesimpulan akademis utama"),
  disclaimer: z
    .string()
    .default(
      "Penjelasan ini ditujukan untuk tujuan akademis dan studi mahasiswa hukum, bukan nasihat hukum profesional."
    ),
});

export type LegalExplainerOutput = z.infer<typeof LegalExplainerSchema>;

// 6. Daily Insight Schema
export const DailyInsightSchema = z.object({
  greeting: z.string().describe("Sapaan personal singkat e.g. Selamat pagi / siang"),
  insight: z
    .string()
    .describe("1-3 kalimat actionable menjawab 'SEKARANG AKU HARUS NGAPAIN?'"),
  urgentFocus: z
    .string()
    .nullable()
    .describe("Hal terpenting yang perlu diselesaikan hari ini"),
  suggestedAction: z.string().describe("Tindakan awal pertama yang paling mudah dimulai"),
});

export type DailyInsightOutput = z.infer<typeof DailyInsightSchema>;
