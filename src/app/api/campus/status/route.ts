import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campusAccounts } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { maskEmail } from "@/lib/crypto/at-rest";

// Status koneksi kampus untuk halaman Pengaturan (tanpa rahasia apa pun).
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const acc = await db.query.campusAccounts.findFirst({
    where: eq(campusAccounts.userId, session.id),
  });

  if (!acc) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    campusEmail: maskEmail(acc.campusEmail),
    nim: acc.campusNim,
    hebatConnected: Boolean(acc.hebatUserid && acc.hebatAuthtokenEnc),
    lastSyncAt: acc.lastSyncAt,
    lastSyncStatus: acc.lastSyncStatus, // never | ok | error
    lastSyncSummary: acc.lastSyncSummary,
    lastSyncError: acc.lastSyncError,
  });
}
