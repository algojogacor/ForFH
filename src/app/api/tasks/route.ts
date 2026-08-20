import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db, tasks, subtasks, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { memGet, memSet, memDel } from "@/lib/cache/mem-cache";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cached = memGet<{ tasks: unknown[] }>(`tasks:${user.id}`);
  if (cached) return NextResponse.json(cached);

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const statusFilter = searchParams.get("status");
  const priorityFilter = searchParams.get("priority");

  const allTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, user.id),
      isNull(tasks.deletedAt),
      courseId ? eq(tasks.courseId, courseId) : undefined,
      statusFilter ? eq(tasks.status, statusFilter) : undefined,
      priorityFilter ? eq(tasks.priority, priorityFilter) : undefined
    ),
    orderBy: [desc(tasks.priority), desc(tasks.createdAt)],
    with: {
      course: true,
      subtasks: {
        where: isNull(subtasks.deletedAt),
        orderBy: [subtasks.orderIndex],
      },
    },
  });

  // Calculate dynamic OVERDUE flag for client
  const now = Date.now();
  const processedTasks = allTasks.map((t) => {
    const isOverdue = t.status !== "DONE" && t.dueAt && t.dueAt.getTime() < now;
    return {
      ...t,
      computedStatus: isOverdue ? "OVERDUE" : t.status,
    };
  });

  const payload = { tasks: processedTasks };
  memSet(`tasks:${user.id}`, payload, 30_000);
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    description,
    courseId,
    type,
    dueAt,
    internalTargetAt,
    priority,
    estimatedMinutes,
    status,
    source,
    initialSubtasks,
  } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Judul tugas wajib diisi." }, { status: 400 });
  }

  // Validate course ownership if courseId is provided
  if (courseId) {
    const validCourse = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.userId, user.id)),
    });
    if (!validCourse) {
      return NextResponse.json({ error: "Mata kuliah tidak valid atau bukan milik Anda." }, { status: 403 });
    }
  }

  const taskId = crypto.randomUUID();
  const now = new Date();

  await db.insert(tasks).values({
    id: taskId,
    userId: user.id,
    courseId: courseId || null,
    title: title.trim(),
    description: description?.trim() || null,
    type: type || "assignment",
    dueAt: dueAt ? new Date(dueAt) : null,
    internalTargetAt: internalTargetAt ? new Date(internalTargetAt) : null,
    priority: priority || "medium",
    estimatedMinutes: typeof estimatedMinutes === "number" ? estimatedMinutes : null,
    status: status || "NOT_STARTED",
    progress: 0,
    source: source || "manual",
    createdAt: now,
    updatedAt: now,
  });

  // If initial subtasks provided (e.g. from AI Quick Capture / Breakdown)
  if (Array.isArray(initialSubtasks) && initialSubtasks.length > 0) {
    let order = 1;
    const subtaskValues = [];
    for (const sub of initialSubtasks) {
      if (sub && sub.title) {
        subtaskValues.push({
          id: crypto.randomUUID(),
          userId: user.id,
          taskId,
          title: sub.title.trim(),
          completed: 0,
          orderIndex: order++,
          estimatedMinutes: sub.estimatedMinutes || null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (subtaskValues.length > 0) {
      await db.insert(subtasks).values(subtaskValues);
    }
  }

  memDel(`tasks:${user.id}`);
  return NextResponse.json({ success: true, taskId });
}
