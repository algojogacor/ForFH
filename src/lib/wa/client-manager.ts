import type { AuthenticationCreds, AuthenticationState, UserFacingSocketConfig, WAMessage, WASocket } from "@whiskeysockets/baileys";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import * as health from "./health";
import { WA_AUTH_INVALID_KEY, WaSessionStore } from "./session-store";
import type { DisconnectClass, WaSocketState } from "./types";

// Baileys dimuat lazy via dynamic import (pola sama dengan session-store):
// paket ESM-only (dependency whatsapp-rust-bridge hanya mengekspor kondisi
// "import"), sedangkan file .ts di tsx ditranspilasi CJS → import statis nilai
// runtime jadi require() → ERR_PACKAGE_PATH_NOT_EXPORTED. Tipe diimpor statis
// (dihapus saat compile — tanpa efek runtime). Runtime di Next.js tidak
// terpengaruh (bundler menyelesaikan dynamic import).
let makeWASocketFactory: ((config: UserFacingSocketConfig) => WASocket) | undefined;
async function getMakeWASocket(): Promise<(config: UserFacingSocketConfig) => WASocket> {
  if (!makeWASocketFactory) {
    const mod = await import("@whiskeysockets/baileys");
    makeWASocketFactory = mod.makeWASocket;
  }
  return makeWASocketFactory;
}

// =====================================================================
// KONSTRAIN DEPLOYMENT (spec A1): 1 deployment = 1 instance = 1 socket
// = 1 bot account. Horizontal scaling DILARANG — dua instance yang
// membaca auth state yang sama akan login sebagai device yang sama
// (conflict). Distribusi socket antar instance = non-goal MVP.
// =====================================================================

/** Matriks disconnect spec A4 — PURE function (callback socket hanya
 *  memanggil classifier; logika klasifikasi TIDAK ditanam di callback).
 *  Nilai numerik sesuai DisconnectReason Baileys 7 (spec §1):
 *  connectionClosed=428, connectionLost/timedOut=408, connectionReplaced=440,
 *  loggedOut=401, badSession=500, restartRequired=515, multideviceMismatch=411,
 *  forbidden=403, unavailableService=503. */
export function classifyDisconnect(statusCode: number | undefined): DisconnectClass {
  switch (statusCode) {
    case 408:
    case 428: return "temporary";
    case 515: return "restart";
    case 401: return "logged_out";
    case 440: return "replaced";
    case 500: return "bad_session";
    case 411: return "mismatch";
    case 403: return "forbidden";
    case 503: return "unavailable";
    default: return "unknown";
  }
}

/** Backoff eksponensial: base min 1s, cap 60s, jitter ±20% (A3). */
export function nextBackoffDelayMs(attempt: number): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** Guard jid yang diabaikan: grup/broadcast/status/newsletter (C1). */
export function isIgnoredJid(jid: string | null | undefined): boolean {
  if (!jid) return true;
  return (
    jid.endsWith("@g.us") || jid.endsWith("@broadcast") ||
    jid.endsWith("@status") || jid.endsWith("@newsletter")
  );
}

// Logger minimal untuk Baileys (adaptor pino-like; level dipakai Baileys utk
// mem-filter log internal). Cast as any — struktur logger pino bukan kontrak
// publik; verifikasi saat typecheck rc14.
const waLogger = {
  level: "info",
  trace: () => {},
  debug: () => {},
  info: (msg: string, ...a: any[]) => logger.info(msg, ...a),
  warn: (msg: string, ...a: any[]) => logger.warn(msg, ...a),
  error: (msg: string, ...a: any[]) => logger.error(msg, ...a),
  child: () => waLogger,
} as any;

const MAX_CONSECUTIVE_ATTEMPTS = 10; // A3: setelah 10 → tetap cap 60s utk temporary
const RESTART_DELAY_MS = 250;

export interface WaManagerOptions {
  makeSocket?: (auth: AuthenticationState) => WASocket | Promise<WASocket>;
  loadAuth?: () => Promise<AuthenticationState>;
  persistCreds?: (creds: AuthenticationCreds) => Promise<void>;
  readAuthFlag?: () => Promise<boolean>;
  persistAuthFlag?: (value: boolean) => Promise<void>;
  scheduleTimer?: (fn: () => void, delayMs: number) => void;
  now?: () => number;
}

const defaultStore = new WaSessionStore(db);

export class WaClientManager {
  state: WaSocketState = "stopped";
  /** Alasan fatal (auth_invalid | replaced | mismatch | forbidden | bad_session | unavailable | unknown) — mengunci auto-recreate. */
  fatalReason: string | null = null;

