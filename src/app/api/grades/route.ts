import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, grades, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { DEFAULT_GRADE_POINTS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  const allGrades = await db.query.grades.findMany({
    where: and(
      eq(grades.userId, user.id),
      courseId ? eq(grades.courseId, courseId) : undefined
    ),
    orderBy: [desc(grades.createdAt)],
    with: { course: true },
  });

  const userCourses = await db.query.courses.findMany({
    where: eq(courses.userId, user.id),
  });

  // Calculate course-level final grade and cumulative GPA (IPK)
  let totalWeightedGradePoints = 0;
  let totalCredits = 0;

  const courseGradeSummaries = userCourses.map((c) => {
    const components = allGrades.filter((g) => g.courseId === c.id);
    let weightedScoreSum = 0;
    let totalWeight = 0;

    for (const comp of components) {
      if (comp.score !== null && comp.weight !== null) {
        weightedScoreSum += (comp.score * comp.weight) / 100;
        totalWeight += comp.weight;
      }
    }

    const finalScore = totalWeight > 0 ? (weightedScoreSum / totalWeight) * 100 : null;
    let letterGrade = "A";
    let gradePoint = 4.0;

    if (finalScore !== null) {
      if (finalScore >= 85) {
        letterGrade = "A";
        gradePoint = 4.0;
      } else if (finalScore >= 80) {
        letterGrade = "A-";
        gradePoint = 3.75;
      } else if (finalScore >= 75) {
        letterGrade = "B+";
        gradePoint = 3.5;
      } else if (finalScore >= 70) {
        letterGrade = "B";
        gradePoint = 3.0;
      } else if (finalScore >= 65) {
        letterGrade = "B-";
        gradePoint = 2.75;
      } else if (finalScore >= 60) {
        letterGrade = "C+";
        gradePoint = 2.5;
      } else if (finalScore >= 55) {
        letterGrade = "C";
        gradePoint = 2.0;
      } else if (finalScore >= 40) {
        letterGrade = "D";
        gradePoint = 1.0;
      } else {
        letterGrade = "E";
        gradePoint = 0.0;
      }

      const credits = c.credits || 2;
      totalCredits += credits;
      totalWeightedGradePoints += gradePoint * credits;
    }

    return {
      courseId: c.id,
      courseName: c.name,
      courseCode: c.code,
      credits: c.credits || 2,
      components,
      totalWeight,
      finalScore: finalScore !== null ? Math.round(finalScore * 10) / 10 : null,
      letterGrade: finalScore !== null ? letterGrade : "-",
      gradePoint: finalScore !== null ? gradePoint : null,
    };
  });

  const currentGPA =
    totalCredits > 0
      ? Math.round((totalWeightedGradePoints / totalCredits) * 100) / 100
      : 4.0;

  return NextResponse.json({
    grades: allGrades,
    courseSummaries: courseGradeSummaries,
    gpa: currentGPA,
    totalCredits,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { courseId, componentName, weight, score, letterGrade, gradePoint } = body;

  if (!courseId || !componentName) {
    return NextResponse.json(
      { error: "Mata kuliah dan nama komponen nilai wajib diisi." },
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

  const gradeId = crypto.randomUUID();
  const now = new Date();

  await db.insert(grades).values({
    id: gradeId,
    userId: user.id,
    courseId,
    componentName: componentName.trim(),
    weight: typeof weight === "number" ? weight : null,
    score: typeof score === "number" ? score : null,
    letterGrade: letterGrade?.trim() || null,
    gradePoint: typeof gradePoint === "number" ? gradePoint : null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ success: true, gradeId });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID komponen nilai wajib diisi." }, { status: 400 });
  }

  await db.delete(grades).where(and(eq(grades.id, id), eq(grades.userId, user.id)));

  return NextResponse.json({ success: true });
}
