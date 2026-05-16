import type { JsonValue, ReportReviewActionRow } from "../db/schema";

export const REPORT_STATUSES = [
  "open",
  "under_review",
  "resolved",
  "dismissed",
  "escalated",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_REVIEW_ACTIONS = [
  "assign",
  "mark_under_review",
  "dismiss",
  "resolve",
  "escalate",
  "add_note",
] as const;
export type ReportReviewAction = (typeof REPORT_REVIEW_ACTIONS)[number];

export type AdminReportsQuery = {
  status?: ReportStatus;
  targetType?: string;
  reporterAmoriaId?: string;
  targetOwnerAmoriaId?: string;
  limit: number;
};

export type AdminReportUserSnapshot = {
  id: string;
  amoriaId: string;
  displayName: string;
  email: string;
};

export type AdminReportRow = {
  id: string;
  reporterUserId: string;
  reporter: AdminReportUserSnapshot;
  targetType: string;
  targetId: string;
  targetOwnerUserId: string | null;
  targetOwner: AdminReportUserSnapshot | null;
  reason: string;
  comment: string | null;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminReportItem = Omit<AdminReportRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export type AdminReportReviewActionItem = {
  id: string;
  reportId: string;
  adminUserId: string | null;
  action: ReportReviewAction;
  reason: string | null;
  note: string | null;
  metadata: JsonValue | null;
  createdAt: string;
};

export type AdminReportDetail = AdminReportItem & {
  reviewActions: AdminReportReviewActionItem[];
};

export type AdminReportsListResponse = {
  items: AdminReportItem[];
  nextCursor: null;
};

export type AdminReportDetailResponse = {
  report: AdminReportDetail;
};

export type AdminReportActionBody = {
  action: ReportReviewAction;
  reason?: string;
  note?: string;
  metadata?: unknown;
};

export type AdminReportActionResponse = {
  ok: true;
  report: AdminReportItem;
  reviewAction: AdminReportReviewActionItem;
};

export function toAdminReportItem(row: AdminReportRow): AdminReportItem {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminReportReviewActionItem(
  row: ReportReviewActionRow,
): AdminReportReviewActionItem {
  return {
    id: row.id,
    reportId: row.reportId,
    adminUserId: row.adminUserId,
    action: row.action as ReportReviewAction,
    reason: row.reason,
    note: row.note,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