  private readonly options: Required<WaManagerOptions>;
  private socket: WASocket | null = null;
  private authState: AuthenticationState | null = null;
  private startupPromise: Promise<void> | null = null;
  private backoffAttempt = 0;
  /** I3: kuota upaya 503 — counter TERPISAH dari backoff eksponensial
   *  408/428 agar deretan 408 tidak menguras kuota 503 (dan sebaliknya). */
  private unavailableAttempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Record<string, Array<(payload: any) => void | Promise<void>>> = {};
  private wiringDone = false;

  constructor(options: WaManagerOptions = {}) {
    this.options = {
      makeSocket: async (auth) => {
        // Baileys dimuat lazy: static import nilai runtime → crash di tsx/CJS
        const makeWASocket = await getMakeWASocket();
        return makeWASocket({
          auth,
          logger: waLogger,
          markOnlineOnConnect: true, // spec §1 — konfigurasi socket yang dipakai
          syncFullHistory: false,
          shouldIgnoreJid: (jid) => isIgnoredJid(jid),
          // keepAliveIntervalMs (30s) & connectTimeoutMs (20s): default Baileys
        });
      },
      loadAuth: () => defaultStore.loadAuthState(),
      persistCreds: (creds) => defaultStore.saveCreds(creds),
      readAuthFlag: async () => {
        const row = await db.select().from(schema.appConfig)
          .where(eq(schema.appConfig.key, WA_AUTH_INVALID_KEY)).limit(1).then((r) => r[0]);
        return row?.value === "1";
      },
      persistAuthFlag: async (value) => {
        health.recordAuthInvalid(value);
        await db.insert(schema.appConfig)
          .values({ key: WA_AUTH_INVALID_KEY, value: value ? "1" : "0" })
          .onConflictDoUpdate({ target: schema.appConfig.key, set: { value: value ? "1" : "0" } });
      },
      scheduleTimer: (fn, delayMs) => { this.timer = setTimeout(fn, delayMs); },
      now: () => Date.now(),
      ...options,
    };
  }

  on(event: "open", cb: (info: { isNewLogin: boolean }) => void | Promise<void>): void;
  on(event: "close", cb: (info: { classification: DisconnectClass; statusCode?: number }) => void | Promise<void>): void;
  on(event: "message", cb: (msg: WAMessage) => void | Promise<void>): void;
  on(event: string, cb: (payload: any) => void | Promise<void>): void {
    (this.listeners[event] ??= []).push(cb);
  }

  isReady(): boolean {
    return this.state === "open" && !!this.socket;
  }

  async isAuthInvalid(): Promise<boolean> {
    return this.options.readAuthFlag();
  }

  /** Idempoten (A2): starting/connecting/reconnecting → startup promise yang
   *  SAMA; open → no-op; logged_out/error fatal → TANPA auto-recreate. */
  async ensureWaClient(): Promise<WaSocketState> {
    if (this.state === "open") return "open";
    if (this.fatalReason) return this.state;
    // C1: jendela starting/connecting (handshake Baileys 1–20 detik di
    // background) → return-early. Guard startupPromise TIDAK menutup jendela
    // ini (di-clear begitu initSocket() resolve): panggilan kedua dalam
    // jendela membuat socket DUA dengan creds sama → koneksi kedua
    // menggantikan pertama → socket pertama menerima 440 replaced →
    // stopFatal sampai re-pair manual. Aman untuk timer reconnect (fire saat
    // state "reconnecting", bukan starting/connecting) dan resetFatal (state
    // "stopped" — tidak di-block).
    if (this.state === "starting" || this.state === "connecting") return this.state;
    if (this.startupPromise) { await this.startupPromise; return this.state; }
    this.startupPromise = this.initSocket().finally(() => { this.startupPromise = null; });
    await this.startupPromise;
    return this.state;
  }

  async sendText(jid: string, text: string): Promise<boolean> {
    if (!this.isReady() || !this.socket) return false;
    try {
      await this.socket.sendMessage(jid, { text });
      return true;
    } catch (err) {
      logger.warn("wa: gagal mengirim", { jid }, err);
      return false;
    }
  }

