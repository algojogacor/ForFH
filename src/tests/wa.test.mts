import { makeWASocket } from "@whiskeysockets/baileys";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";
import * as dbSchema from "../lib/db/schema";
import { WaSessionStore } from "../lib/wa/session-store";
import { classifyDisconnect, nextBackoffDelayMs, WaClientManager, waKeepAlive } from "../lib/wa/client-manager";
import { computeHealth, getHealthIndicators, resetHealthForTests } from "../lib/wa/health";
import type { WaHealthIndicators } from "../lib/wa/types";
import { normalizePhone, maskPhone } from "../lib/wa/normalize";
import { collectCandidateJids, resolveWhatsAppIdentity, resolveWhatsAppTarget } from "../lib/wa/identity";
import type { WaBindingRow } from "../lib/wa/types";
import { parseCommand } from "../lib/wa/commands";
import { formatJadwal, formatTugas, formatHelp, clampOutput, formatNotLinked } from "../lib/wa/format";
import { waRateLimitKey, allowAiReply, resetAiReplyForTests } from "../lib/wa/rate-limit";
import { processIncomingMessage } from "../lib/wa/pipeline";
import type { MessageDeps } from "../lib/wa/pipeline";
import { WaSendService } from "../lib/wa/send";
import { decideDeliveryChannel } from "../lib/notifications/worker";
import { nextPairingState } from "../lib/wa/pairing";

