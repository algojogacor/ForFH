import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { runCampusSync, markSyncError } from "@/lib/campus/sync";
import { logger } from "@/lib/logger";

// Paksa sinkronisasi sekarang (tombol "Sync sekarang" di Pengaturan).
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid. Silakan login ulang." }, { status: 401 });
  }

  // Jalankan di background — POST kembali segera; progress dipantau via
  // /api/campus/sync-status. Lock di runCampusSync mencegah tabrakan.
  void runCampusSync(session.id, { force: true }).catch(async (error: any) => {
    const message = error?.message || "Sinkronisasi gagal.";
    await markSyncError(session.id, message);
    logger.error(`Campus sync error (user ${session.id}):`, error);
  });
  return NextResponse.json({ success: true, started: true });
}
