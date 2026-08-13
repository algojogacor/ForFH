import { and, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { AuthenticationCreds, AuthenticationState, SignalKeyStore } from "@whiskeysockets/baileys";
import * as schema from "@/lib/db/schema";
import { decryptLegacyV1, isLegacyV1 } from "@/lib/crypto/legacy-v1";
import { logger } from "@/lib/logger";

export const WA_CREDS_KEY = "wa_creds";
export const WA_AUTH_INVALID_KEY = "wa_auth_invalid";

// Baileys dimuat lazy via dynamic import: paket ESM-only (exports paket
// whatsapp-rust-bridge hanya "import"), sedangkan file .ts di tsx ditranspilasi
// CJS → import statis jadi require() → ERR_PACKAGE_PATH_NOT_EXPORTED. Dynamic
// import lewat ESM loader (dan bundler Next.js) aman. Tipe diimpor statis
// (dihapus saat compile — tanpa efek runtime).
let initAuthCredsFn: (() => AuthenticationCreds) | undefined;
async function getInitAuthCreds(): Promise<() => AuthenticationCreds> {
  if (!initAuthCredsFn) {
    const mod = await import("@whiskeysockets/baileys");
    initAuthCredsFn = mod.initAuthCreds;
  }
  return initAuthCredsFn;
}

// ---- Serialisasi nilai keystore: round-trip eksak untuk semua namespace ----
// lid-mapping → string; prekeys/sessions/app-state → Buffer; tctoken → objek
// { token: Buffer, timestamp }. Prefiks 2 karakter memastikan ambiguitas nol.
function encodeValue(value: unknown): string {
  if (Buffer.isBuffer(value)) return `b:${value.toString("base64")}`;
  if (typeof value === "string") return `s:${value}`;
  return `j:${JSON.stringify(value, (_k, v) => {
    if (Buffer.isBuffer(v)) return { __buf: v.toString("base64") };
    // Buffer.toJSON() berjalan SEBELUM replacer — replacer tidak pernah
    // menerima instance Buffer, hanya { type: "Buffer", data: number[] }.
    if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
      return { __buf: Buffer.from(v.data).toString("base64") };
    }
    return v;
  })}`;
}

function decodeValue(encoded: string): unknown {
  const prefix = encoded.slice(0, 2);
  if (prefix === "b:") return Buffer.from(encoded.slice(2), "base64");
  if (prefix === "s:") return encoded.slice(2);
  return JSON.parse(encoded.slice(2), (_k, v) =>
    v && typeof v === "object" && "__buf" in v ? Buffer.from((v as { __buf: string }).__buf, "base64") : v
  );
}

// ---- Serialisasi creds: round-trip EKSAK (pola encodeValue di atas) ----
// JSON.stringify(Buffer) menghasilkan { type: "Buffer", data: number[] } yang
// setelah JSON.parse kehilangan tipe Buffer → crypto Baileys crash dengan
// ERR_INVALID_ARG_TYPE ("Received an instance of Object") saat handshake /
// generatePairingKey → pairing 502. Marker __buf menjaga tipe eksak; nilai
// lama berformat { type: "Buffer" } (row terpolusi) tetap di-revive.
function serializeCreds(creds: AuthenticationCreds): string {
  return JSON.stringify(creds, (_k, v) => {
    if (Buffer.isBuffer(v)) return { __buf: v.toString("base64") };
    if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
      return { __buf: Buffer.from(v.data).toString("base64") };
    }
    return v;
  });
}

function deserializeCreds(json: string): AuthenticationCreds {
  return JSON.parse(json, (_k, v) =>
    v && typeof v === "object" && "__buf" in v ? Buffer.from((v as { __buf: string }).__buf, "base64") : v
  );
}

export class WaSessionStore implements SignalKeyStore {
  // null = dalam transaksi (pending map aktif); isi pending = ops belum commit
  private pending: Map<string, string | null> | null = null;

  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  /** Baca creds dari app_config; tanpa baris → initAuthCreds() baru. */
  async loadAuthState(): Promise<AuthenticationState> {
    const row = await this.db
      .select().from(schema.appConfig)
      .where(eq(schema.appConfig.key, WA_CREDS_KEY)).limit(1).then((r) => r[0]);
    if (!row) return { creds: (await getInitAuthCreds())(), keys: this };
    try {
      if (isLegacyV1(row.value)) {
        // Migrasi data lama terenkripsi (v1: AES-256-GCM) → plaintext; disimpan
        // ulang sekali jalan.
        const creds = deserializeCreds(decryptLegacyV1(row.value));
        await this.saveCreds(creds);
        return { creds, keys: this };
      }
      return { creds: deserializeCreds(row.value), keys: this };
    } catch (err) {
      logger.warn("wa_creds korup — memulai auth state baru", err);
      return { creds: (await getInitAuthCreds())(), keys: this };
    }
  }

