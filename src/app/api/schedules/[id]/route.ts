import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, classSchedules } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: scheduleId } = await params;
  const body = await req.json();

  const existing = await db.query.classSchedules.findFirst({
    where: and(eq(classSchedules.id, scheduleId), eq(classSchedules.userId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Jadwal tidak ditemukan." }, { status: 404 });
  }

  await db
    .update(classSchedules)
    .set({
      dayOfWeek: body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : existing.dayOfWeek,
      startTime: body.startTime !== undefined ? body.startTime.trim() : existing.startTime,
      endTime: body.endTime !== undefined ? body.endTime.trim() : existing.endTime,
      room: body.room !== undefined ? body.room?.trim() || null : existing.room,
      onlineUrl: body.onlineUrl !== undefined ? body.onlineUrl?.trim() || null : existing.onlineUrl,
      enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
      updatedAt: new Date(),
    })
    .where(and(eq(classSchedules.id, scheduleId), eq(classSchedules.userId, user.id)));

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: scheduleId } = await params;

  await db
    .delete(classSchedules)
    .where(and(eq(classSchedules.id, scheduleId), eq(classSchedules.userId, user.id)));

  return NextResponse.json({ success: true });
}
