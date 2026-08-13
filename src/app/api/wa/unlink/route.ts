// src/app/api/wa/unlink/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const binding = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  if (!binding) return NextResponse.json({ error: "Tidak ada koneksi WhatsApp." }, { status: 404 });
  await db.update(waBindings)
    // lid/jid = transport identity (resolver): dibersihkan saat unlink agar
    // resolver tidak memetakan nomor yang sudah tidak terhubung (residue)
    .set({ status: "unlinked", lid: null, jid: null, otpCode: null, otpExpiresAt: null, otpAttempts: 0, updatedAt: new Date().toISOString() })
    .where(eq(waBindings.id, binding.id));
  return NextResponse.json({ success: true });
}
