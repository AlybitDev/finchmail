import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { unauthorized } from "@/lib/request";
import { authenticatedUser } from "@/lib/request";

export const runtime = "nodejs";

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  const mailboxes = await prisma.mailbox.findMany({
    where: { account: { userId: user.id } },
    select: { id: true, accountId: true, name: true, path: true, role: true, specialUse: true },
    orderBy: [{ account: { email: "asc" } }, { name: "asc" }],
  });
  const accounts = user.accounts.map((account) => ({ id: account.id, email: account.email, name: account.name }));
  return NextResponse.json({ mailboxes, accounts });
}
