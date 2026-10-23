import { createHash } from "node:crypto";
import argon2 from "argon2";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { csrfCookieMatches, forbiddenOrigin, isSameOrigin } from "@/lib/request";
import { loginSchema } from "@/lib/schemas";
import { createSession } from "@/lib/session";
import { passwordHashOptions } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !csrfCookieMatches(request)) return forbiddenOrigin();
  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch {
    return jsonError("Send your sign-in details as JSON.");
  }
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) return jsonError("Enter a valid email and password.");
  const attemptKey = createHash("sha256").update(`${parsed.data.email}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`).digest("hex");
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const recentFailures = await prisma.loginAttempt.count({ where: { keyHash: attemptKey, createdAt: { gte: cutoff } } });
  if (recentFailures >= 10) return jsonError("Too many sign-in attempts. Please wait 15 minutes and try again.", 429);
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user
    ? await argon2.verify(user.passwordHash, parsed.data.password).catch(() => false)
    : await argon2.hash(parsed.data.password, { ...passwordHashOptions(), type: argon2.argon2id }).then(() => false).catch(() => false);
  if (!user || !valid) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${attemptKey}))`;
      const failures = await tx.loginAttempt.count({ where: { keyHash: attemptKey, createdAt: { gte: cutoff } } });
      if (failures < 10) await tx.loginAttempt.create({ data: { keyHash: attemptKey } });
      if (Math.random() < 0.05) await tx.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    });
    return jsonError("Email or password is incorrect.", 401);
  }
  await prisma.loginAttempt.deleteMany({ where: { keyHash: attemptKey } });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
