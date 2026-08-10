import { createHash, createHmac, randomUUID } from "node:crypto";
import { AppError } from "../common/errors";
import { env } from "../config/env";
import { enqueueMediaModerationJob } from "../media/media.repo";
import { deleteObject, headObject, listObjectKeys } from "../media/object-storage";
import * as auditService from "./admin-audit.service";
import * as adminMediaRepo from "./admin-media.repo";
import * as messageService from "./admin-message-moderation.service";
import * as repo from "./admin-bulk.repo";
import type { AdminBulkConfirmBody, AdminBulkJobDetail, AdminBulkPreviewBody } from "./admin-bulk.types";
import type { AdminContext, AdminRequestContext } from "./admin.types";

export async function previewBulkJob(
  admin: AdminContext,
  body: AdminBulkPreviewBody,
  context: AdminRequestContext,
): Promise<{ job: AdminBulkJobDetail; confirmationToken: string }> {
  assertBulkRole(admin, body.kind);
  const existingId = await repo.findJobIdentity(admin.adminUser.id, body.idempotencyKey);
  const jobId = existingId ?? randomUUID();
  const token = confirmationToken(admin.adminUser.id, jobId, body.idempotencyKey);
  try {
    const job = await repo.createPreview({
      adminUserId: admin.adminUser.id,
      body,
      jobId,
      confirmationTokenHash: hashToken(token),
    });
    const actualToken = confirmationToken(admin.adminUser.id, job.id, body.idempotencyKey);
    await auditService.writeAuditLog({
      adminUserId: admin.adminUser.id,
      action: "admin.bulk.preview",
      targetType: "admin_bulk_job",
      targetId: job.id,
      reason: body.reason,
      metadata: { kind: body.kind, action: body.action, maxItems: body.maxItems, previewCount: job.previewCount, scope: body.scope },
      ...context,
    });
    return { job, confirmationToken: actualToken };
  } catch (error) {
    if ((error as Error).message === "idempotency_conflict") {
      throw new AppError("idempotency_conflict", "Idempotency key was already used for a different preview", 409);
    }
    throw error;
  }
}

export async function confirmBulkJob(
  admin: AdminContext,
  jobId: string,
  body: AdminBulkConfirmBody,
  context: AdminRequestContext,
): Promise<{ job: AdminBulkJobDetail }> {
  let job: AdminBulkJobDetail;
  try {
    job = await repo.claimJob(jobId, admin.adminUser.id, hashToken(body.confirmationToken));
  } catch (error) {
    throw mapJobError(error);
  }
  assertBulkRole(admin, job.kind);
  if (job.status === "completed" || job.status === "partially_failed") return { job };

  for (const item of job.items.filter((candidate) => candidate.status === "pending")) {
    try {
      const applied = await applyItem(admin, job, item.targetId, context);
      await repo.markItem(item.id, applied ? "applied" : "skipped", applied ? undefined : "no_longer_eligible");
    } catch (error) {
      await repo.markItem(item.id, "failed", safeErrorCode(error));
    }
  }
  job = await repo.finalizeJob(job.id);
  await auditService.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.bulk.confirm",
    targetType: "admin_bulk_job",
    targetId: job.id,
    reason: job.reason,
    metadata: {
      kind: job.kind, action: job.action, previewCount: job.previewCount,
      appliedCount: job.appliedCount, skippedCount: job.skippedCount, failedCount: job.failedCount,
    },
    ...context,
  });
  return { job };
}

export async function getBulkJob(admin: AdminContext, jobId: string, context: AdminRequestContext) {
  try {
    const job = await repo.loadJob(jobId, admin.adminUser.id);
    await auditService.writeAuditLog({
      adminUserId: admin.adminUser.id, action: "admin.bulk.detail.read", targetType: "admin_bulk_job", targetId: jobId,
      metadata: { kind: job.kind, status: job.status }, ...context,
    });
    return { job };
  } catch (error) {
    throw mapJobError(error);
  }
}

