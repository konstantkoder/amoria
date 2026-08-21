import { isIP } from "node:net";

export type ParsedIpAddress = {
  version: 4 | 6;
  bits: 32 | 128;
  value: bigint;
};

export type ParsedCidr = ParsedIpAddress & {
  prefix: number;
  source: string;
};

function parseIpv4(value: string): bigint {
  return value.split(".").reduce((result, octet) => (result << 8n) | BigInt(Number(octet)), 0n);
}

function parseIpv6(value: string): bigint {
  let normalized = value.toLowerCase();
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const ipv4 = normalized.slice(separator + 1);
    const ipv4Value = parseIpv4(ipv4);
    normalized = `${normalized.slice(0, separator)}:${(ipv4Value >> 16n).toString(16)}:${(ipv4Value & 0xffffn).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) throw new Error("Invalid IPv6 address");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    throw new Error("Invalid IPv6 address");
  }
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => "0"), ...right];
  if (groups.length !== 8) throw new Error("Invalid IPv6 address");
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group || "0"}`), 0n);
}

export function parseIpAddress(input: string): ParsedIpAddress {
  const withoutZone = input.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(withoutZone);
  if (version === 4) return { version: 4, bits: 32, value: parseIpv4(withoutZone) };
  if (version !== 6) throw new Error(`Invalid IP address: ${input}`);

  const value = parseIpv6(withoutZone);
  const mappedPrefix = 0xffffn;
  if ((value >> 32n) === mappedPrefix) {
    return { version: 4, bits: 32, value: value & 0xffffffffn };
  }
  return { version: 6, bits: 128, value };
}

export function parseCidr(input: string): ParsedCidr {
  const normalized = input.trim();
  const parts = normalized.split("/");
  if (parts.length !== 2 || !/^\d{1,3}$/u.test(parts[1] ?? "")) {
    throw new Error(`Invalid CIDR: ${input}`);
  }
  const address = parseIpAddress(parts[0] ?? "");
  const prefix = Number(parts[1]);
  if (prefix < 0 || prefix > address.bits) throw new Error(`Invalid CIDR prefix: ${input}`);
  const hostBits = BigInt(address.bits - prefix);
  const network = hostBits === 0n ? address.value : (address.value >> hostBits) << hostBits;
  if (network !== address.value) throw new Error(`CIDR must use its canonical network address: ${input}`);
  return { ...address, prefix, source: normalized };
}

export function ipMatchesCidr(ip: ParsedIpAddress, cidr: ParsedCidr): boolean {
  if (ip.version !== cidr.version) return false;
  const hostBits = BigInt(ip.bits - cidr.prefix);
  return hostBits === 0n ? ip.value === cidr.value : (ip.value >> hostBits) === (cidr.value >> hostBits);
}

export function isLoopbackAddress(input: string): boolean {
  const ip = parseIpAddress(input);
  if (ip.version === 4) return (ip.value >> 24n) === 127n;
  return ip.value === 1n;
}
