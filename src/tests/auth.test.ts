// Tes auth murni (tanpa DB): sesi — token acak disimpan RAW (nilai asli =
// nilai tersimpan, tanpa hashing). Password tidak diproses di sisi ForFH
// (login hanya verifikasi email+password ke Kampus Kita UNAIR).
import { NextRequest } from "next/server";
import { generateSessionToken } from "../lib/auth/session";
import { getClientIp } from "../lib/auth/ip";

export async function runAuthTests(assert: (condition: boolean, name: string) => void) {
  console.log("--- 1. Auth & Session Tests ---");

  // Session token: 32 byte acak (64 hex) — disimpan apa adanya di sessions.token
  const tokenA = generateSessionToken();
  assert(tokenA.length === 64, "Session token adalah 64 hex chars (256 bits entropy)");
  assert(/^[0-9a-f]{64}$/.test(tokenA), "Session token hanya karakter hex");

  const tokenB = generateSessionToken();
  assert(tokenA !== tokenB, "Token berbeda antar panggilan (random)");

  console.log("  ── Client IP Extraction Tests ──");
  const req1 = new NextRequest("http://localhost", {
    headers: {
      "cf-connecting-ip": "203.0.113.195",
      "x-real-ip": "198.51.100.1",
      "x-forwarded-for": "192.0.2.1, 198.51.100.1",
    },
  });
  assert(getClientIp(req1) === "203.0.113.195", "getClientIp mengutamakan cf-connecting-ip");

  const req2 = new NextRequest("http://localhost", {
    headers: {
      "x-real-ip": " 198.51.100.1 ",
      "x-forwarded-for": "192.0.2.1, 10.0.0.1",
    },
  });
  assert(getClientIp(req2) === "198.51.100.1", "getClientIp memilih x-real-ip jika cf-connecting-ip tidak ada (dan di-trim)");

  const req3 = new NextRequest("http://localhost", {
    headers: {
      "x-forwarded-for": " 203.0.113.50 , 198.51.100.1, 10.0.0.1",
    },
  });
  assert(getClientIp(req3) === "203.0.113.50", "getClientIp mengambil IP pertama dari x-forwarded-for list dan di-trim");

  const req4 = new NextRequest("http://localhost");
  assert(getClientIp(req4) === "anonymous-client", "getClientIp fallback ke 'anonymous-client' jika tanpa header IP");
}
