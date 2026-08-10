import type { JsonValue } from "../db/schema";

export const ADMIN_BULK_KINDS = [
  "media_scan",
  "media_decision",
  "message_decision",
  "physical_media_purge",
] as const;
export type AdminBulkKind = (typeof ADMIN_BULK_KINDS)[number];
export type AdminBulkStatus = "awaiting_confirmation" | "running" | "completed" | "partially_failed" | "cancelled";

export type AdminBulkPreviewBody = {
  kind: AdminBulkKind;
  action: string;
  reason: string;
  idempotencyKey: string;
  maxItems: number;
  scope: {
    moderationStatus?: string;
    ownerAmoriaId?: string;
  };
};

export type AdminBulkConfirmBody = { confirmationToken: string };

export type AdminBulkJobItem = {
  id: string;
  targetType: string;
  targetId: string;
  proposedAction: string;
  status: "pending" | "applied" | "skipped" | "failed";
  errorCode: string | null;
  metadata: JsonValue | null;
  appliedAt: string | null;
  createdAt: string;
};

export type AdminBulkJob = {
  id: string;
  adminUserId: string | null;
  kind: AdminBulkKind;
  action: string;
  scope: JsonValue;
  reason: string;
  idempotencyKey: string;
  maxItems: number;
  status: AdminBulkStatus;
  confirmedAt: string | null;
  completedAt: string | null;
  previewCount: number;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminBulkJobDetail = AdminBulkJob & { items: AdminBulkJobItem[] };
