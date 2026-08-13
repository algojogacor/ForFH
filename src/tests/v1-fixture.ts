// Helper tes: membuat payload v1: (AES-256-GCM) yang setara dengan format
// penyimpanan LAMA at-rest.ts, agar tes migrasi legacy berjalan mandiri
// tanpa bergantung .env.local (secret dimasukkan langsung oleh tes).
import { hkdfSync, createCipheriv, randomBytes } from "crypto";

export const TEST_LEGACY_SECRET = "test-legacy-secret-for-forfh-v1-fixture-1234567890!";

export function encryptV1Fixture(payload: string, secret = TEST_LEGACY_SECRET): string {
  const key = Buffer.from(hkdfSync("sha256", secret, "forfh-campus-at-rest-v1", "at-rest-key", 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}
