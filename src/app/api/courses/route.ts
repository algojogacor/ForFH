import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, courses, academicTerms } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get("termId");
  const showArchived = searchParams.get("archived") === "true";

  const allCourses = await db.query.courses.findMany({
    where: and(
      eq(courses.userId, user.id),
      termId ? eq(courses.academicTermId, termId) : undefined,
      showArchived ? undefined : eq(courses.archived, 0)
    ),
    orderBy: [desc(courses.createdAt)],
    with: {
      schedules: true,
      academicTerm: true,
    },
  });

  return NextResponse.json({ courses: allCourses });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name,
    code,
    lecturer,
    credits,
    color,
    defaultRoom,
    onlineUrl,
    notes,
    academicTermId,
  } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Nama mata kuliah wajib diisi." }, { status: 400 });
  }

  // Validate academicTermId ownership if provided
  let finalTermId: string | null = null;
  if (academicTermId) {
    const validTerm = await db.query.academicTerms.findFirst({
      where: and(eq(academicTerms.id, academicTermId), eq(academicTerms.userId, user.id)),
    });
    if (!validTerm) {
      return NextResponse.json({ error: "Semester tidak valid atau bukan milik Anda." }, { status: 403 });
    }
    finalTermId = validTerm.id;
  } else {
    const activeTerm = await db.query.academicTerms.findFirst({
      where: and(eq(academicTerms.userId, user.id), eq(academicTerms.isActive, 1)),
    });
    finalTermId = activeTerm?.id || null;
  }

  const courseId = crypto.randomUUID();
  const now = new Date();

  await db.insert(courses).values({
    id: courseId,
    userId: user.id,
    academicTermId: finalTermId,
    name: name.trim(),
    code: code?.trim() || null,
    lecturer: lecturer?.trim() || null,
    credits: typeof credits === "number" ? credits : 2,
    color: color || "#3b82f6",
    defaultRoom: defaultRoom?.trim() || null,
    onlineUrl: onlineUrl?.trim() || null,
    notes: notes?.trim() || null,
    archived: 0,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ success: true, courseId });
}
