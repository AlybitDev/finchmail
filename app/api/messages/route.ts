import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { authenticatedUser, unauthorized } from "@/lib/request";
import { initials, previewText, senderColor } from "@/lib/mail";

export const runtime = "nodejs";
const PAGE_SIZE = 40;
const FOLDERS = new Set(["inbox", "sent", "drafts", "archive", "trash", "spam", "starred", "all"]);

export async function GET(request: Request) {
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") ?? "inbox";
  const mailboxId = url.searchParams.get("mailboxId");
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const offsetValue = Number(url.searchParams.get("offset") ?? 0);
  const offset = Number.isSafeInteger(offsetValue) && offsetValue >= 0 ? Math.min(offsetValue, 100_000) : 0;
  const state = url.searchParams.get("state") ?? "all";
  if (!FOLDERS.has(folder)) return jsonError("Unknown folder.");
  if (!["all", "unread", "starred"].includes(state)) return jsonError("Unknown message filter.");
  if ((after && Number.isNaN(Date.parse(after))) || (before && Number.isNaN(Date.parse(before)))) return jsonError("Date filters must use ISO date values.");
  if (mailboxId && !(await prisma.mailbox.count({ where: { id: mailboxId, account: { userId: user.id } } }))) return jsonError("Folder not found.", 404);
  const accounts = await prisma.mailAccount.findMany({ where: { userId: user.id }, select: { id: true } });
  const accountIds = accounts.map((account) => account.id);
  if (!accountIds.length) return NextResponse.json({ messages: [], total: 0, unread: 0, unreadTotal: 0, nextOffset: null, previousOffset: null });

  const where: Prisma.MessageWhereInput = {
    mailbox: {
      accountId: { in: accountIds },
      ...(mailboxId ? { id: mailboxId } : {}),
      ...(folder === "inbox" || folder === "sent" || folder === "drafts" || folder === "archive" || folder === "trash" || folder === "spam"
        ? { role: folder }
        : {}),
    },
    ...(folder === "starred" ? { isStarred: true } : {}),
    ...(state === "starred" ? { isStarred: true } : {}),
    ...(state === "unread" ? { isRead: false } : {}),
    ...(after || before ? { receivedAt: { ...(after ? { gte: new Date(after) } : {}), ...(before ? { lte: new Date(before) } : {}) } } : {}),
  };
  const searchFilter = query ? Prisma.sql`
    FROM "Message" AS m
    INNER JOIN "Mailbox" AS b ON b.id = m."mailboxId"
    WHERE b."accountId" IN (${Prisma.join(accountIds)})
      ${mailboxId ? Prisma.sql`AND b.id = ${mailboxId}` : Prisma.empty}
      AND (${folder === "inbox" || folder === "sent" || folder === "drafts" || folder === "archive" || folder === "trash" || folder === "spam" ? folder : null}::text IS NULL OR b.role = ${folder === "inbox" || folder === "sent" || folder === "drafts" || folder === "archive" || folder === "trash" || folder === "spam" ? folder : null})
      AND (${folder !== "starred"} OR m."isStarred" = true)
      AND (${state !== "starred"} OR m."isStarred" = true)
      AND (${state !== "unread"} OR m."isRead" = false)
      AND (${after}::timestamptz IS NULL OR m."receivedAt" >= ${after}::timestamptz)
      AND (${before}::timestamptz IS NULL OR m."receivedAt" <= ${before}::timestamptz)
      AND to_tsvector('simple', concat_ws(' ', m.subject, m."fromName", m."fromAddress", m."textBody", m."htmlBody")) @@ plainto_tsquery('simple', ${query})
  ` : null;
  const [searchRows, searchCount] = query && searchFilter ? await Promise.all([
    prisma.$queryRaw<Array<{ id: string; rank: number }>>(Prisma.sql`
      SELECT m.id, ts_rank(to_tsvector('simple', concat_ws(' ', m.subject, m."fromName", m."fromAddress", m."textBody", m."htmlBody")), plainto_tsquery('simple', ${query})) AS rank
      ${searchFilter}
      ORDER BY rank DESC, m."receivedAt" DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT count(*)::int AS total ${searchFilter}`),
  ]) : [null, null];
  const searchOrder = searchRows?.map((item) => item.id) ?? null;
  const searchRanks = searchRows ? new Map(searchRows.map((item) => [item.id, item.rank])) : null;
  const searchPageIds = searchOrder?.slice(0, PAGE_SIZE + 1);
  const searchWhere: Prisma.MessageWhereInput = where;
  const [total, unreadTotal] = await Promise.all([
    query ? Promise.resolve(searchCount?.[0]?.total ?? 0) : prisma.message.count({ where: searchWhere }),
    prisma.message.count({ where: { mailbox: { accountId: { in: accountIds }, role: "inbox" }, isRead: false } }),
  ]);
  const messages = await prisma.message.findMany({
    where: searchOrder ? { ...where, id: { in: searchPageIds ?? [] } } : where,
    include: { mailbox: { select: { id: true, name: true, path: true, role: true, account: { select: { email: true, name: true } } } } },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    skip: searchOrder ? 0 : offset,
    take: PAGE_SIZE + 1,
  });
  const hasMore = messages.length > PAGE_SIZE;
  if (searchRanks) messages.sort((a, b) => (searchRanks.get(b.id) ?? 0) - (searchRanks.get(a.id) ?? 0));
  const page = messages.slice(0, PAGE_SIZE);
  return NextResponse.json({
    messages: page.map((message) => {
      const from = message.fromName || message.fromAddress || "Unknown sender";
      const attachments = Array.isArray(message.attachmentMeta) ? message.attachmentMeta as Array<{ filename?: string }> : [];
      return {
        id: message.id,
        mailboxId: message.mailbox.id,
        mailbox: message.mailbox.name,
        mailboxRole: message.mailbox.role,
        account: message.mailbox.account.name,
        name: from,
        email: message.fromAddress,
        subject: message.subject || "(no subject)",
        preview: previewText(message.textBody || message.subject || ""),
        time: message.receivedAt.toISOString(),
        initials: initials(from),
        color: senderColor(message.fromAddress || from),
        unread: !message.isRead,
        starred: message.isStarred,
        attachment: attachments[0]?.filename ?? null,
      };
    }),
    total,
    unreadTotal,
    nextOffset: hasMore ? offset + PAGE_SIZE : null,
    previousOffset: offset > 0 ? Math.max(0, offset - PAGE_SIZE) : null,
  });
}
