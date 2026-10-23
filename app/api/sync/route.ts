import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { authenticatedUser, csrfCookieMatches, forbiddenOrigin, isSameOrigin, unauthorized } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return forbiddenOrigin();
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  const latest = await prisma.syncRun.findFirst({ where: { account: { userId: user.id } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ status: latest?.status ?? "idle", error: latest?.status === "failed" ? latest.error : null, updatedAt: latest?.endedAt ?? latest?.createdAt ?? null });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !csrfCookieMatches(request)) return forbiddenOrigin();
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  const accountId = new URL(request.url).searchParams.get("accountId");
  const accounts = await prisma.mailAccount.findMany({ where: { userId: user.id, ...(accountId ? { id: accountId } : {}) }, select: { id: true } });
  if (!accounts.length) return jsonError("Connect a mail account before syncing.", 404);
  const queued = [];
  for (const account of accounts) {
    const current = await prisma.syncRun.findFirst({ where: { accountId: account.id, status: { in: ["queued", "running"] } } });
    queued.push(current ?? await prisma.syncRun.create({ data: { accountId: account.id, status: "queued" } }));
  }
  return NextResponse.json({ queued: queued.length }, { status: 202 });
}
