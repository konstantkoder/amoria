import type { JsonValue, MediaModerationJobRow, MediaModerationReviewRow } from "../db/schema";
import { publicMediaUrlForMediaId } from "../media/media-url";

export const MEDIA_MODERATION_ACTIONS = [
  "approve",
  "restrict",
  "remove",
  "mark_under_review",
] as const;
export type MediaModerationAction = (typeof MEDIA_MODERATION_ACTIONS)[number];

export const MEDIA_MODERATION_STATUSES = [
  "pending",
  "approved",
  "restricted",
  "needs_review",
  "removed",
  "automation_failed",
] as const;
export type MediaModerationStatus = (typeof MEDIA_MODERATION_STATUSES)[number];

export type AdminMediaQuery = {
  ownerAmoriaId?: string;
  type?: string;
  moderationStatus?: MediaModerationStatus;
  visibility?: "avatar" | "public" | "locked";
  createdFrom?: Date;
  createdTo?: Date;
  limit: number;
};

export type AdminMediaOwner = {
  id: string;
  amoriaId: string;
  displayName: string;
  email: string;
};

export type AdminMediaRow = {
  id: string;
  ownerUserId: string;
  owner: AdminMediaOwner;
  type: string;
  path: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  checksumSha256: string | null;
  moderationState: string;
  moderationOrigin: string;
  automatedCheckedAt: Date | null;
  visibility: "avatar" | "public" | "locked" | null;
  createdAt: Date;
  latestReview: MediaModerationReviewRow | null;
  latestJob: MediaModerationJobRow | null;
};

export type AdminMediaItem = Omit<
  AdminMediaRow,
  | "automatedCheckedAt"
  | "createdAt"
  | "latestJob"
  | "latestReview"
  | "moderationOrigin"
  | "moderationState"
  | "path"
  | "url"
> & {
  url: string | null;
  previewUrl: string | null;
  publicUrl: string | null;
  moderationStatus: MediaModerationStatus;
  reviewedAt: string | null;
  moderationOrigin: string;
  automatedCheckedAt: string | null;
  automation: AdminMediaAutomationItem | null;
  createdAt: string;
};

