import {
  hashPassword,
  verifyPassword,
  normalizeUsername,
  validateUsername,
  validatePassword,
} from "../lib/auth/password";
import { generateSessionToken, hashSessionToken } from "../lib/auth/session";

export async function runAuthTests(assert: (condition: boolean, name: string) => void) {
  console.log("--- 1. Auth & Password Security Tests ---");

  // Username validation & normalization
  assert(normalizeUsername("  AryaRizky.FH  ") === "aryarizky.fh", "Username normalization lowercases and trims");
  assert(validateUsername("arya.rizky").valid === true, "Valid username with period accepted");
  assert(validateUsername("arya_rizky-123").valid === true, "Valid username with underscores and digits accepted");
  assert(validateUsername("ab").valid === false, "Short username (<3 chars) rejected");
  assert(validateUsername("user with spaces").valid === false, "Username with spaces rejected");
  assert(validateUsername("admin@domain.com").valid === false, "Username with invalid special characters rejected");

  // Password validation
  assert(validatePassword("validPassword123").valid === true, "Valid password accepted");
  assert(validatePassword("short").valid === false, "Password shorter than 8 chars rejected");

  // Scrypt hashing and verification
  const testPw = "VerySecureLegalPass#2026!";
  const hash1 = await hashPassword(testPw);
  const hash2 = await hashPassword(testPw);

  assert(hash1.startsWith("scrypt:"), "Hash uses scrypt algorithm identifier");
  assert(hash1 !== hash2, "Distinct random salts produce distinct hash outputs for same password");

  const validMatch = await verifyPassword(testPw, hash1);
  assert(validMatch === true, "Password verification succeeds for matching password");

  const invalidMatch = await verifyPassword("WrongPass#2026!", hash1);
  assert(invalidMatch === false, "Password verification fails for mismatched password");

  // Session token security
  const rawToken = generateSessionToken();
  assert(rawToken.length === 64, "Session token is 64 hex chars (256 bits entropy)");

  const hashedToken = hashSessionToken(rawToken);
  assert(hashedToken.length === 64, "SHA-256 hash of session token is 64 hex chars");
  assert(hashedToken !== rawToken, "Raw token and database token hash are strictly non-identical");
}
