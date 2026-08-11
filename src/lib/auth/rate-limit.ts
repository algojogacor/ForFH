import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, authRateLimits } from "../db";

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
  error?: string;
}

/**
 * Checks and increments rate limit counter in Turso-backed database
 */
export async function checkRateLimit(
  key: string,
  options: {
    maxAttempts: number;
    windowMs: number;
    blockDurationMs?: number;
  }
): Promise<RateLimitResult> {
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  const now = Date.now();
  const blockDurationMs = options.blockDurationMs || options.windowMs * 2;

  const existing = await db.query.authRateLimits.findFirst({
    where: eq(authRateLimits.keyHash, keyHash),
  });

  if (!existing) {
    await db.insert(authRateLimits).values({
      keyHash,
      windowStart: new Date(now),
      attemptCount: 1,
      blockedUntil: null,
    });
    return { allowed: true, remainingAttempts: options.maxAttempts - 1 };
  }

  // Check if currently blocked
  if (existing.blockedUntil && existing.blockedUntil.getTime() > now) {
    const retryAfterSeconds = Math.ceil((existing.blockedUntil.getTime() - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds,
      error: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfterSeconds} detik.`,
    };
  }

  const windowStartMs = existing.windowStart.getTime();
  const isWindowExpired = now - windowStartMs > options.windowMs;

  if (isWindowExpired) {
    // Reset window
    await db
      .update(authRateLimits)
      .set({
        windowStart: new Date(now),
        attemptCount: 1,
        blockedUntil: null,
      })
      .where(eq(authRateLimits.keyHash, keyHash));

    return { allowed: true, remainingAttempts: options.maxAttempts - 1 };
  }

  // Increment attempts in current window
  const newCount = existing.attemptCount + 1;

  if (newCount > options.maxAttempts) {
    const blockedUntil = new Date(now + blockDurationMs);
    await db
      .update(authRateLimits)
      .set({
        attemptCount: newCount,
        blockedUntil,
      })
      .where(eq(authRateLimits.keyHash, keyHash));

    const retryAfterSeconds = Math.ceil(blockDurationMs / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds,
      error: `Batas percobaan terlampaui. Coba lagi dalam ${retryAfterSeconds} detik.`,
    };
  }

  await db
    .update(authRateLimits)
    .set({ attemptCount: newCount })
    .where(eq(authRateLimits.keyHash, keyHash));

  return {
    allowed: true,
    remainingAttempts: options.maxAttempts - newCount,
  };
}

/**
 * Resets rate limit counter on successful action (e.g. successful login)
 */
export async function resetRateLimit(key: string): Promise<void> {
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  await db.delete(authRateLimits).where(eq(authRateLimits.keyHash, keyHash));
}
