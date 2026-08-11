import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db, tasks, subtasks, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: taskId } = await params;

  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
    with: {
      course: true,
      subtasks: {
        where: isNull(subtasks.deletedAt),
        orderBy: [subtasks.orderIndex],
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Tugas tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: taskId } = await params;
  const body = await req.json();

  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Tugas tidak ditemukan." }, { status: 404 });
  }

  // If reassigning to a course, verify that course belongs to user
  if (body.courseId) {
    const validCourse = await db.query.courses.findFirst({
      where: and(eq(courses.id, body.courseId), eq(courses.userId, user.id)),
    });
    if (!validCourse) {
      return NextResponse.json({ error: "Mata kuliah tidak valid atau bukan milik Anda." }, { status: 403 });
    }
  }

  const newStatus = body.status !== undefined ? body.status : existing.status;
  const completedAt =
    newStatus === "DONE" && existing.status !== "DONE"
      ? new Date()
      : newStatus !== "DONE"
      ? null
      : existing.completedAt;

  await db
    .update(tasks)
    .set({
      title: body.title !== undefined ? body.title.trim() : existing.title,
      description: body.description !== undefined ? body.description?.trim() || null : existing.description,
      courseId: body.courseId !== undefined ? body.courseId || null : existing.courseId,
      type: body.type !== undefined ? body.type : existing.type,
      dueAt: body.dueAt !== undefined ? (body.dueAt ? new Date(body.dueAt) : null) : existing.dueAt,
      internalTargetAt:
        body.internalTargetAt !== undefined
          ? body.internalTargetAt
            ? new Date(body.internalTargetAt)
            : null
          : existing.internalTargetAt,
      priority: body.priority !== undefined ? body.priority : existing.priority,
      estimatedMinutes:
        body.estimatedMinutes !== undefined ? body.estimatedMinutes : existing.estimatedMinutes,
      status: newStatus,
      progress: body.progress !== undefined ? body.progress : (newStatus === "DONE" ? 100 : existing.progress),
      completedAt,
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));

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

  const { id: taskId } = await params;

  // Soft delete for reliable offline sync
  await db
    .update(tasks)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));

  return NextResponse.json({ success: true });
}
