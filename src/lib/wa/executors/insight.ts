// src/lib/wa/executors/insight.ts — !insight: AI-first dengan cache 24 jam
// (C3); fallback heuristik tanpa AI. Cache WA terpisah dari web (web
// menyimpan objek terstruktur, WA teks — hindari String(obj)).
import { and, asc, eq } from "drizzle-orm";
import { db, classSchedules, courses, tasks } from "@/lib/db";
import { executeAIRequest } from "@/lib/ai/router";
import { getCachedAI, setCachedAI } from "@/lib/ai/cache";
import { formatInsight } from "../format";
import { fetchTugasData } from "./tugas";

const WA_INSIGHT_SYSTEM_PROMPT = `Kamu asisten ForFH. Buat "insight harian" singkat (maks ~300 karakter) dalam Bahasa Indonesia untuk mahasiswa: sorot kuliah hari ini, tenggat tugas terdekat, dan saran singkat. Data user:\n\n{{DATA}}`;

export async function executeInsight(userId: string, now: Date = new Date()): Promise<string> {
  const dayKey = `wa-insight:${now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}`;
  const cached = await getCachedAI(userId, "daily_insight", dayKey);
  if (cached) return formatInsight(String(cached));

  // Data ringkas (sama dgn route daily-insight)
  const nowWib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const todayClasses = await db
    .select({ name: courses.name, startTime: classSchedules.startTime })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(and(eq(classSchedules.userId, userId), eq(classSchedules.enabled, 1), eq(classSchedules.dayOfWeek, nowWib.getDay())))
    .orderBy(asc(classSchedules.startTime))
    .then((r) => r.slice(0, 8));
  const tasksData = await fetchTugasData(userId, 5);

  const dataStr =
    `Jadwal hari ini (WIB): ${todayClasses.map((c) => `${c.startTime} ${c.name}`).join(", ") || "tidak ada"}\n` +
    `Tugas terdekat: ${tasksData.map((t) => `${t.title}${t.dueAt ? ` (deadline ${new Date(t.dueAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })})` : ""}`).join("; ") || "tidak ada"}`;

  const result = await executeAIRequest({
    prompt: "Buat insight harian untuk saya.",
    systemPrompt: WA_INSIGHT_SYSTEM_PROMPT.replace("{{DATA}}", dataStr),
    requestType: "daily_insight",
    userId, // perintah ! — perilaku normal (termasuk kuota 30/jam web)
    maxTokens: 400,
  });
  if (result.success && result.text) {
    await setCachedAI(userId, "daily_insight", dayKey, result.text, 24 * 60 * 60 * 1000);
    return formatInsight(result.text);
  }
  // Fallback heuristik (tanpa AI)
  const next = todayClasses[0];
  const fallback = next
    ? `Kuliah berikutnya hari ini: ${next.name} pukul ${next.startTime}.`
    : "Tidak ada kuliah hari ini — waktu luang bisa dipakai mengerjakan tugas.";
  const tugasFallback = tasksData[0] ? ` Tugas terdekat: ${tasksData[0].title}.` : "";
  return formatInsight(fallback + tugasFallback);
}
