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

function mediaIdFromPublicMediaPath(pathname: string): string | undefined {
  if (!isPublicMediaPath(pathname)) return undefined;
  const mediaId = pathname.split("/").pop();
  if (!mediaId) return undefined;
  try {
    return decodeURIComponent(mediaId);
  } catch {
    return mediaId;
  }
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
  return getPublicMediaUrlInfo(value, context).url;
}

export type PublicMediaUrlKind =
  | "relative"
  | "currentOrigin"
  | "rewritten"
  | "external"
  | "devExternal"
  | "invalid";

export type PublicMediaUrlInfo = {
  url?: string;
  urlKind: PublicMediaUrlKind;
  mediaId?: string;
};

export type PublicMediaProbeResult = {
  ok: boolean;
  urlKind: PublicMediaUrlKind;
  mediaId?: string;
  httpStatus?: number;
  contentType?: string;
  errorCode?: string;
};

export function getPublicMediaUrlInfo(
  value: unknown,
  context = "media URL"
): PublicMediaUrlInfo {
  const normalized = normalizeString(value);
  if (!normalized) return { urlKind: "invalid" };

  if (normalized.startsWith("/")) {
    const resolved = resolveAgainstApiBase(normalized.split(/[?#]/, 1)[0] ?? "");
    if (resolved) {
      return {
        url: resolved,
        urlKind: "relative",
        mediaId: mediaIdFromPublicMediaPath(normalized.split(/[?#]/, 1)[0] ?? ""),
      };
    }
    warnInvalidMediaUrl(context, normalized);
    return { urlKind: "invalid" };
  }

  const url = parseUrl(normalized);
  if (!url) {
    warnInvalidMediaUrl(context, normalized);
    return { urlKind: "invalid" };
  }

  const canonicalCurrentUrl = resolveAgainstApiBase(url.pathname);
  if (canonicalCurrentUrl) {
    return {
      url: canonicalCurrentUrl,
      urlKind: isCurrentApiOrigin(url) ? "currentOrigin" : "rewritten",
      mediaId: mediaIdFromPublicMediaPath(url.pathname),
    };
  }

  if (isReleaseSafePublicMediaUrl(normalized)) {
    return { url: normalized, urlKind: "external" };
  }

  if (
    isDevRuntime() &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    !isPrivateOrLocalHostname(url.hostname)
  ) {
    return { url: normalized, urlKind: "devExternal" };
  }

  warnInvalidMediaUrl(context, normalized);
  return { urlKind: "invalid" };
}

export async function probePublicMediaUrl(
  value: unknown,
  context = "media URL"
): Promise<PublicMediaProbeResult> {
  const urlInfo = getPublicMediaUrlInfo(value, context);
  if (!urlInfo.url) {
    return {
      ok: false,
      urlKind: urlInfo.urlKind,
      ...(urlInfo.mediaId ? { mediaId: urlInfo.mediaId } : {}),
      errorCode: "invalid_url",
    };
  }

  try {
    const response = await fetch(urlInfo.url, {
      method: "GET",
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? undefined;
    await response.blob().catch(() => undefined);

    return {
      ok: response.ok,
      urlKind: urlInfo.urlKind,
      ...(urlInfo.mediaId ? { mediaId: urlInfo.mediaId } : {}),
      httpStatus: response.status,
      ...(contentType ? { contentType } : {}),
    };
  } catch (error) {
    const errorName =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name ?? "network_error")
        : "network_error";
    return {
      ok: false,
      urlKind: urlInfo.urlKind,
      ...(urlInfo.mediaId ? { mediaId: urlInfo.mediaId } : {}),
      errorCode: errorName || "network_error",
    };
  }
}

function isCurrentApiOrigin(url: URL): boolean {
  try {
    return url.origin === new URL(getApiBaseUrl()).origin;
  } catch {
    return false;
  }
}

function warnInvalidMediaUrl(context: string, value: string): void {
  if (!isDevRuntime()) return;
  console.warn(`[media] Ignoring unsafe ${context}: ${value}`);
}
