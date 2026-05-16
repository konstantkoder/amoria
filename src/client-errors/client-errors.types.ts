import type { ClientErrorReportRow, JsonValue, UserRow } from "../db/schema";

export const CLIENT_ERROR_LIMIT_DEFAULT = 50;
export const CLIENT_ERROR_LIMIT_MAX = 100;

export type ClientErrorReportBody = {
  screen: string;
  action: string;
  step?: string;
  code?: string;
  message: string;
  stack?: string;
  metadata?: unknown;
  platform?: string;
  appVersion?: string;
  buildNumber?: string;
  deviceModel?: string;
  osVersion?: string;
  requestId?: string;
  backendUrl?: string;
};

export type ClientErrorReportContext = {
  userId?: string;
};

export type ClientErrorReportSnapshot = Pick<
  UserRow,
  "id" | "amoriaId" | "displayName" | "email"
>;

export type ClientErrorReportResponse = {
  ok: true;
  id: string;
};

export type ClientErrorReportListQuery = {
  limit: number;
  screen?: string;
  action?: string;
  code?: string;
  amoriaId?: string;
  userId?: string;
};

export type ClientErrorReportItem = {
  id: string;
  userId: string | null;
  amoriaId: string | null;
  displayName: string | null;
  email: string | null;
  screen: string;
  action: string;
  step: string | null;
  code: string | null;
  message: string;
  stack: string | null;
  metadata: JsonValue | null;
  platform: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  requestId: string | null;
  backendUrl: string | null;
  createdAt: string;
};

export type ClientErrorReportListResponse = {
  items: ClientErrorReportItem[];
  nextCursor: null;
};

export function toClientErrorReportItem(row: ClientErrorReportRow): ClientErrorReportItem {
  return {
    id: row.id,
    userId: row.userId,
    amoriaId: row.amoriaId,
    displayName: row.displayName,
    email: row.email,
    screen: row.screen,
    action: row.action,
    step: row.step,
    code: row.code,
    message: row.message,
    stack: row.stack,
    metadata: row.metadata ?? null,
    platform: row.platform,
    appVersion: row.appVersion,
    buildNumber: row.buildNumber,
    deviceModel: row.deviceModel,
    osVersion: row.osVersion,
    requestId: row.requestId,
    backendUrl: row.backendUrl,
    createdAt: row.createdAt.toISOString(),
  };
}