  async saveCreds(creds: AuthenticationCreds): Promise<void> {
    const payload = serializeCreds(creds);
    await this.db
      .insert(schema.appConfig).values({ key: WA_CREDS_KEY, value: payload })
      .onConflictDoUpdate({ target: schema.appConfig.key, set: { value: payload } });
  }

  /** Batch SELECT per namespace + decode. Value hilang = tidak ada. */
  async get(type: string, ids: string[]): Promise<Record<string, any>> {
    if (!ids.length) return {};
    const out: Record<string, any> = {};
    const missing: string[] = [];
    for (const id of ids) {
      const txVal = this.pending?.get(`${type}:${id}`);
      if (txVal === null) continue; // dihapus dalam transaksi
      if (txVal !== undefined) { out[id] = decodeValue(txVal); continue; }
      missing.push(id);
    }
    if (missing.length) {
      const rows = await this.db
        .select().from(schema.waSignalKeys)
        .where(and(eq(schema.waSignalKeys.type, type), inArray(schema.waSignalKeys.key, missing)));
      for (const row of rows) {
        try {
          out[row.key] = isLegacyV1(row.value)
            ? decodeValue(decryptLegacyV1(row.value))
            : decodeValue(row.value);
        } catch (err) { logger.warn("gagal decode signal key", { type, key: row.key }, err); }
      }
    }
    return out;
  }

  /** Upsert per (type, key); nilai null = DELETE (semantik Baileys). */
  async set(data: Record<string, any>): Promise<void> {
    const entries = Object.entries(data);
    if (!entries.length) return;
    // Encode di kedua jalur (pending & langsung): tanpa prefix encode,
    // decodeValue salah menafsirkan string (JSON.parse angka) dan objek
    // (tctoken) tidak bisa dienkripsi. undefined ≈ tidak ada (guard total —
    // encodeValue(undefined) menghasilkan "j:undefined" yang gagal decode);
    // null = DELETE (semantik Baileys).
    const ops = entries.map(([k, v]) => [k, v === undefined || v === null ? null : encodeValue(v)] as [string, string | null]);
    if (this.pending) {
      for (const [k, v] of ops) this.pending.set(k, v);
      return;
    }
    await this.applyOps(ops);
  }

  /** Pola transaksi keystore (dipakai lid-mapping: key + reverse key ditulis atomik).
   *  Selama transaksi aktif, set() menumpuk ke pending map; get() membaca pending
   *  dulu. Commit berurutan (2 key lid-mapping — biaya trivial). Throw → dibuang. */
  async transaction<T>(fn: (store: SignalKeyStore) => Promise<T>, _type?: string): Promise<T> {
    const outer = this.pending;
    const myMap = this.pending = outer ?? new Map();
    try {
      const result = await fn(this);
      // Commit berurutan. set() yang mendarat SELAMA commit (mis. event pesan
      // WA; round-trip Turso 10-100ms) menumpuk di pending — drain sampai
      // habis agar tidak hilang diam-diam. Snapshot + clear per iterasi:
      // tanpa clear, iterasi meng-commit ulang entry yang sama tanpa henti;
      // ops yang mendarat selama applyOps tetap di pending dan disapu
      // iterasi berikutnya (loop berhenti saat tidak ada ops baru).
      if (!outer) {
        while (this.pending.size) {
          const snapshot = [...this.pending.entries()];
          this.pending.clear();
          await this.applyOps(snapshot);
        }
      }
      return result;
    } finally {
      // Token guard reentrancy (I1): restore HANYA bila pending masih map
      // milik kita. Transaksi kedua (T2) yang mulai saat T1 masih drain berbagi
      // pending map yang sama (outer ?? new Map()); bila T1 menutup pending
      // lebih dulu, finally T2 TIDAK boleh mengembalikan map stale — ops T2
      // yang mendarat saat drain T1 tetap ter-commit, dan set() berikutnya
      // tidak pernah menumpuk di map mati (silent data loss).
      if (this.pending === myMap) this.pending = outer;
    }
  }

  private async applyOps(ops: Array<[string, string | null]>): Promise<void> {
    for (const [k, v] of ops) {
      const sep = k.indexOf(":");
      const type = k.slice(0, sep);
      const key = k.slice(sep + 1);
      if (v === null) {
        await this.db.delete(schema.waSignalKeys)
          .where(and(eq(schema.waSignalKeys.type, type), eq(schema.waSignalKeys.key, key)));
      } else {
        await this.db
          .insert(schema.waSignalKeys).values({ type, key, value: v })
          .onConflictDoUpdate({
            target: [schema.waSignalKeys.type, schema.waSignalKeys.key],
            set: { value: v },
          });
      }
    }
  }
}
