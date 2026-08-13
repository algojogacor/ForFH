// src/lib/wa/pipeline.ts — C1: messages.upsert → validasi → identity →
// router (command / AI / panduan). Semua ketergantungan di-inject (MessageDeps)
// agar murni dan dites dengan event mock tanpa jaringan.
import type { WAMessage } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";
import { getWaSendService } from "./send";
import { dispatchCommand, parseCommand, buildExecutorDeps } from "./commands";
import type { WaCommand } from "./commands";
import { handleNaturalLanguage } from "./ai";
import { createIdentityDeps, resolveWhatsAppIdentity } from "./identity";
import { allowAiReply, allowGuide, allowMessage, waRateLimitKey } from "./rate-limit";
import { clampOutput, formatNotLinked } from "./format";
import type { WaBindingRow, WaIdentity } from "./types";
import type { WaClientManager } from "./client-manager";

// Baileys dimuat lazy via dynamic import (pola sama dengan session-store /
// client-manager / identity): paket ESM-only (dependency whatsapp-rust-bridge
// hanya mengekspor kondisi "import"), sedangkan file .ts di tsx ditranspilasi
// CJS → import statis nilai runtime jadi require() →
// ERR_PACKAGE_PATH_NOT_EXPORTED. Tipe diimpor statis (dihapus saat compile).
// Catatan: Baileys 7 rc14 TIDAK mengekspor isJidUser; user jid = PN
// (@s.whatsapp.net) atau LID (@lid) — grup/broadcast/status/newsletter
// dikecualikan oleh konstruksi (domain jid berbeda).
let _baileys: typeof import("@whiskeysockets/baileys") | undefined;
async function getBaileysUtils(): Promise<typeof import("@whiskeysockets/baileys")> {
  return _baileys ??= await import("@whiskeysockets/baileys");
}

export interface MessageDeps {
  resolveIdentity(key: WAMessage["key"]): Promise<{ userId: string | null; identity: WaIdentity; binding: WaBindingRow | null }>;
  allowMessage(rlKey: string): Promise<boolean>;
  allowGuide(rlKey: string): Promise<boolean>;
  allowAiReply(rlKey: string): boolean;
  executeCommand(cmd: WaCommand, args: string, userId: string): Promise<string>;
  executeAi(userId: string, text: string): Promise<string>;
  send(jid: string, text: string): Promise<{ sent: boolean; queued: boolean }>;
}

function extractText(msg: WAMessage): string {
  const content = msg.message;
  if (!content) return "";
  if (typeof content.conversation === "string") return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  return "";
}

export type PipelineResult = "handled" | "ignored" | "guide" | "rate-limited";

export async function processIncomingMessage(deps: MessageDeps, msg: WAMessage): Promise<PipelineResult> {
  const key = msg.key;
  const remoteJid = key?.remoteJid;
  // Validasi event (C1/B4): bukan user jid (grup/broadcast/status/newsletter)
  // → diabaikan. Jangan pernah memproses event blind.
  const { isPnUser, isLidUser } = await getBaileysUtils();
  if (!remoteJid || !(isPnUser(remoteJid) || isLidUser(remoteJid))) return "ignored";
  const text = extractText(msg);
  if (!text) return "ignored";

  const { userId, identity } = await deps.resolveIdentity(key);
  if (!userId) {
    // Sender belum terhubung → panduan, maks 1/sender/jam (B4)
    if (await deps.allowGuide(waRateLimitKey(null, identity, remoteJid))) {
      await deps.send(remoteJid, formatNotLinked(identity.phone ?? null));
      return "guide";
    }
    return "rate-limited";
  }

  if (!(await deps.allowMessage(waRateLimitKey(userId, identity, remoteJid)))) return "rate-limited"; // 20/menit — drop diam-diam

  if (text.startsWith("!")) {
    const parsed = parseCommand(text);
    const reply = await deps.executeCommand(parsed.command, parsed.args, userId);
    await deps.send(remoteJid, clampOutput(reply));
    return "handled";
  }

  if (!deps.allowAiReply(waRateLimitKey(userId, identity, remoteJid))) return "rate-limited"; // interval 5 detik
  const reply = await deps.executeAi(userId, text);
  await deps.send(remoteJid, clampOutput(reply));
  return "handled";
}

let registered = false;
/** Wire pipeline ke manager singleton (dipanggil client-manager via import
 *  dinamis saat socket dibuat — idempoten per proses). */
export function registerMessagePipeline(manager: WaClientManager): void {
  if (registered) return;
  registered = true;
  const sendService = getWaSendService();
  const deps: MessageDeps = {
    resolveIdentity: (key) => resolveWhatsAppIdentity(key, createIdentityDeps({ getPNForLID: (lid) => manager.getPNForLID(lid) })),
    allowMessage: async (k) => (await allowMessage(k)).allowed,
    allowGuide: async (k) => (await allowGuide(k)).allowed,
    allowAiReply: (k) => allowAiReply(k),
    executeCommand: (cmd, args, userId) => dispatchCommand(cmd, args, buildExecutorDeps(userId)),
    executeAi: (userId, text) => handleNaturalLanguage(userId, text),
    send: (jid, text) => sendService.send(jid, text),
  };
  manager.on("message", (msg) => {
    void processIncomingMessage(deps, msg).catch((err) => logger.error("wa: pipeline error", err));
  });
}
