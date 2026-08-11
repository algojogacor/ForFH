import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getPasalLawDetail } from "@/lib/legal/pasal-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uri: string[] }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uri: uriSegments } = await params;
  const frbrUri = uriSegments.join("/");

  const detail = await getPasalLawDetail(frbrUri);
  if (!detail) {
    return NextResponse.json({ error: "Peraturan perundang-undangan tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ law: detail });
}
