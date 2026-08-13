import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campusAccounts } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

// Status sync real-time untuk UI (progress bar dashboard & Pengaturan).
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
    state: acc.syncState,          // idle | running
    step: acc.syncStep,            // mulai | jadwal | kursus | tugas | nilai | info | selesai
    startedAt: acc.syncStartedAt,
    lastSyncAt: acc.lastSyncAt,
    lastSyncStatus: acc.lastSyncStatus, // never | ok | error
    lastSyncError: acc.lastSyncError,
  });
}
