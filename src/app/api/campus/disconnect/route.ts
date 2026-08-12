import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, campusAccounts } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

// Putuskan koneksi kampus: hapus akun kampus (token terenkripsi ikut hilang).
// Data yang sudah tersync (kursus, jadwal, tugas) tetap tersimpan; hanya
// berhenti disinkronkan.
export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  await db.delete(campusAccounts).where(eq(campusAccounts.userId, session.id));
  return NextResponse.json({ success: true });
}
