import { eq } from "drizzle-orm";
import { db, userSettings } from "@/lib/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { AICallOptions, AIResult } from "./types";
import { getNextGroqSlot, callGroq } from "./groq";
import { getNextOllamaSlot, callOllama } from "./ollama";
import { loadPersistedCooldowns } from "./circuit-breaker";

// Batas total seluruh rantai fallback — jangan biarkan request > 35 detik
const TOTAL_DEADLINE_MS = 35_000;
// Rate limit per user: 30 permintaan AI per jam
const AI_RATE_LIMIT = { maxAttempts: 30, windowMs: 60 * 60 * 1000 };

export async function executeAIRequest<T = any>(options: AICallOptions): Promise<AIResult<T>> {
  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  const pastDeadline = () => Date.now() > deadline;

  // Muat cooldown persisten dari app_config (idempoten — sekali baca per proses)
  await loadPersistedCooldowns();

  // Gate per-user: rate limit + toggle AI (server-side, tidak hanya UI)
  if (options.userId) {
    const rl = await checkRateLimit(`ai:${options.userId}`, AI_RATE_LIMIT);
    if (!rl.allowed) {
      return {
        success: false,
        text: "Batas penggunaan AI tercapai. Coba lagi nanti.",
        provider: "groq",
        accountSlot: 1,
        model: "none",
        latencyMs: 0,
        error: rl.error || "rate limited",
        fallbackUsed: true,
      };
    }
    try {
      const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, options.userId) });
      if (settings && !settings.aiEnabled) {
        return {
          success: false,
          text: "Fitur AI dimatikan di Pengaturan.",
          provider: "groq",
          accountSlot: 1,
          model: "none",
          latencyMs: 0,
          error: "AI disabled",
          fallbackUsed: true,
        };
      }
    } catch {
      /* settings tidak ditemukan → lanjut (default aktif) */
    }
  }

  // 1. Try Primary Groq Slot
  const groqSlot1 = getNextGroqSlot();
  if (groqSlot1) {
    const res1 = await callGroq(groqSlot1, options);
    if (res1.success && (!options.responseSchema || res1.data !== undefined)) {
      return res1;
    }

    // 2. Try Alternate Groq Slot if available
    const groqSlot2 = getNextGroqSlot();
    if (groqSlot2 && groqSlot2 !== groqSlot1 && !pastDeadline()) {
      const res2 = await callGroq(groqSlot2, options);
      if (res2.success && (!options.responseSchema || res2.data !== undefined)) {
        return res2;
      }
    }
  }

  // 3. Fallback to Ollama Cloud
  const ollamaSlot1 = getNextOllamaSlot();
  if (ollamaSlot1 && !pastDeadline()) {
    const resOllama1 = await callOllama(ollamaSlot1, options);
    if (resOllama1.success && (!options.responseSchema || resOllama1.data !== undefined)) {
      return resOllama1;
    }

    // 4. Try Alternate Ollama Slot
    const ollamaSlot2 = getNextOllamaSlot();
    if (ollamaSlot2 && ollamaSlot2 !== ollamaSlot1 && !pastDeadline()) {
      const resOllama2 = await callOllama(ollamaSlot2, options);
      if (resOllama2.success && (!options.responseSchema || resOllama2.data !== undefined)) {
        return resOllama2;
      }
    }

    // 5. Try MiniMax M3 Cloud Last Resort Model
    const lastResortModel = process.env.OLLAMA_LAST_RESORT_MODEL || "minimax-m3:cloud";
    if (!pastDeadline()) {
      const resMiniMax = await callOllama(ollamaSlot1, options, lastResortModel);
      if (resMiniMax.success && (!options.responseSchema || resMiniMax.data !== undefined)) {
        return resMiniMax;
      }
    }
  }

  // 6. Graceful Degradation / AI Unavailable
  return {
    success: false,
    text: "Layanan AI sedang tidak tersedia atau belum dikonfigurasi. Fitur utama aplikasi tetap dapat digunakan secara manual.",
    provider: "groq",
    accountSlot: 1,
    model: "none",
    latencyMs: 0,
    error: "Semua penyedia AI sedang tidak dapat dijangkau.",
    fallbackUsed: true,
  };
}
