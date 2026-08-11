import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, userSettings, users } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, user.id),
  });

  return NextResponse.json({ settings, user });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    displayName,
    timezone,
    locale,
    theme,
    defaultTaskReminders,
    defaultClassReminders,
    primaryClassAlertMinutes,
    deadlineBufferMinutes,
    aiEnabled,
  } = body;

  if (displayName !== undefined) {
    await db
      .update(users)
      .set({ displayName: displayName.trim(), updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  const existingSettings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, user.id),
  });

  if (existingSettings) {
    await db
      .update(userSettings)
      .set({
        timezone: timezone !== undefined ? timezone : existingSettings.timezone,
        locale: locale !== undefined ? locale : existingSettings.locale,
        theme: theme !== undefined ? theme : existingSettings.theme,
        defaultTaskReminders:
          defaultTaskReminders !== undefined
            ? JSON.stringify(defaultTaskReminders)
            : existingSettings.defaultTaskReminders,
        defaultClassReminders:
          defaultClassReminders !== undefined
            ? JSON.stringify(defaultClassReminders)
            : existingSettings.defaultClassReminders,
        primaryClassAlertMinutes:
          primaryClassAlertMinutes !== undefined
            ? Number(primaryClassAlertMinutes)
            : existingSettings.primaryClassAlertMinutes,
        deadlineBufferMinutes:
          deadlineBufferMinutes !== undefined
            ? Number(deadlineBufferMinutes)
            : existingSettings.deadlineBufferMinutes,
        aiEnabled:
          aiEnabled !== undefined
            ? aiEnabled
              ? 1
              : 0
            : existingSettings.aiEnabled,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, user.id));
  }

  return NextResponse.json({ success: true });
}
