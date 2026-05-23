import type { JsonValue, MediaModerationReviewRow } from "../db/schema";
import { publicMediaUrlForMediaId } from "../media/media-url";

export const MEDIA_MODERATION_ACTIONS = [
  "approve",
  "restrict",
  "remove",
  "mark_under_review",
] as const;
export type MediaModerationAction = (typeof MEDIA_MODERATION_ACTIONS)[number];

export const MEDIA_MODERATION_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "restricted",
  "needs_manual_review",
] as const;
export type MediaModerationStatus = (typeof MEDIA_MODERATION_STATUSES)[number];

export type AdminMediaQuery = {
  ownerAmoriaId?: string;
  type?: string;
  moderationStatus?: MediaModerationStatus;
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
  visibility: "avatar" | "public" | "locked" | null;
  createdAt: Date;
  latestReview: MediaModerationReviewRow | null;
};

export type AdminMediaItem = Omit<AdminMediaRow, "createdAt" | "latestReview" | "path" | "url"> & {
  url: string | null;
  previewUrl: string | null;
  publicUrl: string | null;
  moderationStatus: MediaModerationStatus;
  reviewedAt: string | null;
  createdAt: string;
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
    moderationStatus: moderationStatusForReview(row.latestReview),
    reviewedAt: row.latestReview?.createdAt.toISOString() ?? null,
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
): MediaModerationStatus {
  if (!review) {
    return "pending_review";
  }

  switch (review.action as MediaModerationAction) {
    case "approve":
      return "approved";
    case "restrict":
      return "restricted";
    case "remove":
      return "rejected";
    case "mark_under_review":
      return "needs_manual_review";
    default:
      return "pending_review";
  }
}

function publicUrlForAdminMedia(row: AdminMediaRow): string | null {
  if (row.visibility === "avatar" || row.visibility === "public") {
    return publicMediaUrlForMediaId(row.id);
  }

  return null;
}
