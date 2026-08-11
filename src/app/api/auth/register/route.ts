import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, users, userSettings, academicTerms } from "@/lib/db";
import {
  hashPassword,
  normalizeUsername,
  validateUsername,
  validatePassword,
} from "@/lib/auth/password";
import { createSession, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting by IP
    const ip = req.headers.get("x-forwarded-for") || "anonymous-client";
    const rateLimit = await checkRateLimit(`register:${ip}`, {
      maxAttempts: 10,
      windowMs: 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const body = await req.json();
    const { username, password, confirmPassword, displayName } = body;

    // 2. Validation
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) {
      return NextResponse.json({ error: usernameCheck.error }, { status: 400 });
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json(
        { error: "Konfirmasi password tidak cocok." },
        { status: 400 }
      );
    }

    const usernameNormalized = normalizeUsername(username);

    // 3. Check for existing username
    const existingUser = await db.query.users.findFirst({
      where: eq(users.usernameNormalized, usernameNormalized),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Username sudah terdaftar. Silakan pilih username lain." },
        { status: 409 }
      );
    }

    // 4. Create User
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = new Date();

    await db.insert(users).values({
      id: userId,
      username: username.trim(),
      usernameNormalized,
      passwordHash,
      displayName: displayName?.trim() || username.trim(),
      createdAt: now,
      updatedAt: now,
    });

    // 5. Create default settings
    await db.insert(userSettings).values({
      id: crypto.randomUUID(),
      userId,
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
    });

    // 6. Create initial active academic term
    await db.insert(academicTerms).values({
      id: crypto.randomUUID(),
      userId,
      name: "Semester Ganjil 2026/2027",
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Create session & set secure cookie
    const { token, expiresAt } = await createSession(userId);

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        username: username.trim(),
        displayName: displayName?.trim() || username.trim(),
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      expires: expiresAt,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error: any) {
    logger.error("Registration error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat mendaftar akun." },
      { status: 500 }
    );
  }
}
