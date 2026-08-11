import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { invalidateSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await invalidateSession(token);
    }

    const response = NextResponse.json({ success: true, message: "Berhasil logout." });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    return NextResponse.json({ success: true });
  }
}
