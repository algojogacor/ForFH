import { makeWASocket } from "@whiskeysockets/baileys";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";
import * as dbSchema from "../lib/db/schema";
import { WaSessionStore } from "../lib/wa/session-store";

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
}
