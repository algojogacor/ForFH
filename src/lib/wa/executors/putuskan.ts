// src/lib/wa/executors/putuskan.ts — !putuskan dengan konfirmasi sekali (C3):
// "!putuskan" → minta konfirmasi (berlaku 2 menit), "!putuskan ya" → eksekusi.
import { and, eq } from "drizzle-orm";
import { db, waBindings } from "@/lib/db";

const pendingUnlink = new Map<string, number>(); // userId → timestamp

export async function executePutuskan(userId: string, args: string): Promise<string> {
  const confirm = (args || "").trim().toLowerCase() === "ya";
  const pendingAt = pendingUnlink.get(userId) ?? 0;
  if (!confirm) {
    pendingUnlink.set(userId, Date.now());
    return "⚠️ Putuskan koneksi WhatsApp?\nBalas: !putuskan ya\n(ini tidak menghapus akun ForFH)";
  }
  pendingUnlink.delete(userId);
  if (Date.now() - pendingAt > 2 * 60_000) return "Konfirmasi kedaluwarsa. Ketik !putuskan lagi.";
  const binding = await db.query.waBindings.findFirst({
    where: and(eq(waBindings.userId, userId), eq(waBindings.status, "active")),
  });
  if (!binding) return "Tidak ada koneksi WhatsApp yang aktif.";
  await db
    .update(waBindings)
    .set({ status: "unlinked", updatedAt: new Date().toISOString() })
    .where(eq(waBindings.id, binding.id));
  return "🔌 Koneksi WhatsApp diputuskan. Hubungkan lagi kapan saja via Pengaturan.";
}