export type AdminMediaAutomationItem = {
  jobId: string;
  status: string;
  attemptCount: number;
  providerEngine: string;
  modelVersion: string;
  policyVersion: string;
  policyDecision: string | null;
  errorCode: string | null;
  rawResult: JsonValue | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type AdminMediaReviewItem = {
  id: string;
  mediaId: string;
  ownerUserId: string | null;
  adminUserId: string | null;
  action: MediaModerationAction;
  reason: string | null;
  metadata: JsonValue | null;
  createdAt: string;
};

export type AdminMediaDetail = AdminMediaItem & {
  reviews: AdminMediaReviewItem[];
};

export type AdminMediaListResponse = {
  items: AdminMediaItem[];
  nextCursor: null;
};

export type AdminMediaDetailResponse = {
  media: AdminMediaDetail;
};

export type AdminMediaDecisionBody = {
  action: MediaModerationAction;
  reason?: string;
  metadata?: unknown;
};

export type AdminMediaDecisionResponse = {
  ok: true;
  media: AdminMediaItem;
  review: AdminMediaReviewItem;
};

export function toAdminMediaItem(row: AdminMediaRow, includeSensitiveUrl: boolean): AdminMediaItem {
  const publicUrl = publicUrlForAdminMedia(row);
  const exposedUrl = includeSensitiveUrl && row.visibility !== "locked" ? publicUrl : null;

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    owner: row.owner,
    type: row.type,
    url: exposedUrl,
    previewUrl: exposedUrl,
    publicUrl: exposedUrl,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    checksumSha256: row.checksumSha256,
    visibility: row.visibility,
    moderationStatus: moderationStatusForReview(row.latestReview, row),
    reviewedAt: row.latestReview?.createdAt.toISOString() ?? null,
    moderationOrigin: row.moderationOrigin,
    automatedCheckedAt: row.automatedCheckedAt?.toISOString() ?? null,
    automation: row.latestJob ? {
      jobId: row.latestJob.id,
      status: row.latestJob.status,
      attemptCount: row.latestJob.attemptCount,
      providerEngine: safeCode(row.latestJob.providerEngine) ?? "[redacted]",
      modelVersion: safeModelIdentifier(row.latestJob.modelVersion) ?? "[redacted]",
      policyVersion: safeCode(row.latestJob.policyVersion) ?? "[redacted]",
      policyDecision: safeEnum(row.latestJob.policyDecision, ["approve", "needs_review", "restrict"]),
      errorCode: safeCode(row.latestJob.errorCode),
      rawResult: safeAdminMediaRawResult(row.latestJob.rawResult),
      startedAt: row.latestJob.startedAt?.toISOString() ?? null,
      completedAt: row.latestJob.completedAt?.toISOString() ?? null,
    } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAdminMediaReviewItem(row: MediaModerationReviewRow): AdminMediaReviewItem {
  return {
    id: row.id,
    mediaId: row.mediaId,
    ownerUserId: row.ownerUserId,
    adminUserId: row.adminUserId,
    action: row.action as MediaModerationAction,
    reason: row.reason,
    metadata: sanitizeAdminMediaReviewMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

export function moderationStatusForReview(
  review: MediaModerationReviewRow | null,
  row?: Pick<AdminMediaRow, "moderationState" | "moderationOrigin">,
): MediaModerationStatus {
  if (row?.moderationOrigin === "automation_failed") {
    return "automation_failed";
  }
  if (row && MEDIA_MODERATION_STATUSES.includes(row.moderationState as MediaModerationStatus)) {
    return row.moderationState as MediaModerationStatus;
  }
  return review?.action === "approve" ? "approved" : "pending";
}

export function safeAdminMediaRawResult(value: unknown): JsonValue | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  const output: Record<string, JsonValue> = {};
  const containsPerson = safeEnum(source.containsPerson, ["true", "false", "unknown"]);
  if (containsPerson) {
    output.containsPerson = containsPerson;
  }

  const policyReasonCode = safeCode(source.policyReasonCode);
  if (policyReasonCode) {
    output.policyReasonCode = policyReasonCode;
  }

  const confidence = asRecord(source.confidence);
  const nsfwConfidence = safeProbability(confidence?.nsfw);
  if (nsfwConfidence !== null) {
    output.confidence = { nsfw: nsfwConfidence };
  }

  const graphicSource = asRecord(source.graphicSafety);
  if (graphicSource) {
    const graphic: Record<string, JsonValue> = {};
    const signal = safeEnum(graphicSource.signal, ["safe", "unknown", "unsafe"]);
    const decision = safeEnum(graphicSource.policyDecision, ["approve", "needs_review", "restrict"]);
    const probability = safeProbability(graphicSource.nsflProbability);
    const modelVersion = safeModelIdentifier(graphicSource.modelVersion);
    if (signal) graphic.signal = signal;
    if (decision) graphic.policyDecision = decision;
    if (probability !== null) graphic.nsflProbability = probability;
    if (modelVersion) graphic.modelVersion = modelVersion;
    if (Object.keys(graphic).length) {
      output.graphicSafety = graphic;
    }
  }

  return Object.keys(output).length ? output : null;
}

export function sanitizeAdminMediaReviewMetadata(value: unknown): JsonValue | null {
  if (value === undefined || value === null) {
    return null;
  }
  return sanitizeReviewValue(value, 0);
}

const sensitiveReviewKey = /password|token|secret|authorization|cookie|jwt|access[_-]?key|private[_-]?key|(?:^|[_-])path(?:$|[_-])|path$|storage[_-]?key|endpoint|host(?:name)?/i;

function sanitizeReviewValue(value: unknown, depth: number): JsonValue {
  if (depth > 4) {
    return "[truncated]";
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "[invalid]";
  }
  if (typeof value === "string") {
    if (/\p{Cc}/u.test(value) || /:\/\//u.test(value) || /[\\/]/u.test(value) || /^[a-z0-9.-]+:\d+$/iu.test(value)) {
      return "[redacted]";
    }
    return value.length <= 500 ? value : `${value.slice(0, 500)}...[truncated]`;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeReviewValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      const safeKey = key.slice(0, 80);
      output[safeKey] = sensitiveReviewKey.test(key)
        ? "[redacted]"
        : sanitizeReviewValue(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : null;
}

function safeProbability(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function safeCode(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]{1,120}$/u.test(value) ? value : null;
}

function safeModelIdentifier(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const clean = value.trim();
  const slashCount = clean.split("/").length - 1;
  return clean.length > 0 && clean.length <= 200 && slashCount <= 1 &&
    !/\p{Cc}|:\/\/|\\|^\/|(?:^|\/)\.\.(?:\/|$)|\.(?:avif|gif|jpe?g|png|webp)$|^[a-z0-9.-]+:\d+$/iu.test(clean)
    ? clean
    : null;
}

function publicUrlForAdminMedia(row: AdminMediaRow): string | null {
  if (row.moderationState === "approved" && (row.visibility === "avatar" || row.visibility === "public")) {
    return publicMediaUrlForMediaId(row.id);
  }

  return null;
}
