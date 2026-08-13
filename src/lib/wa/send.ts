// src/lib/wa/send.ts — D4: queue in-memory maks 50 FIFO HANYA untuk short
// reconnect. Gagal lama → drop + caller menerima failure (worker fallback
// web push). Bukan guaranteed delivery.
import { logger } from "@/lib/logger";
import * as health from "./health";
import { getWaClientManager } from "./client-manager";
import type { WaClientManager } from "./client-manager";

const QUEUE_MAX = 50;

export interface SendResult { sent: boolean; queued: boolean; }

export class WaSendService {
  private queue: Array<{ jid: string; text: string }> = [];
  private flushing = false;

  constructor(private readonly manager: WaClientManager = getWaClientManager()) {
    manager.on("open", () => { void this.flushQueue(); });
  }

  isReady(): boolean { return this.manager.isReady(); }
  getQueueLength(): number { return this.queue.length; }

  /** Kirim langsung; bila socket tidak siap → queue bila pendek, else drop. */
  async send(jid: string, text: string): Promise<SendResult> {
    health.recordSendAttempt();
    if (this.manager.isReady()) {
      const ok = await this.manager.sendText(jid, text);
      if (ok) { health.recordSendSuccess(); return { sent: true, queued: false }; }
      health.recordSendFailure();
      return { sent: false, queued: false };
    }
    if (this.queue.length < QUEUE_MAX) {
      this.queue.push({ jid, text });
      return { sent: false, queued: true };
    }
    health.recordSendFailure();
    return { sent: false, queued: false }; // drop — caller menerima failure
  }

  /** Tanpa antrean: gagal = failure seketika (dipakai notifikasi — hindari
   *  dobel kirim dengan web push fallback). */
  async sendStrict(jid: string, text: string): Promise<SendResult> {
    health.recordSendAttempt();
    if (!this.manager.isReady()) { health.recordSendFailure(); return { sent: false, queued: false }; }
    const ok = await this.manager.sendText(jid, text);
    if (ok) { health.recordSendSuccess(); return { sent: true, queued: false }; }
    health.recordSendFailure();
    return { sent: false, queued: false };
  }

  private async flushQueue(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length && this.manager.isReady()) {
        const item = this.queue.shift()!;
        try { await this.manager.sendText(item.jid, item.text); }
        catch (err) { logger.warn("wa: gagal kirim antrean", err); }
      }
    } finally { this.flushing = false; }
  }
}

let serviceSingleton: WaSendService | null = null;
export function getWaSendService(): WaSendService {
  serviceSingleton ??= new WaSendService();
  return serviceSingleton;
}
