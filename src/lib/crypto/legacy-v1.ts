// Migrasi data lama berformat v1 (AES-256-GCM, kunci HKDF dari SESSION_SECRET).
// Hanya dipakai untuk MEMBACA nilai lama saat upgrade ke penyimpanan plaintext
// (2026-08-14: enkripsi at-rest dihapus). Kunci dibaca dari process.env
// langsung agar src/lib/env.ts tidak lagi bergantung pada SESSION_SECRET.
// HAPUS FILE INI setelah semua environment (lokal + Turso produksi) termigrasi.
import { createDecipheriv, hkdfSync } from "crypto";

const SALT = "forfh-campus-at-rest-v1";
const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (!cachedKey) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("SESSION_SECRET tidak tersedia untuk migrasi data lama.");
    cachedKey = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), SALT, "at-rest-key", 32));
  }
  return cachedKey;
}

export function isLegacyV1(payload: string): boolean {
  return payload.startsWith("v1:");
}

export function decryptLegacyV1(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Format payload terenkripsi tidak dikenal.");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv(ALGO, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
