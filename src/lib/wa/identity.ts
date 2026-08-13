// src/lib/wa/identity.ts — satu-satunya tempat menjawab:
// "given WhatsApp identity → ForFH user?" (C2) dan
// "ForFH user → WhatsApp target?" (D2).
import type { WAMessageKey } from "@whiskeysockets/baileys";
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { WaBindingRow, WaIdentity } from "./types";

// Baileys dimuat lazy via dynamic import (pola sama dengan session-store /
// client-manager): paket ESM-only (dependency whatsapp-rust-bridge hanya
// mengekspor kondisi "import"), sedangkan file .ts di tsx ditranspilasi CJS →
// import statis nilai runtime jadi require() → ERR_PACKAGE_PATH_NOT_EXPORTED.
// Tipe diimpor statis (dihapus saat compile — tanpa efek runtime). Runtime di
// Next.js tidak terpengaruh (bundler menyelesaikan dynamic import).
let _baileys: typeof import("@whiskeysockets/baileys") | undefined;
async function getBaileysUtils(): Promise<typeof import("@whiskeysockets/baileys")> {
  return _baileys ??= await import("@whiskeysockets/baileys");
}

export interface IdentityDeps {
  /** Resolver LID→PN dari internal Baileys (sock.signalRepository.lidMapping);
   *  absen → LID dipakai sebagai identitas lid saja. */
  getPNForLID?: (lid: string) => Promise<string | null>;
  findBindingByLid: (lid: string) => Promise<WaBindingRow | null>;
  findBindingByJid: (jid: string) => Promise<WaBindingRow | null>;
  findBindingByPhone: (phone: string) => Promise<WaBindingRow | null>;
  backfillBinding: (bindingId: string, patch: { lid?: string; jid?: string }) => Promise<void>;
}

export function createIdentityDeps(opts: { getPNForLID?: (lid: string) => Promise<string | null> } = {}): IdentityDeps {
  return {
    getPNForLID: opts.getPNForLID,
    findBindingByLid: async (lid) => (await db.query.waBindings.findFirst({ where: eq(waBindings.lid, lid) })) ?? null,
    findBindingByJid: async (jid) => (await db.query.waBindings.findFirst({ where: eq(waBindings.jid, jid) })) ?? null,
    findBindingByPhone: async (phone) => (await db.query.waBindings.findFirst({ where: eq(waBindings.phone, phone) })) ?? null,
    backfillBinding: async (bindingId, patch) => {
      await db.update(waBindings).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(waBindings.id, bindingId));
    },
  };
}

/** Dedupe + urutan kandidat: explicit participant > remoteJid > alternates (C2). */
export function collectCandidateJids(key: WAMessageKey | null | undefined): string[] {
  if (!key) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const jid of [key.participant, key.remoteJid, key.participantAlt, key.remoteJidAlt]) {
    if (jid && !seen.has(jid)) { seen.add(jid); out.push(jid); }
  }
  return out;
}

export async function isValidTransportJid(jid: string): Promise<boolean> {
  if (!jid || jid.length > 100) return false;
  const { jidDecode } = await getBaileysUtils();
  const decoded = jidDecode(jid);
  return !!decoded?.user && !!decoded?.server;
}

export interface ResolvedIdentity {
  userId: string | null;
  identity: WaIdentity;
  binding: WaBindingRow | null;
}

/** C2 — jangan pernah asumsi semua identity berupa `628...@s.whatsapp.net`.
 *  Semua konversi lewat resolver; mapping LID dipelihara internal Baileys di
 *  keystore `lid-mapping` — application layer TIDAK membuat mapping LID kustom. */
export async function resolveWhatsAppIdentity(
  key: WAMessageKey | null | undefined,
  deps: IdentityDeps
): Promise<ResolvedIdentity> {
  const { isLidUser, isPnUser, jidDecode } = await getBaileysUtils();
  const identity: WaIdentity = {};
  for (const jid of collectCandidateJids(key)) {
    let lid: string | undefined;
    let phone: string | undefined;
    let isLid = false;

    if (isLidUser(jid)) {
      isLid = true;
      lid = jidDecode(jid)?.user;
      if (lid) {
        identity.lid = lid;
        phone = (await deps.getPNForLID?.(lid)) ?? undefined;
        if (phone) identity.phone = phone;
      }
    } else if (isPnUser(jid)) {
      phone = jidDecode(jid)?.user;
      if (phone) {
        identity.phone = phone;
        identity.jid = jid;
      }
    } else {
      continue; // jid aneh (bukan PN/LID) → kandidat berikutnya
    }

    // Lookup binding: prioritas lid → jid → phone (C2)
    let binding: WaBindingRow | null = null;
    if (lid) binding = await deps.findBindingByLid(lid);
    if (!binding) binding = await deps.findBindingByJid(jid);
    if (!binding && phone) binding = await deps.findBindingByPhone(phone);

    if (binding) {
      // Backfill non-destruktif: isi lid/jid yang masih kosong
      const patch: { lid?: string; jid?: string } = {};
      if (isLid && lid && !binding.lid) patch.lid = lid;
      if (identity.jid && !binding.jid) patch.jid = identity.jid;
      if (Object.keys(patch).length > 0) {
        try { await deps.backfillBinding(binding.id, patch); }
        catch (err) { logger.warn("wa: backfill binding gagal", err); }
      }
      return { userId: binding.userId, identity, binding: { ...binding, ...patch } };
    }
  }
  return { userId: null, identity, binding: null };
}

/** D2 — target outbound. Prinsip: prefer LID sebagai transport identity;
 *  JANGAN PERNAH otomatis mengembalikan LID → PN, dan JANGAN PERNAH membuat
 *  `${lid}@s.whatsapp.net` (`@lid` vs `@s.whatsapp.net` dua identity berbeda). */
export async function resolveWhatsAppTarget(binding: { jid?: string | null; lid?: string | null; phone: string }): Promise<string | null> {
  if (binding.jid && (await isValidTransportJid(binding.jid))) return binding.jid;
  if (binding.lid) return `${binding.lid}@lid`;
  return `${binding.phone}@s.whatsapp.net`; // fallback binding tanpa transport identity
}
