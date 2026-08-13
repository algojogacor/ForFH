// src/lib/wa/executors/nilai.ts — !nilai: ringkasan per MK (baca data user
// sendiri, B5).
import { asc, eq } from "drizzle-orm";
import { db, grades, courses } from "@/lib/db";
import { formatNilai } from "../format";
import type { NilaiItem } from "../format";

export interface NilaiRow { courseName: string; letterGrade: string | null; }

export async function fetchNilaiData(userId: string): Promise<NilaiItem[]> {
  const rows = await db
    .select({ courseName: courses.name, letterGrade: grades.letterGrade })
    .from(grades)
    .innerJoin(courses, eq(grades.courseId, courses.id))
    .where(eq(grades.userId, userId))
    .orderBy(asc(courses.name));
  const byCourse = new Map<string, NilaiItem>();
  for (const r of rows) {
    const cur = byCourse.get(r.courseName) ?? { courseName: r.courseName, komponen: 0, letterGrade: null };
    cur.komponen += 1;
    if (r.letterGrade) cur.letterGrade = r.letterGrade;
    byCourse.set(r.courseName, cur);
  }
  return [...byCourse.values()];
}

export async function executeNilai(userId: string): Promise<string> {
  return formatNilai(await fetchNilaiData(userId));
}
