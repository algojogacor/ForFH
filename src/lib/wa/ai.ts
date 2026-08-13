// src/lib/wa/ai.ts — C5: natural language TANPA checkRateLimit('ai') —
// executeAIRequest dipanggil TANPA userId agar kuota 30/jam web tidak
// terpakai; aiEnabled dicek manual di sini.
import { eq } from "drizzle-orm";
import { db, userSettings } from "@/lib/db";
import { executeAIRequest } from "@/lib/ai/router";
import { fetchJadwalData } from "./executors/jadwal";
import { fetchTugasData } from "./executors/tugas";
import { fetchNilaiData } from "./executors/nilai";

const WA_AI_SYSTEM_PROMPT = `Kamu adalah asisten ForFH — aplikasi jadwal kuliah, tugas, dan nilai mahasiswa. Jawab pertanyaan user dengan SINGKAT (maks ~500 karakter), ramah, Bahasa Indonesia, boleh pakai emoji dan *bold* secukupnya. Tidak perlu listing panjang. Data user saat ini:\n\n{{DATA}}`;

export async function handleNaturalLanguage(userId: string, text: string): Promise<string> {
  const trimmed = (text || "").trim().slice(0, 500); // cap input 500 char (B4)
  if (!trimmed) return "Halo! Ketik !help utk daftar perintah.";
  const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  if (settings && !settings.aiEnabled) return "Fitur AI nonaktif — ketik !help untuk perintah.";

  const [jadwal, tugas, nilai] = await Promise.all([
    fetchJadwalData(userId),
    fetchTugasData(userId, 5),
    fetchNilaiData(userId),
  ]);
  const dataStr =
    `Jadwal minggu ini: ${jadwal.slice(0, 10).map((j) => `${j.dayOfWeek} ${j.startTime} ${j.courseName}`).join(", ") || "tidak ada"}\n` +
    `Tugas terdekat: ${tugas.map((t) => t.title).join("; ") || "tidak ada"}\n` +
    `Nilai: ${nilai.map((n) => `${n.courseName} (${n.komponen} komponen)${n.letterGrade ? ` ${n.letterGrade}` : ""}`).join("; ") || "belum ada"}`;

  const result = await executeAIRequest({
    prompt: trimmed,
    systemPrompt: WA_AI_SYSTEM_PROMPT.replace("{{DATA}}", dataStr),
    requestType: "study_assistant",
    maxTokens: 800,
    // userId sengaja TIDAK dikirim — C5: jalur WA bebas kuota 30/jam web
  });
  return result.success && result.text
    ? result.text
    : "Layanan AI sedang tidak tersedia. Ketik !help untuk perintah.";
}
