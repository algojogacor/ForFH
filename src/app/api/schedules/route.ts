import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, asc } from "drizzle-orm";
import { db, classSchedules, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await db
    .select({
      id: classSchedules.id,
      courseId: classSchedules.courseId,
      courseName: courses.name,
      courseCode: courses.code,
      courseColor: courses.color,
      lecturer: courses.lecturer,
      credits: courses.credits,
      dayOfWeek: classSchedules.dayOfWeek,
      startTime: classSchedules.startTime,
      endTime: classSchedules.endTime,
      room: classSchedules.room,
      onlineUrl: classSchedules.onlineUrl,
      enabled: classSchedules.enabled,
    })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(eq(classSchedules.userId, user.id))
    .orderBy(asc(classSchedules.dayOfWeek), asc(classSchedules.startTime));

  return NextResponse.json({ schedules });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { courseId, dayOfWeek, startTime, endTime, room, onlineUrl } = body;

  if (!courseId || dayOfWeek === undefined || !startTime || !endTime) {
    return NextResponse.json(
      { error: "Mata kuliah, hari, jam mulai, dan jam selesai wajib diisi." },
      { status: 400 }
    );
  }

  // Verify course ownership
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.userId, user.id)),
  });

  if (!course) {
    return NextResponse.json({ error: "Mata kuliah tidak valid." }, { status: 404 });
  }

  const scheduleId = crypto.randomUUID();
  const now = new Date();

  await db.insert(classSchedules).values({
    id: scheduleId,
    userId: user.id,
    courseId,
    dayOfWeek: Number(dayOfWeek),
    startTime: startTime.trim(),
    endTime: endTime.trim(),
    room: room?.trim() || null,
    onlineUrl: onlineUrl?.trim() || null,
    enabled: 1,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ success: true, scheduleId });
}
