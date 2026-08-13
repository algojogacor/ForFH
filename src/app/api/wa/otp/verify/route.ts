// src/app/api/wa/otp/verify/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/wa/normalize";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { phone?: string; otp?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body tidak valid" }, { status: 400 }); }

  const phone = normalizePhone(body.phone ?? "");
  const otp = String(body.otp ?? "").trim();
  if (!phone || !otp) return NextResponse.json({ error: "Nomor dan kode diperlukan." }, { status: 400 });

  const binding = await db.query.waBindings.findFirst({
    where: and(eq(waBindings.userId, user.id), eq(waBindings.phone, phone)),
  });
  if (!binding) return NextResponse.json({ error: "Mulai lagi dari Pengaturan (minta kode baru)." }, { status: 404 });
  if (binding.status === "active") return NextResponse.json({ error: "Sudah terhubung." }, { status: 409 });
  if (binding.status === "unlinked") return NextResponse.json({ error: "Sesi kedaluwarsa. Minta kode baru." }, { status: 409 });
  if (!binding.otpCode || !binding.otpExpiresAt) return NextResponse.json({ error: "Belum ada kode. Minta kode baru dulu." }, { status: 409 });
  if (Date.now() > binding.otpExpiresAt) return NextResponse.json({ error: "Kode kedaluwarsa. Minta kode baru." }, { status: 410 });
  if (binding.otpAttempts >= 3) return NextResponse.json({ error: "Terlalu banyak percobaan. Minta kode baru." }, { status: 429 });

  const matches = crypto.createHash("sha256").update(otp).digest("hex") === binding.otpCode;
  if (!matches) {
    await db.update(waBindings)
      .set({ otpAttempts: binding.otpAttempts + 1, updatedAt: new Date().toISOString() })
      .where(eq(waBindings.id, binding.id));
    return NextResponse.json({ error: `Kode salah. Sisa ${Math.max(0, 2 - binding.otpAttempts)} percobaan.` }, { status: 400 });
  }

  await db.update(waBindings)
    .set({ status: "active", otpCode: null, otpExpiresAt: null, otpAttempts: 0, updatedAt: new Date().toISOString() })
    .where(eq(waBindings.id, binding.id));
  return NextResponse.json({ success: true, message: "WhatsApp terhubung! Notifikasi akan dikirim ke chat ini." });
}
