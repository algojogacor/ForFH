import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db, academicTerms } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const terms = await db.query.academicTerms.findMany({
    where: eq(academicTerms.userId, user.id),
    orderBy: [desc(academicTerms.createdAt)],
  });

  return NextResponse.json({ terms });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, startDate, endDate, isActive } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Nama semester wajib diisi." }, { status: 400 });
  }

  const termId = crypto.randomUUID();
  const now = new Date();

  // If this new term is marked as active, optionally set others to inactive
  if (isActive) {
    await db
      .update(academicTerms)
      .set({ isActive: 0 })
      .where(eq(academicTerms.userId, user.id));
  }

  await db.insert(academicTerms).values({
    id: termId,
    userId: user.id,
    name: name.trim(),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    isActive: isActive ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ success: true, termId });
}
