import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { normalizeUsername, verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const usernameNormalized = normalizeUsername(username);
    const ip = req.headers.get("x-forwarded-for") || "anonymous-client";
    const rateLimitKey = `login:${usernameNormalized}:${ip}`;

    // Rate limiting: max 5 failed attempts in 5 minutes, 15-minute lockout
    const rateLimit = await checkRateLimit(rateLimitKey, {
      maxAttempts: 5,
      windowMs: 5 * 60 * 1000,
      blockDurationMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    // Lookup user by normalized username
    const user = await db.query.users.findFirst({
      where: eq(users.usernameNormalized, usernameNormalized),
    });

    if (!user) {
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Username atau password salah." },
        { status: 401 }
      );
    }

    // Reset rate limit on success
    await resetRateLimit(rateLimitKey);

    // Create session and set cookie
    const { token, expiresAt } = await createSession(user.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
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
    logger.error("Login error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat memproses login." },
      { status: 500 }
    );
  }
}
