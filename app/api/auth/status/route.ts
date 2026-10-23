import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (user) return NextResponse.json({ mode: "authenticated", user });
  const hasOwner = Boolean(await prisma.user.findFirst({ where: { isOwner: true }, select: { id: true } }));
  return NextResponse.json({ mode: hasOwner ? "login" : "setup" });
}