export async function getOrphanDiagnostics(admin: AdminContext, context: AdminRequestContext) {
  const maximum = 1000;
  const [storage, known] = await Promise.all([
    listObjectKeys({ bucket: env.S3_BUCKET, maximumKeys: maximum }),
    repo.listKnownObjectPaths(maximum),
  ]);
  const knownPaths = new Set(known.filter((row) => !row.physicallyPurgedAt).map((row) => row.path));
  const storagePaths = new Set(storage.keys);
  const storageOrphanHashes = storage.keys.filter((key) => !knownPaths.has(key)).slice(0, 100).map(hashDiagnosticValue);
  const missingMediaIds: string[] = [];
  for (const row of known.filter((candidate) => !candidate.physicallyPurgedAt).slice(0, 100)) {
    if (storagePaths.has(row.path)) continue;
    try {
      await headObject({ bucket: env.S3_BUCKET, key: row.path });
    } catch (error) {
      if ((error as { code?: string }).code === "not_found") missingMediaIds.push(row.id);
    }
  }
  const result = {
    status: "diagnostic_only" as const,
    destructiveActionAvailable: false,
    boundedAt: maximum,
    storageListingTruncated: storage.truncated,
    storageOrphanCount: storageOrphanHashes.length,
    storageOrphanKeyHashes: storageOrphanHashes,
    missingObjectMediaIds: missingMediaIds,
  };
  await auditService.writeAuditLog({
    adminUserId: admin.adminUser.id, action: "admin.storage.orphans.diagnose", targetType: "object_storage",
    metadata: { storageOrphanCount: result.storageOrphanCount, missingObjectCount: missingMediaIds.length, truncated: storage.truncated }, ...context,
  });
  return result;
}

async function applyItem(
  admin: AdminContext,
  job: AdminBulkJobDetail,
  targetId: string,
  context: AdminRequestContext,
): Promise<boolean> {
  if (job.kind === "media_scan") {
    const media = await adminMediaRepo.findMediaById(targetId);
    if (!media || media.visibility === "locked" || !["avatar", "public"].includes(media.visibility ?? "")) return false;
    return Boolean(await enqueueMediaModerationJob(targetId));
  }
  if (job.kind === "media_decision") {
    const media = await adminMediaRepo.findMediaById(targetId);
    if (!media || media.visibility === "locked" || !["avatar", "public"].includes(media.visibility ?? "")) return false;
    if (!["pending", "needs_review", "restricted"].includes(media.moderationState)) return false;
    await adminMediaRepo.createEffectiveMediaDecision({
      mediaId: targetId, ownerUserId: media.ownerUserId, adminUserId: admin.adminUser.id,
      action: job.action, reason: job.reason, metadata: { source: "admin_bulk_job", bulkJobId: job.id },
    });
    return true;
  }
  if (job.kind === "message_decision") {
    await messageService.decideMessage(admin, targetId, { action: job.action as "restrict" | "remove" | "escalate", reason: job.reason }, context);
    return true;
  }
  return repo.purgePhysicalMedia(targetId, admin.adminUser.id, job.reason, async (path) => {
    await deleteObject({ bucket: env.S3_BUCKET, key: path });
  });
}

function assertBulkRole(admin: AdminContext, kind: AdminBulkPreviewBody["kind"]): void {
  if (kind === "physical_media_purge") {
    if (!admin.adminUser.roles.includes("owner")) throw new AppError("forbidden", "Physical purge is owner-only", 403);
    return;
  }
  if (!admin.adminUser.roles.includes("owner") && !admin.adminUser.roles.includes("moderator")) {
    throw new AppError("forbidden", "Bulk moderation requires owner or moderator", 403);
  }
}

function confirmationToken(adminUserId: string, jobId: string, idempotencyKey: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(`${adminUserId}:${jobId}:${idempotencyKey}:confirm`).digest("base64url");
}
function hashToken(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function hashDiagnosticValue(value: string): string { return createHash("sha256").update(value).digest("hex").slice(0, 20); }
function safeErrorCode(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown };
  const value = typeof candidate.code === "string" ? candidate.code : typeof candidate.message === "string" ? candidate.message : "item_failed";
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80) || "item_failed";
}
function mapJobError(error: unknown): AppError {
  switch ((error as Error).message) {
    case "bulk_job_not_found": return new AppError("not_found", "Bulk job not found", 404);
    case "invalid_confirmation": return new AppError("invalid_confirmation", "Confirmation token is invalid", 403);
    case "bulk_job_busy": return new AppError("bulk_job_busy", "Bulk job is already running", 409);
    default: return error instanceof AppError ? error : new AppError("internal_error", "Bulk job operation failed", 500);
  }
}
