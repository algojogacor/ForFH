import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, legalBookmarks, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  const bookmarks = await db.query.legalBookmarks.findMany({
    where: and(
      eq(legalBookmarks.userId, user.id),
      courseId ? eq(legalBookmarks.courseId, courseId) : undefined
    ),
    orderBy: [desc(legalBookmarks.createdAt)],
    with: {
      course: true,
    },
  });

  return NextResponse.json({ bookmarks });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { frbrUri, title, type, number, year, userNote, courseId } = body;

  if (!frbrUri || !title) {
    return NextResponse.json({ error: "FRBR URI dan judul peraturan wajib diisi." }, { status: 400 });
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

  const bookmarkId = crypto.randomUUID();
  const now = new Date();

  await db.insert(legalBookmarks).values({
    id: bookmarkId,
    userId: user.id,
    courseId: courseId || null,
    frbrUri: frbrUri.trim(),
    title: title.trim(),
    type: type || null,
    number: number || null,
    year: year || null,
    userNote: userNote?.trim() || null,
    createdAt: now,
  });

  return NextResponse.json({ success: true, bookmarkId });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID bookmark wajib diisi." }, { status: 400 });
  }

  await db
    .delete(legalBookmarks)
    .where(and(eq(legalBookmarks.id, id), eq(legalBookmarks.userId, user.id)));

  return NextResponse.json({ success: true });
}