  /** Pairing: requestPairingCode tetap dipakai (Baileys 7). Tunggu handshake
   *  ws selesai dulu — route memanggilnya ~segera setelah ensureWaClient()
   *  (state "connecting"), dan tanpa tunggu sendNode lempar 428 Connection
   *  Closed → 502. waitForSocketOpen menunggu event 'open' ws (tanpa timeout
   *  sendiri; dibungkus race 25s ≈ connectTimeoutMs Baileys). */
  async requestPairingCode(phone: string, timeoutMs = 25_000): Promise<string> {
    if (!this.socket) throw new Error("Socket belum siap — panggil ensureWaClient() dulu");
    await Promise.race([
      this.socket.waitForSocketOpen(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("WAIT_WS_OPEN_TIMEOUT")), timeoutMs)),
    ]);
    return this.socket.requestPairingCode(phone);
  }

  /** Resolver LID→PN dari internal Baileys (signalRepository.lidMapping).
   *  Mapping dipelihara Baileys di keystore — application layer tidak
   *  membuat mapping LID kustom yang konflik. */
  async getPNForLID(lid: string): Promise<string | null> {
    try {
      const pn = await this.socket?.signalRepository?.lidMapping?.getPNForLID(lid);
      return pn ?? null;
    } catch { return null; }
  }

  async setAuthInvalidFlag(): Promise<void> { await this.options.persistAuthFlag(true); }
  async clearAuthInvalidFlag(): Promise<void> { await this.options.persistAuthFlag(false); }

  /** Jalur pemulihan setelah re-pair (dipakai Task 7): buka kunci fatal —
   *  fatalReason di-null, state "stopped", flag auth invalid dibersihkan, dan
   *  timer pending dibatalkan. Panggil setelah pairing sukses; panggilan
   *  ensureWaClient() berikutnya akan menginisialisasi socket baru. */
  async resetFatal(): Promise<void> {
    this.fatalReason = null;
    this.state = "stopped";
    health.recordSocketState("stopped");
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.clearAuthInvalidFlag();
  }

  // ---- internal ----

  private async initSocket(): Promise<void> {
    this.state = "starting";
    try {
      this.authState ??= await this.options.loadAuth();
      const sock = await this.options.makeSocket(this.authState);
      this.socket = sock;
      // C1 belt-and-braces: handler membawa referensi sock — event dari socket
      // generasi LAMA (sudah diganti) diabaikan di awal handler.
      sock.ev.on("connection.update", (update) => { void this.handleConnectionUpdate(sock, update); });
      sock.ev.on("creds.update", (creds) => { void this.handleCredsUpdate(creds); });
      sock.ev.on("messages.upsert", (upsert) => { void this.handleMessagesUpsert(sock, upsert); });
      this.state = "connecting";
      health.recordSocketState("connecting");
      this.ensureWiring();
    } catch (err) {
      this.state = "error";
      health.recordSocketState("error");
      logger.error("wa: gagal inisialisasi socket", err);
    }
  }

  private ensureWiring(): void {
    if (this.wiringDone) return;
    this.wiringDone = true;
    // Import dinamis: pipeline & pairing tidak boleh membuat siklus statis
    // (client-manager ↔ pipeline ↔ send ↔ client-manager).
    void import("./pipeline").then((m) => m.registerMessagePipeline(this)).catch((e) => logger.warn("wa: wiring pipeline gagal", e));
    void import("./pairing").then((m) => m.registerPairingHooks(this)).catch((e) => logger.warn("wa: wiring pairing gagal", e));
    void import("@/lib/notifications/worker").then((m) => m.startInternalReminderLoop()).catch((e) => logger.warn("worker: startInternalReminderLoop error", e));
  }

  private async handleConnectionUpdate(sock: WASocket, update: any): Promise<void> {
    if (this.socket !== sock) return; // C1: event socket lama (sudah diganti) → abaikan
    if (update.connection === "open") {
      this.state = "open";
      this.backoffAttempt = 0;
      this.unavailableAttempts = 0; // I3: kuota 503 juga di-reset saat open
      health.recordConnectionOpen(!!update.isNewLogin);
      if (update.isNewLogin) {
        await this.persistCredsNow();
        await this.clearAuthInvalidFlag();
      }
      await this.emit("open", { isNewLogin: !!update.isNewLogin });
    } else if (update.connection === "close") {
      await this.handleClose(update);
    } else if (update.connection === "connecting") {
      this.state = "connecting";
      health.recordSocketState("connecting");
    }
  }

  private async handleClose(update: any): Promise<void> {
    const err = update.lastDisconnect?.error as any;
    // Baileys rc14 SELALU menutup socket dengan error @hapi/boom (Boom):
    // status ada di err.output.statusCode — err.status/err.code TIDAK ADA.
    // Fallback tetap dipertahankan untuk error non-Boom (robustness).
    const statusCode =
      typeof err?.output?.statusCode === "number" ? err.output.statusCode :
      typeof err?.status === "number" ? err.status :
      typeof err?.code === "number" ? err.code : undefined;
    const classification = classifyDisconnect(statusCode);
    logger.warn("wa: koneksi tertutup", { classification, statusCode, message: err?.message });

    switch (classification) {
      case "restart": // 515: tutup socket lama → init ulang (auth sama)
        this.state = "closing";
        try { this.socket?.end(new Error("restartRequired")); } catch { /* noop */ }
        this.socket = null;
        this.state = "reconnecting";
        health.recordSocketState("reconnecting");
        this.scheduleReconnect(RESTART_DELAY_MS);
        break;
      case "temporary": // 408/428
        this.state = "reconnecting";
        health.recordSocketState("reconnecting");
        this.scheduleReconnect(0);
        break;
      case "unavailable": // 503: maks 3 upaya berurutan — kuota TERPISAH dari
        // backoff 408/428 (I3): deretan 408 tidak menguras kuota 503 dan
        // sebaliknya; keduanya di-reset saat open.
        if (this.unavailableAttempts < 3) {
          this.unavailableAttempts += 1;
          this.state = "reconnecting";
          health.recordSocketState("reconnecting");
          this.scheduleReconnect(0);
        } else {
          this.stopFatal("unavailable");
        }
        break;
      case "logged_out":
      case "bad_session":
        this.stopFatal("auth_invalid");
        await this.setAuthInvalidFlag();
        break;
      case "replaced": // 440: TIDAK pernah auto-reconnect
        this.stopFatal("replaced");
        break;
      default: // mismatch / forbidden / unknown
        this.stopFatal(classification);
        break;
    }
    await this.emit("close", { classification, statusCode });
  }

  private stopFatal(reason: string): void {
    this.fatalReason = reason;
    this.state = reason === "auth_invalid" ? "logged_out" : "error";
    health.recordSocketState(this.state);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try { this.socket?.end(new Error(reason)); } catch { /* noop */ }
    this.socket = null;
  }

  /** A3: backoff eksponensial 1s–60s + jitter ±20%; batas 10 upaya berurutan,
   *  setelah itu tetap cap maksimum (temporary). Selalu jeda via timer —
   *  reconnecting, bukan loop ketat. */
  private scheduleReconnect(extraMs: number): void {
    if (this.fatalReason || this.timer) return;
    this.backoffAttempt += 1;
    const base = this.backoffAttempt >= MAX_CONSECUTIVE_ATTEMPTS ? 60_000 : nextBackoffDelayMs(this.backoffAttempt);
    const delay = Math.max(0, base + extraMs);
    this.options.scheduleTimer(() => {
      this.timer = null;
      if (this.fatalReason) return;
      void this.ensureWaClient();
    }, delay);
  }

  private async handleCredsUpdate(creds: Partial<AuthenticationCreds>): Promise<void> {
    if (!this.authState) return;
    // MERGE ke creds yang ada, BUKAN replace: payload rc14 sering PARTIAL
    // ({ me }, { signedPreKey }, { accountSettings }, { preKeys }...) —
    // replace membuang noiseKey/signedIdentityKey/pairingEphemeralKeyPair dan
    // menyimpan creds cacat ke DB (pairing berikutnya rusak permanen).
    // Payload ber-ref sama (socket.js emit authState.creds) = no-op, aman.
    Object.assign(this.authState.creds, creds);
    await this.persistCredsNow();
  }

  private async persistCredsNow(): Promise<void> {
    try {
      if (!this.authState) return;
      await this.options.persistCreds(this.authState.creds);
      health.recordAuthPersistence();
    } catch (err) {
      logger.error("wa: gagal menyimpan creds", err);
    }
  }

  private async handleMessagesUpsert(sock: WASocket, upsert: { messages: WAMessage[]; type: string }): Promise<void> {
    if (this.socket !== sock) return; // C1: event socket lama (sudah diganti) → abaikan
    if (!upsert || upsert.type !== "notify" || !Array.isArray(upsert.messages)) return; // C1: hanya notify
    for (const msg of upsert.messages) {
      health.recordInboundMessage();
      await this.emit("message", msg);
    }
  }

  private async emit(event: string, payload: any): Promise<void> {
    for (const cb of this.listeners[event] ?? []) {
      try { await cb(payload); } catch (err) { logger.warn(`wa: listener ${event} error`, err); }
    }
  }
}

/** A5: keepalive dari tick QStash. QStash = health/recovery trigger, BUKAN
 *  pengganti persistent socket; tidak pernah recreate socket tiap tick. */
export async function waKeepAlive(manager: WaClientManager): Promise<string> {
  if (await manager.isAuthInvalid()) return "auth-invalid"; // tanpa recreate
  if (manager.state === "open") return "healthy";
  // I2: tick QStash yang mendarat saat timer backoff pending (state
  // reconnecting) → biarkan timer bekerja; jangan paksa initSocket yang
  // mengalahkan delay backoff eksponensial & menguras kuota 503.
  if (manager.state === "reconnecting") return "reconnecting";
  const state = await manager.ensureWaClient();
  return state === "open" ? "recovered" : state;
}

let managerSingleton: WaClientManager | null = null;
export function getWaClientManager(): WaClientManager {
  managerSingleton ??= new WaClientManager();
  return managerSingleton;
}
