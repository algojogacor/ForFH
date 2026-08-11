import { AIProviderName, AIAccountSlot, SlotHealth } from "./types";

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
}

export function getSlotStatus(): Record<string, SlotHealth> {
  return { ...slotStates };
}

export function resetAllSlots(): void {
  for (const key of Object.keys(slotStates)) {
    slotStates[key] = { state: "HEALTHY", cooldownUntil: 0, failureCount: 0 };
  }
}

