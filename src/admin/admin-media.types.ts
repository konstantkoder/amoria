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
  path: string | null;
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
      providerEngine: row.latestJob.providerEngine,
      modelVersion: row.latestJob.modelVersion,
      policyVersion: row.latestJob.policyVersion,
      policyDecision: row.latestJob.policyDecision,
      errorCode: row.latestJob.errorCode,
      rawResult: row.latestJob.rawResult ?? null,
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
    metadata: row.metadata ?? null,
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

function publicUrlForAdminMedia(row: AdminMediaRow): string | null {
  if (row.moderationState === "approved" && (row.visibility === "avatar" || row.visibility === "public")) {
    return publicMediaUrlForMediaId(row.id);
  }

  return null;
}
