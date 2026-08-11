import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, examTopics, exams } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: examId } = await params;
  const body = await req.json();
  const { title } = body;

  if (!title) {
    return NextResponse.json({ error: "Judul materi ujian wajib diisi." }, { status: 400 });
  }

  // Verify exam ownership
  const exam = await db.query.exams.findFirst({
    where: and(eq(exams.id, examId), eq(exams.userId, user.id)),
  });

  if (!exam) {
    return NextResponse.json({ error: "Ujian tidak ditemukan." }, { status: 404 });
  }

  const existing = await db.query.examTopics.findMany({
    where: eq(examTopics.examId, examId),
  });

  const topicId = crypto.randomUUID();
  await db.insert(examTopics).values({
    id: topicId,
    userId: user.id,
    examId,
    title: title.trim(),
    completed: 0,
    orderIndex: existing.length + 1,
  });

  return NextResponse.json({ success: true, topicId });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { topicId, completed } = body;

  if (!topicId) {
    return NextResponse.json({ error: "ID topik wajib diisi." }, { status: 400 });
  }

  await db
    .update(examTopics)
    .set({
      completed: completed ? 1 : 0,
    })
    .where(and(eq(examTopics.id, topicId), eq(examTopics.userId, user.id)));

  return NextResponse.json({ success: true });
}
