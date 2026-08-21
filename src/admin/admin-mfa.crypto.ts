import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { decodeAdminMfaEncryptionKey, env } from "../config/env";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const ADMIN_OPAQUE_TOKEN_BYTES = 32;
export const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 20;
const encryptionKey = decodeAdminMfaEncryptionKey(env.ADMIN_MFA_ENCRYPTION_KEY);

export type EncryptedTotpSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export function encodeBase32(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/u, "");
  if (!normalized || !/^[A-Z2-7]+$/u.test(normalized)) throw new Error("Invalid base32 value");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function encryptTotpSecret(secret: string, adminUserId: string, keyVersion = 1): EncryptedTotpSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(Buffer.from(`amoria-admin-mfa:${adminUserId}:${keyVersion}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

export function decryptTotpSecret(input: EncryptedTotpSecret, adminUserId: string): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(input.iv, "base64"));
  decipher.setAAD(Buffer.from(`amoria-admin-mfa:${adminUserId}:${input.keyVersion}`, "utf8"));
  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function totpCounter(at: Date | number = Date.now()): number {
  const milliseconds = at instanceof Date ? at.getTime() : at;
  return Math.floor(milliseconds / 1000 / TOTP_PERIOD_SECONDS);
}

export function generateTotpCode(secret: string, counter: number): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** TOTP_DIGITS);
  return binary.toString().padStart(TOTP_DIGITS, "0");
}

export function findMatchingTotpCounter(
  secret: string,
  code: string,
  now = new Date(),
  window = 1,
): number | undefined {
  if (!/^\d{6}$/u.test(code)) return undefined;
  const supplied = Buffer.from(code, "utf8");
  const current = totpCounter(now);
  const matches: number[] = [];
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = current + offset;
    const expected = Buffer.from(generateTotpCode(secret, counter), "utf8");
    if (timingSafeEqual(supplied, expected)) matches.push(counter);
  }
  return matches.sort((a, b) => b - a)[0];
}

export function buildOtpAuthUri(secret: string, email: string): string {
  const issuer = "Amoria Admin";
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateOpaqueToken(): string {
  return randomBytes(ADMIN_OPAQUE_TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function separatedHmacKey(purpose: string): Buffer {
  return createHmac("sha256", encryptionKey).update(`amoria-admin-mfa:${purpose}:v1`, "utf8").digest();
}

export function hashSecurityContext(kind: "ip" | "user-agent", value: string | undefined): string | null {
  if (!value) return null;
  return createHmac("sha256", separatedHmacKey("pre-auth-context"))
    .update(kind, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = encodeBase32(randomBytes(RECOVERY_CODE_BYTES));
    return raw.match(/.{1,4}/gu)?.join("-") ?? raw;
  });
}

export function normalizeRecoveryCode(value: string): string | undefined {
  const normalized = value.trim().toUpperCase().replace(/[-\s]/gu, "");
  return /^[A-Z2-7]{32}$/u.test(normalized) ? normalized : undefined;
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return createHmac("sha256", separatedHmacKey("recovery-codes")).update("invalid").digest("hex");
  return createHmac("sha256", separatedHmacKey("recovery-codes")).update(normalized, "utf8").digest("hex");
}