// DDL minimal untuk :memory: — jaga sinkron dgn schema.ts waBindings/waSignalKeys
const MEM_DDL = [
  `CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000))`,
  `CREATE TABLE IF NOT EXISTS wa_signal_keys (type TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY (type, key))`,
  `CREATE TABLE IF NOT EXISTS wa_bindings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, phone TEXT NOT NULL UNIQUE, lid TEXT UNIQUE, jid TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending', otp_code TEXT, otp_expires_at INTEGER, otp_attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
];

async function createMemDb() {
  const client = createClient({ url: ":memory:" });
  for (const ddl of MEM_DDL) await client.execute(ddl);
  return drizzle(client, { schema: dbSchema });
}

// Client dengan execute() yang di-defer via setImmediate: mensimulasikan
// round-trip Turso remote (macrotask boundary 10-100ms) sehingga commit
// transaksi bisa diselangi set() dari luar — dipakai tes drain.
async function createSlowMemDb() {
  const client = createClient({ url: ":memory:" });
  for (const ddl of MEM_DDL) await client.execute(ddl);
  const slowClient = new Proxy(client, {
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (p === "execute" && typeof v === "function") {
        return async (...args: unknown[]) => {
          await new Promise((resolve) => setImmediate(resolve));
          return v.apply(t, args);
        };
      }
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return drizzle(slowClient as unknown as Client, { schema: dbSchema });
}

export async function runWaTests(assert: (condition: boolean, name: string) => void) {
  console.log("\n--- 9. WhatsApp Assistant (Baileys 7) Tests ---");

  // ESM gate: import statis bernama langsung dari paket (DILARANG require()).
  // Gagal di sini = CJS/ESM interop error → seluruh suite crash (fail loud).
  assert(typeof makeWASocket === "function", "ESM import Baileys 7 works (makeWASocket tersedia)");

  // ===== F1 — Auth state (storage adapter, libsql :memory:) =====
  {
    const memDb = await createMemDb();
    const store = new WaSessionStore(memDb);

    // seeding: tanpa baris app_config → initAuthCreds() baru. Juga memaksa
    // jalur dynamic import Baileys & cabang no-row yang tadinya tak pernah
    // dieksekusi tes (saveCreds dipanggil dulu sebelumnya).
    const seeded = await store.loadAuthState();
    assert(!seeded.creds.me && typeof seeded.creds.nextPreKeyId === "number", "no row → initAuthCreds seeded (dynamic import Baileys)");

    // save/load creds (round-trip terenkripsi)
    const fakeCreds: any = { me: { id: "62812@lid" }, registered: true, noiseKey: { private: Buffer.from("ab"), public: Buffer.from("cd") } };
    await store.saveCreds(fakeCreds);
    const restored = await store.loadAuthState();
    assert(restored.creds.me?.id === "62812@lid", "creds round-trip: save → load utuh");
    const rawRow = await memDb.select().from(dbSchema.appConfig).where(eq(dbSchema.appConfig.key, "wa_creds")).limit(1).then((r) => r[0]);
    assert(!!rawRow && !rawRow.value.includes("62812"), "creds tersimpan terenkripsi (plaintext tidak tampil)");

    // save/load key per namespace
    await store.set({ "lid-mapping:lidA": "628111" });
    const got = await store.get("lid-mapping", ["lidA"]);
    assert(got["lidA"] === "628111", "key round-trip: set → get mengembalikan nilai sama");

    // update existing key → load updated
    await store.set({ "lid-mapping:lidA": "628222" });
    const got2 = await store.get("lid-mapping", ["lidA"]);
    assert(got2["lidA"] === "628222", "update key → get mengembalikan nilai baru");

    // delete key (null) → absent
    await store.set({ "lid-mapping:lidA": null });
    const got3 = await store.get("lid-mapping", ["lidA"]);
    assert(got3["lidA"] === undefined, "delete key (null) → get tidak mengembalikan");

    // lid-mapping + _reverse dalam satu transaksi → keduanya ada
    await store.transaction(async () => {
      await store.set({ "lid-mapping:lidB": "628333", "lid-mapping:628333_reverse": "lidB" });
    });
    const lidB = await store.get("lid-mapping", ["lidB"]);
    const rev = await store.get("lid-mapping", ["628333_reverse"]);
    assert(lidB["lidB"] === "628333" && rev["628333_reverse"] === "lidB", "transaction lid-mapping: key + _reverse ditulis atomik");

    // pending-overlay: get() di dalam transaksi membaca pending map
    // (cabang nilai pending & cabang null=deleted)
    await store.set({ "lid-mapping:overlay": "628666" });
    await store.transaction(async () => {
      await store.set({ "lid-mapping:overlay": "628777" }); // update → pending
      await store.set({ "lid-mapping:overlayDel": null });  // delete → pending (null)
      const readOverlay = await store.get("lid-mapping", ["overlay"]);
      assert(readOverlay["overlay"] === "628777", "get() dalam transaksi: baca nilai pending yang baru di-set");
      const readDel = await store.get("lid-mapping", ["overlayDel"]);
      assert(readDel["overlayDel"] === undefined, "get() dalam transaksi: key di-delete (null) tidak terbaca");
    });
    const afterTx = await store.get("lid-mapping", ["overlay"]);
    const afterDel = await store.get("lid-mapping", ["overlayDel"]);
    assert(afterTx["overlay"] === "628777" && afterDel["overlayDel"] === undefined, "commit transaksi: update & delete diterapkan ke DB");

    // drain: set() yang mendarat DETIK commit berlangsung tidak boleh hilang.
    // Client di-defer via setImmediate → commit punya macrotask boundary;
    // setImmediate late-cb terdaftar LEBIH DULU dari setImmediate internal
    // commit → deterministik menyelip di tengah commit (bukan setelahnya).
    const slowMemDb = await createSlowMemDb();
    const slowStore = new WaSessionStore(slowMemDb);
    const drainTxn = slowStore.transaction(async () => {
      await slowStore.set({ "lid-mapping:inTxn": "628444" });
    });
    setImmediate(() => { slowStore.set({ "lid-mapping:late": "628555" }); });
    await drainTxn;
    const late = await slowStore.get("lid-mapping", ["late"]);
    assert(late["late"] === "628555", "set() selama commit transaksi tetap tersimpan (drain sisa ops)");

    // tctoken namespace (objek dengan Buffer)
    const tctoken = { token: Buffer.from("tok"), timestamp: 1755000000000 };
    await store.set({ "tctoken:628333": tctoken });
    const tc = await store.get("tctoken", ["628333"]) as any;
    assert(Buffer.isBuffer(tc["628333"]?.token) && tc["628333"]?.timestamp === 1755000000000, "tctoken round-trip (objek + Buffer)");

    // "restart": instance store baru dari data yang sama → restore utuh
    const store2 = new WaSessionStore(memDb);
    const restored2 = await store2.get("lid-mapping", ["lidB"]);
    const tc2 = await store2.get("tctoken", ["628333"]) as any;
    assert(restored2["lidB"] === "628333" && Buffer.isBuffer(tc2["628333"]?.token), "restart: store baru dari data sama → mapping & tctoken utuh");

    // total: nilai undefined tidak disimpan (tanpa guard → "j:undefined"
    // yang gagal di-decode, baris sampah tertinggal)
    await store.set({ "lid-mapping:undef": undefined });
    const undef = await store.get("lid-mapping", ["undef"]);
    const undefRow = await memDb.select().from(dbSchema.waSignalKeys)
      .where(and(eq(dbSchema.waSignalKeys.type, "lid-mapping"), eq(dbSchema.waSignalKeys.key, "undef"))).limit(1).then((r) => r[0]);
    assert(undef["undef"] === undefined && !undefRow, "nilai undefined tidak tersimpan (guard total)");

    // korup: baris app_config yang tidak bisa didekripsi → fallback
    // initAuthCreds() baru (cabang catch loadAuthState)
    await memDb.delete(dbSchema.appConfig).where(eq(dbSchema.appConfig.key, "wa_creds"));
    await memDb.insert(dbSchema.appConfig).values({ key: "wa_creds", value: "corrupt!" });
    const corrupted = await store.loadAuthState();
    assert(!corrupted.creds.me, "creds korup → initAuthCreds() baru (fallback)");
  }

  // ===== F1 — Health model (pure) =====
  {
    const base: WaHealthIndicators = {
      socketState: "open", lastConnectionUpdate: Date.now() - 1000, lastMessageEvent: Date.now() - 1000,
      lastSendAttempt: Date.now() - 1000, lastSuccessfulSend: Date.now() - 1000,
      lastSuccessfulReceive: Date.now() - 1000, lastAuthPersistence: Date.now() - 1000,
      failedSendAttempts: 0, authInvalid: false,
    };
    assert(computeHealth({ ...base }) === "healthy", "open + event baru → healthy");
    const silent: WaHealthIndicators = { ...base, lastMessageEvent: Date.now() - 20 * 60_000, lastSuccessfulReceive: Date.now() - 20 * 60_000 };
    assert(computeHealth(silent) === "possibly_silent", "open + tak ada inbound >15 mnt → possibly_silent (BUKAN unhealthy)");
    const degraded: WaHealthIndicators = { ...base, failedSendAttempts: 3 };
    assert(computeHealth(degraded) === "degraded", "open + 3 kiriman gagal beruntun → degraded");
    assert(computeHealth({ ...base, socketState: "reconnecting" }) === "disconnected", "socket tidak open → disconnected");
    assert(computeHealth({ ...base, authInvalid: true }) === "auth_invalid", "flag auth invalid → auth_invalid");
    // Segar open tanpa pesan masuk: berbasis lastConnectionUpdate → sehat (tanpa false alarm langsung)
    assert(computeHealth({ ...base, lastMessageEvent: null, lastSuccessfulReceive: null, lastConnectionUpdate: Date.now() - 60_000 }) === "healthy",
      "baru open + belum ada pesan → healthy (bukan mungkin_silent instan)");
  }

  // ===== F1 — classifyDisconnect pure (matriks A4) =====
  {
    assert(classifyDisconnect(408) === "temporary", "408 connectionLost/timedOut → temporary");
    assert(classifyDisconnect(428) === "temporary", "428 connectionClosed → temporary");
    assert(classifyDisconnect(515) === "restart", "515 restartRequired → restart");
    assert(classifyDisconnect(401) === "logged_out", "401 loggedOut → logged_out");
    assert(classifyDisconnect(440) === "replaced", "440 connectionReplaced → replaced");
    assert(classifyDisconnect(500) === "bad_session", "500 badSession → bad_session");
    assert(classifyDisconnect(411) === "mismatch", "411 multideviceMismatch → mismatch");
    assert(classifyDisconnect(403) === "forbidden", "403 forbidden → forbidden");
    assert(classifyDisconnect(503) === "unavailable", "503 unavailableService → unavailable");
    assert(classifyDisconnect(undefined) === "unknown", "tanpa error → unknown");

    // Backoff: min 1s, max 60s, jitter ±20% (A3)
    const d1 = nextBackoffDelayMs(1);
    assert(d1 >= 800 && d1 <= 1200, "backoff attempt 1 dalam 0.8–1.2s (base 1s ±20%)");
    const d10 = nextBackoffDelayMs(10);
    assert(d10 >= 48_000 && d10 <= 72_000, "backoff attempt 10 terkunci di 60s ±20% (cap)");
  }

  // ===== F1 — Socket manager (Baileys di-mock) =====
  {
    interface FakeSocket {
      ev: { on: (ev: string, cb: (p: any) => void) => void };
      sendMessage: () => Promise<any>;
      requestPairingCode: () => Promise<string>;
      end: (err?: Error) => void;
      handlers: Record<string, (p: any) => void>;
    }
    function makeFakeSocket(): FakeSocket {
      const handlers: Record<string, (p: any) => void> = {};
      return {
        handlers,
        ev: { on: (ev, cb) => { handlers[ev] = cb; } },
        sendMessage: async () => ({}),
        requestPairingCode: async () => "ABC-DEF",
        end: () => {},
      };
    }
    async function makeManager(opts: { onClose?: (p: any) => void }) {
      let callCount = 0;
      let authInvalid = false;
      const sockets: FakeSocket[] = [];
      const manager = new WaClientManager({
        makeSocket: (() => { callCount++; const s = makeFakeSocket(); sockets.push(s); return s; }) as any,
        loadAuth: async () => ({ creds: { me: { id: "62812@lid" }, registered: false } as any, keys: {} as any }),
        persistCreds: async () => {},
        readAuthFlag: async () => authInvalid,
        persistAuthFlag: async (v) => { authInvalid = v; },
        scheduleTimer: (fn) => { fn(); }, // fire langsung (deterministik untuk tes)
      });
      manager.on("close", opts.onClose ?? (() => {}));
      return { manager, sockets, getCallCount: () => callCount };
    }
    // Fixture realistis error lastDisconnect: Baileys rc14 SELALU memakai
    // @hapi/boom (Boom) — status hanya di err.output.statusCode. Plain object
    // literal (jangan import @hapi/boom di tes; itu cuma transitive dep).
    function boomError(statusCode: number, message: string): any {
      return { isBoom: true, output: { statusCode }, message };
    }

    // ensureWaClient idempoten: 3× berurutan → 1 socket
    const m1 = await makeManager({});
    await Promise.all([m1.manager.ensureWaClient(), m1.manager.ensureWaClient(), m1.manager.ensureWaClient()]);
    assert(m1.getCallCount() === 1, "ensureWaClient 3× berurutan → tepat 1 socket (shared startup promise)");
    assert(m1.manager.state === "connecting", "ensureWaClient selesai → state connecting (socket belum open)");

    // connect → open; temporary disconnect (408, Boom) → reconnect (backoff, 2 socket)
    const m2 = await makeManager({});
    await m2.manager.ensureWaClient();
    m2.sockets[0].handlers["connection.update"]({ connection: "open" });
    assert(m2.manager.state === "open" && m2.manager.isReady(), "connect → state open");
    m2.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: boomError(408, "Connection was lost") } });
    await new Promise((r) => setTimeout(r, 10));
    assert(m2.getCallCount() === 2, "disconnect temporary (408) → reconnect via backoff");
    assert(m2.manager.fatalReason === null, "temporary → fatalReason tetap null");

    // loggedOut (401, Boom) → stop + auth invalid; TANPA recreate
    const m3 = await makeManager({});
    await m3.manager.ensureWaClient();
    m3.sockets[0].handlers["connection.update"]({ connection: "open" });
    m3.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: boomError(401, "Logged out") } });
    assert(m3.manager.state === "logged_out" && m3.manager.fatalReason === "auth_invalid", "loggedOut (401) → state logged_out + fatal");
    assert(m3.getCallCount() === 1, "loggedOut → TIDAK auto-recreate");
    const keep3 = await waKeepAlive(m3.manager);
    assert(keep3 === "auth-invalid", "waKeepAlive saat auth invalid → auth-invalid (tanpa recreate)");

    // resetFatal: buka kunci fatal (jalur pemulihan Task 7 setelah re-pair)
    await m3.manager.resetFatal();
    assert(m3.manager.fatalReason === null && m3.manager.state === "stopped", "resetFatal → kunci fatal dibuka + state stopped");
    assert((await m3.manager.isAuthInvalid()) === false, "resetFatal → flag auth invalid dibersihkan");
    await m3.manager.ensureWaClient();
    assert(m3.getCallCount() === 2, "setelah resetFatal → ensureWaClient init ulang (socket baru)");

    // badSession (500, Boom) → stop fatal auth_invalid + set flag; TANPA recreate
    const m7 = await makeManager({});
    await m7.manager.ensureWaClient();
    m7.sockets[0].handlers["connection.update"]({ connection: "open" });
    m7.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: boomError(500, "Session corrupted") } });
    await new Promise((r) => setTimeout(r, 10));
    assert(m7.manager.state === "logged_out" && m7.manager.fatalReason === "auth_invalid", "badSession (500) → state logged_out + fatal");
    assert(m7.getCallCount() === 1, "badSession → TIDAK auto-recreate");
    assert((await waKeepAlive(m7.manager)) === "auth-invalid", "badSession → flag auth invalid terset (tanpa recreate)");

    // connectionReplaced (440, Boom) → stop, TIDAK reconnect
    const m4 = await makeManager({});
    await m4.manager.ensureWaClient();
    m4.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: boomError(440, "Connection replaced") } });
    assert(m4.manager.state === "error" && m4.manager.fatalReason === "replaced", "connectionReplaced (440) → stop tanpa reconnect");
    assert(m4.getCallCount() === 1, "connectionReplaced → 1 socket saja");

    // restartRequired (515, Boom) → recreate (auth sama)
    const m5 = await makeManager({});
    await m5.manager.ensureWaClient();
    m5.sockets[0].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: boomError(515, "Restart required") } });
    await new Promise((r) => setTimeout(r, 10));
    assert(m5.getCallCount() === 2, "restartRequired (515) → recreate socket");

    // unavailableService (503, Boom): retry sampai 3 upaya → stop fatal
    const m8 = await makeManager({});
    await m8.manager.ensureWaClient();
    for (let i = 0; i < 3; i++) {
      m8.sockets[i].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: boomError(503, "Service unavailable") } });
      await new Promise((r) => setTimeout(r, 10));
    }
    assert(m8.getCallCount() === 4, "503 berulang (3 upaya) → retry tanpa fatal");
    assert(m8.manager.fatalReason === null, "503 belum lewat batas → fatalReason tetap null");
    m8.sockets[3].handlers["connection.update"]({ connection: "close", lastDisconnect: { error: boomError(503, "Service unavailable") } });
    await new Promise((r) => setTimeout(r, 10));
    assert(m8.manager.state === "error" && m8.manager.fatalReason === "unavailable", "503 melewati 3 upaya → stop fatal unavailable");
    assert(m8.getCallCount() === 4, "503 melewati batas → TIDAK recreate lagi");

    // waKeepAlive: open → healthy; dead → ensure (recovered)
    const m6 = await makeManager({});
    assert((await waKeepAlive(m6.manager)) === "connecting", "waKeepAlive saat belum ada socket → ensure → state");
    m6.sockets[0].handlers["connection.update"]({ connection: "open" });
    assert((await waKeepAlive(m6.manager)) === "healthy", "waKeepAlive saat open → healthy");

    // creds.update → persist + health lastAuthPersistence
    resetHealthForTests();
    m6.sockets[0].handlers["creds.update"]({ me: { id: "62812@lid" }, registered: true } as any);
    await new Promise((r) => setTimeout(r, 5));
    assert(getHealthIndicators().lastAuthPersistence !== null, "creds.update → lastAuthPersistence tercatat");
  }

  // ===== F1 — normalize (verification identity) =====
  {
    assert(normalizePhone("081234567890") === "6281234567890", "08xx → 628xx");
    assert(normalizePhone("+62 812-3456-7890") === "6281234567890", "+62 dengan spasi/tanda → 628");
    assert(normalizePhone("6281234567890") === "6281234567890", "628xx tetap");
    assert(normalizePhone("81234567890") === "6281234567890", "8xx → 628");
    assert(normalizePhone("12345") === null, "nomor terlalu pendek → null");
    assert(maskPhone("6281234567890") === "628****90", "maskPhone menyembunyikan tengah");
  }

  // ===== F1 — Identity resolver (pure, Baileys utils nyata) =====
  {
    const b1 = { id: "b1", userId: "u1", phone: "628111111111", lid: "lidA", jid: null, status: "active", otpCode: null, otpExpiresAt: null, otpAttempts: 0, createdAt: "", updatedAt: "" } as WaBindingRow;
    const b2 = { id: "b2", userId: "u2", phone: "628222222222", lid: null, jid: null, status: "active", otpCode: null, otpExpiresAt: null, otpAttempts: 0, createdAt: "", updatedAt: "" } as WaBindingRow;
    const deps = {
      getPNForLID: async (lid: string) => (lid === "lidA" ? "628111111111" : null),
      findBindingByLid: async (lid: string): Promise<WaBindingRow | null> => (lid === "lidA" ? b1 : null),
      findBindingByJid: async (jid: string): Promise<WaBindingRow | null> => null,
      findBindingByPhone: async (phone: string): Promise<WaBindingRow | null> => {
        if (phone === "628111111111") return b1;
        if (phone === "628222222222") return b2;
        return null;
      },
      backfillBinding: async () => {},
    };

    // PN identity → userId
    const res1 = await resolveWhatsAppIdentity({ remoteJid: "628111111111@s.whatsapp.net" } as any, deps);
    assert(res1.userId === "u1", "PN identity → userId via phone lookup");
    // LID identity → userId via mapping PN → phone
    const res2 = await resolveWhatsAppIdentity({ remoteJid: "lidA@lid" } as any, deps);
    assert(res2.userId === "u1" && res2.identity.lid === "lidA", "LID identity → userId (via mapping)");
    // unknown → null
    const res3 = await resolveWhatsAppIdentity({ remoteJid: "628999999999@s.whatsapp.net" } as any, deps);
    assert(res3.userId === null, "identity asing → userId null");
    // alternates: participant > remoteJid
    const res4 = await resolveWhatsAppIdentity({ participant: "628222222222@s.whatsapp.net", remoteJid: "628999999999@s.whatsapp.net" } as any, deps);
    assert(res4.userId === "u2", "participant diprioritaskan atas remoteJid");
    // tanpa key → null
    const res5 = await resolveWhatsAppIdentity(null, deps);
    assert(res5.userId === null, "tanpa key → null");

    // collectCandidateJids dedupe + urutan
    const jids = collectCandidateJids({ participant: "a@lid", remoteJid: "a@lid", participantAlt: "b@s.whatsapp.net" } as any);
    assert(jids.length === 2 && jids[0] === "a@lid" && jids[1] === "b@s.whatsapp.net", "kandidat jid dedupe + urut participant > remoteJid > alternates");
  }

  // ===== F1 — resolveWhatsAppTarget (D2: prefer LID, JANGAN ${lid}@s.whatsapp.net) =====
  {
    assert((await resolveWhatsAppTarget({ jid: "628111111111@s.whatsapp.net", lid: "lidA", phone: "628111111111" })) === "628111111111@s.whatsapp.net", "jid valid dipakai apa adanya");
    assert((await resolveWhatsAppTarget({ jid: null, lid: "lidA", phone: "628111111111" })) === "lidA@lid", "lid → `${lid}@lid` (TANPA @s.whatsapp.net)");
    assert((await resolveWhatsAppTarget({ jid: null, lid: null, phone: "628111111111" })) === "628111111111@s.whatsapp.net", "hanya phone → fallback `${phone}@s.whatsapp.net`");
    assert((await resolveWhatsAppTarget({ jid: "lidA@lid", lid: "lidA", phone: "628111111111" })) === "lidA@lid", "jid LID tersimpan → apa adanya");
  }

  // ===== F1 — commands parser (pure) =====
  {
    const c1 = parseCommand("!jadwal besok");
    assert(c1.command === "jadwal" && c1.args === "besok", "!jadwal besok → command jadwal + args besok");
    const c2 = parseCommand("!JADWAL");
    assert(c2.command === "jadwal", "command case-insensitive");
    const c3 = parseCommand("!menu");
    assert(c3.command === "menu", "!menu dikenal");
    const c4 = parseCommand("!tidakada");
    assert(c4.command === "unknown", "perintah tak dikenal → unknown (dispatcher → !help singkat)");
    const c5 = parseCommand("halo");
    assert(c5.command === "unknown", "tanpa prefix ! → unknown (jalur AI)");
  }

  // ===== F1 — formatter (pure) =====
  {
    const out = formatJadwal(
      [{ startTime: "08:00", endTime: "09:40", courseName: "Hukum Pidana", room: "A-203" }],
      "📅 *JADWAL HARI INI*",
      "ketik !jadwal besok utk besok"
    );
    assert(out.includes("08:00–09:40") && out.includes("Hukum Pidana") && out.includes("Ruang A-203") && out.includes("1 kelas"), "formatJadwal: waktu, MK, ruang, ringkasan");
    const outT = formatTugas([{ title: "Resume Buku PIH", dueAt: Date.now() + 3600_000, done: false, courseName: "PIH" }]);
    assert(outT.includes("1.") && outT.includes("⏳") && outT.includes("PIH"), "formatTugas: nomor urut + status + MK");
    assert(formatHelp(true).includes("!hubungkan") && formatHelp(true).includes("!putuskan"), "formatHelp memuat semua perintah");
    assert(clampOutput("x".repeat(4000)).length <= 3500, "clampOutput memotong ke ≤3500 char");
    assert(formatNotLinked("6281234567890").includes("6281234567890"), "panduan hubungkan memuat nomor sender");
  }

  // ===== F1 — rate limit key (resolved identity) + interval AI =====
  {
    assert(waRateLimitKey("u1", {}, "6281@s.whatsapp.net") === "wa:user:u1", "key memakai userId bila ter-resolve");
    const keyJid = waRateLimitKey(null, { jid: "6282@s.whatsapp.net" }, "6282@s.whatsapp.net");
    assert(keyJid === "wa:jid:6282@s.whatsapp.net", "tanpa userId → key dari JID stabil (bukan substring phone)");
    const keyLid = waRateLimitKey(null, { lid: "lidX" }, "lidX@lid");
    assert(keyLid === "wa:jid:lidX@lid", "fallback LID → key stabil @lid");
    resetAiReplyForTests();
    assert(allowAiReply("wa:user:u1") === true, "AI interval: pesan pertama diizinkan");
    assert(allowAiReply("wa:user:u1") === false, "AI interval: pesan kedua < 5 detik → ditolak");
    await new Promise((r) => setTimeout(r, 5100));
    assert(allowAiReply("wa:user:u1") === true, "AI interval: setelah 5 detik → diizinkan lagi");
  }

  // ===== F1 — Messaging (pure, event mock) + Security =====
  {
    function msg(remoteJid: string, text: string, extra: any = {}): any {
      return { key: { remoteJid, ...extra }, message: { conversation: text } };
    }
    const calls: Array<{ jid: string; text: string }> = [];
    let userIdFor: string | null = "u1";
    let guideAllowed = true;
    let msgAllowed = true;
    let aiAllowed = true;
    const deps: MessageDeps = {
      resolveIdentity: async (key) => ({ userId: userIdFor, identity: {}, binding: null }),
      allowMessage: async () => msgAllowed,
      allowGuide: async () => guideAllowed,
      allowAiReply: () => aiAllowed,
      executeCommand: async (cmd, _args, userId) => `cmd:${cmd}:${userId}`,
      executeAi: async (userId, text) => `ai:${userId}:${text}`,
      send: async (jid, text) => { calls.push({ jid, text }); return { sent: true, queued: false }; },
    };

    // bound sender + command → routed
    const r1 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "!jadwal besok"));
    assert(r1 === "handled" && calls[0].text.startsWith("cmd:jadwal"), "bound sender + !jadwal → routed ke dispatcher");
    // bound sender + natural language → AI
    calls.length = 0;
    const r2 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "ada kelas besok?"));
    assert(r2 === "handled" && calls[0].text.startsWith("ai:"), "natural language → jalur AI");
    // unknown sender → panduan (maks 1/jam)
    calls.length = 0;
    userIdFor = null;
    const r3 = await processIncomingMessage(deps, msg("6289@s.whatsapp.net", "halo"));
    assert(r3 === "guide" && calls[0].text.includes("HUBUNGKAN"), "unknown sender → panduan hubungkan");
    // kedua kalinya dalam jam yang sama → rate-limited (tanpa balasan)
    guideAllowed = false;
    const r4 = await processIncomingMessage(deps, msg("6289@s.whatsapp.net", "halo lagi"));
    assert(r4 === "rate-limited" && calls.length === 1, "panduan kedua dalam 1 jam → rate-limited (maks 1/jam)");
    // group diabaikan
    guideAllowed = true; userIdFor = "u1";
    const r5 = await processIncomingMessage(deps, msg("123@g.us", "halo"));
    assert(r5 === "ignored", "pesan grup diabaikan");
    // broadcast/status diabaikan
    const r6 = await processIncomingMessage(deps, msg("status@broadcast", "halo"));
    assert(r6 === "ignored", "pesan broadcast/status diabaikan");
    // system/non-text (sticker, tanpa conversation) → ignored
    const r7 = await processIncomingMessage(deps, { key: { remoteJid: "6281@s.whatsapp.net" }, message: { stickerMessage: {} } } as any);
    assert(r7 === "ignored", "pesan non-teks diabaikan");
    // keamanan: spoof identity (remoteJid user valid tapi tidak ter-bound) → guide, TIDAK pernah command
    calls.length = 0;
    userIdFor = null;
    const r8 = await processIncomingMessage(deps, msg("628777@s.whatsapp.net", "!selesai 1"));
    assert(r8 === "guide" && calls[0].text.includes("HUBUNGKAN"), "spoof identity → panduan, command tidak dieksekusi");
    // rate limit pesan (20/menit) dilanggar → drop tanpa balasan
    calls.length = 0; userIdFor = "u1"; msgAllowed = false;
    const r9 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "!jadwal"));
    assert(r9 === "rate-limited" && calls.length === 0, "rate limit 20/menit → drop tanpa balasan");
    // interval AI 5 detik → pesan kedua ditolak
    calls.length = 0; msgAllowed = true; aiAllowed = false;
    const r10 = await processIncomingMessage(deps, msg("6281@s.whatsapp.net", "ceritain dong"));
    assert(r10 === "rate-limited" && calls.length === 0, "interval AI 5 detik → pesan kedua ditolak");
  }

  // ===== F1 — Send service (queue D4) =====
  {
    class FakeManager {
      ready = false;
      sent: Array<{ jid: string; text: string }> = [];
      handlers: Record<string, (p: any) => void> = {};
      isReady() { return this.ready; }
      async sendText(jid: string, text: string) { this.sent.push({ jid, text }); return true; }
      on(ev: string, cb: (p: any) => void) { this.handlers[ev] = cb; }
    }
    const fm = new FakeManager() as any;
    const svc = new WaSendService(fm);
    assert(svc.isReady() === false, "send service: manager belum siap");
    const q1 = await svc.send("a@lid", "pesan 1");
    assert(q1.queued === true && svc.getQueueLength() === 1, "socket belum siap → pesan masuk queue");
    // kapasitas 50
    for (let i = 0; i < 49; i++) await svc.send("a@lid", `pesan ${i}`);
    const dropped = await svc.send("a@lid", "ke-51");
    assert(dropped.queued === false && dropped.sent === false && svc.getQueueLength() === 50, "queue maks 50 → ke-51 di-drop (caller terima failure)");
    // open → flush FIFO
    fm.ready = true;
    fm.handlers["open"]({ isNewLogin: false });
    await new Promise((r) => setTimeout(r, 10));
    assert(fm.sent.length === 50 && fm.sent[0].text === "pesan 1" && svc.getQueueLength() === 0, "open → queue di-flush FIFO (50 pesan, urutan lama dulu)");
    // sendStrict tanpa siap → failure seketika
    fm.ready = false;
    const strict = await svc.sendStrict("a@lid", "reminder");
    assert(strict.sent === false && strict.queued === false && svc.getQueueLength() === 0, "sendStrict gagal → tanpa antrean (hindari dobel dengan web push)");
  }

  // ===== F1 — Notification decision (pure) =====
  {
    assert(decideDeliveryChannel(true, 0) === "whatsapp", "WA sukses → channel whatsapp");
    assert(decideDeliveryChannel(false, 2) === "web_push", "WA gagal + push sukses → fallback web_push");
    assert(decideDeliveryChannel(false, 0) === "none", "WA gagal + tanpa push → none");
    assert(decideDeliveryChannel(true, 0) === "whatsapp", "WA sukses → TIDAK dobel kirim web push");
  }

  // ===== F1 — Pairing state machine (pure, A7) =====
  {
    assert(nextPairingState("pairing_not_started", "request") === "pairing_code_requested", "start → request → code_requested");
    assert(nextPairingState("pairing_code_requested", "code_received") === "waiting_for_phone", "code_received → waiting_for_phone");
    assert(nextPairingState("waiting_for_phone", "linked") === "pairing_success", "linked → pairing_success");
    assert(nextPairingState("waiting_for_phone", "expired") === "pairing_failed", "expired → pairing_failed");
    assert(nextPairingState("waiting_for_phone", "timeout_408") === "pairing_failed", "408 selama menunggu → pairing_failed");
    assert(nextPairingState("waiting_for_phone", "logged_out_401") === "pairing_failed", "401 selama menunggu → pairing_failed");
    assert(nextPairingState("pairing_failed", "request") === "pairing_code_requested", "failed → request (minta kode baru)");
    assert(nextPairingState("pairing_success", "request") === "pairing_code_requested", "re-pair dari success → request");
    assert(nextPairingState("pairing_success", "linked") === "pairing_success", "event tak relevan → state tetap");
  }
}
