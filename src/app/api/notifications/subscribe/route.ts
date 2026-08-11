import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, pushSubscriptions } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { subscription } = body;

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return NextResponse.json(
      { error: "Payload push subscription tidak valid." },
      { status: 400 }
    );
  }

  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;

  const existing = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.endpoint, endpoint),
  });

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        userId: user.id,
        p256dh,
        auth,
        lastUsedAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, existing.id));

    return NextResponse.json({ success: true, updated: true });
  }

  await db.insert(pushSubscriptions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  });

  return NextResponse.json({ success: true, created: true });
}
