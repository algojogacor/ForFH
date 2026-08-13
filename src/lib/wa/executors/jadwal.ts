// src/lib/wa/executors/jadwal.ts — executor !jadwal (C3/C4): scope hari ini /
// besok / minggu ini / per-hari, memakai formatter Task 4.
import { asc, eq } from "drizzle-orm";
import { db, classSchedules, courses } from "@/lib/db";
import { formatJadwal, wibWallClock, formatWibDayName } from "../format";
import type { JadwalItem } from "../format";

export type JadwalScope = "hari_ini" | "besok" | "minggu_ini" | "hari";

const DAY_NAMES: Record<string, number> = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 };
const DAY_ID: string[] = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function parseJadwalScope(args: string, now: Date): { scope: JadwalScope; dayOfWeek?: number; title: string; hint: string } {
  const arg = (args || "").trim().toLowerCase();
  const today = wibWallClock(now.getTime());
  const todayDOW = today.getDay();
  if (arg === "besok") {
    const dow = (todayDOW + 1) % 7;
    const target = new Date(today); target.setDate(today.getDate() + 1);
    return { scope: "besok", dayOfWeek: dow, title: `📅 *JADWAL BESOK — ${formatWibDayName(target.getTime())}*`, hint: "ketik !jadwal utk hari ini" };
  }
  if (arg === "minggu ini") {
    return { scope: "minggu_ini", title: "📅 *JADWAL MINGGU INI*", hint: "ketik !jadwal senin utk lihat per hari" };
  }
  if (arg in DAY_NAMES) {
    const dow = DAY_NAMES[arg];
    const target = new Date(today);
    let diff = dow - todayDOW;
    if (diff < 0) diff += 7;
    target.setDate(today.getDate() + diff);
    return { scope: "hari", dayOfWeek: dow, title: `📅 *JADWAL ${DAY_ID[dow].toUpperCase()} — ${formatWibDayName(target.getTime())}*`, hint: "ketik !jadwal utk hari ini" };
  }
  return { scope: "hari_ini", dayOfWeek: todayDOW, title: `📅 *JADWAL HARI INI — ${formatWibDayName(now.getTime())}*`, hint: "ketik !jadwal besok utk besok" };
}

export interface JadwalRow { startTime: string; endTime: string; courseName: string; room: string | null; dayOfWeek: number; }

export async function fetchJadwalData(userId: string): Promise<JadwalRow[]> {
  const rows = await db
    .select({
      startTime: classSchedules.startTime, endTime: classSchedules.endTime,
      courseName: courses.name, room: classSchedules.room, dayOfWeek: classSchedules.dayOfWeek,
    })
    .from(classSchedules)
    .innerJoin(courses, eq(classSchedules.courseId, courses.id))
    .where(eq(classSchedules.userId, userId))
    .orderBy(asc(classSchedules.dayOfWeek), asc(classSchedules.startTime));
  return rows as JadwalRow[];
}

export async function executeJadwal(userId: string, args: string, now: Date = new Date()): Promise<string> {
  const parsed = parseJadwalScope(args, now);
  const rows = await fetchJadwalData(userId);
  let items: JadwalItem[];
  if (parsed.scope === "minggu_ini") {
    items = rows
      .filter((r) => r.dayOfWeek >= 1 && r.dayOfWeek <= 6)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime, courseName: r.courseName, room: r.room }));
  } else {
    items = rows
      .filter((r) => r.dayOfWeek === parsed.dayOfWeek)
      .map((r) => ({ startTime: r.startTime, endTime: r.endTime, courseName: r.courseName, room: r.room }));
  }
  return formatJadwal(items, parsed.title, parsed.hint);
}
