import { AIProviderName, AIAccountSlot, SlotHealth } from "./types";
import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

// In-memory slot state tracker
const slotStates: Record<string, SlotHealth> = {
  "groq:1": { state: "HEALTHY", cooldownUntil: 0, failureCount: 0 },
  "groq:2": { state: "HEALTHY", cooldownUntil: 0, failureCount: 0 },
  "ollama:1": { state: "HEALTHY", cooldownUntil: 0, failureCount: 0 },
  "ollama:2": { state: "HEALTHY", cooldownUntil: 0, failureCount: 0 },
};

function getSlotKey(provider: AIProviderName, slot: AIAccountSlot): string {
  return `${provider}:${slot}`;
}

export function isSlotAvailable(provider: AIProviderName, slot: AIAccountSlot): boolean {
  const key = getSlotKey(provider, slot);
  const health = slotStates[key];
  if (!health) return true;

  if (health.state === "COOLDOWN") {
    if (Date.now() >= health.cooldownUntil) {
      // Cooldown expired, restore to healthy
      health.state = "HEALTHY";
      health.failureCount = 0;
      return true;
    }
    return false;
  }
  return true;
}

export function recordSlotSuccess(provider: AIProviderName, slot: AIAccountSlot): void {
  const key = getSlotKey(provider, slot);
  const health = slotStates[key];
  if (health) {
    health.state = "HEALTHY";
    health.failureCount = 0;
    health.lastFailureReason = undefined;
  }
}

export function recordSlotFailure(
  provider: AIProviderName,
  slot: AIAccountSlot,
  options: {
    status?: number;
    retryAfterSeconds?: number;
    reason?: string;
  }
): void {
  const key = getSlotKey(provider, slot);
  let health = slotStates[key];
  if (!health) {
    health = { state: "HEALTHY", cooldownUntil: 0, failureCount: 0 };
    slotStates[key] = health;
  }

  health.failureCount += 1;
  health.lastFailureReason = options.reason || `HTTP status ${options.status || "network error"}`;

  // If 429 rate limit with Retry-After
  if (options.retryAfterSeconds && options.retryAfterSeconds > 0) {
    health.state = "COOLDOWN";
    health.cooldownUntil = Date.now() + options.retryAfterSeconds * 1000;
  } else if (options.status === 429) {
    // Default 60 seconds cooldown for 429
    health.state = "COOLDOWN";
    health.cooldownUntil = Date.now() + 60 * 1000;
  } else if (options.status && options.status >= 500) {
    // 5xx server error: exponential backoff (10s, 30s, 60s)
    const backoffSeconds = Math.min(60, Math.pow(2, health.failureCount) * 5);
    health.state = "COOLDOWN";
    health.cooldownUntil = Date.now() + backoffSeconds * 1000;
  } else {
    // Network or other error: short 15s cooldown if repeated
    if (health.failureCount >= 2) {
      health.state = "COOLDOWN";
      health.cooldownUntil = Date.now() + 15 * 1000;
    }
  }

  if (health.state === "COOLDOWN") {
    // Persist cooldown — tidak hilang saat redeploy (fire-and-forget).
    // Builder update bisa di-await langsung (thenable → ResultSet libsql
    // punya `.rowsAffected`; pola yang sama dengan sync.ts).
    db.update(appConfig)
      .set({ value: String(health.cooldownUntil), updatedAt: new Date() })
      .where(eq(appConfig.key, `ai_slot_cooldown:${key}`))
      .then(async (r) => {
        if (r.rowsAffected === 0) {
          await db.insert(appConfig).values({ key: `ai_slot_cooldown:${key}`, value: String(health.cooldownUntil) });
        }
      })
      .catch(() => {});
  }
}

export function getSlotStatus(): Record<string, SlotHealth> {
  return { ...slotStates };
}

export function resetAllSlots(): void {
  for (const key of Object.keys(slotStates)) {
    slotStates[key] = { state: "HEALTHY", cooldownUntil: 0, failureCount: 0 };
  }
}

// Muat cooldown tersimpan (app_config) ke slotStates — jalankan sekali saat server jalan
let cooldownsLoaded = false;
export async function loadPersistedCooldowns(): Promise<void> {
  if (cooldownsLoaded) return;
  cooldownsLoaded = true;
  try {
    const rows = await db.select().from(appConfig);
    for (const row of rows) {
      if (!row.key.startsWith("ai_slot_cooldown:")) continue;
      const key = row.key.replace("ai_slot_cooldown:", "");
      const health = slotStates[key];
      if (!health) continue;
      health.cooldownUntil = Number(row.value) || 0;
      // Restore state juga, bukan hanya timestamp: isSlotAvailable hanya
      // menegakkan cooldown saat state === "COOLDOWN".
      if (health.cooldownUntil > Date.now()) {
        health.state = "COOLDOWN";
      }
    }
  } catch (e: any) {
    logger.warn(`loadPersistedCooldowns: ${e?.message || e}`);
  }
}

