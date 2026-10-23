import { ImapFlow } from "imapflow";
import { isIP } from "node:net";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { csrfCookieMatches, forbiddenOrigin, isSameOrigin, unauthorized } from "@/lib/request";
import { accountSchema } from "@/lib/schemas";
import { authenticatedUser } from "@/lib/request";
import { normalizeHost, publicAddresses, verifySmtpWithPinnedAddress } from "@/lib/outbound";

export const runtime = "nodejs";

async function assertPublicMailHost(host: string) {
  await publicAddresses(host);
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  const accounts = await prisma.mailAccount.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, email: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ accounts });
}

async function verifyImap(config: { host: string; port: number; secure: boolean; user: string; pass: string }) {
  const resolvedAddresses = await publicAddresses(config.host);
  const client = new ImapFlow({
    host: resolvedAddresses[0].address,
    port: config.port,
    secure: config.secure,
    doSTARTTLS: !config.secure,
    servername: isIP(normalizeHost(config.host)) ? undefined : normalizeHost(config.host),
    auth: { user: config.user, pass: config.pass },
    logger: false,
    maxLineLength: 1024 * 1024,
    maxLiteralSize: 6 * 1024 * 1024,
    maxResponseSize: 8 * 1024 * 1024,
    maxResponseTokens: 200_000,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
  });
  try {
    await client.connect();
    await client.logout();
  } catch (error) {
    try { await client.close(); } catch { /* connection may never have opened */ }
    throw error;
  }
}

async function verifySmtp(config: { host: string; port: number; secure: boolean; user: string; pass: string }) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    tls: { ...(isIP(normalizeHost(config.host)) ? {} : { servername: normalizeHost(config.host) }) },
    getSocket: (_options, callback) => { void verifySmtpWithPinnedAddress(config, callback); },
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request) || !csrfCookieMatches(request)) return forbiddenOrigin();
  const user = await authenticatedUser();
  if (!user) return unauthorized();
  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch {
    return jsonError("Send account details as JSON.");
  }
  const parsed = accountSchema.safeParse(payload);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Check the account details.");

  const existing = await prisma.mailAccount.findUnique({ where: { userId_email: { userId: user.id, email: parsed.data.email } } });
  if (existing) return jsonError("That email account is already connected.", 409);

  try {
    await Promise.all([assertPublicMailHost(parsed.data.imapHost), assertPublicMailHost(parsed.data.smtpHost)]);
  } catch {
    return jsonError("Mail servers must resolve only to public IP addresses.");
  }

  try {
    await verifyImap({ host: parsed.data.imapHost, port: parsed.data.imapPort, secure: parsed.data.imapSecure, user: parsed.data.imapUsername, pass: parsed.data.imapPassword });
  } catch {
    return jsonError("Could not connect to IMAP. Check the host, port, TLS mode, username, and password.");
  }
  try {
    await verifySmtp({ host: parsed.data.smtpHost, port: parsed.data.smtpPort, secure: parsed.data.smtpSecure, user: parsed.data.smtpUsername, pass: parsed.data.smtpPassword });
  } catch {
    return jsonError("IMAP worked, but SMTP could not be verified. Check its host, port, TLS mode, username, and password.");
  }

  try {
    const account = await prisma.mailAccount.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        email: parsed.data.email,
        imapHost: parsed.data.imapHost,
        imapPort: parsed.data.imapPort,
        imapSecure: parsed.data.imapSecure,
        imapUsername: parsed.data.imapUsername,
        imapPasswordCipher: encryptSecret(parsed.data.imapPassword),
        smtpHost: parsed.data.smtpHost,
        smtpPort: parsed.data.smtpPort,
        smtpSecure: parsed.data.smtpSecure,
        smtpUsername: parsed.data.smtpUsername,
        smtpPasswordCipher: encryptSecret(parsed.data.smtpPassword),
      },
      select: { id: true, name: true, email: true },
    });
    await prisma.syncRun.create({ data: { accountId: account.id, status: "queued" } });
    return NextResponse.json({ account }, { status: 201 });
  } catch {
    return jsonError("Could not save this account. Check the server encryption key and try again.", 500);
  }
}
