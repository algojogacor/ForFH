// src/app/api/wa/pairing/route.ts — A7: request kode + state tracking.
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
  markPairingCodeReceived, failPairing, pairingCodeForState, PAIRING_EXPIRY_MS,
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
      if (rec.state === "waiting_for_phone" || rec.state === "pairing_code_requested") {
        rec = await setPairingState({ ...rec, state: "pairing_success", updatedAt: Date.now() });
      }
      return NextResponse.json({ state: "pairing_success", linked: true });
    }

    // Safety net: kode kedaluwarsa (A7 — kasus kode dibuat tapi link 408/expired)
    if (rec.state === "waiting_for_phone" && rec.requestedAt && Date.now() - rec.requestedAt > PAIRING_EXPIRY_MS) {
      rec = await setPairingState({ ...rec, state: nextPairingState(rec.state, "expired"), updatedAt: Date.now() });
    }

    if (action === "request") {
      const botPhone = normalizePhone(serverEnv.WA_BOT_PHONE ?? "");
      if (!botPhone) return NextResponse.json({ error: "WA_BOT_PHONE belum dikonfigurasi." }, { status: 500 });
      // Re-pair setelah fatal (401/408): buka kunci fatal agar socket baru bisa
      // diinisialisasi (resetFatal = jalur pemulihan Task 7; ensureWaClient
      // TIDAK merecreate socket saat fatalReason ter-set).
      if (manager.fatalReason) await manager.resetFatal();
      await manager.ensureWaClient();
      try {
        const code = await manager.requestPairingCode(botPhone);
        rec = await setPairingState({ ...rec, state: nextPairingState(rec.state, "request"), code, requestedAt: Date.now(), updatedAt: Date.now() });
        // A7: emitor code_received → waiting_for_phone. Tanpa ini state macet
        // di pairing_code_requested dan kode tidak pernah dikembalikan.
        rec = await markPairingCodeReceived(rec);
      } catch (err) {
        logger.warn("wa: gagal membuat kode pairing", err);
        rec = await failPairing(rec);
        return NextResponse.json({ error: "Gagal membuat kode pairing. Coba lagi." }, { status: 502 });
      }
    }

    return NextResponse.json({
      state: rec.state,
      code: pairingCodeForState(rec),
      requestedAt: rec.requestedAt ?? null,
    });
  } catch (err) {
    logger.error("wa: route pairing error", err);
    return NextResponse.json({ error: "Terjadi kesalahan internal." }, { status: 500 });
  }
}
