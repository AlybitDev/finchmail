import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticatedUser } from "@/lib/request";

export const runtime = "nodejs";

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ mode: (await prisma.user.findFirst({ where: { isOwner: true }, select: { id: true } })) ? "login" : "setup" });
  const latest = await prisma.syncRun.findFirst({ where: { account: { userId: user.id } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ mode: "authenticated", user: { id: user.id, email: user.email, accounts: user.accounts }, sync: latest ? { status: latest.status, error: latest.status === "failed" ? latest.error : null, updatedAt: (latest.endedAt ?? latest.startedAt ?? latest.createdAt).toISOString() } : null });
}
