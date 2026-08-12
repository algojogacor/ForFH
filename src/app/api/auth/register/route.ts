import { NextResponse } from "next/server";

// Registrasi manual dihapus total — akun dibuat otomatis saat login kampus.
// Dibiarkan sebagai 410 supaya klien lama tidak diam-diam sukses.
export async function POST() {
  return NextResponse.json(
    { error: "Registrasi manual tidak tersedia. Login dengan email kampus (@student.unair.ac.id)." },
    { status: 410 }
  );
}
