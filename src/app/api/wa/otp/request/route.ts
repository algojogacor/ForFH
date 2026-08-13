// src/app/api/wa/otp/request/route.ts — B3: web-first OTP. OTP baru
// membatalkan OTP sebelumnya (overwrite + reset attempts).
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { normalizePhone } from "@/lib/wa/normalize";
import { formatOtpMessage } from "@/lib/wa/format";
import { getWaSendService } from "@/lib/wa/send";

export const runtime = "nodejs";

const OTP_TTL_MS = 10 * 60_000;
const OTP_REQUEST_LIMIT = { maxAttempts: 5, windowMs: 10 * 60_000 };

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { phone?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body tidak valid" }, { status: 400 }); }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) return NextResponse.json({ error: "Format nomor tidak valid. Contoh: 081234567890" }, { status: 400 });

  // Guard: maks 5 request/10 menit per user DAN per nomor (B3)
  const rlUser = await checkRateLimit(`wa:otp:user:${user.id}`, OTP_REQUEST_LIMIT);
  if (!rlUser.allowed) return NextResponse.json({ error: rlUser.error }, { status: 429 });
  const rlPhone = await checkRateLimit(`wa:otp:phone:${phone}`, OTP_REQUEST_LIMIT);
  if (!rlPhone.allowed) return NextResponse.json({ error: rlPhone.error }, { status: 429 });

  if (!getWaSendService().isReady()) {
    return NextResponse.json({ error: "Bot WhatsApp belum online. Coba beberapa saat lagi." }, { status: 409 });
  }

  const own = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  if (own && own.status === "active") {
    return NextResponse.json({ error: "Akun sudah terhubung. Putuskan dulu (Pengaturan / !putuskan)." }, { status: 409 });
  }
  const byPhone = await db.query.waBindings.findFirst({ where: eq(waBindings.phone, phone) });
  if (byPhone && byPhone.userId !== user.id && byPhone.status === "active") {
    return NextResponse.json({ error: "Nomor ini sudah terhubung ke akun lain." }, { status: 409 });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpCode = crypto.createHash("sha256").update(otp).digest("hex");
  const otpExpiresAt = Date.now() + OTP_TTL_MS;
  const nowIso = new Date().toISOString();

  // Binding unlinked milik user lain → pindah kepemilikan; user punya baris
  // (pending/unlinked) → overwrite (invalidate previous OTP, reset attempts)
  if (byPhone && byPhone.userId !== user.id) {
    await db.delete(waBindings).where(eq(waBindings.id, byPhone.id));
  }
  const existing = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  if (existing) {
    await db.update(waBindings)
      .set({ phone, otpCode, otpExpiresAt, otpAttempts: 0, status: "pending", updatedAt: nowIso })
      .where(eq(waBindings.id, existing.id));
  } else {
    await db.insert(waBindings).values({ id: crypto.randomUUID(), userId: user.id, phone, otpCode, otpExpiresAt, otpAttempts: 0, status: "pending" });
  }

  // OTP dikirim ke raw phone (lid/jid kosong saat pending — B3)
  const res = await getWaSendService().sendStrict(`${phone}@s.whatsapp.net`, formatOtpMessage(otp));
  if (!res.sent) {
    return NextResponse.json({ error: "Kode dibuat tetapi gagal terkirim. Coba lagi." }, { status: 502 });
  }
  return NextResponse.json({ success: true, hint: "Kode OTP terkirim ke WhatsApp Anda. Berlaku 10 menit." });
}
