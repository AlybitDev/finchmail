import sanitizeHtml from "sanitize-html";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { authenticatedUser, unauthorized } from "@/lib/request";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  const message = await prisma.message.findFirst({
    where: { id, mailbox: { account: { userId: user.id } } },
    include: { mailbox: { select: { name: true, role: true, account: { select: { email: true, name: true } } } } },
  });
  if (!message) return jsonError("Message not found.", 404);
  return NextResponse.json({
    id: message.id,
    subject: message.subject || "(no subject)",
    name: message.fromName || message.fromAddress || "Unknown sender",
    email: message.fromAddress,
    body: message.textBody,
    html: message.htmlBody ? sanitizeHtml(message.htmlBody, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
      allowedAttributes: { a: ["href", "name", "target", "rel"], img: ["alt", "width", "height"], td: ["align", "valign", "colspan", "rowspan", "width", "height"], th: ["align", "valign", "colspan", "rowspan", "width", "height"], table: ["align", "width", "height", "border", "cellpadding", "cellspacing", "bgcolor"] },
      allowedSchemes: ["http", "https", "mailto"],
      allowedSchemesByTag: { img: [] },
      transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }, true) },
    }) : "",
    time: message.receivedAt.toISOString(),
    isRead: message.isRead,
    isStarred: message.isStarred,
    mailbox: message.mailbox.name,
    mailboxRole: message.mailbox.role,
    account: message.mailbox.account.name,
    attachments: Array.isArray(message.attachmentMeta) ? message.attachmentMeta : [],
  });
}
