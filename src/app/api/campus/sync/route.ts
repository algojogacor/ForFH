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

  try {
    const summary = await runCampusSync(session.id, { force: true });
    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    const message = error?.message || "Sinkronisasi gagal.";
    await markSyncError(session.id, message);
    logger.error(`Campus sync error (user ${session.id}):`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
