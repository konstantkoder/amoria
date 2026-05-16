import { AppError, validationError } from "../common/errors";
import * as auditService from "./admin-audit.service";
import { sanitizeAuditMetadata } from "./admin-audit.service";
import * as mediaRepo from "./admin-media.repo";
import type {
  AdminMediaDecisionBody,
  AdminMediaDecisionResponse,
  AdminMediaDetailResponse,
  AdminMediaListResponse,
  AdminMediaQuery,
} from "./admin-media.types";
import {
  toAdminMediaItem,
  toAdminMediaReviewItem,
} from "./admin-media.types";
import type { AdminContext, AdminRequestContext } from "./admin.types";

type AdminMediaDeps = {
  repo: Pick<
    typeof mediaRepo,
    "createMediaModerationReview" | "findMediaById" | "listMedia" | "listMediaReviews"
  >;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminMediaDeps = {
  repo: mediaRepo,
  audit: auditService,
};

let deps: AdminMediaDeps = defaultDeps;

export function __setAdminMediaServiceDepsForTests(
  overrides: Partial<AdminMediaDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function listMediaForAdmin(
  admin: AdminContext,
  query: AdminMediaQuery,
  requestContext: AdminRequestContext,
): Promise<AdminMediaListResponse> {
  const rows = await deps.repo.listMedia(query);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.media.list",
    targetType: "media_files",
    metadata: {
      filters: {
        ownerAmoriaId: query.ownerAmoriaId ?? null,
        type: query.type ?? null,
      },
      limit: query.limit,
      resultCount: rows.length,
    },
    ...requestContext,
  });

  return {
    items: rows.map((row) => toAdminMediaItem(row, row.visibility !== "locked")),
    nextCursor: null,
  };
}

export async function getMediaForAdmin(
  admin: AdminContext,
  mediaId: string,
  reason: string | undefined,
  requestContext: AdminRequestContext,
): Promise<AdminMediaDetailResponse> {
  const media = await deps.repo.findMediaById(mediaId);
  if (!media) {
    throw new AppError("not_found", "Media not found", 404);
  }

  const includeSensitiveUrl = assertCanViewMediaDetail(admin, media.visibility, reason);
  const reviews = await deps.repo.listMediaReviews(mediaId);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: media.visibility === "locked" ? "admin.media.locked.view" : "admin.media.detail.read",
    targetType: "media_file",
    targetId: mediaId,
    reason: media.visibility === "locked" ? cleanReason(reason) : null,
    metadata: {
      ownerAmoriaId: media.owner.amoriaId,
      type: media.type,
      visibility: media.visibility,
      reviewCount: reviews.length,
    },
    ...requestContext,
  });

  return {
    media: {
      ...toAdminMediaItem(media, includeSensitiveUrl),
      path: includeSensitiveUrl ? media.path : null,
      reviews: reviews.map(toAdminMediaReviewItem),
    },
  };
}

export async function createMediaDecisionForAdmin(
  admin: AdminContext,
  mediaId: string,
  input: AdminMediaDecisionBody,
  requestContext: AdminRequestContext,
): Promise<AdminMediaDecisionResponse> {
  if (!admin.adminUser.roles.includes("owner") && !admin.adminUser.roles.includes("moderator")) {
    throw new AppError("forbidden", "Admin role is not allowed for media decisions", 403);
  }

  const media = await deps.repo.findMediaById(mediaId);
  if (!media) {
    throw new AppError("not_found", "Media not found", 404);
  }

  if (media.visibility === "locked") {
    cleanReason(input.reason, "reason is required for locked gallery media decisions");
  }

  const review = await deps.repo.createMediaModerationReview({
    mediaId,
    ownerUserId: media.ownerUserId,
    adminUserId: admin.adminUser.id,
    action: input.action,
    reason: cleanOptional(input.reason, 500),
    metadata: sanitizeAuditMetadata(input.metadata),
  });

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.media.decision",
    targetType: "media_file",
    targetId: mediaId,
    reason: cleanOptional(input.reason, 500),
    metadata: {
      action: input.action,
      ownerAmoriaId: media.owner.amoriaId,
      type: media.type,
      visibility: media.visibility,
    },
    ...requestContext,
  });

  return {
    ok: true,
    media: toAdminMediaItem({ ...media, latestReview: review }, media.visibility !== "locked"),
    review: toAdminMediaReviewItem(review),
  };
}

function assertCanViewMediaDetail(
  admin: AdminContext,
  visibility: "avatar" | "public" | "locked" | null,
  reason: string | undefined,
): boolean {
  if (visibility !== "locked") {
    return true;
  }

  if (!admin.adminUser.roles.includes("owner") && !admin.adminUser.roles.includes("moderator")) {
    throw new AppError("forbidden", "Locked media requires owner or moderator access", 403);
  }

  cleanReason(reason);
  return true;
}

function cleanReason(
  value: string | undefined,
  message = "reason is required for locked gallery media access",
): string {
  const normalized = cleanOptional(value, 500);
  if (!normalized) {
    throw validationError(message, { reason: "required" });
  }
  return normalized;
}

function cleanOptional(value: string | undefined, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw validationError("Field is too long", { value: "too_long" });
  }

  return normalized;
}
