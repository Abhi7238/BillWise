import { NextResponse } from "next/server";
import {
  createSessionToken,
  isAuthConfigured,
  isSameOriginRequest,
  passwordMatches,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Set BILLING_APP_PASSWORD (at least 16 characters) and AUTH_SECRET (at least 32 characters) in your environment before signing in.",
      },
      { status: 503 },
    );
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Sign-in request origin is invalid." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const password =
    body && typeof body === "object" && "password" in body && typeof body.password === "string"
      ? body.password
      : "";
  if (!password || password.length > 1024 || !passwordMatches(password)) {
    return NextResponse.json({ error: "That password doesn’t match. Please try again." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
