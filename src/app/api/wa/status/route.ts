// src/app/api/wa/status/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { getWaClientManager } from "@/lib/wa/client-manager";
import { computeHealth, getHealthIndicators } from "@/lib/wa/health";
import { maskPhone, normalizePhone } from "@/lib/wa/normalize";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const manager = getWaClientManager();
  const binding = await db.query.waBindings.findFirst({ where: eq(waBindings.userId, user.id) });
  const adminPhone = normalizePhone(serverEnv.WA_ADMIN_PHONE ?? "");
  const isOwner = !!adminPhone && !!binding && binding.phone === adminPhone && binding.status === "active";
  const indicators = getHealthIndicators();

  return NextResponse.json({
    socketState: manager.state,
    botConnected: manager.isReady(),
    botPhone: serverEnv.WA_BOT_PHONE ? maskPhone(serverEnv.WA_BOT_PHONE) : null,
    canPair: isOwner,
    health: { ...indicators, status: computeHealth(indicators) },
    myPhone: binding ? maskPhone(binding.phone) : null,
    myStatus: binding?.status ?? null,
  });
}
