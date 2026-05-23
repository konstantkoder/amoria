import { getApiBaseUrl } from "@/config/apiConfig";

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function isDevRuntime() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPublicMediaPath(pathname: string): boolean {
  return /^\/media\/public\/[^/?#]+$/.test(pathname);
}

function resolveAgainstApiBase(pathname: string): string | undefined {
  if (!isPublicMediaPath(pathname)) return undefined;

  try {
    return `${getApiBaseUrl()}${pathname}`;
  } catch {
    return undefined;
  }
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.includes("minio")
  ) {
    return true;
  }

  const parts = normalized.split(".");
  if (parts.length !== 4) return false;

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        String(octet) !== parts[index] ||
        octet < 0 ||
        octet > 255
    )
  ) {
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

export function isReleaseSafePublicMediaUrl(value: unknown): boolean {
  const normalized = normalizeString(value);
  if (!normalized) return false;

  const url = parseUrl(normalized);
  if (!url) return false;
  if (url.protocol !== "https:") return false;
  return !isPrivateOrLocalHostname(url.hostname);
}

export function normalizePublicMediaUrl(
  value: unknown,
  context = "media URL"
): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) return undefined;

  if (normalized.startsWith("/")) {
    const resolved = resolveAgainstApiBase(normalized.split(/[?#]/, 1)[0] ?? "");
    if (resolved) return resolved;
    warnInvalidMediaUrl(context, normalized);
    return undefined;
  }

  const url = parseUrl(normalized);
  if (!url) {
    warnInvalidMediaUrl(context, normalized);
    return undefined;
  }

  const canonicalCurrentUrl = resolveAgainstApiBase(url.pathname);
  if (canonicalCurrentUrl) {
    return canonicalCurrentUrl;
  }

  if (isReleaseSafePublicMediaUrl(normalized)) {
    return normalized;
  }

  if (
    isDevRuntime() &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    !isPrivateOrLocalHostname(url.hostname)
  ) {
    return normalized;
  }

  warnInvalidMediaUrl(context, normalized);
  return undefined;
}

function warnInvalidMediaUrl(context: string, value: string): void {
  if (!isDevRuntime()) return;
  console.warn(`[media] Ignoring unsafe ${context}: ${value}`);
}
