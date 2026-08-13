// Tipe bersama modul WA — diimpor modul lain; jangan taruh tipe ini di modul
// yang punya siklus (client-manager ↔ health) agar tidak circular.

export type WaSocketState =
  | "stopped" | "starting" | "connecting" | "open"
  | "reconnecting" | "closing" | "logged_out" | "error";

export type DisconnectClass =
  | "temporary" | "restart" | "logged_out" | "replaced" | "bad_session"
  | "mismatch" | "forbidden" | "unavailable" | "unknown";

export type WaHealthStatus =
  | "healthy" | "degraded" | "possibly_silent" | "disconnected" | "auth_invalid";

export interface WaHealthIndicators {
  socketState: WaSocketState;
  lastConnectionUpdate: number | null; // ms epoch
  lastMessageEvent: number | null;
  lastSendAttempt: number | null;
  lastSuccessfulSend: number | null;
  lastSuccessfulReceive: number | null;
  lastAuthPersistence: number | null;
  failedSendAttempts: number;
  authInvalid: boolean;
}

export interface WaIdentity {
  lid?: string; // user part "@lid"
  phone?: string; // E.164 tanpa "+"
  jid?: string; // jid penuh (PN "@s.whatsapp.net" atau LID "@lid")
}

export type WaBindingRow = typeof import("@/lib/db/schema").waBindings.$inferSelect;
