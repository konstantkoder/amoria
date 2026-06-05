import { and, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import {
  type JsonValue,
  type NewReportReviewActionRow,
  type ReportReviewActionRow,
  type SafetyReportRow,
  reportReviewActions,
  safetyReports,
  users,
} from "../db/schema";
import type {
  AdminReportRow,
  AdminReportsQuery,
  ReportStatus,
} from "./admin-reports.types";

const reporterUsers = alias(users, "reporter_users");
const targetOwnerUsers = alias(users, "target_owner_users");

type ReportSelectRow = {
  report: SafetyReportRow;
  reporter: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  };
  targetOwner: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  } | null;
};

export async function listReports(query: AdminReportsQuery): Promise<AdminReportRow[]> {
  const conditions: SQL[] = [];

  if (query.status) {
    conditions.push(eq(safetyReports.status, query.status));
  }
  if (query.targetType) {
    conditions.push(eq(safetyReports.targetType, query.targetType));
  }
  if (query.reporterAmoriaId) {
    conditions.push(eq(reporterUsers.amoriaId, query.reporterAmoriaId));
  }
  if (query.targetOwnerAmoriaId) {
    conditions.push(eq(targetOwnerUsers.amoriaId, query.targetOwnerAmoriaId));
  }

  let selectQuery = reportSelect().$dynamic();
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const rows = await selectQuery
    .orderBy(desc(safetyReports.createdAt))
    .limit(query.limit);

  return rows.map(toAdminReportRow);
}

export async function findReportById(reportId: string): Promise<AdminReportRow | undefined> {
  const [row] = await reportSelect().where(eq(safetyReports.id, reportId)).limit(1);
  return row ? toAdminReportRow(row) : undefined;
}

export async function listReportReviewActions(
  reportId: string,
): Promise<ReportReviewActionRow[]> {
  return db
    .select()
    .from(reportReviewActions)
    .where(eq(reportReviewActions.reportId, reportId))
    .orderBy(desc(reportReviewActions.createdAt));
}

export async function createReportReviewAction(input: {
  reportId: string;
  adminUserId: string;
  action: NewReportReviewActionRow["action"];
  status?: ReportStatus;
  reason?: string | null;
  note?: string | null;
  metadata?: NewReportReviewActionRow["metadata"];
}): Promise<
  | {
    report: AdminReportRow;
    reviewAction: ReportReviewActionRow;
    previousStatus: ReportStatus;
    nextStatus: ReportStatus;
  }
  | undefined
> {
  const result = await db.transaction(async (tx) => {
    const [existingReport] = await tx
      .select()
      .from(safetyReports)
      .where(eq(safetyReports.id, input.reportId))
      .limit(1);

    if (!existingReport) {
      return undefined;
    }

    const previousStatus = existingReport.status as ReportStatus;
    const nextStatus = input.status ?? previousStatus;
    const [updatedReport] = await tx
      .update(safetyReports)
      .set({
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(safetyReports.id, input.reportId))
      .returning();

    if (!updatedReport) {
      return undefined;
    }

    const [reviewAction] = await tx
      .insert(reportReviewActions)
      .values({
        reportId: input.reportId,
        adminUserId: input.adminUserId,
        action: input.action,
        reason: input.reason ?? null,
        note: input.note ?? null,
        metadata: withStatusMetadata(input.metadata, previousStatus, nextStatus),
      })
      .returning();

    if (!reviewAction) {
      throw new Error("Failed to write report review action");
    }

    return {
      reviewAction,
      previousStatus,
      nextStatus,
    };
  });

  if (!result) {
    return undefined;
  }

  const report = await findReportById(input.reportId);
  if (!report) {
    throw new Error("Failed to reload report after review action");
  }

  return {
    report,
    reviewAction: result.reviewAction,
    previousStatus: result.previousStatus,
    nextStatus: result.nextStatus,
  };
}

function reportSelect() {
  return db
    .select({
      report: safetyReports,
      reporter: {
        id: reporterUsers.id,
        amoriaId: reporterUsers.amoriaId,
        displayName: reporterUsers.displayName,
        email: reporterUsers.email,
      },
      targetOwner: {
        id: targetOwnerUsers.id,
        amoriaId: targetOwnerUsers.amoriaId,
        displayName: targetOwnerUsers.displayName,
        email: targetOwnerUsers.email,
      },
    })
    .from(safetyReports)
    .innerJoin(reporterUsers, eq(safetyReports.reporterUserId, reporterUsers.id))
    .leftJoin(targetOwnerUsers, eq(safetyReports.targetOwnerUserId, targetOwnerUsers.id));
}

function toAdminReportRow(row: ReportSelectRow): AdminReportRow {
  return {
    id: row.report.id,
    reporterUserId: row.report.reporterUserId,
    reporter: row.reporter,
    targetType: row.report.targetType,
    targetId: row.report.targetId,
    targetOwnerUserId: row.report.targetOwnerUserId,
    targetOwner: row.targetOwner,
    reason: row.report.reason,
    comment: row.report.comment,
    status: row.report.status as ReportStatus,
    createdAt: row.report.createdAt,
    updatedAt: row.report.updatedAt,
  };
}

function withStatusMetadata(
  metadata: JsonValue | null | undefined,
  previousStatus: ReportStatus,
  nextStatus: ReportStatus,
): JsonValue {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return {
      ...metadata,
      previousStatus,
      nextStatus,
    };
  }

  if (metadata === null || metadata === undefined) {
    return {
      previousStatus,
      nextStatus,
    };
  }

  return {
    value: metadata,
    previousStatus,
    nextStatus,
  };
}
