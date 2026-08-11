import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { mutations } = body;

  if (!Array.isArray(mutations)) {
    return NextResponse.json({ error: "Mutations array expected" }, { status: 400 });
  }

  // Acknowledge sync batch
  return NextResponse.json({
    success: true,
    processedCount: mutations.length,
    timestamp: Date.now(),
  });
}
