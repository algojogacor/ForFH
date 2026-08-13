// src/lib/wa/executors/selesai.ts — !selesai <nomor>: toggle DONE ↔
// IN_PROGRESS (nomor urut dari daftar !tugas — format "1. ⏳ *title*…").
import { and, eq } from "drizzle-orm";
import { db, tasks } from "@/lib/db";
import { fetchTugasData } from "./tugas";

export async function executeSelesai(userId: string, args: string, now: Date = new Date()): Promise<string> {
  const idx = parseInt((args || "").trim(), 10);
  if (!Number.isInteger(idx) || idx < 1) return "Format: !selesai <nomor> — nomor dari daftar !tugas";
  const items = await fetchTugasData(userId, 10);
  const target = items[idx - 1];
  if (!target) return `Tidak ada tugas nomor ${idx}. Ketik !tugas utk daftar terbaru.`;
  const task = await db.query.tasks.findFirst({ where: and(eq(tasks.id, target.id), eq(tasks.userId, userId)) });
  if (!task) return "Tugas tidak ditemukan.";
  const wasDone = task.status === "DONE";
  await db
    .update(tasks)
    .set({ status: wasDone ? "IN_PROGRESS" : "DONE", completedAt: wasDone ? null : now, updatedAt: now })
    .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)));
  return wasDone
    ? `↩️ *${target.title}* dibuka kembali.`
    : `✅ *${target.title}* ditandai selesai.`;
}
