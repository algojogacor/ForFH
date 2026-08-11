import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, exams } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: examId } = await params;
  const body = await req.json();

  const existing = await db.query.exams.findFirst({
    where: and(eq(exams.id, examId), eq(exams.userId, user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Ujian tidak ditemukan." }, { status: 404 });
  }

  await db
    .update(exams)
    .set({
      name: body.name !== undefined ? body.name.trim() : existing.name,
      type: body.type !== undefined ? body.type : existing.type,
      examAt: body.examAt !== undefined ? new Date(body.examAt) : existing.examAt,
      location: body.location !== undefined ? body.location?.trim() || null : existing.location,
      notes: body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(exams.id, examId), eq(exams.userId, user.id)));

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

  const { id: examId } = await params;

  await db
    .delete(exams)
    .where(and(eq(exams.id, examId), eq(exams.userId, user.id)));

  return NextResponse.json({ success: true });
}
