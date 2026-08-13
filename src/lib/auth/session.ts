import crypto from "crypto";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { db, sessions, users, userSettings } from "../db";
import { logger } from "../logger";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-forfh-session" : "forfh-session";

export const SESSION_DURATION_DAYS = 30;
export const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Throttle write last_seen_at: maks 1×/menit per user (request path tidak
// selalu nulis DB)
const lastSeenThrottle = new Map<string, number>();

export interface SessionUser {
  id: string;
  username: string;
  displayName: string | null;
  settings: {
    timezone: string;
    locale: string;
    theme: string;
    aiEnabled: boolean;
    primaryClassAlertMinutes: number;
    deadlineBufferMinutes: number;
  };
}

/**
 * Computes SHA-256 hash of raw session token for database lookup
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a high-entropy 256-bit random session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates a new high-entropy session in the database
 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    tokenHash,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
  });

  return { token: rawToken, expiresAt };
}

/**
 * Validates session token and returns authenticated user
 */
export async function validateSession(rawToken: string | null | undefined): Promise<SessionUser | null> {
  if (!rawToken || rawToken.length < 16) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const foundSession = await db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
  });

  if (!foundSession) {
    return null;
  }

  // Update last seen asynchronously (throttled — maks 1×/menit per user)
  const lastWrite = lastSeenThrottle.get(foundSession.userId) || 0;
  if (Date.now() - lastWrite > 60_000) {
    lastSeenThrottle.set(foundSession.userId, Date.now());
    db.update(sessions)
      .set({ lastSeenAt: now })
      .where(eq(sessions.id, foundSession.id))
      .catch((err) => logger.error("Error updating session lastSeenAt:", err));
  }

  // Retrieve user and settings
  const user = await db.query.users.findFirst({
    where: eq(users.id, foundSession.userId),
  });

  if (!user) {
    return null;
  }

  let settings = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, user.id),
  });

  if (!settings) {
    // Automatically create default settings if missing
    const settingsId = crypto.randomUUID();
    await db.insert(userSettings).values({
      id: settingsId,
      userId: user.id,
      timezone: "Asia/Jakarta",
      locale: "id-ID",
      theme: "system",
      primaryClassAlertMinutes: 240,
      deadlineBufferMinutes: 720,
      aiEnabled: 1,
    });
    settings = {
      id: settingsId,
      userId: user.id,
      timezone: "Asia/Jakarta",
      locale: "id-ID",
      theme: "system",
      defaultTaskReminders: "[10080, 4320, 1440, 360, 60]",
      defaultClassReminders: "[120, 90, 60, 30, 20]",
      primaryClassAlertMinutes: 240,
      deadlineBufferMinutes: 720,
      aiEnabled: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    settings: {
      timezone: settings.timezone,
      locale: settings.locale,
      theme: settings.theme,
      aiEnabled: Boolean(settings.aiEnabled),
      primaryClassAlertMinutes: settings.primaryClassAlertMinutes,
      deadlineBufferMinutes: settings.deadlineBufferMinutes,
    },
  };
}

/**
 * Retrieves the currently authenticated user from Next.js server cookies
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return validateSession(token);
}

/**
 * Invalidates (deletes) a session token from the database
 */
export async function invalidateSession(rawToken: string | null | undefined): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/**
 * Invalidates all sessions for a specific user (e.g. on password change)
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
