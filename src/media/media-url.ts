export function publicMediaPathForMediaId(mediaId: string): string {
  return `/media/public/${encodeURIComponent(mediaId)}`;
}

export function publicMediaUrlForMediaId(mediaId: string): string {
  return publicMediaPathForMediaId(mediaId);
}

export function mediaIdFromPublicMediaReference(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const path = normalized.startsWith("/")
    ? normalized
    : safeUrlPathname(normalized);
  if (!path) {
    return null;
  }

  const match = path.match(/^\/media\/public\/([^/?#]+)$/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function safeUrlPathname(value: string): string | null {
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}
