import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, aiCache } from "@/lib/db";
import { logger } from "@/lib/logger";

// Cache hasil AI per (user, jenis, key). Menghindari panggilan provider untuk
// permintaan deterministik (daily-insight per hari, explain-law per pertanyaan).
export async function getCachedAI(userId: string, jenis: string, cacheKey: string): Promise<unknown | null> {
  try {
    const row = await db.select().from(aiCache).where(and(
      eq(aiCache.userId, userId),
      eq(aiCache.jenis, jenis),
      eq(aiCache.cacheKey, cacheKey),
      gt(aiCache.expiresAt, new Date()),
    )).limit(1).then((rows) => rows[0]);
    if (!row) return null;
    return JSON.parse(row.resultJson);
  } catch (e: any) {
    logger.warn(`getCachedAI ${jenis}: ${e?.message || e}`);
    return null;
  }
}

export async function setCachedAI(userId: string, jenis: string, cacheKey: string, data: unknown, ttlMs: number): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlMs);
    const resultJson = JSON.stringify(data);
    const existing = await db.select().from(aiCache).where(and(
      eq(aiCache.userId, userId),
      eq(aiCache.jenis, jenis),
      eq(aiCache.cacheKey, cacheKey),
    )).limit(1).then((rows) => rows[0]);
    if (existing) {
      await db.update(aiCache).set({ resultJson, expiresAt }).where(eq(aiCache.id, existing.id));
    } else {
      await db.insert(aiCache).values({ id: crypto.randomUUID(), userId, jenis, cacheKey, resultJson, expiresAt });
    }
  } catch (e: any) {
    logger.warn(`setCachedAI ${jenis}: ${e?.message || e}`);
  }
}
