// src/lib/wa/pairing.ts — A7: pairing state machine; state persist di
// app_config key "wa_pairing" (survive restart). Mendukung QR Code Baileys 7
// dan pairing code.
import { eq } from "drizzle-orm";
import { db, appConfig, type DB } from "@/lib/db";
import type { WaClientManager } from "./client-manager";

export type PairingState =
  | "pairing_not_started"
  | "waiting_for_qr"
  | "waiting_for_scan"
  | "waiting_for_phone"
  | "pairing_code_requested"
  | "pairing_success"
  | "pairing_failed";

export type PairingEvent =
  | "request"
  | "qr_received"
  | "code_received"
  | "linked"
  | "expired"
  | "timeout_408"
  | "logged_out_401";

export interface PairingRecord {
  state: PairingState;
  qr?: string;
  code?: string;
  requestedAt?: number; // ms
  updatedAt: number;
}

export const PAIRING_KEY = "wa_pairing";
export const PAIRING_EXPIRY_MS = 5 * 60_000; // safety net aplikasi; 408/401 path menangani failure nyata

/** Pure — transisi; event tak relevan → state tetap. */
export function nextPairingState(current: PairingState, event: PairingEvent): PairingState {
  switch (event) {
    case "request": // re-request membatalkan yang sebelumnya
      return "waiting_for_qr";
    case "qr_received":
      return current === "waiting_for_qr" || current === "pairing_not_started" || current === "pairing_failed" || current === "waiting_for_scan"
        ? "waiting_for_scan"
        : current;
    case "code_received":
      return current === "pairing_code_requested" || current === "waiting_for_qr" ? "waiting_for_phone" : current;
    case "linked":
      return current === "waiting_for_scan" || current === "waiting_for_qr" || current === "waiting_for_phone" || current === "pairing_code_requested"
        ? "pairing_success"
        : current;
    case "expired":
    case "timeout_408":
    case "logged_out_401":
      return current === "waiting_for_scan" || current === "waiting_for_qr" || current === "waiting_for_phone" || current === "pairing_code_requested"
        ? "pairing_failed"
        : current;
    default:
      return current;
  }
}

export async function getPairingState(store: DB = db): Promise<PairingRecord> {
  const row = await store.select().from(appConfig).where(eq(appConfig.key, PAIRING_KEY)).limit(1).then((r) => r[0]);
  if (!row) return { state: "pairing_not_started", updatedAt: 0 };
  try { return JSON.parse(row.value) as PairingRecord; }
  catch { return { state: "pairing_not_started", updatedAt: 0 }; }
}

export async function setPairingState(rec: PairingRecord, store: DB = db): Promise<PairingRecord> {
  const value = JSON.stringify(rec);
  await store.insert(appConfig).values({ key: PAIRING_KEY, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } });
  return rec;
}

/** Emitor jalur qr_received: socket meng-emit QR → state waiting_for_scan. */
export async function markPairingQrReceived(rec: PairingRecord, qr: string, store: DB = db): Promise<PairingRecord> {
  const next = nextPairingState(rec.state, "qr_received");
  return setPairingState({ ...rec, state: next, qr, updatedAt: Date.now() }, store);
}

/** Emitor jalur code_received: request pairing code sukses → menunggu phone. */
export async function markPairingCodeReceived(rec: PairingRecord, store: DB = db): Promise<PairingRecord> {
  const next = nextPairingState(rec.state, "code_received");
  if (next === rec.state) return rec;
  return setPairingState({ ...rec, state: next, updatedAt: Date.now() }, store);
}

/** Pure — QR hanya ditampilkan saat waiting_for_scan atau waiting_for_qr. */
export function qrForState(rec: PairingRecord): string | null {
  return (rec.state === "waiting_for_scan" || rec.state === "waiting_for_qr") && rec.qr ? rec.qr : null;
}

/** Pure — kode hanya ditampilkan saat waiting_for_phone. */
export function pairingCodeForState(rec: PairingRecord): string | null {
  return rec.state === "waiting_for_phone" && rec.code ? rec.code : null;
}

/** Kegagalan request kode/QR: state langsung pairing_failed. */
export async function failPairing(rec: PairingRecord, store: DB = db): Promise<PairingRecord> {
  return setPairingState({ ...rec, state: "pairing_failed", qr: undefined, code: undefined, updatedAt: Date.now() }, store);
}

// Flag per-instance (WeakSet), bukan module-level
const hookedManagers = new WeakSet<WaClientManager>();

/** Wire transisi via event manager (dipanggil client-manager via import dinamis saat socket dibuat). */
export function registerPairingHooks(manager: WaClientManager): void {
  if (hookedManagers.has(manager)) return;
  hookedManagers.add(manager);

  manager.on("qr", async (qr) => {
    const rec = await getPairingState();
    await markPairingQrReceived({
      ...rec,
      requestedAt: rec.requestedAt ?? Date.now(),
    }, qr);
  });

  manager.on("open", async ({ isNewLogin }) => {
    const rec = await getPairingState();
    if (isNewLogin || rec.state === "waiting_for_scan" || rec.state === "waiting_for_qr" || rec.state === "waiting_for_phone" || rec.state === "pairing_code_requested") {
      await setPairingState({ ...rec, state: "pairing_success", qr: undefined, code: undefined, updatedAt: Date.now() });
      await manager.clearAuthInvalidFlag();
    }
  });

  manager.on("close", async ({ classification, statusCode }) => {
    const rec = await getPairingState();
    if (rec.state !== "waiting_for_scan" && rec.state !== "waiting_for_qr" && rec.state !== "waiting_for_phone" && rec.state !== "pairing_code_requested") return;
    if (classification === "logged_out" || statusCode === 408) {
      await setPairingState({ ...rec, state: "pairing_failed", qr: undefined, code: undefined, updatedAt: Date.now() });
    }
  });
}
