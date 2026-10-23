import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { authenticatedUser, csrfCookieMatches, forbiddenOrigin, isSameOrigin, unauthorized } from "@/lib/request";

export const runtime = "nodejs";
const flagsSchema = z.object({ isRead: z.boolean().optional(), isStarred: z.boolean().optional() }).refine((value) => value.isRead !== undefined || value.isStarred !== undefined);
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOrigin(request) || !csrfCookieMatches(request)) return forbiddenOrigin();
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  let payload: unknown;
  try { payload = await readJson(request); } catch { return jsonError("Send updated flags as JSON."); }
  const parsed = flagsSchema.safeParse(payload);
  if (!parsed.success) return jsonError("Invalid message flags.");
  const { id } = await context.params;
  const result = await prisma.message.updateMany({
    where: { id, mailbox: { account: { userId: user.id } } },
    data: {
      ...(parsed.data.isRead !== undefined ? { isRead: parsed.data.isRead, localReadOverride: parsed.data.isRead } : {}),
      ...(parsed.data.isStarred !== undefined ? { isStarred: parsed.data.isStarred, localStarOverride: parsed.data.isStarred } : {}),
    },
  });
  if (!result.count) return jsonError("Message not found.", 404);
  return NextResponse.json({ ok: true });
}
