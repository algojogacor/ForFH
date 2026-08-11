import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getUserStorageQuota } from "@/lib/drive/client";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quota = await getUserStorageQuota(user.id);
  return NextResponse.json({ quota });
}
