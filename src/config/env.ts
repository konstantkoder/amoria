import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { parseCidr } from "../common/security/ip-cidr";

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

const unsafeProductionValueFragments = [
  "change-me",
  "changeme",
  "replace-with",
  "example",
  "development-only",
  "minioadmin",
  "amoria_password",
] as const;

function productionSecret(name: string, value: string, minimumLength = 32): string {
  if (value.length < minimumLength) {
    throw new Error(`${name} must be at least ${minimumLength} characters long in production`);
  }

  const normalized = value.toLowerCase();
  if (
    unsafeProductionValueFragments.some((fragment) => normalized.includes(fragment)) ||
    new Set(value).size < 8
  ) {
    throw new Error(`${name} must be a high-entropy non-sample value in production`);
  }

  return value;
}

export type AdminNetworkAccessMode = "development_local" | "private_cidr" | "disabled";

export function parseAdminNetworkAccessMode(value: string, nodeEnv: string): AdminNetworkAccessMode {
  const normalized = value.trim() || (nodeEnv === "production" ? "disabled" : "development_local");
  if (!(["development_local", "private_cidr", "disabled"] as const).includes(normalized as AdminNetworkAccessMode)) {
    throw new Error("ADMIN_NETWORK_ACCESS_MODE must be development_local, private_cidr, or disabled");
  }
  if (nodeEnv === "production" && normalized === "development_local") {
    throw new Error("ADMIN_NETWORK_ACCESS_MODE=development_local is forbidden in production");
  }
  return normalized as AdminNetworkAccessMode;
}

