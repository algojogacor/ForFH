import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, readings, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: readingId } = await params;
  const body = await req.json();

  const existing = await db.query.readings.findFirst({
    where: and(eq(readings.id, readingId), eq(readings.userId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Bahan bacaan tidak ditemukan." }, { status: 404 });
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

  const currentPage =
    body.currentPage !== undefined ? Number(body.currentPage) : existing.currentPage || 0;
  const endPage =
    body.endPage !== undefined ? Number(body.endPage) : existing.endPage;

  let computedStatus = body.status || existing.status;
  if (endPage && currentPage >= endPage) {
    computedStatus = "DONE";
  } else if (currentPage > (existing.startPage || 0)) {
    computedStatus = "READING";
  }

  await db
    .update(readings)
    .set({
      title: body.title !== undefined ? body.title.trim() : existing.title,
      author: body.author !== undefined ? body.author?.trim() || null : existing.author,
      type: body.type !== undefined ? body.type : existing.type,
      startPage: body.startPage !== undefined ? body.startPage : existing.startPage,
      endPage: body.endPage !== undefined ? body.endPage : existing.endPage,
      currentPage,
      status: computedStatus,
      deadline: body.deadline !== undefined ? (body.deadline ? new Date(body.deadline) : null) : existing.deadline,
      notes: body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(readings.id, readingId), eq(readings.userId, user.id)));

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

  const { id: readingId } = await params;

  await db
    .delete(readings)
    .where(and(eq(readings.id, readingId), eq(readings.userId, user.id)));

  return NextResponse.json({ success: true });
}
