// src/app/api/wa/pairing/route.ts — A7: request QR code / pairing + state tracking.
// Hanya pemilik WA_ADMIN_PHONE (via binding aktif dengan nomor admin).
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { getWaClientManager } from "@/lib/wa/client-manager";
import { normalizePhone } from "@/lib/wa/normalize";
import {
  getPairingState, setPairingState, nextPairingState,
  markPairingQrReceived, failPairing, qrForState, pairingCodeForState, PAIRING_EXPIRY_MS,
} from "@/lib/wa/pairing";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const adminPhone = normalizePhone(serverEnv.WA_ADMIN_PHONE ?? "");
    if (!adminPhone) return NextResponse.json({ error: "WA_ADMIN_PHONE belum dikonfigurasi." }, { status: 500 });
    const adminBinding = await db.query.waBindings.findFirst({
      where: and(eq(waBindings.phone, adminPhone), eq(waBindings.status, "active")),
    });
    if (!adminBinding || adminBinding.userId !== user.id) {
      return NextResponse.json({ error: "Hanya pemilik bot yang dapat melakukan pairing." }, { status: 403 });
    }

    const manager = getWaClientManager();
    const action = req.nextUrl.searchParams.get("action");

    let rec = await getPairingState();
    if (manager.isReady()) {
      if (rec.state === "waiting_for_scan" || rec.state === "waiting_for_qr" || rec.state === "waiting_for_phone" || rec.state === "pairing_code_requested") {
        rec = await setPairingState({ ...rec, state: "pairing_success", qr: undefined, code: undefined, updatedAt: Date.now() });
      }
      return NextResponse.json({ state: "pairing_success", linked: true });
    }

    // Safety net: QR/kode kedaluwarsa
    if ((rec.state === "waiting_for_scan" || rec.state === "waiting_for_qr" || rec.state === "waiting_for_phone") && rec.requestedAt && Date.now() - rec.requestedAt > PAIRING_EXPIRY_MS) {
      rec = await setPairingState({ ...rec, state: nextPairingState(rec.state, "expired"), qr: undefined, code: undefined, updatedAt: Date.now() });
    }

    if (action === "request") {
      // Re-pair / fresh QR: bersihkan sesi lama & buka kunci socket agar Baileys menghasilkan QR baru
      await manager.resetFatal();
      await manager.ensureWaClient();

      // Tunggu QR dihasilkan Baileys jika belum ada di memory
      if (!manager.getQr() && !manager.isReady()) {
        await manager.waitForQr(4000);
      }

      const activeQr = manager.getQr();
      if (activeQr) {
        rec = await markPairingQrReceived({ ...rec, requestedAt: Date.now() }, activeQr);
      } else if (!manager.isReady()) {
        // Socket sedang inisialisasi / handshake
        rec = await setPairingState({ ...rec, state: "waiting_for_qr", requestedAt: Date.now(), updatedAt: Date.now() });
      }
    }

    const currentQr = qrForState(rec) ?? manager.getQr();

    return NextResponse.json({
      state: rec.state,
      qr: currentQr,
      code: pairingCodeForState(rec),
      requestedAt: rec.requestedAt ?? null,
    });
  } catch (err) {
    logger.error("wa: route pairing error", err);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
