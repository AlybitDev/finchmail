import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const target = new URL(request.url);
      const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || target.host;
      const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || target.protocol.slice(0, -1);
      if (new URL(origin).origin !== `${protocol}://${host}`) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
    }
  }
  const token = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ token });
  response.cookies.set("finchmail_csrf", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60,
  });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
