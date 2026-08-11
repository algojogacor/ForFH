import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db, subtasks, tasks } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: subtaskId } = await params;
  const body = await req.json();

  const existing = await db.query.subtasks.findFirst({
    where: and(eq(subtasks.id, subtaskId), eq(subtasks.userId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Subtask tidak ditemukan." }, { status: 404 });
  }

  const newCompleted = body.completed !== undefined ? (body.completed ? 1 : 0) : existing.completed;

  await db
    .update(subtasks)
    .set({
      title: body.title !== undefined ? body.title.trim() : existing.title,
      completed: newCompleted,
      orderIndex: body.orderIndex !== undefined ? body.orderIndex : existing.orderIndex,
      updatedAt: new Date(),
    })
    .where(and(eq(subtasks.id, subtaskId), eq(subtasks.userId, user.id)));

  // Auto-calculate parent task progress
  const allParentSubtasks = await db.query.subtasks.findMany({
    where: and(eq(subtasks.taskId, existing.taskId), isNull(subtasks.deletedAt)),
  });

  if (allParentSubtasks.length > 0) {
    const completedCount = allParentSubtasks.filter((s) =>
      s.id === subtaskId ? newCompleted === 1 : s.completed === 1
    ).length;

    const progressPercentage = Math.round((completedCount / allParentSubtasks.length) * 100);
    const newStatus =
      progressPercentage === 100
        ? "DONE"
        : progressPercentage > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED";

    await db
      .update(tasks)
      .set({
        progress: progressPercentage,
        status: newStatus,
        completedAt: newStatus === "DONE" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, existing.taskId), eq(tasks.userId, user.id)));
  }

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

  const { id: subtaskId } = await params;

  await db
    .update(subtasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subtasks.id, subtaskId), eq(subtasks.userId, user.id)));

  return NextResponse.json({ success: true });
}
