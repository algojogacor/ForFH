// src/lib/wa/rate-limit.ts — B4: key dari resolved identity (prioritas userId,
// fallback JID/LID stabil — BUKAN substring phone).
import { checkRateLimit } from "@/lib/auth/rate-limit";
import type { WaIdentity } from "./types";

const MESSAGE_LIMIT = { maxAttempts: 20, windowMs: 60_000 }; // 20 pesan/menit
const GUIDE_LIMIT = { maxAttempts: 1, windowMs: 60 * 60_000 }; // panduan maks 1/sender/jam
const AI_INTERVAL_MS = 5_000; // B4: interval 5 detik antar pesan AI per sender

const aiLastReply = new Map<string, number>();

export function waRateLimitKey(userId: string | null, identity: WaIdentity, remoteJid: string): string {
  if (userId) return `wa:user:${userId}`;
  const stable = identity.jid || (identity.lid ? `${identity.lid}@lid` : null) || remoteJid;
  return `wa:jid:${stable}`;
}

export async function allowMessage(rlKey: string): Promise<{ allowed: boolean }> {
  return checkRateLimit(`wa:msg:${rlKey}`, MESSAGE_LIMIT);
}

export async function allowGuide(rlKey: string): Promise<{ allowed: boolean }> {
  return checkRateLimit(`wa:guide:${rlKey}`, GUIDE_LIMIT);
}

/** Guard interval AI — in-memory (Turso hot path, F4). Pemanggilan pertama
 *  mengonsumsi slot; pesan yang ditolak TIDAK menggeser last-reply. */
export function allowAiReply(rlKey: string): boolean {
  const now = Date.now();
  const last = aiLastReply.get(rlKey) ?? 0;
  if (now - last < AI_INTERVAL_MS) return false;
  aiLastReply.set(rlKey, now);
  if (aiLastReply.size > 5000) {
    const cutoff = now - 10 * 60_000;
    for (const [k, v] of aiLastReply) if (v < cutoff) aiLastReply.delete(k);
  }
  return true;
}

export function resetAiReplyForTests(): void { aiLastReply.clear(); }
