import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users, campusAccounts } from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { loginCampus, KampusKitaClient, KampusKitaError } from "@/lib/campus/kampuskita";
import { connectHebat } from "@/lib/campus/hebat";
import { runCampusSync, saveHebatToken, markSyncError } from "@/lib/campus/sync";
import { logger } from "@/lib/logger";

// Login satu-satunya: email kampus + password (sama dengan Kampus Kita).
// Setelah terverifikasi ke UNAIR, password disimpan apa adanya di
// users.password (kebijakan "nilai tersimpan = nilai asli"). JWT KK dan
// authtoken HE-BAT juga plaintext. Akun dibuat otomatis dari email pertama kali.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
    }
    if (!String(email).includes("@")) {
      return NextResponse.json({ error: "Gunakan email kampus, mis. nama@student.unair.ac.id." }, { status: 400 });
    }

    const emailNormalized = String(email).trim().toLowerCase();

    // 1. Login ke Kampus Kita (verifikasi email+password ke server UNAIR)
    let campusLogin;
    try {
      campusLogin = await loginCampus(emailNormalized, password);
    } catch (e: any) {
      if (e instanceof KampusKitaError) {
        return NextResponse.json({ error: e.message }, { status: e.status === 0 ? 502 : e.status });
      }
      throw e;
    }

    const nim = campusLogin.nim || "";
    const localPart = emailNormalized.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "");

    // 2. Upsert user by email_normalized (akun dibuat otomatis). Password
    // disimpan di sini — hanya setelah verifikasi UNAIR di langkah 1 lolos.
    let user = await db.query.users.findFirst({ where: eq(users.emailNormalized, emailNormalized) });
    if (!user) {
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        username: localPart || nim,
        usernameNormalized: (localPart || nim).toLowerCase(),
        displayName: localPart || nim,
        email: emailNormalized,
        emailNormalized,
        password,
      });
      user = await db.query.users.findFirst({ where: eq(users.emailNormalized, emailNormalized) });
      if (!user) throw new Error("Gagal membuat akun pengguna.");
    } else {
      await db.update(users).set({ password, updatedAt: new Date() }).where(eq(users.id, user.id));
    }

    // 3. Simpan akun kampus (upsert)
    const jwt = campusLogin.jwt;
    const existingAcc = await db.query.campusAccounts.findFirst({ where: eq(campusAccounts.userId, user.id) });
    if (existingAcc) {
      await db.update(campusAccounts)
        .set({ campusEmail: emailNormalized, campusNim: nim, jwt, updatedAt: new Date() })
        .where(eq(campusAccounts.userId, user.id));
    } else {
      await db.insert(campusAccounts).values({
        userId: user.id,
        campusEmail: emailNormalized,
        campusNim: nim,
        jwt,
        lastSyncStatus: "never",
      });
    }

    await resetRateLimit(rateLimitKey);

    // 4. Sesi ForFH
    const { token, expiresAt } = await createSession(user.id);
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        nim,
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

    // 5. Sync awal + connect HE-BAT — fire-and-forget, tidak memblokir login
    void bootstrapCampus(user.id, campusLogin.jwt, nim, password);

    return response;
  } catch (error: any) {
    logger.error("Login error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat memproses login: " + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}

async function bootstrapCampus(userId: string, jwt: string, nim: string, password: string): Promise<void> {
  try {
    // display name dari profil kampus (best-effort)
    try {
      const status = await new KampusKitaClient(jwt).status();
      const nm = status[0]?.NM_PENGGUNA;
      if (nm) {
        await db.update(users).set({ displayName: String(nm) }).where(eq(users.id, userId));
      }
    } catch (e: any) {
      logger.warn(`bootstrap ${userId}: profil kampus gagal: ${e?.message || e}`);
    }

    // HE-BAT: coba NIM+password yang sama; kalau beda, dilewati (UI bisa hubungkan ulang)
    if (nim) {
      try {
        const h = await connectHebat(nim, password);
        await saveHebatToken(userId, h.userid, h.authtoken);
      } catch (e: any) {
        logger.warn(`bootstrap ${userId}: HE-BAT connect dilewati: ${e?.message || e}`);
      }
    }

    await runCampusSync(userId);
  } catch (e: any) {
    logger.error(`bootstrap sync ${userId} gagal:`, e);
    await markSyncError(userId, e?.message || "Sync awal gagal");
  }
}
