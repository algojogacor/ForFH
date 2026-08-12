import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campusAccounts } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { connectHebat, fetchCourseInstructions } from "@/lib/campus/hebat";
import { saveHebatToken, upsertCampusData } from "@/lib/campus/sync";
import { logger } from "@/lib/logger";

// Hubungkan ulang HE-BAT dengan password terpisah (kalau beda dari password
// Kampus Kita). Dipakai sekali saat connect — authtoken hasilnya disimpan
// terenkripsi; password tidak pernah disimpan.
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const acc = await db.query.campusAccounts.findFirst({
    where: eq(campusAccounts.userId, session.id),
  });
  if (!acc) {
    return NextResponse.json({ error: "Akun kampus belum terhubung." }, { status: 400 });
  }

  const body = await req.json();
  const password = String(body.password || "");

  const ip = req.headers.get("x-forwarded-for") || "anonymous-client";
  const rateLimit = await checkRateLimit(`hebat-connect:${session.id}:${ip}`, {
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000,
    blockDurationMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.error }, { status: 429 });
  }

  try {
    const h = await connectHebat(acc.campusNim, password);
    await saveHebatToken(session.id, h.userid, h.authtoken);

    // Crawl instruksi tugas (section summary) pakai sesi aktif — gagal TIDAK
    // menggagalkan connect (authtoken tetap tersimpan). upsert tetap dijalankan
    // walau kosong ([]) agar UI tahu instruksi sudah pernah di-crawl.
    let instruksiCount = 0;
    if (h.sessionCookie) {
      try {
        const inst = await fetchCourseInstructions(h.sessionCookie);
        await upsertCampusData(session.id, "instruksi_tugas", inst);
        instruksiCount = inst.length;
      } catch (error: any) {
        logger.warn(`HE-BAT crawl instruksi gagal (user ${session.id}): ${error?.message || error}`);
      }
    }
    return NextResponse.json({ success: true, userid: h.userid, instruksi: instruksiCount });
  } catch (error: any) {
    logger.warn(`HE-BAT reconnect gagal (user ${session.id}): ${error?.message || error}`);
    const status = error?.status === 401 ? 401 : 400;
    return NextResponse.json(
      { error: error?.message || "Gagal menghubungkan HE-BAT." },
      { status }
    );
  }
}
