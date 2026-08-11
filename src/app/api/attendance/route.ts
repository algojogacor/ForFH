import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, attendance, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  const records = await db.query.attendance.findMany({
    where: and(
      eq(attendance.userId, user.id),
      courseId ? eq(attendance.courseId, courseId) : undefined
    ),
    orderBy: [desc(attendance.classDate)],
    with: { course: true },
  });

  // Calculate statistics per course
  const userCourses = await db.query.courses.findMany({
    where: eq(courses.userId, user.id),
  });

  const courseStats = userCourses.map((c) => {
    const courseRecords = records.filter((r) => r.courseId === c.id);
    const present = courseRecords.filter((r) => r.status === "PRESENT").length;
    const permit = courseRecords.filter((r) => r.status === "PERMIT").length;
    const sick = courseRecords.filter((r) => r.status === "SICK").length;
    const absent = courseRecords.filter((r) => r.status === "ABSENT").length;
    const total = courseRecords.length;
    const attendancePercentage = total > 0 ? Math.round(((present + permit) / total) * 100) : 100;

    return {
      courseId: c.id,
      courseName: c.name,
      courseCode: c.code,
      total,
      present,
      permit,
      sick,
      absent,
      attendancePercentage,
      isBelowThreshold: total >= 4 && attendancePercentage < 75,
    };
  });

  return NextResponse.json({ records, courseStats });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { courseId, classDate, status, notes } = body;

  if (!courseId || !classDate || !status) {
    return NextResponse.json(
      { error: "Mata kuliah, tanggal pertemuan, dan status kehadiran wajib diisi." },
      { status: 400 }
    );
  }

  // Validate course ownership
  const validCourse = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.userId, user.id)),
  });
  if (!validCourse) {
    return NextResponse.json({ error: "Mata kuliah tidak valid atau bukan milik Anda." }, { status: 403 });
  }

  // Check if attendance for this course on this date already exists
  const existing = await db.query.attendance.findFirst({
    where: and(
      eq(attendance.userId, user.id),
      eq(attendance.courseId, courseId),
      eq(attendance.classDate, classDate)
    ),
  });

  if (existing) {
    await db
      .update(attendance)
      .set({
        status,
        notes: notes?.trim() || null,
      })
      .where(and(eq(attendance.id, existing.id), eq(attendance.userId, user.id)));

    return NextResponse.json({ success: true, id: existing.id, updated: true });
  }

  const newId = crypto.randomUUID();
  await db.insert(attendance).values({
    id: newId,
    userId: user.id,
    courseId,
    classDate,
    status,
    notes: notes?.trim() || null,
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true, id: newId, created: true });
}
