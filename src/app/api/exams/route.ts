import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, asc } from "drizzle-orm";
import { db, exams, examTopics, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  const allExams = await db.query.exams.findMany({
    where: and(
      eq(exams.userId, user.id),
      courseId ? eq(exams.courseId, courseId) : undefined
    ),
    orderBy: [asc(exams.examAt)],
    with: {
      course: true,
      topics: {
        orderBy: [examTopics.orderIndex],
      },
    },
  });

  return NextResponse.json({ exams: allExams });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, courseId, type, examAt, location, notes, initialTopics } = body;

  if (!name || !courseId || !examAt) {
    return NextResponse.json(
      { error: "Nama ujian, mata kuliah, dan tanggal ujian wajib diisi." },
      { status: 400 }
    );
  }

  // Validate course ownership
  const validCourse = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.userId, user.id)),
  });
  if (!validCourse) {
    return NextResponse.json({ error: "Mata kuliah tidak valid atau bukan milik Anda." }, { status: 403 });
  }

  const examId = crypto.randomUUID();
  const now = new Date();

  await db.insert(exams).values({
    id: examId,
    userId: user.id,
    courseId,
    name: name.trim(),
    type: type || "UTS",
    examAt: new Date(examAt),
    location: location?.trim() || null,
    notes: notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  if (Array.isArray(initialTopics)) {
    let order = 1;
    for (const title of initialTopics) {
      if (title && typeof title === "string") {
        await db.insert(examTopics).values({
          id: crypto.randomUUID(),
          userId: user.id,
          examId,
          title: title.trim(),
          completed: 0,
          orderIndex: order++,
        });
      }
    }
  }

  return NextResponse.json({ success: true, examId });
}
