import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { cleanupOldUsage, processDueReminders } from "@/lib/notifications/worker";
import { syncDueUsers } from "@/lib/campus/sync";
import { getWaClientManager, waKeepAlive } from "@/lib/wa/client-manager";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  // In production, QStash signature verification is MANDATORY and FAILS CLOSED
  if (isProduction) {
    if (!currentKey || !nextKey) {
      logger.error("QStash webhook invoked in production without configured signing keys.");
      return NextResponse.json(
        { error: "QStash signature verification failed: signing keys missing." },
        { status: 401 }
      );
    }

    const signature = req.headers.get("upstash-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing Upstash-Signature header." }, { status: 401 });
    }

    const receiver = new Receiver({
      currentSigningKey: currentKey,
      nextSigningKey: nextKey,
    });

    const bodyText = await req.text();
    try {
      await receiver.verify({
        signature,
        body: bodyText,
      });
    } catch (err: any) {
      logger.warn("QStash signature verification failed:", err?.message || "Invalid signature");
      return NextResponse.json({ error: "Invalid Upstash signature." }, { status: 401 });
    }
  } else if (currentKey && nextKey) {
    // In development mode, verify if keys are present
    const signature = req.headers.get("upstash-signature");
    if (signature) {
      const receiver = new Receiver({
        currentSigningKey: currentKey,
        nextSigningKey: nextKey,
      });
      const bodyText = await req.text();
      try {
        await receiver.verify({
          signature,
          body: bodyText,
        });
      } catch (err: any) {
        logger.warn("Development QStash signature verification rejected:", err?.message);
        return NextResponse.json({ error: "Invalid Upstash signature in dev." }, { status: 401 });
      }
    }
  }

  const result = await processDueReminders();

  // Keepalive bot WA: health/recovery trigger (A5) — jangan recreate tiap tick
  let waKeepalive = "skipped";
  try {
    waKeepalive = await waKeepAlive(getWaClientManager());
  } catch (err: any) {
    logger.warn("wa keepalive error:", err?.message || err);
    waKeepalive = "error";
  }

  // Tick sinkronisasi kampus: jalankan di cron yang sama (tanpa jadwal QStash baru)
  const syncResult = await syncDueUsers();

  // Pemeliharaan: buang log pemakaian AI > 90 hari (guard harian di dalam)
  await cleanupOldUsage();

  return NextResponse.json({
    success: true,
    processedUsers: result.processedUsers,
    notificationsSent: result.notificationsSent,
    campusSync: syncResult,
    waKeepalive,
    timestamp: new Date().toISOString(),
  });
}
