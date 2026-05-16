import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  type ClientErrorReportRow,
  type NewClientErrorReportRow,
  clientErrorReports,
  users,
} from "../db/schema";
import type {
  ClientErrorReportListQuery,
  ClientErrorReportSnapshot,
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
  if (query.userId) {
    conditions.push(eq(clientErrorReports.userId, query.userId));
  }

  let selectQuery = db.select().from(clientErrorReports).$dynamic();
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  return selectQuery.orderBy(desc(clientErrorReports.createdAt)).limit(query.limit);
}
