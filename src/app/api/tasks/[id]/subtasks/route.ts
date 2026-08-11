import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, tasks, subtasks } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: taskId } = await params;
  const body = await req.json();
  const { title, estimatedMinutes, dueAt } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Judul subtask wajib diisi." }, { status: 400 });
  }

  // Verify task ownership
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
  });

  if (!task) {
    return NextResponse.json({ error: "Tugas tidak ditemukan." }, { status: 404 });
  }

  const existingSubtasks = await db.query.subtasks.findMany({
    where: and(eq(subtasks.taskId, taskId), isNull(subtasks.deletedAt)),
  });

  const subtaskId = crypto.randomUUID();
  const now = new Date();

  await db.insert(subtasks).values({
    id: subtaskId,
    userId: user.id,
    taskId,
    title: title.trim(),
    completed: 0,
    orderIndex: existingSubtasks.length + 1,
    estimatedMinutes: estimatedMinutes || null,
    dueAt: dueAt ? new Date(dueAt) : null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ success: true, subtaskId });
}
