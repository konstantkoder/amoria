import { createHash, createHmac } from "node:crypto";
import { extractUrlHosts } from "./text-validation";

const zeroWidthPattern = /[\u200B-\u200D\u2060\uFEFF]/gu;
const urlPattern = /(?:https?:\/\/|www\.)[^\s<>{}\[\]]+/giu;

export type MessageFingerprints = {
  exactFingerprint: string;
  similarityHash: string;
  linkFingerprint: string | null;
  normalized: string;
  urlCount: number;
};

export function fingerprintMessage(text: string, secret: string): MessageFingerprints {
  const hosts = extractUrlHosts(text);
  const normalized = normalizeForAbuse(text);
  return {
    exactFingerprint: hmac(secret, `exact\0${normalized}`),
    similarityHash: simHash64(normalized),
    linkFingerprint: hosts.length > 0
      ? hmac(secret, `links\0${[...new Set(hosts)].sort().join("\0")}`)
      : null,
    normalized,
    urlCount: hosts.length,
  };
}

export function normalizeForAbuse(text: string): string {
  return text
    .normalize("NFKC")
    .replace(zeroWidthPattern, "")
    .toLocaleLowerCase("und")
    .replace(urlPattern, " <url> ")
    .replace(/\p{N}+/gu, " <n> ")
    .replace(/([!?.,])\1+/gu, "$1")
    .replace(/([^\s])\1{3,}/gu, "$1$1")
    .replace(/[^\p{L}\p{N}<>]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function hammingDistance64(leftHex: string, rightHex: string): number {
  let value = BigInt(`0x${leftHex}`) ^ BigInt(`0x${rightHex}`);
  let count = 0;
  while (value > 0n) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

function simHash64(value: string): string {
  const grams = characterTrigrams(value);
  const weights = new Int32Array(64);
  for (const gram of grams) {
    const digest = createHash("sha256").update(gram, "utf8").digest();
    const bits = digest.readBigUInt64BE(0);
    for (let bit = 0; bit < 64; bit += 1) {
      weights[bit] += (bits & (1n << BigInt(bit))) === 0n ? -1 : 1;
    }
  }
  let output = 0n;
  for (let bit = 0; bit < 64; bit += 1) {
    if (weights[bit] >= 0) output |= 1n << BigInt(bit);
  }
  return output.toString(16).padStart(16, "0");
}

function characterTrigrams(value: string): string[] {
  const padded = `  ${value}  `;
  if (padded.length <= 3) return [padded];
  const grams: string[] = [];
  for (let index = 0; index <= padded.length - 3; index += 1) {
    grams.push(padded.slice(index, index + 3));
  }
  return grams.slice(0, 512);
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}
