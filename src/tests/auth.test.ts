// Tes auth murni (tanpa DB): sesi — token acak disimpan RAW (nilai asli =
// nilai tersimpan, tanpa hashing). Password tidak diproses di sisi ForFH
// (login hanya verifikasi email+password ke Kampus Kita UNAIR).
import { generateSessionToken } from "../lib/auth/session";

export async function runAuthTests(assert: (condition: boolean, name: string) => void) {
  console.log("--- 1. Auth & Session Tests ---");

  // Session token: 32 byte acak (64 hex) — disimpan apa adanya di sessions.token
  const tokenA = generateSessionToken();
  assert(tokenA.length === 64, "Session token adalah 64 hex chars (256 bits entropy)");
  assert(/^[0-9a-f]{64}$/.test(tokenA), "Session token hanya karakter hex");

  const tokenB = generateSessionToken();
  assert(tokenA !== tokenB, "Token berbeda antar panggilan (random)");
}
