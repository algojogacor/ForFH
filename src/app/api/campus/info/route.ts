import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campusAccounts, campusData } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

// Data rekap & info kampus yang tersinkron (hanya baca). Semua jenis dikirim
// sekaligus; UI menyaring per jenis. Baris data_json yang rusak dilewati —
// tidak pernah 500.
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const acc = await db.query.campusAccounts.findFirst({
    where: eq(campusAccounts.userId, session.id),
  });
  if (!acc) {
    // Gate connected: menyembunyikan sisa campus_data setelah disconnect
    return NextResponse.json({ connected: false, items: [] });
  }

  const rows = await db.select().from(campusData).where(eq(campusData.userId, session.id));
  const items = [];
  for (const r of rows) {
    try {
      items.push({ jenis: r.jenis, data: JSON.parse(r.dataJson), updatedAt: r.updatedAt });
    } catch {
      logger.warn(`campus/info: data_json rusak untuk ${r.jenis} (${session.id})`);
    }
  }

  return NextResponse.json({ connected: true, lastSyncAt: acc.lastSyncAt, items });
}
