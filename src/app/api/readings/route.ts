import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, readings, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const statusFilter = searchParams.get("status");

  const allReadings = await db.query.readings.findMany({
    where: and(
      eq(readings.userId, user.id),
      courseId ? eq(readings.courseId, courseId) : undefined,
      statusFilter ? eq(readings.status, statusFilter) : undefined
    ),
    orderBy: [desc(readings.createdAt)],
    with: { course: true },
  });

  return NextResponse.json({ readings: allReadings });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    author,
    type,
    courseId,
    startPage,
    endPage,
    currentPage,
    sourceUrl,
    deadline,
    notes,
  } = body;

  if (!title) {
    return NextResponse.json({ error: "Judul bahan bacaan wajib diisi." }, { status: 400 });
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

  const readingId = crypto.randomUUID();
  const now = new Date();

  await db.insert(readings).values({
    id: readingId,
    userId: user.id,
    courseId: courseId || null,
    title: title.trim(),
    author: author?.trim() || null,
    type: type || "book",
    startPage: typeof startPage === "number" ? startPage : null,
    endPage: typeof endPage === "number" ? endPage : null,
    currentPage: typeof currentPage === "number" ? currentPage : 0,
    sourceUrl: sourceUrl?.trim() || null,
    status: "NOT_STARTED",
    deadline: deadline ? new Date(deadline) : null,
    notes: notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ success: true, readingId });
}
