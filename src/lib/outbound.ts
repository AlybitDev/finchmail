import { lookup } from "node:dns/promises";
import { createConnection, isIP, type Socket } from "node:net";
import { connect as tlsConnect, type ConnectionOptions } from "node:tls";
import { isPrivateAddress } from "@/lib/net";

export function normalizeHost(host: string) {
  return host.trim().replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

export function isAllowedMailHost(host: string) {
  const normalized = normalizeHost(host);
  if (process.env.ALLOW_PRIVATE_MAIL_HOSTS === "true") return true;
  return normalized !== "localhost" && !normalized.endsWith(".localhost") && !normalized.endsWith(".local") && !normalized.endsWith(".internal");
}

export async function publicAddresses(host: string) {
  const normalized = normalizeHost(host);
  if (!isAllowedMailHost(host)) {
    throw new Error("Local mail hosts are disabled");
  }
  if (process.env.ALLOW_PRIVATE_MAIL_HOSTS === "true") {
    const addresses = isIP(normalized)
      ? [{ address: normalized, family: isIP(normalized) }]
      : await lookup(normalized, { all: true, verbatim: true });
    if (!addresses.length) throw new Error("Mail server did not resolve");
    return addresses;
  }
  const addresses = isIP(normalized)
    ? [{ address: normalized, family: isIP(normalized) }]
    : await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address, entry.family))) {
    throw new Error("Mail server must resolve only to public IP addresses");
  }
  return addresses;
}

export async function connectPinnedSocket(host: string, port: number, secure: boolean, pinnedAddresses?: Array<{ address: string; family: number }>) {
  const servername = isIP(normalizeHost(host)) ? undefined : normalizeHost(host);
  const addresses = pinnedAddresses ?? await publicAddresses(host);
  if (process.env.ALLOW_PRIVATE_MAIL_HOSTS !== "true" && addresses.some((entry) => isPrivateAddress(entry.address, entry.family))) {
    throw new Error("Mail server resolved to a private network address");
  }
  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await new Promise<Socket | import("node:tls").TLSSocket>((resolve, reject) => {
        const socket: Socket | import("node:tls").TLSSocket = secure
          ? tlsConnect({ host: address.address, port, ...(servername ? { servername } : {}) })
          : createConnection({ host: address.address, port });
        const event = secure ? "secureConnect" : "connect";
        const onError = (error: Error) => { socket.removeListener(event, onConnect); reject(error); };
        const onConnect = () => { socket.removeListener("error", onError); resolve(socket); };
        socket.once("error", onError);
        socket.once(event, onConnect);
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not connect to mail server");
}

export async function verifySmtpWithPinnedAddress(config: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}, callback: (error: Error | null, socket: false | { connection: Socket | import("node:tls").TLSSocket; secured: boolean }) => void) {
  try {
    const addresses = await publicAddresses(config.host);
    const servername = isIP(normalizeHost(config.host)) ? undefined : normalizeHost(config.host);
    const connection = await new Promise<Socket | import("node:tls").TLSSocket>((resolve, reject) => {
      const address = addresses[0];
      const socket: Socket | import("node:tls").TLSSocket = config.secure
        ? tlsConnect({ host: address.address, port: config.port, ...(servername ? { servername } : {}) } satisfies ConnectionOptions)
        : createConnection({ host: address.address, port: config.port });
      const event = config.secure ? "secureConnect" : "connect";
      const onError = (error: Error) => { socket.removeListener(event, onConnect); reject(error); };
      const onConnect = () => { socket.removeListener("error", onError); resolve(socket); };
      socket.once("error", onError);
      socket.once(event, onConnect);
    });
    callback(null, { connection, secured: config.secure });
  } catch (error) {
    callback(error instanceof Error ? error : new Error("Mail server connection failed"), false);
  }
}
