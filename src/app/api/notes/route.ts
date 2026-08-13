import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db, notes, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { memGet, memSet, memDel } from "@/lib/cache/mem-cache";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const includeContent = searchParams.get("includeContent") === "true";

  // Hanya list ringan (tanpa content) yang di-cache; pemanggil yang butuh
  // konten penuh memakai ?includeContent=true dan selalu hit DB.
  if (!includeContent) {
    const cached = memGet<{ notes: unknown[] }>(`notes-list:${user.id}`);
    if (cached) return NextResponse.json(cached);
  }

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

  const listNotes = includeContent
    ? allNotes
    : allNotes.map((n) => ({ ...n, content: undefined }));
  const payload = { notes: listNotes };
  if (!includeContent) memSet(`notes-list:${user.id}`, payload, 30_000);
  return NextResponse.json(payload);
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

  memDel(`notes-list:${user.id}`);
  return NextResponse.json({ success: true, noteId });
}
