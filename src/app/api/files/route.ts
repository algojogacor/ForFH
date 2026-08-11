import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db, files, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getUserStorageQuota } from "@/lib/drive/client";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const category = searchParams.get("category");

  const [allFiles, quota] = await Promise.all([
    db.query.files.findMany({
      where: and(
        eq(files.userId, user.id),
        isNull(files.deletedAt),
        courseId ? eq(files.courseId, courseId) : undefined,
        category ? eq(files.category, category) : undefined
      ),
      orderBy: [desc(files.createdAt)],
      with: { course: true },
    }),
    getUserStorageQuota(user.id),
  ]);

  return NextResponse.json({ files: allFiles, quota });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id");

  if (!fileId) {
    return NextResponse.json({ error: "ID file wajib diisi." }, { status: 400 });
  }

  await db
    .update(files)
    .set({ deletedAt: new Date() })
    .where(and(eq(files.id, fileId), eq(files.userId, user.id)));

  return NextResponse.json({ success: true });
}
