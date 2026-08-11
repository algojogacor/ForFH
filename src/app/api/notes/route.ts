import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db, notes, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  const allNotes = await db.query.notes.findMany({
    where: and(
      eq(notes.userId, user.id),
      isNull(notes.deletedAt),
      courseId ? eq(notes.courseId, courseId) : undefined
    ),
    orderBy: [desc(notes.pinned), desc(notes.updatedAt)],
    with: {
      course: true,
    },
  });

  return NextResponse.json({ notes: allNotes });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, content, courseId, pinned } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Judul catatan wajib diisi." }, { status: 400 });
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

  const noteId = crypto.randomUUID();
  const now = new Date();

  await db.insert(notes).values({
    id: noteId,
    userId: user.id,
    courseId: courseId || null,
    title: title.trim(),
    content: content || "",
    format: "markdown",
    pinned: pinned ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ success: true, noteId });
}
