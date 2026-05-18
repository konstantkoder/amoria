import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  type ClientErrorReportRow,
  type NewClientErrorReportRow,
  clientErrorReports,
  users,
} from "../db/schema";
import type {
  ClientErrorBulkFilters,
  ClientErrorReportListQuery,
  ClientErrorReportSnapshot,
  ClientErrorStatus,
} from "./client-errors.types";

export async function findUserSnapshotById(
  userId: string,
): Promise<ClientErrorReportSnapshot | undefined> {
  return db.query.users.findFirst({
    columns: {
      id: true,
      amoriaId: true,
      displayName: true,
      email: true,
    },
    where: eq(users.id, userId),
  });
}

export async function createClientErrorReport(
  input: NewClientErrorReportRow,
): Promise<ClientErrorReportRow> {
  const [created] = await db.insert(clientErrorReports).values(input).returning();
  if (!created) {
    throw new Error("Failed to create client error report");
  }

  return created;
}

export async function listClientErrorReports(
  query: ClientErrorReportListQuery,
): Promise<ClientErrorReportRow[]> {
  const conditions = clientErrorReportConditions(query);

  let selectQuery = db.select().from(clientErrorReports).$dynamic();
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  return selectQuery.orderBy(desc(clientErrorReports.createdAt)).limit(query.limit);
}

export async function updateClientErrorReportStatus(input: {
  id: string;
  status: ClientErrorStatus;
  resolvedAt: Date | null;
  resolvedByAdminUserId: string | null;
  resolutionNote: string | null;
}): Promise<{ previousStatus: ClientErrorStatus; row: ClientErrorReportRow } | undefined> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: clientErrorReports.status })
      .from(clientErrorReports)
      .where(eq(clientErrorReports.id, input.id))
      .limit(1);

    if (!current) {
      return undefined;
    }

    const [updated] = await tx
      .update(clientErrorReports)
      .set({
        status: input.status,
        resolvedAt: input.resolvedAt,
        resolvedByAdminUserId: input.resolvedByAdminUserId,
        resolutionNote: input.resolutionNote,
        updatedAt: new Date(),
      })
      .where(eq(clientErrorReports.id, input.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update client error report");
    }

    return {
      previousStatus: current.status as ClientErrorStatus,
      row: updated,
    };
  });
}

export async function bulkUpdateClientErrorReportStatus(input: {
  actionStatus: ClientErrorStatus;
  filters: ClientErrorBulkFilters;
  resolvedAt: Date;
  resolvedByAdminUserId: string;
  resolutionNote: string | null;
  limit: number;
}): Promise<{ count: number }> {
  const conditions = clientErrorReportConditions(input.filters);

  let selectQuery = db
    .select({ id: clientErrorReports.id })
    .from(clientErrorReports)
    .$dynamic();

  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const rows = await selectQuery
    .orderBy(desc(clientErrorReports.createdAt))
    .limit(input.limit);

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return { count: 0 };
  }

  const updated = await db
    .update(clientErrorReports)
    .set({
      status: input.actionStatus,
      resolvedAt: input.resolvedAt,
      resolvedByAdminUserId: input.resolvedByAdminUserId,
      resolutionNote: input.resolutionNote,
      updatedAt: new Date(),
    })
    .where(inArray(clientErrorReports.id, ids))
    .returning({ id: clientErrorReports.id });

  return { count: updated.length };
}

function clientErrorReportConditions(
  query: Partial<ClientErrorReportListQuery> | ClientErrorBulkFilters,
): SQL[] {
  const conditions: SQL[] = [];

  if (query.screen) {
    conditions.push(eq(clientErrorReports.screen, query.screen));
  }
  if (query.action) {
    conditions.push(eq(clientErrorReports.action, query.action));
  }
  if (query.code) {
    conditions.push(eq(clientErrorReports.code, query.code));
  }
  if (query.amoriaId) {
    conditions.push(eq(clientErrorReports.amoriaId, query.amoriaId));
  }
  if ("userId" in query && query.userId) {
    conditions.push(eq(clientErrorReports.userId, query.userId));
  }
  if (query.status) {
    conditions.push(eq(clientErrorReports.status, query.status));
  }
  if ("createdFrom" in query && query.createdFrom) {
    conditions.push(gte(clientErrorReports.createdAt, query.createdFrom));
  }
  if ("createdTo" in query && query.createdTo) {
    conditions.push(lte(clientErrorReports.createdAt, query.createdTo));
  }

  return conditions;
}
