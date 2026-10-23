import { ImapFlow, type ListResponse, type MessageStructureObject } from "imapflow";
import { isIP } from "node:net";
import { simpleParser } from "mailparser";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { folderRole } from "@/lib/mail";
import { normalizeHost, publicAddresses } from "@/lib/outbound";
import { descendingUidBatch } from "@/lib/sync-cursor";

const MAX_RAW_BYTES = 6 * 1024 * 1024;
const MAX_BODY_CHARS = 500_000;
const NEW_BATCH_SIZE = 10;
const RECENT_BATCH_SIZE = 10;
const BACKFILL_BATCH_SIZE = 5;

function attachmentParts(node: MessageStructureObject | undefined, result: Map<string, { filename: string; contentType: string; size: number }>) {
  if (!node) return;
  const isAttachment = node.disposition?.toLowerCase() === "attachment" || Boolean(node.dispositionParameters?.filename);
  if (isAttachment && node.part) {
    result.set(node.part, {
      filename: node.dispositionParameters?.filename || "attachment",
      contentType: node.type || "application/octet-stream",
      size: node.size || 0,
    });
  }
  for (const child of node.childNodes ?? []) attachmentParts(child, result);
}

function toAddresses(value: { value: Array<{ name: string; address?: string }> } | Array<{ value: Array<{ name: string; address?: string }> }> | undefined) {
  const groups = value ? Array.isArray(value) ? value : [value] : [];
  return groups.flatMap((group) => group.value.map((item) => ({ name: item.name, address: item.address ?? "" })));
}

