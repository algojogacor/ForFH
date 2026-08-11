import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  db,
  courses,
  classSchedules,
  tasks,
  notes,
  readings,
  exams,
  attendance,
  grades,
  files,
  legalBookmarks,
} from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  // Strict user isolation check
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.userId, user.id)),
    with: {
      academicTerm: true,
      schedules: true,
    },
  });

  if (!course) {
    return NextResponse.json({ error: "Mata kuliah tidak ditemukan." }, { status: 404 });
  }

  // Fetch all related entities for Course Hub
  const [
    courseTasks,
    courseNotes,
    courseReadings,
    courseExams,
    courseAttendance,
    courseGrades,
    courseFiles,
    courseBookmarks,
  ] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        eq(tasks.courseId, courseId),
        eq(tasks.userId, user.id),
        isNull(tasks.deletedAt)
      ),
      orderBy: [desc(tasks.createdAt)],
      with: { subtasks: true },
    }),
    db.query.notes.findMany({
      where: and(
        eq(notes.courseId, courseId),
        eq(notes.userId, user.id),
        isNull(notes.deletedAt)
      ),
      orderBy: [desc(notes.pinned), desc(notes.updatedAt)],
    }),
    db.query.readings.findMany({
      where: and(eq(readings.courseId, courseId), eq(readings.userId, user.id)),
      orderBy: [desc(readings.createdAt)],
    }),
    db.query.exams.findMany({
      where: and(eq(exams.courseId, courseId), eq(exams.userId, user.id)),
      orderBy: [desc(exams.examAt)],
      with: { topics: true },
    }),
    db.query.attendance.findMany({
      where: and(eq(attendance.courseId, courseId), eq(attendance.userId, user.id)),
      orderBy: [desc(attendance.classDate)],
    }),
    db.query.grades.findMany({
      where: and(eq(grades.courseId, courseId), eq(grades.userId, user.id)),
      orderBy: [desc(grades.createdAt)],
    }),
    db.query.files.findMany({
      where: and(
        eq(files.courseId, courseId),
        eq(files.userId, user.id),
        isNull(files.deletedAt)
      ),
      orderBy: [desc(files.createdAt)],
    }),
    db.query.legalBookmarks.findMany({
      where: and(eq(legalBookmarks.courseId, courseId), eq(legalBookmarks.userId, user.id)),
      orderBy: [desc(legalBookmarks.createdAt)],
    }),
  ]);

  return NextResponse.json({
    course,
    tasks: courseTasks,
    notes: courseNotes,
    readings: courseReadings,
    exams: courseExams,
    attendance: courseAttendance,
    grades: courseGrades,
    files: courseFiles,
    legalBookmarks: courseBookmarks,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  const body = await req.json();

  // Verify ownership
  const existing = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.userId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Mata kuliah tidak ditemukan." }, { status: 404 });
  }

  await db
    .update(courses)
    .set({
      name: body.name !== undefined ? body.name.trim() : existing.name,
      code: body.code !== undefined ? body.code?.trim() || null : existing.code,
      lecturer: body.lecturer !== undefined ? body.lecturer?.trim() || null : existing.lecturer,
      credits: body.credits !== undefined ? body.credits : existing.credits,
      color: body.color !== undefined ? body.color : existing.color,
      defaultRoom: body.defaultRoom !== undefined ? body.defaultRoom?.trim() || null : existing.defaultRoom,
      onlineUrl: body.onlineUrl !== undefined ? body.onlineUrl?.trim() || null : existing.onlineUrl,
      notes: body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
      archived: body.archived !== undefined ? (body.archived ? 1 : 0) : existing.archived,
      updatedAt: new Date(),
    })
    .where(and(eq(courses.id, courseId), eq(courses.userId, user.id)));

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

  const { id: courseId } = await params;

  await db
    .delete(courses)
    .where(and(eq(courses.id, courseId), eq(courses.userId, user.id)));

  return NextResponse.json({ success: true });
}
