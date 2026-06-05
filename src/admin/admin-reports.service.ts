import { AppError, validationError } from "../common/errors";
import * as auditService from "./admin-audit.service";
import { sanitizeAuditMetadata } from "./admin-audit.service";
import * as reportsRepo from "./admin-reports.repo";
import type {
  AdminReportActionBody,
  AdminReportActionResponse,
  AdminReportDetailResponse,
  AdminReportsListResponse,
  AdminReportsQuery,
  ReportReviewAction,
  ReportStatus,
} from "./admin-reports.types";
import {
  toAdminReportItem,
  toAdminReportReviewActionItem,
} from "./admin-reports.types";
import type { AdminContext, AdminRequestContext } from "./admin.types";

type AdminReportsDeps = {
  repo: Pick<
    typeof reportsRepo,
    "createReportReviewAction" | "findReportById" | "listReportReviewActions" | "listReports"
  >;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminReportsDeps = {
  repo: reportsRepo,
  audit: auditService,
};

let deps: AdminReportsDeps = defaultDeps;

export function __setAdminReportsServiceDepsForTests(
  overrides: Partial<AdminReportsDeps>,
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

export async function listReportsForAdmin(
  admin: AdminContext,
  query: AdminReportsQuery,
  requestContext: AdminRequestContext,
): Promise<AdminReportsListResponse> {
  const rows = await deps.repo.listReports(query);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.reports.list",
    targetType: "safety_reports",
    metadata: {
      filters: {
        status: query.status ?? null,
        targetType: query.targetType ?? null,
        reporterAmoriaId: query.reporterAmoriaId ?? null,
        targetOwnerAmoriaId: query.targetOwnerAmoriaId ?? null,
      },
      limit: query.limit,
      resultCount: rows.length,
    },
    ...requestContext,
  });

  return {
    items: rows.map(toAdminReportItem),
    nextCursor: null,
  };
}

export async function getReportForAdmin(
  admin: AdminContext,
  reportId: string,
  requestContext: AdminRequestContext,
): Promise<AdminReportDetailResponse> {
  const report = await deps.repo.findReportById(reportId);
  if (!report) {
    throw new AppError("not_found", "Report not found", 404);
  }

  const actions = await deps.repo.listReportReviewActions(reportId);
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.reports.detail.read",
    targetType: "safety_report",
    targetId: reportId,
    metadata: {
      status: report.status,
      targetType: report.targetType,
    },
    ...requestContext,
  });

  return {
    report: {
      ...toAdminReportItem(report),
      reviewActions: actions.map(toAdminReportReviewActionItem),
    },
  };
}

export async function createReportActionForAdmin(
  admin: AdminContext,
  reportId: string,
  input: AdminReportActionBody,
  requestContext: AdminRequestContext,
): Promise<AdminReportActionResponse> {
  assertCanActOnReport(admin, input.action);

  const status = statusForAction(input.action);
  const cleanedReason = cleanOptional(input.reason, 500);
  const cleanedNote = cleanOptional(input.note, 2000);
  const result = await deps.repo.createReportReviewAction({
    reportId,
    adminUserId: admin.adminUser.id,
    action: input.action,
    status,
    reason: cleanedReason,
    note: cleanedNote,
    metadata: sanitizeAuditMetadata(input.metadata),
  });

  if (!result) {
    throw new AppError("not_found", "Report not found", 404);
  }

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.reports.action",
    targetType: "safety_report",
    targetId: reportId,
    reason: cleanedReason,
    metadata: {
      action: input.action,
      reason: cleanedReason,
      note: cleanedNote,
      previousStatus: result.previousStatus,
      nextStatus: result.nextStatus,
      hasNote: Boolean(cleanedNote),
      actionCreatedAt: result.reviewAction.createdAt.toISOString(),
    },
    ...requestContext,
  });

  return {
    ok: true,
    report: toAdminReportItem(result.report),
    reviewAction: toAdminReportReviewActionItem(result.reviewAction),
  };
}

function assertCanActOnReport(admin: AdminContext, action: ReportReviewAction): void {
  if (admin.adminUser.roles.includes("owner") || admin.adminUser.roles.includes("moderator")) {
    return;
  }

  if (admin.adminUser.roles.includes("support") && action === "add_note") {
    return;
  }

  throw new AppError("forbidden", "Admin role is not allowed for this report action", 403);
}

function statusForAction(action: ReportReviewAction): ReportStatus | undefined {
  switch (action) {
    case "mark_under_review":
      return "under_review";
    case "dismiss":
      return "dismissed";
    case "resolve":
      return "resolved";
    case "escalate":
      return "escalated";
    case "assign":
    case "add_note":
      return undefined;
  }
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
