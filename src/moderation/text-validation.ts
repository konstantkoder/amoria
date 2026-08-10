import { validationError } from "../common/errors";

const forbiddenControlPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const bidiOverridePattern = /[\u202A-\u202E\u2066-\u2069]/u;
const zeroWidthPattern = /[\u200B-\u200D\u2060\uFEFF]/gu;
const urlPattern = /(?:https?:\/\/|www\.)[^\s<>{}\[\]]+/giu;

export type TextValidationOptions = {
  field: string;
  maxUrls?: number;
  rejectBidiOverrides?: boolean;
};

export function assertSafeText(value: string, options: TextValidationOptions): void {
  if (forbiddenControlPattern.test(value)) {
    throw validationError("Text contains unsupported control characters", {
      [options.field]: "unsupported_control_character",
    });
  }
  if ((options.rejectBidiOverrides ?? true) && bidiOverridePattern.test(value)) {
    throw validationError("Text contains unsupported direction-control characters", {
      [options.field]: "unsupported_direction_control",
    });
  }
  const invisibleCount = value.match(zeroWidthPattern)?.length ?? 0;
  if (invisibleCount > 3) {
    throw validationError("Text contains too many invisible characters", {
      [options.field]: "excessive_invisible_characters",
    });
  }
  const urls = extractUrls(value);
  if (options.maxUrls !== undefined && urls.length > options.maxUrls) {
    throw validationError("Text contains too many links", {
      [options.field]: "too_many_links",
    });
  }
  if (/(.)\1{39,}/su.test(value)) {
    throw validationError("Text contains an excessive repeated character run", {
      [options.field]: "excessive_repetition",
    });
  }
}
export function extractUrls(value: string): string[] {
  return value.match(urlPattern) ?? [];
}

export function extractUrlHosts(value: string): string[] {
  const hosts: string[] = [];
  for (const candidate of extractUrls(value)) {
    try {
      const parsed = new URL(candidate.toLowerCase().startsWith("www.") ? `https://${candidate}` : candidate);
      hosts.push(parsed.hostname.toLowerCase().replace(/\.$/u, ""));
    } catch {
      // Malformed URL-like text remains a signal through the raw URL count.
    }
  }
  return hosts;
}

export function containsPunycodeHost(value: string): boolean {
  return extractUrlHosts(value).some((host) => host.split(".").some((part) => part.startsWith("xn--")));
}
