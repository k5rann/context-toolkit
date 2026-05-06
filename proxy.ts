import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  // Allow requests if no APP_PASSWORD is configured (open access)
  if (!process.env.APP_PASSWORD) return NextResponse.next();

  const path = req.nextUrl.pathname;

  // Public paths that bypass auth
  const isPublic =
    path.startsWith("/auth") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico" ||
    path.startsWith("/icon");

  if (isPublic) return NextResponse.next();

  const authed = req.cookies.get("toolkit_auth")?.value === "1";
  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
