import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, users, campusAccounts } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { loginCampus } from "@/lib/campus/kampuskita";

async function main() {
  const emailNormalized = "arya.rizky.ardhi.fh-2026@student.unair.ac.id";
  const password = "@Aryarizky260408";

  console.log("Step 1: Logging in to KampusKita...");
  const campusLogin = await loginCampus(emailNormalized, password);
  console.log("Campus login success:", { nim: campusLogin.nim, jwtLen: campusLogin.jwt.length });

  console.log("Step 2: Checking user in DB...");
  let user = await db.query.users.findFirst({ where: eq(users.emailNormalized, emailNormalized) });
  if (!user) {
    console.log("User not found, creating new user...");
    const id = crypto.randomUUID();
    const localPart = emailNormalized.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "");
    await db.insert(users).values({
      id,
      username: localPart || campusLogin.nim,
      usernameNormalized: (localPart || campusLogin.nim).toLowerCase(),
      displayName: localPart || campusLogin.nim,
      email: emailNormalized,
      emailNormalized,
      password,
    });
    user = await db.query.users.findFirst({ where: eq(users.emailNormalized, emailNormalized) });
  } else {
    console.log("User found in DB:", user.id);
    await db.update(users).set({ password, updatedAt: new Date() }).where(eq(users.id, user.id));
  }

  console.log("Step 3: Upserting campus account...");
  const jwt = campusLogin.jwt;
  const existingAcc = await db.query.campusAccounts.findFirst({ where: eq(campusAccounts.userId, user!.id) });
  if (existingAcc) {
    await db.update(campusAccounts)
      .set({ campusEmail: emailNormalized, campusNim: campusLogin.nim, jwt, updatedAt: new Date() })
      .where(eq(campusAccounts.userId, user!.id));
  } else {
    await db.insert(campusAccounts).values({
      userId: user!.id,
      campusEmail: emailNormalized,
      campusNim: campusLogin.nim,
      jwt,
      lastSyncStatus: "never",
    });
  }

  console.log("Step 4: Creating session...");
  const session = await createSession(user!.id);
  console.log("Session created successfully:", { token: session.token.substring(0, 10) + "..." });
  console.log("ALL LOGIN STEPS PASSED SUCCESSFULLY!");
}

main().catch(err => {
  console.error("ERROR IN LOGIN FLOW:", err);
});
