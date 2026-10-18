import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, isValidSession, SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  const isAuthApi = pathname.startsWith("/api/auth/");
  const isApi = pathname.startsWith("/api/");

  if (isLoginPage || isAuthApi) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    if (isApi) {
      return NextResponse.json(
        { error: "App access is not configured. Set BILLING_APP_PASSWORD and AUTH_SECRET." },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL("/login?setup=1", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSession(token)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "Sign in to access this billing data." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