export function parseAdminAllowedCidrs(value: string, mode: AdminNetworkAccessMode): string[] {
  const cidrs = [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  if (mode === "private_cidr" && cidrs.length === 0) {
    throw new Error("ADMIN_ALLOWED_CIDRS is required for ADMIN_NETWORK_ACCESS_MODE=private_cidr");
  }
  if (mode !== "private_cidr" && cidrs.length > 0) {
    throw new Error("ADMIN_ALLOWED_CIDRS may only be set for ADMIN_NETWORK_ACCESS_MODE=private_cidr");
  }
  for (const cidr of cidrs) parseCidr(cidr);
  return cidrs;
}

export function decodeAdminMfaEncryptionKey(value: string): Buffer {
  const normalized = value.trim();
  let decoded: Buffer;
  if (/^[0-9a-f]{64}$/iu.test(normalized)) {
    decoded = Buffer.from(normalized, "hex");
  } else if (/^[A-Za-z0-9+/_-]+={0,2}$/u.test(normalized)) {
    decoded = Buffer.from(normalized.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } else {
    throw new Error("ADMIN_MFA_ENCRYPTION_KEY must be 32 bytes encoded as base64, base64url, or hex");
  }
  if (decoded.length !== 32) {
    throw new Error("ADMIN_MFA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return decoded;
}

export type TrustProxyConfiguration = false | number | string[];

export function parseTrustProxyConfiguration(
  value: string,
  nodeEnv: string,
): TrustProxyConfiguration {
  const normalized = value.trim();
  if (!normalized) {
    if (nodeEnv === "production") {
      throw new Error("TRUST_PROXY must identify the known reverse proxy in production");
    }
    return false;
  }

  if (["false", "0", "no"].includes(normalized.toLowerCase())) {
    if (nodeEnv === "production") {
      throw new Error("TRUST_PROXY cannot be disabled for the production reverse-proxy deployment");
    }
    return false;
  }

  if (["true", "*", "all"].includes(normalized.toLowerCase())) {
    throw new Error("TRUST_PROXY must not trust every proxy");
  }

  if (/^[1-9]\d*$/.test(normalized)) {
    const hops = Number.parseInt(normalized, 10);
    if (hops > 3) throw new Error("TRUST_PROXY hop count must be between 1 and 3");
    return hops;
  }

  const addresses = normalized.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!addresses.length || addresses.some((entry) => /\s/.test(entry))) {
    throw new Error("TRUST_PROXY must be a hop count or comma-separated proxy IP/CIDR list");
  }
  return addresses;
}

export function parseCorsAllowedOrigins(value: string, nodeEnv: string): string[] {
  const origins = [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  if (nodeEnv === "production" && origins.length === 0) {
    throw new Error("CORS_ALLOWED_ORIGINS must include the production Admin/Web origin");
  }

  for (const origin of origins) {
    if (origin === "*" || origin === "null") {
      throw new Error("CORS_ALLOWED_ORIGINS must not include wildcard or null origins");
    }
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("CORS_ALLOWED_ORIGINS entries must be valid origins");
    }
    if (url.origin !== origin || (nodeEnv === "production" && url.protocol !== "https:")) {
      throw new Error("CORS_ALLOWED_ORIGINS entries must be exact origins and use HTTPS in production");
    }
  }
  return origins;
}

function parsePositiveInteger(name: string, value: string, minimum = 1): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

function parseIntegerInRange(name: string, value: string, minimum: number, maximum: number): number {
  const parsed = parsePositiveInteger(name, value, minimum);
  if (parsed > maximum) {
    throw new Error(`${name} must be an integer less than or equal to ${maximum}`);
  }
  return parsed;
}

function parseProcessRole(value: string): "api" | "worker" | "all" {
  if (value === "api" || value === "worker" || value === "all") return value;
  throw new Error("AMORIA_PROCESS_ROLE must be api, worker, or all");
}

function parseTextModerationTransport(value: string): "local" | "http" {
  if (value === "local" || value === "http") return value;
  throw new Error("TEXT_MODERATION_TRANSPORT must be local or http");
}

function parsePublicMediaDeliveryMode(value: string): "proxy" | "presigned" {
  if (value === "proxy" || value === "presigned") return value;
  throw new Error("PUBLIC_MEDIA_DELIVERY_MODE must be proxy or presigned");
}

function optionalUrl(name: string, value: string, protocols: string[]): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}`);
  }
  return parsed.toString().replace(/\/$/, "");
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
const processRole = parseProcessRole(optional("AMORIA_PROCESS_ROLE", "all"));
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
const publicMediaDeliveryMode = parsePublicMediaDeliveryMode(
  optional("PUBLIC_MEDIA_DELIVERY_MODE", "proxy"),
);
const s3ForcePathStyle = parseBooleanFlag(
  "S3_FORCE_PATH_STYLE",
  optional("S3_FORCE_PATH_STYLE", "1"),
);
const authSecurityHmacSecret = process.env.AUTH_SECURITY_HMAC_SECRET?.trim()
  || (nodeEnv === "production" ? "" : "development-only-auth-security-hmac-secret");
const messageAbuseHmacSecret = process.env.MESSAGE_ABUSE_HMAC_SECRET?.trim()
  || (nodeEnv === "production" ? "" : authSecurityHmacSecret);
const adminMfaEncryptionKey = process.env.ADMIN_MFA_ENCRYPTION_KEY?.trim()
  || (nodeEnv === "production" ? "" : "YW1vcmlhLWFkbWluLW1mYS1sb2NhbC10ZXN0LWtleQA=");
const adminNetworkAccessMode = parseAdminNetworkAccessMode(
  optional("ADMIN_NETWORK_ACCESS_MODE", ""),
  nodeEnv,
);
const adminAllowedCidrs = parseAdminAllowedCidrs(
  optional("ADMIN_ALLOWED_CIDRS", ""),
  adminNetworkAccessMode,
);
const messageAbuseRetentionHours = parsePositiveInteger(
  "MESSAGE_ABUSE_RETENTION_HOURS",
  optional("MESSAGE_ABUSE_RETENTION_HOURS", "48"),
);
const textModerationEnabled = parseBooleanFlag(
  "TEXT_MODERATION_ENABLED",
  optional("TEXT_MODERATION_ENABLED", nodeEnv === "production" ? "true" : "false"),
);
const textModerationPython = process.env.TEXT_MODERATION_PYTHON?.trim() || undefined;
const textModerationModelDir = process.env.TEXT_MODERATION_MODEL_DIR?.trim() || undefined;
const textModerationTransport = parseTextModerationTransport(
  optional("TEXT_MODERATION_TRANSPORT", process.env.TEXT_MODERATION_SERVICE_URL ? "http" : "local"),
);
const textModerationServiceUrl = optionalUrl(
  "TEXT_MODERATION_SERVICE_URL",
  optional("TEXT_MODERATION_SERVICE_URL", ""),
  ["http:", "https:"],
);
const textModerationServiceToken = process.env.TEXT_MODERATION_SERVICE_TOKEN?.trim() || undefined;
const realtimeBusUrl = optionalUrl(
  "REALTIME_BUS_URL",
  optional("REALTIME_BUS_URL", ""),
  ["redis:", "rediss:"],
);
const metricsToken = process.env.METRICS_TOKEN?.trim() || undefined;
const workerMetricsHost = optional("WORKER_METRICS_HOST", "0.0.0.0");
const nearbySummaryCacheTtlMs = parseIntegerInRange(
  "NEARBY_SUMMARY_CACHE_TTL_MS",
  optional("NEARBY_SUMMARY_CACHE_TTL_MS", "10000"),
  1_000,
  60_000,
);
const nearbySummaryStaleTtlMs = parseIntegerInRange(
  "NEARBY_SUMMARY_STALE_TTL_MS",
  optional("NEARBY_SUMMARY_STALE_TTL_MS", "60000"),
  10_000,
  300_000,
);
const smtpHost = process.env.SMTP_HOST?.trim()
  || (nodeEnv === "production" ? "" : "localhost");
const mailFrom = process.env.MAIL_FROM?.trim()
  || (nodeEnv === "production" ? "" : "no-reply@amoria.local");
const mailFromName = optional("MAIL_FROM_NAME", "Amoria");
const smtpUser = process.env.SMTP_USER?.trim() || undefined;
const smtpPassword = process.env.SMTP_PASSWORD || undefined;
const s3AccessKey = process.env.S3_ACCESS_KEY?.trim()
  || (nodeEnv === "production" ? "" : "minioadmin");
const s3SecretKey = process.env.S3_SECRET_KEY?.trim()
  || (nodeEnv === "production" ? "" : "minioadmin");
const corsAllowedOrigins = parseCorsAllowedOrigins(
  optional(
    "CORS_ALLOWED_ORIGINS",
    nodeEnv === "production" ? "" : "http://localhost:5174,http://127.0.0.1:5174",
  ),
  nodeEnv,
);
const trustProxy = parseTrustProxyConfiguration(optional("TRUST_PROXY", ""), nodeEnv);
const releaseSha = process.env.RELEASE_SHA?.trim() || (nodeEnv === "production" ? "" : "development");
const supportEmail = process.env.SUPPORT_EMAIL?.trim()
  || (nodeEnv === "production" ? "" : "support@example.invalid");
const expoPushAccessToken = process.env.EXPO_PUSH_ACCESS_TOKEN?.trim() || undefined;
const expoPushSendUrl = optionalUrl(
  "EXPO_PUSH_SEND_URL",
  optional("EXPO_PUSH_SEND_URL", "https://exp.host/--/api/v2/push/send"),
  ["http:", "https:"],
)!;
const expoPushReceiptsUrl = optionalUrl(
  "EXPO_PUSH_RECEIPTS_URL",
  optional("EXPO_PUSH_RECEIPTS_URL", "https://exp.host/--/api/v2/push/getReceipts"),
  ["http:", "https:"],
)!;
const publicAppUrl = optionalUrl(
  "PUBLIC_APP_URL",
  optional("PUBLIC_APP_URL", ""),
  ["http:", "https:"],
);
const googlePlayListingUrl = optionalUrl(
  "GOOGLE_PLAY_LISTING_URL",
  optional("GOOGLE_PLAY_LISTING_URL", ""),
  ["https:"],
);
const googlePlayPackageName = optional(
  "GOOGLE_PLAY_PACKAGE_NAME",
  "com.kostiantyndemidets.amoria",
);
const googlePlayProductId = process.env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID?.trim() || undefined;
const googlePlayServiceAccountJsonBase64 =
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64?.trim() || undefined;
const billingTokenEncryptionKey = process.env.BILLING_TOKEN_ENCRYPTION_KEY?.trim() || undefined;
const googleRtdnAudience = process.env.GOOGLE_RTDN_AUDIENCE?.trim() || undefined;
const androidAppLinkFingerprints = [...new Set(
  optional("ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS", "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean),
)];

if (googlePlayPackageName !== "com.kostiantyndemidets.amoria") {
  throw new Error("GOOGLE_PLAY_PACKAGE_NAME must remain com.kostiantyndemidets.amoria");
}
if (googlePlayProductId && !/^[a-z0-9][a-z0-9._-]{1,126}$/u.test(googlePlayProductId)) {
  throw new Error("GOOGLE_PLAY_PREMIUM_PRODUCT_ID is invalid");
}
for (const fingerprint of androidAppLinkFingerprints) {
  if (!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u.test(fingerprint)) {
    throw new Error("ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS contains an invalid SHA-256 fingerprint");
  }
}
if (nodeEnv === "production" && publicAppUrl) {
  validateProductionPublicUrl("PUBLIC_APP_URL", publicAppUrl);
}

if (objectStorageProvider !== "s3") {
  throw new Error("OBJECT_STORAGE_PROVIDER must be s3");
}

if (jwtSecret.length < (nodeEnv === "production" ? 32 : 16)) {
  throw new Error(`JWT_SECRET must be at least ${nodeEnv === "production" ? 32 : 16} characters long`);
}

if (nodeEnv === "production") {
  productionSecret("JWT_SECRET", jwtSecret);
  productionSecret("AUTH_SECURITY_HMAC_SECRET", authSecurityHmacSecret);
  productionSecret("MESSAGE_ABUSE_HMAC_SECRET", messageAbuseHmacSecret);
  productionSecret("S3_ACCESS_KEY", s3AccessKey, 12);
  productionSecret("S3_SECRET_KEY", s3SecretKey);
  if (!adminMfaEncryptionKey) throw new Error("ADMIN_MFA_ENCRYPTION_KEY is required in production");
  const decodedAdminMfaKey = decodeAdminMfaEncryptionKey(adminMfaEncryptionKey);
  const normalizedAdminMfaKey = adminMfaEncryptionKey.toLowerCase();
  if (
    unsafeProductionValueFragments.some((fragment) => normalizedAdminMfaKey.includes(fragment)) ||
    new Set(decodedAdminMfaKey).size < 8
  ) {
    throw new Error("ADMIN_MFA_ENCRYPTION_KEY must be a high-entropy non-sample value in production");
  }
  if (!/^[0-9a-f]{40}$/i.test(releaseSha) || /^0{40}$/.test(releaseSha)) {
    throw new Error("RELEASE_SHA must be the exact 40-character Git commit SHA in production");
  }
  if (
    expoPushSendUrl !== "https://exp.host/--/api/v2/push/send" ||
    expoPushReceiptsUrl !== "https://exp.host/--/api/v2/push/getReceipts"
  ) throw new Error("Production Expo push endpoints must use the official HTTPS service");
}

if (!adminMfaEncryptionKey) throw new Error("ADMIN_MFA_ENCRYPTION_KEY is required");
decodeAdminMfaEncryptionKey(adminMfaEncryptionKey);

if (!supportEmail || /[\r\n]/.test(supportEmail) || !/^[^\s@<>]+@[^\s@<>]+$/.test(supportEmail)) {
  throw new Error("SUPPORT_EMAIL must be a single valid email address");
}

if (authSecurityHmacSecret.length < 32) {
  throw new Error("AUTH_SECURITY_HMAC_SECRET must be at least 32 characters long");
}

if (messageAbuseHmacSecret.length < 32) {
  throw new Error("MESSAGE_ABUSE_HMAC_SECRET must be at least 32 characters long");
}

if (messageAbuseRetentionHours > 168) {
  throw new Error("MESSAGE_ABUSE_RETENTION_HOURS must not exceed 168");
}

if (nodeEnv === "production" && !textModerationEnabled) {
  throw new Error("TEXT_MODERATION_ENABLED must be true in production");
}

if (
  textModerationEnabled &&
  textModerationTransport === "local" &&
  (!textModerationPython || !textModerationModelDir)
) {
  throw new Error(
    "TEXT_MODERATION_PYTHON and TEXT_MODERATION_MODEL_DIR are required when text moderation is enabled",
  );
}

if (textModerationEnabled && textModerationTransport === "http") {
  if (!textModerationServiceUrl || !textModerationServiceToken) {
    throw new Error(
      "TEXT_MODERATION_SERVICE_URL and TEXT_MODERATION_SERVICE_TOKEN are required for HTTP text moderation",
    );
  }
  if (textModerationServiceToken.length < 32) {
    throw new Error("TEXT_MODERATION_SERVICE_TOKEN must be at least 32 characters long");
  }
}

if (nodeEnv === "production" && (processRole === "api" || processRole === "all")) {
  if (!realtimeBusUrl) throw new Error("REALTIME_BUS_URL is required for production API processes");
}

if (nodeEnv === "production") {
  if (!metricsToken || metricsToken.length < 32) {
    throw new Error("METRICS_TOKEN must be at least 32 characters long in production");
  }
}

if (nearbySummaryStaleTtlMs <= nearbySummaryCacheTtlMs) {
  throw new Error("NEARBY_SUMMARY_STALE_TTL_MS must be greater than NEARBY_SUMMARY_CACHE_TTL_MS");
}

if (!["0.0.0.0", "127.0.0.1", "::1", "localhost"].includes(workerMetricsHost)) {
  throw new Error("WORKER_METRICS_HOST must be a local or container bind address");
}

if (!smtpHost) {
  throw new Error("SMTP_HOST is required in production");
}

if (/[\r\n]/.test(smtpHost)) {
  throw new Error("SMTP_HOST must not contain line breaks");
}

if (!mailFrom) {
  throw new Error("MAIL_FROM is required in production");
}

if (/[\r\n]/.test(mailFrom) || !/^[^\s@<>]+@[^\s@<>]+$/.test(mailFrom)) {
  throw new Error("MAIL_FROM must be a single valid email address");
}

if (!mailFromName || mailFromName.length > 200 || /[\r\n]/.test(mailFromName)) {
  throw new Error("MAIL_FROM_NAME must be between 1 and 200 characters without line breaks");
}

if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
  throw new Error("SMTP_USER and SMTP_PASSWORD must be configured together");
}

validatePublicUrlEnv({
  nodeEnv,
  allowLocalPublicUrls,
  publicApiUrl,
  publicMediaUrl,
  s3PublicBaseUrl,
  s3Endpoint,
});

if (publicMediaDeliveryMode === "presigned") {
  const publicStorageUrl = new URL(s3PublicBaseUrl);
  const s3Bucket = optional("S3_BUCKET", "amoria");
  if (!s3ForcePathStyle || !publicStorageUrl.pathname.replace(/\/+$/, "").endsWith(`/${s3Bucket}`)) {
    throw new Error(
      "Presigned public media requires S3_FORCE_PATH_STYLE=1 and S3_PUBLIC_BASE_URL ending with /S3_BUCKET",
    );
  }
}

export const env = {
  NODE_ENV: nodeEnv,
  AMORIA_PROCESS_ROLE: processRole,
  PORT: parsePort(optional("PORT", "4000")),
  WORKER_METRICS_HOST: workerMetricsHost,
  WORKER_METRICS_PORT: parsePort(optional("WORKER_METRICS_PORT", "4001")),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: jwtSecret,
  AUTH_SECURITY_HMAC_SECRET: authSecurityHmacSecret,
  MESSAGE_ABUSE_HMAC_SECRET: messageAbuseHmacSecret,
  ADMIN_MFA_ENCRYPTION_KEY: adminMfaEncryptionKey,
  ADMIN_NETWORK_ACCESS_MODE: adminNetworkAccessMode,
  ADMIN_ALLOWED_CIDRS: adminAllowedCidrs,
  ADMIN_PRE_AUTH_TTL_SEC: parseIntegerInRange(
    "ADMIN_PRE_AUTH_TTL_SEC",
    optional("ADMIN_PRE_AUTH_TTL_SEC", "300"),
    60,
    300,
  ),
  ADMIN_MFA_MAX_ATTEMPTS: parseIntegerInRange(
    "ADMIN_MFA_MAX_ATTEMPTS",
    optional("ADMIN_MFA_MAX_ATTEMPTS", "5"),
    3,
    10,
  ),
  ADMIN_STEP_UP_TTL_SEC: parseIntegerInRange(
    "ADMIN_STEP_UP_TTL_SEC",
    optional("ADMIN_STEP_UP_TTL_SEC", "600"),
    60,
    900,
  ),
  MESSAGE_ABUSE_RETENTION_HOURS: messageAbuseRetentionHours,
  TEXT_MODERATION_ENABLED: textModerationEnabled,
  TEXT_MODERATION_PYTHON: textModerationPython,
  TEXT_MODERATION_MODEL_DIR: textModerationModelDir,
  TEXT_MODERATION_TRANSPORT: textModerationTransport,
  TEXT_MODERATION_SERVICE_URL: textModerationServiceUrl,
  TEXT_MODERATION_SERVICE_TOKEN: textModerationServiceToken,
  TEXT_MODERATION_TIMEOUT_MS: parsePositiveInteger(
    "TEXT_MODERATION_TIMEOUT_MS",
    optional("TEXT_MODERATION_TIMEOUT_MS", "5000"),
    100,
  ),
  PUBLIC_API_URL: publicApiUrl,
  PUBLIC_MEDIA_URL: publicMediaUrl,
  ALLOW_LOCAL_PUBLIC_URLS: allowLocalPublicUrls,
  UPLOADS_DIR: uploadsDir,
  UPLOADS_ROOT: path.resolve(process.cwd(), uploadsDir),
  OBJECT_STORAGE_PROVIDER: objectStorageProvider,
  S3_ENDPOINT: s3Endpoint,
  S3_REGION: optional("S3_REGION", "us-east-1"),
  S3_ACCESS_KEY: s3AccessKey,
  S3_SECRET_KEY: s3SecretKey,
  S3_BUCKET: optional("S3_BUCKET", "amoria"),
  S3_PUBLIC_BASE_URL: s3PublicBaseUrl,
  PUBLIC_MEDIA_DELIVERY_MODE: publicMediaDeliveryMode,
  PUBLIC_MEDIA_PRESIGN_EXPIRES_SEC: parseIntegerInRange(
    "PUBLIC_MEDIA_PRESIGN_EXPIRES_SEC",
    optional("PUBLIC_MEDIA_PRESIGN_EXPIRES_SEC", "60"),
    15,
    300,
  ),
  S3_FORCE_PATH_STYLE: s3ForcePathStyle,
  OBJECT_STORAGE_DELETE_TIMEOUT_MS: parseIntegerInRange(
    "OBJECT_STORAGE_DELETE_TIMEOUT_MS",
    optional("OBJECT_STORAGE_DELETE_TIMEOUT_MS", "10000"),
    500,
    60_000,
  ),
  SMTP_HOST: smtpHost,
  SMTP_PORT: parsePort(optional("SMTP_PORT", "1025")),
  SMTP_SECURE: parseBooleanFlag("SMTP_SECURE", optional("SMTP_SECURE", "false")),
  SMTP_REQUIRE_TLS: parseBooleanFlag(
    "SMTP_REQUIRE_TLS",
    optional("SMTP_REQUIRE_TLS", nodeEnv === "production" ? "true" : "false"),
  ),
  SMTP_USER: smtpUser,
  SMTP_PASSWORD: smtpPassword,
  SMTP_CONNECTION_TIMEOUT_MS: parseIntegerInRange(
    "SMTP_CONNECTION_TIMEOUT_MS",
    optional("SMTP_CONNECTION_TIMEOUT_MS", "5000"),
    100,
    30_000,
  ),
  MAIL_FROM: mailFrom,
  MAIL_FROM_NAME: mailFromName,
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
  CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
  TRUST_PROXY: trustProxy,
  DB_POOL_MAX: parseIntegerInRange("DB_POOL_MAX", optional("DB_POOL_MAX", "10"), 1, 50),
  DB_CONNECTION_TIMEOUT_MS: parseIntegerInRange(
    "DB_CONNECTION_TIMEOUT_MS",
    optional("DB_CONNECTION_TIMEOUT_MS", "5000"),
    100,
    60_000,
  ),
  DB_IDLE_TIMEOUT_MS: parseIntegerInRange(
    "DB_IDLE_TIMEOUT_MS",
    optional("DB_IDLE_TIMEOUT_MS", "30000"),
    1000,
    600_000,
  ),
  DB_STATEMENT_TIMEOUT_MS: parseIntegerInRange(
    "DB_STATEMENT_TIMEOUT_MS",
    optional("DB_STATEMENT_TIMEOUT_MS", "15000"),
    100,
    300_000,
  ),
  REALTIME_BUS_URL: realtimeBusUrl,
  REALTIME_BUS_CHANNEL: optional("REALTIME_BUS_CHANNEL", "amoria:realtime:v1"),
  REALTIME_EVENT_MAX_BYTES: parseIntegerInRange(
    "REALTIME_EVENT_MAX_BYTES",
    optional("REALTIME_EVENT_MAX_BYTES", "262144"),
    4096,
    1_048_576,
  ),
  REALTIME_BUS_CONNECT_TIMEOUT_MS: parseIntegerInRange(
    "REALTIME_BUS_CONNECT_TIMEOUT_MS",
    optional("REALTIME_BUS_CONNECT_TIMEOUT_MS", "5000"),
    100,
    60_000,
  ),
  WS_MAX_CONNECTIONS_PER_INSTANCE: parseIntegerInRange(
    "WS_MAX_CONNECTIONS_PER_INSTANCE",
    optional("WS_MAX_CONNECTIONS_PER_INSTANCE", "5000"),
    1,
    100_000,
  ),
  WS_CONNECTION_ATTEMPT_LIMIT_PER_MINUTE: parseIntegerInRange(
    "WS_CONNECTION_ATTEMPT_LIMIT_PER_MINUTE",
    optional("WS_CONNECTION_ATTEMPT_LIMIT_PER_MINUTE", "60"),
    1,
    1_000_000,
  ),
  WS_MAX_CONNECTIONS_PER_USER: parseIntegerInRange(
    "WS_MAX_CONNECTIONS_PER_USER",
    optional("WS_MAX_CONNECTIONS_PER_USER", "5"),
    1,
    50,
  ),
  WS_MAX_SUBSCRIPTIONS_PER_CONNECTION: parseIntegerInRange(
    "WS_MAX_SUBSCRIPTIONS_PER_CONNECTION",
    optional("WS_MAX_SUBSCRIPTIONS_PER_CONNECTION", "50"),
    1,
    500,
  ),
  WS_MAX_BUFFERED_BYTES: parseIntegerInRange(
    "WS_MAX_BUFFERED_BYTES",
    optional("WS_MAX_BUFFERED_BYTES", "262144"),
    16_384,
    16_777_216,
  ),
  WS_ACCESS_REVALIDATION_INTERVAL_MS: parseIntegerInRange(
    "WS_ACCESS_REVALIDATION_INTERVAL_MS",
    optional("WS_ACCESS_REVALIDATION_INTERVAL_MS", "30000"),
    5_000,
    300_000,
  ),
  API_MAX_IN_FLIGHT_REQUESTS: parseIntegerInRange(
    "API_MAX_IN_FLIGHT_REQUESTS",
    optional("API_MAX_IN_FLIGHT_REQUESTS", "1000"),
    10,
    100_000,
  ),
  NEARBY_SUMMARY_CACHE_TTL_MS: nearbySummaryCacheTtlMs,
  NEARBY_SUMMARY_STALE_TTL_MS: nearbySummaryStaleTtlMs,
  PRESENCE_HEARTBEAT_INTERVAL_MS: parseIntegerInRange(
    "PRESENCE_HEARTBEAT_INTERVAL_MS",
    optional("PRESENCE_HEARTBEAT_INTERVAL_MS", "60000"),
    10_000,
    300_000,
  ),
  METRICS_TOKEN: metricsToken,
  RELEASE_SHA: releaseSha,
  APP_VERSION: optional("APP_VERSION", "0.1.0"),
  SUPPORT_EMAIL: supportEmail,
  EXPO_PUSH_ACCESS_TOKEN: expoPushAccessToken,
  EXPO_PUSH_SEND_URL: expoPushSendUrl,
  EXPO_PUSH_RECEIPTS_URL: expoPushReceiptsUrl,
  PUBLIC_APP_URL: publicAppUrl,
  GOOGLE_PLAY_LISTING_URL: googlePlayListingUrl,
  GOOGLE_PLAY_PACKAGE_NAME: googlePlayPackageName,
  GOOGLE_PLAY_PREMIUM_PRODUCT_ID: googlePlayProductId,
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64: googlePlayServiceAccountJsonBase64,
  BILLING_TOKEN_ENCRYPTION_KEY: billingTokenEncryptionKey,
  GOOGLE_RTDN_AUDIENCE: googleRtdnAudience,
  ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS: androidAppLinkFingerprints,
  BILLING_RECONCILIATION_INTERVAL_MS: parseIntegerInRange(
    "BILLING_RECONCILIATION_INTERVAL_MS",
    optional("BILLING_RECONCILIATION_INTERVAL_MS", "21600000"),
    900_000,
    86_400_000,
  ),
  PUSH_REQUEST_TIMEOUT_MS: parseIntegerInRange(
    "PUSH_REQUEST_TIMEOUT_MS",
    optional("PUSH_REQUEST_TIMEOUT_MS", "5000"),
    500,
    30_000,
  ),
  PUSH_WORKER_INTERVAL_MS: parseIntegerInRange(
    "PUSH_WORKER_INTERVAL_MS",
    optional("PUSH_WORKER_INTERVAL_MS", "5000"),
    1000,
    60_000,
  ),
  ACCOUNT_DELETION_WORKER_INTERVAL_MS: parseIntegerInRange(
    "ACCOUNT_DELETION_WORKER_INTERVAL_MS",
    optional("ACCOUNT_DELETION_WORKER_INTERVAL_MS", "30000"),
    1000,
    300_000,
  ),
  RETENTION_WORKER_INTERVAL_MS: parseIntegerInRange(
    "RETENTION_WORKER_INTERVAL_MS",
    optional("RETENTION_WORKER_INTERVAL_MS", "60000"),
    10_000,
    3_600_000,
  ),
  TOGETHER_QUEUE_MAINTENANCE_INTERVAL_MS: parseIntegerInRange(
    "TOGETHER_QUEUE_MAINTENANCE_INTERVAL_MS",
    optional("TOGETHER_QUEUE_MAINTENANCE_INTERVAL_MS", "5000"),
    1_000,
    300_000,
  ),
  TOGETHER_QUEUE_MAINTENANCE_BATCH_SIZE: parseIntegerInRange(
    "TOGETHER_QUEUE_MAINTENANCE_BATCH_SIZE",
    optional("TOGETHER_QUEUE_MAINTENANCE_BATCH_SIZE", "500"),
    1,
    5_000,
  ),
  READ_NOTIFICATION_RETENTION_DAYS: parseIntegerInRange(
    "READ_NOTIFICATION_RETENTION_DAYS",
    optional("READ_NOTIFICATION_RETENTION_DAYS", "180"),
    30,
    3650,
  ),
  PUSH_DELIVERY_RETENTION_DAYS: parseIntegerInRange(
    "PUSH_DELIVERY_RETENTION_DAYS",
    optional("PUSH_DELIVERY_RETENTION_DAYS", "30"),
    7,
    365,
  ),
  PHOTO_JOB_RETENTION_DAYS: parseIntegerInRange(
    "PHOTO_JOB_RETENTION_DAYS",
    optional("PHOTO_JOB_RETENTION_DAYS", "30"),
    7,
    365,
  ),
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
};
