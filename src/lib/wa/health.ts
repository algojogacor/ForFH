import type { DisconnectClass, WaHealthIndicators, WaHealthStatus, WaSocketState } from "./types";

const SILENT_THRESHOLD_MS = 15 * 60_000; // A6: lastMessageEvent basi > 15 menit
const DEGRADED_FAILURES = 3; // A6: kiriman gagal beruntun

// Health = fungsi gabungan indikator (A6), BUKAN satu pencatat waktu.
// Observability — tanpa aggressive probing; possibly_silent ≠ unhealthy.
const indicators: WaHealthIndicators = {
  socketState: "stopped",
  lastConnectionUpdate: null,
  lastMessageEvent: null,
  lastSendAttempt: null,
  lastSuccessfulSend: null,
  lastSuccessfulReceive: null,
  lastAuthPersistence: null,
  failedSendAttempts: 0,
  authInvalid: false,
};

export function getHealthIndicators(): WaHealthIndicators {
  return { ...indicators };
}

export function resetHealthForTests(): void {
  Object.assign(indicators, {
    socketState: "stopped", lastConnectionUpdate: null, lastMessageEvent: null,
    lastSendAttempt: null, lastSuccessfulSend: null, lastSuccessfulReceive: null,
    lastAuthPersistence: null, failedSendAttempts: 0, authInvalid: false,
  });
}

export function recordSocketState(state: WaSocketState): void { indicators.socketState = state; }
export function recordConnectionOpen(isNewLogin: boolean): void {
  indicators.socketState = "open";
  indicators.lastConnectionUpdate = Date.now();
  if (isNewLogin) indicators.lastAuthPersistence = Date.now();
}
export function recordInboundMessage(): void { indicators.lastMessageEvent = Date.now(); }
export function recordReceiveSuccess(): void { indicators.lastSuccessfulReceive = Date.now(); }
export function recordSendAttempt(): void { indicators.lastSendAttempt = Date.now(); }
export function recordSendSuccess(): void { indicators.lastSuccessfulSend = Date.now(); indicators.failedSendAttempts = 0; }
export function recordSendFailure(): void { indicators.failedSendAttempts += 1; }
export function recordAuthPersistence(): void { indicators.lastAuthPersistence = Date.now(); }
export function recordAuthInvalid(v: boolean): void { indicators.authInvalid = v; }

/** Model 5 level (A6). possibly_silent TIDAK pernah = unhealthy. */
export function computeHealth(h: WaHealthIndicators): WaHealthStatus {
  if (h.authInvalid) return "auth_invalid";
  if (h.socketState !== "open") return "disconnected";
  const now = Date.now();
  // Anchor aktivitas inbound: bila sudah pernah ada pesan/receive sukses,
  // pakai yang paling baru di antara keduanya; bila BELUM pernah ada pesan
  // sama sekali, pakai lastConnectionUpdate agar bot yang baru connect tidak
  // langsung diflag "silent" (tanpa false alarm instan).
  const lastInbound =
    h.lastMessageEvent !== null || h.lastSuccessfulReceive !== null
      ? Math.max(h.lastMessageEvent ?? 0, h.lastSuccessfulReceive ?? 0)
      : (h.lastConnectionUpdate ?? 0);
  if (now - lastInbound > SILENT_THRESHOLD_MS) return "possibly_silent";
  if (h.failedSendAttempts >= DEGRADED_FAILURES) return "degraded";
  return "healthy";
}

// DisconnectClass hanya dipakai tipe callback client-manager; re-export agar
// consumer tidak perlu import types langsung dua kali.
export type { DisconnectClass };
