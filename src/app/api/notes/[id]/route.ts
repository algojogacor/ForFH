import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db, notes, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { memDel } from "@/lib/cache/mem-cache";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: noteId } = await params;

  const note = await db.query.notes.findFirst({
    where: and(eq(notes.id, noteId), eq(notes.userId, user.id), isNull(notes.deletedAt)),
    with: { course: true },
  });

  if (!note) {
    return NextResponse.json({ error: "Catatan tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ note });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: noteId } = await params;
  const body = await req.json();

  const existing = await db.query.notes.findFirst({
    where: and(eq(notes.id, noteId), eq(notes.userId, user.id), isNull(notes.deletedAt)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Catatan tidak ditemukan." }, { status: 404 });
  }

  // Validate course ownership if courseId is provided
  if (body.courseId) {
    const validCourse = await db.query.courses.findFirst({
      where: and(eq(courses.id, body.courseId), eq(courses.userId, user.id)),
    });
    if (!validCourse) {
      return NextResponse.json({ error: "Mata kuliah tidak valid atau bukan milik Anda." }, { status: 403 });
    }
  }

  await db
    .update(notes)
    .set({
      title: body.title !== undefined ? body.title.trim() : existing.title,
      content: body.content !== undefined ? body.content : existing.content,
      courseId: body.courseId !== undefined ? body.courseId || null : existing.courseId,
      pinned: body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned,
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)));

  memDel(`notes-list:${user.id}`);
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

  const { id: noteId } = await params;

  await db
    .update(notes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.userId, user.id)));

  memDel(`notes-list:${user.id}`);
  return NextResponse.json({ success: true });
}
