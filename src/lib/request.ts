import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

export async function authenticatedUser() {
  return getSessionUser();
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const target = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || target.host;
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto || target.protocol.replace(":", "");
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export function csrfCookieMatches(request: Request) {
  const header = request.headers.get("x-finchmail-csrf");
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("finchmail_csrf="))?.slice("finchmail_csrf=".length);
  return Boolean(header && cookie && header === cookie);
}

export function unauthorized() {
  return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
}

export function forbiddenOrigin() {
  return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
}
