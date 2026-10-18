import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "billwise_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

export function isAuthConfigured(): boolean {
  const password = process.env.BILLING_APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  return Boolean(password && password.length >= 16 && secret && Buffer.byteLength(secret) >= 32);
}

function sessionSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !isAuthConfigured()) {
    throw new Error("Authentication is not configured.");
  }

  const payload = Buffer.from(
    JSON.stringify({
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
      nonce: randomBytes(16).toString("base64url"),
    }),
  ).toString("base64url");
  return `${payload}.${sessionSignature(payload, secret)}`;
}

export function isValidSession(token: string | undefined): boolean {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret || !isAuthConfigured()) {
    return false;
  }

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) {
    return false;
  }

  const expected = sessionSignature(payload, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return false;
  }

  try {
    const session: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !session ||
      typeof session !== "object" ||
      !("expiresAt" in session) ||
      typeof session.expiresAt !== "number"
    ) {
      return false;
    }
    return session.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function passwordMatches(candidate: string): boolean {
  const configuredPassword = process.env.BILLING_APP_PASSWORD;
  if (!configuredPassword || !isAuthConfigured()) {
    return false;
  }
  const candidateHash = createHash("sha256").update(candidate).digest();
  const configuredHash = createHash("sha256").update(configuredPassword).digest();
  return timingSafeEqual(candidateHash, configuredHash);
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol || new URL(request.url).protocol.slice(0, -1);
  if (!host || (protocol !== "http" && protocol !== "https")) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
