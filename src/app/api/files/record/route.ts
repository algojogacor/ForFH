import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, files, courses } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { verifyDriveFileServerSide } from "@/lib/drive/client";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { driveFileId, driveParentFolderId, name, mimeType, sizeBytes, category, courseId } = body;

  if (!driveFileId) {
    return NextResponse.json(
      { error: "driveFileId wajib disertakan." },
      { status: 400 }
    );
  }

  // Validate course ownership if courseId is supplied
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

  // 1. Server-side verification against Google Drive API
  const verification = await verifyDriveFileServerSide({
    driveFileId,
    expectedName: name,
    expectedSizeBytes: typeof sizeBytes === "number" ? sizeBytes : undefined,
  });

  if (!verification.verified) {
    return NextResponse.json(
      { error: verification.error || "Berkas tidak dapat diverifikasi di Google Drive." },
      { status: 400 }
    );
  }

  // 2. Insert verified metadata into Turso database
  const fileId = crypto.randomUUID();
  const now = new Date();

  await db.insert(files).values({
    id: fileId,
    userId: user.id,
    courseId: courseId || null,
    driveFileId,
    driveParentFolderId: verification.parentFolderId || driveParentFolderId || null,
    name: verification.name,
    mimeType: verification.mimeType,
    sizeBytes: verification.sizeBytes,
    category: category || "assignment",
    createdAt: now,
  });

  return NextResponse.json({
    success: true,
    fileId,
    verifiedFile: {
      name: verification.name,
      sizeBytes: verification.sizeBytes,
      mimeType: verification.mimeType,
    },
  });
}
