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

export type AdminReportTargetContextLink = {
  kind:
    | "reporter_user"
    | "target_owner_user"
    | "target_user"
    | "target_media"
    | "target_thread"
    | "target_message"
    | "target_together_session"
    | "nearby_diagnostics";
  label: string;
  screen: "users" | "media" | "together_sessions" | "nearby_diagnostics" | "none";
  available: boolean;
  params: Record<string, string>;
  unavailableReason: string | null;
};

export type AdminReportTargetContext = {
  summary: string;
  privacyNote: string;
  links: AdminReportTargetContextLink[];
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
  targetContext: AdminReportTargetContext;
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
    targetContext: buildTargetContext(row),
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

function buildTargetContext(row: AdminReportRow): AdminReportTargetContext {
  const links: AdminReportTargetContextLink[] = [
    {
      kind: "reporter_user",
      label: "Open reporter profile",
      screen: "users",
      available: true,
      params: { amoriaId: row.reporter.amoriaId },
      unavailableReason: null,
    },
  ];

  if (row.targetOwner) {
    links.push({
      kind: "target_owner_user",
      label: "Open target owner profile",
      screen: "users",
      available: true,
      params: { amoriaId: row.targetOwner.amoriaId },
      unavailableReason: null,
    });
  }

  switch (normalizedTargetType(row.targetType)) {
    case "user":
      links.push({
        kind: "target_user",
        label: "Open target user",
        screen: "users",
        available: true,
        params: { q: row.targetId },
        unavailableReason: null,
      });
      break;
    case "media":
      links.push({
        kind: "target_media",
        label: "Open target media",
        screen: "media",
        available: true,
        params: {
          mediaId: row.targetId,
          reason: `Safety report ${row.id}`,
        },
        unavailableReason: null,
      });
      break;
    case "thread":
      links.push({
        kind: "target_thread",
        label: "Chat thread target",
        screen: "none",
        available: false,
        params: { targetId: row.targetId },
        unavailableReason: "Dedicated safe chat-thread admin view is not available yet.",
      });
      break;
    case "message":
      links.push({
        kind: "target_message",
        label: "Chat message target",
        screen: "none",
        available: false,
        params: { targetId: row.targetId },
        unavailableReason: "Dedicated safe chat-message admin view is not available yet.",
      });
      break;
    case "together_session":
      links.push({
        kind: "target_together_session",
        label: "Open Together session",
        screen: "together_sessions",
        available: true,
        params: { sessionId: row.targetId },
        unavailableReason: null,
      });
      break;
    case "nearby":
      links.push({
        kind: "nearby_diagnostics",
        label: "Open Nearby diagnostics",
        screen: "nearby_diagnostics",
        available: true,
        params: { targetId: row.targetId },
        unavailableReason: null,
      });
      break;
  }

  return {
    summary: `${row.targetType}:${row.targetId}`,
    privacyNote:
      "Safe admin context only: exact coordinates, exact birth dates, locked gallery media, private credentials, and signed URLs are not included.",
    links,
  };
}

function normalizedTargetType(
  targetType: string,
): "user" | "media" | "thread" | "message" | "together_session" | "nearby" | "other" {
  const normalized = targetType.trim().toLowerCase();
  if (normalized === "user" || normalized === "profile") {
    return "user";
  }
  if (["media", "media_file", "photo", "profile_photo"].includes(normalized)) {
    return "media";
  }
  if (normalized === "thread" || normalized === "chat_thread") {
    return "thread";
  }
  if (normalized === "message" || normalized === "chat_message") {
    return "message";
  }
  if (normalized === "session" || normalized === "together_session" || normalized.startsWith("together")) {
    return "together_session";
  }
  if (normalized === "nearby" || normalized.startsWith("nearby_")) {
    return "nearby";
  }
  return "other";
}
