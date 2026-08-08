import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return parsed;
}

function parsePositiveInteger(name: string, value: string, minimum = 1): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

function parseBooleanFlag(name: string, value: string): boolean {
  if (["1", "true", "yes"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} must be one of 1, 0, true, false, yes, or no`);
}

type PublicUrlValidationInput = {
  nodeEnv: string;
  allowLocalPublicUrls: boolean;
  publicApiUrl: string;
  publicMediaUrl: string;
  s3PublicBaseUrl: string;
  s3Endpoint?: string;
};

export function validatePublicUrlEnv(input: PublicUrlValidationInput): void {
  if (input.nodeEnv === "production" && input.allowLocalPublicUrls) {
    throw new Error("ALLOW_LOCAL_PUBLIC_URLS can only be true in development or test");
  }

  if (input.nodeEnv !== "production") {
    return;
  }

  validateProductionPublicUrl("PUBLIC_API_URL", input.publicApiUrl);
  validateProductionPublicUrl("PUBLIC_MEDIA_URL", input.publicMediaUrl);
  validateProductionPublicUrl("S3_PUBLIC_BASE_URL", input.s3PublicBaseUrl);
}

export function validateProductionPublicUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use https in production`);
  }

  const hostname = url.hostname.trim().toLowerCase();
  if (isLocalOrPrivatePublicHostname(hostname)) {
    throw new Error(`${name} must not point to localhost, private IPs, or minio in production`);
  }
}

function isLocalOrPrivatePublicHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.includes("minio")
  ) {
    return true;
  }

  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet, index) => !Number.isInteger(octet) || String(octet) !== parts[index] || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

const nodeEnv = optional("NODE_ENV", "development");
const publicApiUrl = optional("PUBLIC_API_URL", "http://localhost:4000").replace(/\/+$/, "");
const publicMediaUrl = optional("PUBLIC_MEDIA_URL", `${publicApiUrl}/media`).replace(/\/+$/, "");
const uploadsDir = optional("UPLOADS_DIR", "./uploads");
const jwtSecret = required("JWT_SECRET");
const objectStorageProvider = optional("OBJECT_STORAGE_PROVIDER", "s3");
const s3Endpoint = optional("S3_ENDPOINT", "http://localhost:9000");
const s3PublicBaseUrl = optional("S3_PUBLIC_BASE_URL", "http://localhost:9000/amoria").replace(
  /\/+$/,
  "",
);
const allowLocalPublicUrls = parseBooleanFlag(
  "ALLOW_LOCAL_PUBLIC_URLS",
  optional("ALLOW_LOCAL_PUBLIC_URLS", "false"),
);
const authSecurityHmacSecret = process.env.AUTH_SECURITY_HMAC_SECRET?.trim()
  || (nodeEnv === "production" ? "" : "development-only-auth-security-hmac-secret");
const smtpHost = process.env.SMTP_HOST?.trim()
  || (nodeEnv === "production" ? "" : "localhost");
const mailFrom = process.env.MAIL_FROM?.trim()
  || (nodeEnv === "production" ? "" : "no-reply@amoria.local");

if (objectStorageProvider !== "s3") {
  throw new Error("OBJECT_STORAGE_PROVIDER must be s3");
}

if (jwtSecret.length < 16) {
  throw new Error("JWT_SECRET must be at least 16 characters long");
}

if (nodeEnv === "production" && jwtSecret.startsWith("change-me")) {
  throw new Error("JWT_SECRET must be changed for production");
}

if (authSecurityHmacSecret.length < 32) {
  throw new Error("AUTH_SECURITY_HMAC_SECRET must be at least 32 characters long");
}

if (!smtpHost) {
  throw new Error("SMTP_HOST is required in production");
}

if (!mailFrom) {
  throw new Error("MAIL_FROM is required in production");
}

validatePublicUrlEnv({
  nodeEnv,
  allowLocalPublicUrls,
  publicApiUrl,
  publicMediaUrl,
  s3PublicBaseUrl,
  s3Endpoint,
});

