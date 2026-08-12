// Enkripsi at-rest untuk token akun kampus (JWT Kampus Kita & authtoken HE-BAT).
// Password asli TIDAK PERNAH disimpan — hanya token hasil login yang disimpan,
// dan dalam bentuk terenkripsi. Kunci diturunkan dari SESSION_SECRET via HKDF,
// jadi bocornya DB saja tidak cukup: butuh SESSION_SECRET juga.
// Format rekaman: v1:<iv base64>:<tag base64>:<ciphertext base64>
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";
import { getSessionSecret } from "@/lib/env";

const SALT = "forfh-campus-at-rest-v1";
const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (!cachedKey) {
    const derived = hkdfSync("sha256", Buffer.from(getSessionSecret(), "utf8"), SALT, "at-rest-key", 32);
    cachedKey = Buffer.from(derived);
  }
  return cachedKey;
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptText(payload: string): string {
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

// Tampilkan email terblur untuk status (mis. "ary***@student.unair.ac.id").
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email.slice(0, 3) + "***";
  return email.slice(0, 3) + "***" + email.slice(at);
}
