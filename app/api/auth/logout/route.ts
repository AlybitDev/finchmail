import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { csrfCookieMatches, forbiddenOrigin, isSameOrigin } from "@/lib/request";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !csrfCookieMatches(request)) return forbiddenOrigin();
  await destroySession();
  (await cookies()).set("finchmail_csrf", "", { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