async function syncMailbox(client: ImapFlow, accountId: string, listed: ListResponse) {
  if (listed.flags.has("\\Noselect")) return;
  const lock = await client.getMailboxLock(listed.path, { readOnly: true });
  try {
    const mailboxState = client.mailbox;
    if (!mailboxState) return;
    const uidValidity = mailboxState.uidValidity;
    let mailbox = await prisma.mailbox.findUnique({ where: { accountId_path: { accountId, path: listed.path } } });
    let shouldReconcileAll = !mailbox || !mailbox.lastFullReconcileAt || Date.now() - mailbox.lastFullReconcileAt.getTime() > 24 * 60 * 60 * 1000;
    if (!mailbox) {
      const initialUid = BigInt(Math.max(0, mailboxState.uidNext - 1));
      mailbox = await prisma.mailbox.create({
        data: { accountId, path: listed.path, name: listed.name, specialUse: listed.specialUse ?? null, role: folderRole(listed.specialUse ?? null, listed.path), uidValidity, highestUid: initialUid, backfillBeforeUid: initialUid, backfillComplete: initialUid === BigInt(0), recentBeforeUid: initialUid, recentComplete: initialUid === BigInt(0) },
      });
    } else {
      if (mailbox.uidValidity !== uidValidity) {
        await prisma.message.deleteMany({ where: { mailboxId: mailbox.id } });
        shouldReconcileAll = true;
        const initialUid = BigInt(Math.max(0, mailboxState.uidNext - 1));
        mailbox = await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: { uidValidity, highestUid: initialUid, backfillBeforeUid: initialUid, backfillComplete: initialUid === BigInt(0), recentBeforeUid: initialUid, recentComplete: initialUid === BigInt(0), name: listed.name, specialUse: listed.specialUse ?? null, role: folderRole(listed.specialUse ?? null, listed.path) },
        });
      } else {
        mailbox = await prisma.mailbox.update({ where: { id: mailbox.id }, data: { name: listed.name, specialUse: listed.specialUse ?? null, role: folderRole(listed.specialUse ?? null, listed.path) } });
      }
    }

    if (mailbox.backfillBeforeUid === null && !mailbox.backfillComplete) {
      const initialUid = BigInt(Math.max(0, mailboxState.uidNext - 1));
      mailbox = await prisma.mailbox.update({ where: { id: mailbox.id }, data: { highestUid: mailbox.highestUid === BigInt(0) ? initialUid : mailbox.highestUid, backfillBeforeUid: initialUid, backfillComplete: initialUid === BigInt(0), recentBeforeUid: initialUid, recentComplete: initialUid === BigInt(0) } });
    }
    let highestUid = mailbox.highestUid;
    const foundNewUids = mailbox.highestUid > BigInt(0)
      ? await client.search({ uid: `${mailbox.highestUid + BigInt(1)}:*` }, { uid: true })
      : await client.search({ uid: "1:*" }, { uid: true });
    const newUids = Array.isArray(foundNewUids) ? foundNewUids : [];
    const newBatch = newUids.slice(0, NEW_BATCH_SIZE);
    const recentCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const foundRecentUids = mailbox.recentComplete || mailbox.recentBeforeUid === BigInt(0)
      ? null
      : await client.search({ uid: `1:${mailbox.recentBeforeUid}`, since: recentCutoff }, { uid: true });
    const recentUids = Array.isArray(foundRecentUids) ? foundRecentUids : [];
    const recentPage = descendingUidBatch(recentUids, RECENT_BATCH_SIZE);
    const recentBatch = recentPage.batch;
    let historicalBatch: number[] = [];
    let historicalComplete = true;
    if (!mailbox.backfillComplete && mailbox.backfillBeforeUid !== null && mailbox.backfillBeforeUid > BigInt(0)) {
      const beforeCursor = await client.search({ uid: `1:${mailbox.backfillBeforeUid}`, before: recentCutoff }, { uid: true });
      const candidates = Array.isArray(beforeCursor) ? beforeCursor : [];
      const historicalPage = descendingUidBatch(candidates, BACKFILL_BATCH_SIZE);
      historicalBatch = historicalPage.batch;
      historicalComplete = historicalPage.complete;
    }
    const batchUids = [...new Set([...newBatch, ...recentBatch, ...historicalBatch])].sort((a, b) => a - b);
    let backfillBeforeUid = mailbox.backfillBeforeUid;
    let backfillComplete = mailbox.backfillComplete;
    let recentBeforeUid = mailbox.recentBeforeUid;
    let recentComplete = mailbox.recentComplete;
    if (batchUids.length) for await (const message of client.fetch(batchUids, { uid: true, flags: true, internalDate: true, envelope: true, bodyStructure: true, headers: true, source: { maxLength: MAX_RAW_BYTES } }, { uid: true })) {
      if (!message.uid) continue;
      const uid = BigInt(message.uid);
      if (uid > highestUid) highestUid = uid;
      if (!message.source) continue;
      const parsed = await simpleParser(message.source, { maxHtmlLengthToParse: 500_000, maxHeadSize: 256_000, maxChildNodes: 500, keepCidLinks: true });
      const from = parsed.from?.value[0];
      const subject = parsed.subject ?? message.envelope?.subject ?? "(no subject)";
      const bodyText = (parsed.text || "").slice(0, MAX_BODY_CHARS);
      const html = typeof parsed.html === "string" ? parsed.html.slice(0, MAX_BODY_CHARS) : "";
      const attachmentMap = new Map<string, { filename: string; contentType: string; size: number }>();
      attachmentParts(message.bodyStructure, attachmentMap);
      const attachmentMeta = parsed.attachments.map((attachment) => {
        const part = attachment.partId ? attachmentMap.get(attachment.partId) : undefined;
        return {
          filename: (attachment.filename || part?.filename || "attachment").slice(0, 255),
          contentType: (attachment.contentType || part?.contentType || "application/octet-stream").slice(0, 160),
          size: attachment.size || part?.size || 0,
          partId: attachment.partId,
        };
      });
      const flags = message.flags ?? new Set<string>();
      const existing = await prisma.message.findUnique({ where: { mailboxId_uid: { mailboxId: mailbox.id, uid } }, select: { id: true, localReadOverride: true, localStarOverride: true } });
      const update = {
        messageId: parsed.messageId ?? message.envelope?.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? message.envelope?.inReplyTo ?? null,
        references: (Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []).slice(0, 50),
        subject: subject.slice(0, 998),
        fromName: (from?.name || from?.address || "Unknown sender").slice(0, 255),
        fromAddress: (from?.address || "").slice(0, 254),
        toAddresses: toAddresses(parsed.to) as object,
        ccAddresses: toAddresses(parsed.cc) as object,
        sentAt: parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : (message.envelope?.date instanceof Date ? message.envelope.date : null),
        receivedAt: message.internalDate instanceof Date
          ? message.internalDate
          : typeof message.internalDate === "string" && !Number.isNaN(new Date(message.internalDate).getTime())
            ? new Date(message.internalDate)
            : new Date(),
        textBody: bodyText,
        htmlBody: html,
        isRead: existing?.localReadOverride ?? flags.has("\\Seen"),
        isStarred: existing?.localStarOverride ?? flags.has("\\Flagged"),
        hasAttachments: attachmentMeta.length > 0,
        attachmentMeta: attachmentMeta as object,
      };
      if (existing) await prisma.message.update({ where: { id: existing.id }, data: update });
      else await prisma.message.create({ data: { mailboxId: mailbox.id, uid, ...update } });
    }
    if (!mailbox.backfillComplete && mailbox.backfillBeforeUid !== null && mailbox.backfillBeforeUid > BigInt(0)) {
      if (historicalBatch.length) backfillBeforeUid = BigInt(Math.min(...historicalBatch)) - BigInt(1);
      else backfillComplete = true;
      if (historicalComplete || (backfillBeforeUid !== null && backfillBeforeUid <= BigInt(0))) backfillComplete = true;
    }
    if (!mailbox.recentComplete) {
      if (recentBatch.length) recentBeforeUid = BigInt(Math.min(...recentBatch)) - BigInt(1);
      if (recentPage.complete) recentComplete = true;
    }
    await prisma.mailbox.update({ where: { id: mailbox.id }, data: { highestUid, backfillBeforeUid, backfillComplete, recentBeforeUid, recentComplete, uidValidity, syncedAt: new Date() } });

    // Reconcile the IMAP flags for locally known messages without downloading their bodies again.
    const stored = await prisma.message.findMany({
      where: {
        mailboxId: mailbox.id,
        ...(shouldReconcileAll ? {} : {
          OR: [
            { uid: { gte: highestUid > BigInt(500) ? highestUid - BigInt(500) : BigInt(0) } },
            { localReadOverride: { not: null } },
            { localStarOverride: { not: null } },
          ],
        }),
      },
      select: { uid: true },
      orderBy: { uid: "asc" },
    });
    for (let start = 0; start < stored.length; start += 100) {
      const group = stored.slice(start, start + 100);
      const uidList = group.map((item) => Number(item.uid));
      if (!uidList.length) continue;
      for await (const message of client.fetch(uidList.join(","), { uid: true, flags: true }, { uid: true })) {
        const uid = BigInt(message.uid);
        const flags = message.flags ?? new Set<string>();
        await prisma.message.updateMany({ where: { mailboxId: mailbox.id, uid, localReadOverride: null }, data: { isRead: flags.has("\\Seen") } });
        await prisma.message.updateMany({ where: { mailboxId: mailbox.id, uid, localStarOverride: null }, data: { isStarred: flags.has("\\Flagged") } });
      }
      const foundUids = await client.search({ uid: uidList.join(",") }, { uid: true });
      const serverUids = new Set((Array.isArray(foundUids) ? foundUids : []).map((uid) => BigInt(uid)));
      const missing = group.filter((item) => !serverUids.has(item.uid)).map((item) => item.uid);
      if (missing.length) await prisma.message.deleteMany({ where: { mailboxId: mailbox.id, uid: { in: missing } } });
    }
    if (shouldReconcileAll) await prisma.mailbox.update({ where: { id: mailbox.id }, data: { lastFullReconcileAt: new Date() } });
  } finally {
    lock.release();
  }
}

