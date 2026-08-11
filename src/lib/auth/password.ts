import crypto from "crypto";
import { getPasswordPepper } from "../env";

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/**
 * Normalizes username to lowercase and trimmed string for unique case-insensitive lookup
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Validates username format (3-32 chars, alphanumeric and underscore/hyphen/dot)
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return { valid: false, error: "Username harus antara 3 hingga 32 karakter." };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return { valid: false, error: "Username hanya boleh memuat huruf, angka, titik, underscore, atau tanda hubung." };
  }
  return { valid: true };
}

/**
 * Validates password format (minimum 8 characters)
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password minimal harus 8 karakter." };
  }
  return { valid: true };
}

/**
 * Hash password securely using Node.js crypto.scrypt + unique per-user salt + server-side PASSWORD_PEPPER
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const pepper = getPasswordPepper();
  const passwordWithPepper = password + pepper;

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      passwordWithPepper,
      salt,
      SCRYPT_KEYLEN,
      SCRYPT_PARAMS,
      (err, derivedKey) => {
        if (err) return reject(err);
        const saltHex = salt.toString("hex");
        const hashHex = derivedKey.toString("hex");
        resolve(`scrypt:${SCRYPT_PARAMS.N}:${SCRYPT_PARAMS.r}:${SCRYPT_PARAMS.p}:${saltHex}:${hashHex}`);
      }
    );
  });
}

/**
 * Verify password against stored hash using constant-time comparison
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") {
      return false;
    }

    const [, nStr, rStr, pStr, saltHex, originalHashHex] = parts;
    const n = parseInt(nStr, 10);
    const r = parseInt(rStr, 10);
    const p = parseInt(pStr, 10);
    const salt = Buffer.from(saltHex, "hex");
    const pepper = getPasswordPepper();
    const passwordWithPepper = password + pepper;

    return new Promise((resolve) => {
      crypto.scrypt(
        passwordWithPepper,
        salt,
        SCRYPT_KEYLEN,
        { N: n, r, p },
        (err, derivedKey) => {
          if (err) return resolve(false);
          const originalHash = Buffer.from(originalHashHex, "hex");
          if (originalHash.length !== derivedKey.length) {
            return resolve(false);
          }
          const matches = crypto.timingSafeEqual(originalHash, derivedKey);
          resolve(matches);
        }
      );
    });
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}
