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

if (objectStorageProvider !== "s3") {
  throw new Error("OBJECT_STORAGE_PROVIDER must be s3");
}

if (jwtSecret.length < 16) {
  throw new Error("JWT_SECRET must be at least 16 characters long");
}

if (nodeEnv === "production" && jwtSecret.startsWith("change-me")) {
  throw new Error("JWT_SECRET must be changed for production");
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
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
};
