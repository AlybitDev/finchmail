import { isIP } from "node:net";

function ipv4Number(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + (octets[2] << 8) + octets[3]) >>> 0;
}

function ipv4InCidr(address: string, network: string, bits: number) {
  const ip = ipv4Number(address);
  const base = ipv4Number(network);
  if (ip === null || base === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function ipv6Bytes(address: string): number[] | null {
  let value = address.toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = ipv4Number(value.slice(lastColon + 1));
    if (ipv4 === null) return null;
    value = `${value.slice(0, lastColon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  if (value.includes("::")) {
    const halves = value.split("::");
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    value = [...left, ...Array(missing).fill("0"), ...right].join(":");
  }
  const groups = value.split(":");
  if (groups.length !== 8 || groups.some((part) => !/^[a-f\d]{1,4}$/.test(part))) return null;
  return groups.flatMap((part) => {
    const number = Number.parseInt(part, 16);
    return [(number >> 8) & 255, number & 255];
  });
}

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  const allZero = bytes.every((part) => part === 0);
  if (allZero || (bytes.slice(0, 15).every((part) => part === 0) && bytes[15] === 1)) return false;
  if (bytes.slice(0, 10).every((part) => part === 0) && bytes[10] === 255 && bytes[11] === 255) {
    return !isPrivateAddress(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`, 4);
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every((part) => part === 0)) {
    return !isPrivateAddress(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`, 4);
  }
  if ((bytes[0] & 0xfe) === 0xfc) return false;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false;
  if (bytes[0] === 0xff) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] <= 0x01) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return false;
  return (bytes[0] & 0xe0) === 0x20;
}

export function isPrivateAddress(address: string, family: number): boolean {
  const version = family || isIP(address);
  if (version === 4) {
    return [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ].some(([network, bits]) => ipv4InCidr(address, network as string, bits as number));
  }
  if (version === 6) return !isPublicIpv6(address);
  return true;
}
