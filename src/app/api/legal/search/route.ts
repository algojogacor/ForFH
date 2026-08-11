import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { searchPasalLaws } from "@/lib/legal/pasal-client";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const type = searchParams.get("type") || undefined;
  const limitStr = searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 10;

  if (!q || !q.trim()) {
    return NextResponse.json({ error: "Kata kunci pencarian hukum (q) wajib diisi." }, { status: 400 });
  }

  const response = await searchPasalLaws({
    q: q.trim(),
    type,
    limit,
  });

  return NextResponse.json(response);
}
