// src/lib/wa/executors/tugas.ts — executor !tugas [n]: n tugas terdekat yang
// belum selesai (default 5, clamp 1–10).
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { formatTugas } from "../format";
import type { TugasItem } from "../format";

export interface TugasItemData { id: string; title: string; dueAt: number | null; courseName: string | null; }

export async function fetchTugasData(userId: string, n: number): Promise<TugasItemData[]> {
  const rows = await db.query.tasks.findMany({
    where: and(eq(tasks.userId, userId), isNull(tasks.deletedAt), sql`${tasks.status} != 'DONE'`),
    orderBy: [asc(sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`), asc(tasks.dueAt)],
    with: { course: true },
    limit: n,
  });
  return rows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.getTime() ?? null, courseName: t.course?.name ?? null }));
}

export async function executeTugas(userId: string, args: string): Promise<string> {
  const n = Math.min(10, Math.max(1, parseInt(args.trim(), 10) || 5));
  const items = await fetchTugasData(userId, n);
  return formatTugas(items.map((t) => ({ title: t.title, dueAt: t.dueAt, done: false, courseName: t.courseName })));
}
