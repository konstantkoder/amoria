import { AppError, validationError } from "../common/errors";
import { MAX_MEDIA_UPLOAD_BYTES } from "../config/constants";
import { env } from "../config/env";
import { getObjectBuffer } from "../media/object-storage";
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
    | "createEffectiveMediaDecision"
    | "findMediaById"
    | "hasRecentLockedMediaContentAccess"
    | "listMedia"
    | "listMediaReviews"
  >;
  audit: Pick<typeof auditService, "writeAuditLog">;
  getObjectBuffer: typeof getObjectBuffer;
};

const defaultDeps: AdminMediaDeps = {
  repo: mediaRepo,
  audit: auditService,
  getObjectBuffer,
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
        moderationStatus: query.moderationStatus ?? null,
        visibility: query.visibility ?? null,
        createdFrom: query.createdFrom?.toISOString() ?? null,
        createdTo: query.createdTo?.toISOString() ?? null,
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

  assertCanViewMediaDetail(admin, media.visibility, reason);
  const includeSensitiveUrl = media.visibility !== "locked";
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
      path: media.visibility === "locked" ? null : media.path,
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

  const reason = cleanReason(input.reason, "reason is required for media moderation decisions");
  const automatedPersonPresence = personPresenceFromRawResult(media.latestJob?.rawResult);
  const manualPersonPresenceOverride = media.type === "avatar" &&
    input.action === "approve" &&
    automatedPersonPresence !== "true";
  if (media.visibility === "locked" && !await deps.repo.hasRecentLockedMediaContentAccess(
    admin.adminUser.id,
    mediaId,
  )) {
    throw new AppError(
      "locked_media_access_required",
      "Locked media content must be opened with a reason before a decision",
      409,
    );
  }

  const review = await deps.repo.createEffectiveMediaDecision({
    mediaId,
    ownerUserId: media.ownerUserId,
    adminUserId: admin.adminUser.id,
    action: input.action,
    reason,
    metadata: sanitizeAuditMetadata({
      previousState: media.moderationState,
      ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? input.metadata
        : { submitted: input.metadata }),
      ...(manualPersonPresenceOverride ? {
        manualPersonPresenceOverride: true,
        automatedPersonPresence: automatedPersonPresence ?? "unknown",
        automatedPersonPolicyReasonCode: policyReasonCodeFromRawResult(media.latestJob?.rawResult),
      } : {}),
    }),
  });

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.media.decision",
    targetType: "media_file",
    targetId: mediaId,
    reason,
    metadata: {
      action: input.action,
      ownerAmoriaId: media.owner.amoriaId,
      type: media.type,
      visibility: media.visibility,
      previousState: media.moderationState,
      manualPersonPresenceOverride,
      ...(manualPersonPresenceOverride ? {
        automatedPersonPresence: automatedPersonPresence ?? "unknown",
      } : {}),
    },
    ...requestContext,
  });

  const updated = await deps.repo.findMediaById(mediaId);
  if (!updated) {
    throw new Error("Media disappeared after moderation decision");
  }
  return {
    ok: true,
    media: toAdminMediaItem(updated, updated.visibility !== "locked"),
    review: toAdminMediaReviewItem(review),
  };
}

export async function getMediaContentForAdmin(
  admin: AdminContext,
  mediaId: string,
  reason: string | undefined,
  requestContext: AdminRequestContext,
): Promise<{ body: Buffer; contentType: string }> {
  const media = await deps.repo.findMediaById(mediaId);
  if (!media) {
    throw new AppError("not_found", "Media not found", 404);
  }

  assertCanViewMediaDetail(admin, media.visibility, reason);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: media.visibility === "locked"
      ? "admin.media.locked.content.read"
      : "admin.media.content.read",
    targetType: "media_file",
    targetId: mediaId,
    reason: media.visibility === "locked" ? cleanReason(reason) : null,
    metadata: {
      ownerAmoriaId: media.owner.amoriaId,
      type: media.type,
      visibility: media.visibility,
    },
    ...requestContext,
  });

  return {
    body: await deps.getObjectBuffer({
      bucket: env.S3_BUCKET,
      key: media.path,
      maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    }),
    contentType: media.mimeType,
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

function personPresenceFromRawResult(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const signal = (value as Record<string, unknown>).containsPerson;
  return signal === "true" || signal === "false" || signal === "unknown" ? signal : undefined;
}

function policyReasonCodeFromRawResult(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const reason = (value as Record<string, unknown>).policyReasonCode;
  return typeof reason === "string" && reason ? reason : null;
}