export async function syncAccount(accountId: string, queuedRunId?: string) {
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Mail account no longer exists");
  const listedPaths = new Set<string>();
  const run = queuedRunId
    ? await prisma.syncRun.update({ where: { id: queuedRunId }, data: { status: "running", startedAt: new Date(), error: null } })
    : await prisma.syncRun.create({ data: { accountId, status: "running", startedAt: new Date() } });
  let client: ImapFlow | null = null;
  try {
    const resolvedAddresses = await publicAddresses(account.imapHost);
    client = new ImapFlow({
      host: resolvedAddresses[0].address,
      port: account.imapPort,
      secure: account.imapSecure,
      doSTARTTLS: !account.imapSecure,
      servername: isIP(normalizeHost(account.imapHost)) ? undefined : normalizeHost(account.imapHost),
      auth: { user: account.imapUsername, pass: decryptSecret(account.imapPasswordCipher) },
      logger: false,
      maxLineLength: 1024 * 1024,
      maxLiteralSize: MAX_RAW_BYTES,
      maxResponseSize: MAX_RAW_BYTES + 1024 * 1024,
      maxResponseTokens: 200_000,
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 60000,
    });
    await client.connect();
    const mailboxes = await client.list();
    for (const listed of mailboxes) {
      if (listed.flags.has("\\Noselect")) continue;
      listedPaths.add(listed.path);
      await syncMailbox(client, accountId, listed);
    }
    if (listedPaths.size) await prisma.mailbox.deleteMany({ where: { accountId, path: { notIn: [...listedPaths] } } });
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "completed", endedAt: new Date() } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Mailbox synchronization failed";
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "failed", endedAt: new Date(), error: message } });
    throw error;
  } finally {
    if (client) {
      try { await client.logout(); } catch { try { await client.close(); } catch { /* already disconnected */ } }
    }
  }
}
