// src/lib/wa/pairing.ts — A7: pairing state machine; state persist di
// app_config key "wa_pairing" (survive restart). requestPairingCode tetap
// dipakai, tetapi endpoint pairing TIDAK memanggilnya tanpa state tracking.
import { eq } from "drizzle-orm";
import { db, appConfig } from "@/lib/db";
import type { WaClientManager } from "./client-manager";

export type PairingState =
  | "pairing_not_started" | "pairing_code_requested" | "waiting_for_phone"
  | "pairing_success" | "pairing_failed";

export type PairingEvent = "request" | "code_received" | "linked" | "expired" | "timeout_408" | "logged_out_401";

export interface PairingRecord {
  state: PairingState;
  code?: string;
  requestedAt?: number; // ms
  updatedAt: number;
}

export const PAIRING_KEY = "wa_pairing";
export const PAIRING_EXPIRY_MS = 5 * 60_000; // safety net aplikasi; 408/401 path menangani failure nyata

/** Pure — transisi; event tak relevan → state tetap. */
export function nextPairingState(current: PairingState, event: PairingEvent): PairingState {
  switch (event) {
    case "request": // re-request membatalkan yang sebelumnya (A7)
      return "pairing_code_requested";
    case "code_received":
      return current === "pairing_code_requested" ? "waiting_for_phone" : current;
    case "linked":
      return current === "waiting_for_phone" ? "pairing_success" : current;
    case "expired":
    case "timeout_408":
    case "logged_out_401":
      return current === "waiting_for_phone" ? "pairing_failed" : current;
    default:
      return current;
  }
}

export async function getPairingState(): Promise<PairingRecord> {
  const row = await db.select().from(appConfig).where(eq(appConfig.key, PAIRING_KEY)).limit(1).then((r) => r[0]);
  if (!row) return { state: "pairing_not_started", updatedAt: 0 };
  try { return JSON.parse(row.value) as PairingRecord; }
  catch { return { state: "pairing_not_started", updatedAt: 0 }; }
}

export async function setPairingState(rec: PairingRecord): Promise<PairingRecord> {
  const value = JSON.stringify(rec);
  await db.insert(appConfig).values({ key: PAIRING_KEY, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } });
  return rec;
}

let hooksRegistered = false;
/** Wire transisi via event manager (dipanggil client-manager via import
 *  dinamis saat socket dibuat). pairing_success = open + isNewLogin. */
export function registerPairingHooks(manager: WaClientManager): void {
  if (hooksRegistered) return;
  hooksRegistered = true;
  manager.on("open", async ({ isNewLogin }) => {
    const rec = await getPairingState();
    if (isNewLogin && (rec.state === "waiting_for_phone" || rec.state === "pairing_code_requested")) {
      await setPairingState({ ...rec, state: "pairing_success", updatedAt: Date.now() });
      await manager.clearAuthInvalidFlag();
    }
  });
  manager.on("close", async ({ classification, statusCode }) => {
    const rec = await getPairingState();
    if (rec.state !== "waiting_for_phone") return;
    if (classification === "logged_out" || statusCode === 408) {
      await setPairingState({ ...rec, state: "pairing_failed", updatedAt: Date.now() });
    }
  });
}
