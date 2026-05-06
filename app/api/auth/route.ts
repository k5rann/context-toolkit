import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const expected = process.env.APP_PASSWORD;

    // If no APP_PASSWORD is set, auth is disabled — let everyone in
    if (!expected) {
      const res = NextResponse.json({ ok: true, authDisabled: true });
      return res;
    }

    if (password !== expected) {
      return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("toolkit_auth", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
