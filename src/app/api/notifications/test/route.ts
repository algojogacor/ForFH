import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendPushToUser } from "@/lib/notifications/web-push";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendPushToUser(user.id, {
    title: "🔔 ForFH Notifikasi Berfungsi!",
    body: "Pengingat jadwal kuliah dan deadline tugas Anda telah aktif di perangkat ini.",
    data: { url: "/" },
  });

  return NextResponse.json({
    success: true,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
  });
}
