import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { createResumableUploadSession } from "@/lib/drive/client";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { filename, mimeType, sizeBytes, category, courseId } = body;

  if (!filename || !mimeType || !sizeBytes) {
    return NextResponse.json(
      { error: "Nama file, tipe MIME, dan ukuran file wajib diisi." },
      { status: 400 }
    );
  }

  // Validate course ownership if courseId is provided
  if (courseId) {
    const validCourse = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.userId, user.id)),
    });
    if (!validCourse) {
      return NextResponse.json(
        { error: "Mata kuliah tidak valid atau bukan milik Anda." },
        { status: 403 }
      );
    }
  }

  const sessionResult = await createResumableUploadSession({
    userId: user.id,
    filename,
    mimeType,
    sizeBytes: Number(sizeBytes),
    category,
  });

  if ("error" in sessionResult) {
    return NextResponse.json({ error: sessionResult.error }, { status: 400 });
  }

  return NextResponse.json(sessionResult);
}