export const env = {
  NODE_ENV: nodeEnv,
  PORT: parsePort(optional("PORT", "4000")),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: jwtSecret,
  AUTH_SECURITY_HMAC_SECRET: authSecurityHmacSecret,
  PUBLIC_API_URL: publicApiUrl,
  PUBLIC_MEDIA_URL: publicMediaUrl,
  ALLOW_LOCAL_PUBLIC_URLS: allowLocalPublicUrls,
  UPLOADS_DIR: uploadsDir,
  UPLOADS_ROOT: path.resolve(process.cwd(), uploadsDir),
  OBJECT_STORAGE_PROVIDER: objectStorageProvider,
  S3_ENDPOINT: s3Endpoint,
  S3_REGION: optional("S3_REGION", "us-east-1"),
  S3_ACCESS_KEY: optional("S3_ACCESS_KEY", "minioadmin"),
  S3_SECRET_KEY: optional("S3_SECRET_KEY", "minioadmin"),
  S3_BUCKET: optional("S3_BUCKET", "amoria"),
  S3_PUBLIC_BASE_URL: s3PublicBaseUrl,
  S3_FORCE_PATH_STYLE: parseBooleanFlag("S3_FORCE_PATH_STYLE", optional("S3_FORCE_PATH_STYLE", "1")),
  SMTP_HOST: smtpHost,
  SMTP_PORT: parsePort(optional("SMTP_PORT", "1025")),
  SMTP_SECURE: parseBooleanFlag("SMTP_SECURE", optional("SMTP_SECURE", "false")),
  SMTP_USER: process.env.SMTP_USER?.trim() || undefined,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || undefined,
  SMTP_CONNECTION_TIMEOUT_MS: parsePositiveInteger(
    "SMTP_CONNECTION_TIMEOUT_MS",
    optional("SMTP_CONNECTION_TIMEOUT_MS", "5000"),
  ),
  MAIL_FROM: mailFrom,
  MAIL_FROM_NAME: optional("MAIL_FROM_NAME", "Amoria"),
  EMAIL_CHALLENGE_TTL_SEC: parsePositiveInteger(
    "EMAIL_CHALLENGE_TTL_SEC",
    optional("EMAIL_CHALLENGE_TTL_SEC", "900"),
  ),
  EMAIL_CHALLENGE_MAX_ATTEMPTS: parsePositiveInteger(
    "EMAIL_CHALLENGE_MAX_ATTEMPTS",
    optional("EMAIL_CHALLENGE_MAX_ATTEMPTS", "5"),
  ),
  EMAIL_RESEND_COOLDOWN_SEC: parsePositiveInteger(
    "EMAIL_RESEND_COOLDOWN_SEC",
    optional("EMAIL_RESEND_COOLDOWN_SEC", "60"),
  ),
  EMAIL_DOMAIN_DNS_TIMEOUT_MS: parsePositiveInteger(
    "EMAIL_DOMAIN_DNS_TIMEOUT_MS",
    optional("EMAIL_DOMAIN_DNS_TIMEOUT_MS", "2500"),
  ),
  EMAIL_DOMAIN_CACHE_TTL_SEC: parsePositiveInteger(
    "EMAIL_DOMAIN_CACHE_TTL_SEC",
    optional("EMAIL_DOMAIN_CACHE_TTL_SEC", "21600"),
  ),
  DISPOSABLE_EMAIL_DOMAIN_OVERRIDES: optional("DISPOSABLE_EMAIL_DOMAIN_OVERRIDES", ""),
  AUTH_RATE_LIMIT_RETENTION_HOURS: parsePositiveInteger(
    "AUTH_RATE_LIMIT_RETENTION_HOURS",
    optional("AUTH_RATE_LIMIT_RETENTION_HOURS", "168"),
  ),
  REGISTER_EMAIL_LIMIT: parsePositiveInteger("REGISTER_EMAIL_LIMIT", optional("REGISTER_EMAIL_LIMIT", "3")),
  REGISTER_IP_LIMIT: parsePositiveInteger("REGISTER_IP_LIMIT", optional("REGISTER_IP_LIMIT", "10")),
  REGISTER_DEVICE_LIMIT: parsePositiveInteger("REGISTER_DEVICE_LIMIT", optional("REGISTER_DEVICE_LIMIT", "5")),
  LOGIN_EMAIL_FAILURE_LIMIT: parsePositiveInteger("LOGIN_EMAIL_FAILURE_LIMIT", optional("LOGIN_EMAIL_FAILURE_LIMIT", "5")),
  LOGIN_IP_FAILURE_LIMIT: parsePositiveInteger("LOGIN_IP_FAILURE_LIMIT", optional("LOGIN_IP_FAILURE_LIMIT", "20")),
  LOGIN_DEVICE_FAILURE_LIMIT: parsePositiveInteger("LOGIN_DEVICE_FAILURE_LIMIT", optional("LOGIN_DEVICE_FAILURE_LIMIT", "10")),
  RESEND_EMAIL_LIMIT: parsePositiveInteger("RESEND_EMAIL_LIMIT", optional("RESEND_EMAIL_LIMIT", "5")),
  RESEND_IP_LIMIT: parsePositiveInteger("RESEND_IP_LIMIT", optional("RESEND_IP_LIMIT", "20")),
  RESEND_DEVICE_LIMIT: parsePositiveInteger("RESEND_DEVICE_LIMIT", optional("RESEND_DEVICE_LIMIT", "10")),
  RESET_EMAIL_LIMIT: parsePositiveInteger("RESET_EMAIL_LIMIT", optional("RESET_EMAIL_LIMIT", "3")),
  RESET_IP_LIMIT: parsePositiveInteger("RESET_IP_LIMIT", optional("RESET_IP_LIMIT", "20")),
  RESET_DEVICE_LIMIT: parsePositiveInteger("RESET_DEVICE_LIMIT", optional("RESET_DEVICE_LIMIT", "10")),
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
};
