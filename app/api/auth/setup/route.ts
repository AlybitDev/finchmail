import argon2 from "argon2";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { csrfCookieMatches, isSameOrigin, forbiddenOrigin } from "@/lib/request";
import { passwordHashOptions, setupSchema } from "@/lib/schemas";
import { createSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !csrfCookieMatches(request)) return forbiddenOrigin();
  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch {
    return jsonError("Send setup details as JSON.");
  }
  const parsed = setupSchema.safeParse(payload);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Check the setup details.");
  const configuredToken = process.env.INITIAL_SETUP_TOKEN;
  if (!configuredToken || configuredToken.length < 32) return jsonError("Owner setup is disabled. Configure INITIAL_SETUP_TOKEN on the server first.", 503);
  const supplied = Buffer.from(parsed.data.setupToken);
  const expected = Buffer.from(configuredToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return jsonError("The one-time setup key is incorrect.", 403);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(751204)`;
      if (await tx.user.findFirst({ where: { isOwner: true } })) throw new Error("OWNER_EXISTS");
      const passwordHash = await argon2.hash(parsed.data.password, { ...passwordHashOptions(), type: argon2.argon2id });
      await tx.user.create({ data: { email: parsed.data.email, passwordHash } });
    }, { isolationLevel: "Serializable" });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
    if (!user) return jsonError("Could not create the owner account. Please try again.", 500);
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "OWNER_EXISTS") return jsonError("Owner setup has already been completed.", 409);
    return jsonError("Could not create the owner account. Please try again.", 500);
  }
}
