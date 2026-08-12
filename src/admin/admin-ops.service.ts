import { count, eq, inArray, sql } from "drizzle-orm";
import * as auditService from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";
import { AppError } from "../common/errors";
import {
  boundedDependencyStatus,
  DEPENDENCY_READINESS_TIMEOUT_MS,
} from "../common/dependency-readiness";
import { db } from "../db/client";
import { env } from "../config/env";
import { TOGETHER_HEARTBEAT_TIMEOUT_MS } from "../config/constants";
import {
  clientErrorReports,
  mediaFiles,
  safetyReports,
  togetherQueue,
  togetherSessions,
} from "../db/schema";
import {
  checkObjectStorageHealth,
  type ObjectStorageHealth,
} from "../media/object-storage";
import { verifyEmailDeliveryReadiness } from "../email/email-delivery.service";
import * as nearbyRepo from "../nearby/nearby.repo";
import * as togetherRepo from "../together/together.repo";
import type {
  AdminTogetherQueueActionBody,
  AdminTogetherQueueQuery,
  AdminTogetherSessionsQuery,
} from "./admin-ops.schemas";

export type AdminOpsHealthResponse = {
  ok: true;
  service: "amoria-admin-ops";
  time: string;
  admin: {
    id: string;
    userId: string;
    roles: string[];
  };
  nodeEnv: string;
  database: {
    ok: boolean;
  };
  objectStorage: ObjectStorageHealth;
  smtp: AdminSmtpHealth;
  counts: {
    openClientErrors: number | null;
    openReports: number | null;
    pendingMediaModerationItems: number | null;
  };
};

export type AdminSmtpHealth = {
  status: "ok" | "error";
  checkedAt: string;
};

export type AdminReleaseDashboardCounts = {
  reports: {
    open: number | null;
    underReview: number | null;
    escalated: number | null;
  };
  clientErrors: {
    open: number | null;
  };
  mediaModeration: {
    pending: number | null;
  };
  togetherQueue: {
    waiting: number | null;
  };
  togetherSessions: {
    active: number | null;
    recent24h: number | null;
  };
};

export type AdminReleaseDashboardResponse = {
  ok: true;
  service: "amoria-admin-ops";
  time: string;
  admin: {
    id: string;
    userId: string;
    roles: string[];
  };
  health: {
    apiStatus: "ok";
    databaseStatus: "ok" | "failed";
    objectStorage: ObjectStorageHealth;
    smtp: AdminSmtpHealth;
  };
  reports: AdminReleaseDashboardCounts["reports"];
  clientErrors: AdminReleaseDashboardCounts["clientErrors"];
  mediaModeration: AdminReleaseDashboardCounts["mediaModeration"];
  togetherQueue: AdminReleaseDashboardCounts["togetherQueue"];
  togetherSessions: AdminReleaseDashboardCounts["togetherSessions"];
  nearby: {
    checkedAt: string | null;
    activeVisibilityCount: number | null;
    offVisibilityCount: number | null;
    expiredVisibilityCount: number | null;
    profileReadinessMissingCount: number | null;
  };
};

export type AdminNearbyDiagnosticsResponse = {
  ok: true;
  status: "ok";
  checkedAt: string;
  activeVisibilityCount: number;
  offVisibilityCount: number;
  expiredVisibilityCount: number;
  recentlyUpdatedCount: number;
  profileReadinessMissing: {
    missingBirthDate: number;
    missingGender: number;
    missingPreferredGenders: number;
    missingAvatar: number;
    missingDisplayName: number;
  };
  profileReadinessItems: Array<{
    amoriaId: string;
    displayName: string | null;
    emailMasked: string | null;
    missingReasons: nearbyRepo.NearbyAdminProfileMissingReason[];
    visibilityStatus: nearbyRepo.NearbyAdminVisibilityStatusBucket;
    createdAt: string;
    updatedAt: string;
  }>;
  feedExclusionReasons: Record<nearbyRepo.NearbyAdminFeedExclusionReason, number>;
};

export type AdminTogetherQueueEntryDto = {
  entryId: string;
  userId: string;
  amoriaId: string | null;
  displayName: string | null;
  activity: string;
  status: string;
  radiusKm: number | null;
  hasCoordinates: boolean;
  geoMode:
    | "no_limit_with_location"
    | "finite_with_location"
    | "missing_location_invalid_old_entry";
  userAgeGroup: togetherRepo.AdminTogetherQueueEntryRow["userAgeGroup"];
  preferredAgeRange: togetherRepo.AdminTogetherQueueEntryRow["preferredAgeRange"];
  waitingReason: togetherRepo.AdminTogetherQueueWaitingReason;
  cancelledAt: string | null;
  cancelSource: togetherRepo.AdminTogetherQueueEntryRow["cancelSource"];
  cancelReason: string | null;
  lastAction: string | null;
  lastActionAt: string | null;
  lastClientPollAt: string | null;
  ageSeconds: number;
  createdAt: string;
  expiresAt: string;
  matchedSessionId: string | null;
};

export type AdminTogetherQueueResponse = {
  items: AdminTogetherQueueEntryDto[];
  nextCursor: null;
};

export type AdminTogetherQueueActionResponse = {
  ok: true;
  entry: AdminTogetherQueueEntryDto;
};

export type AdminTogetherSessionParticipantDto = {
  userId: string;
  lastHeartbeatAt: string | null;
  leftAt: string | null;
  isStale: boolean;
};

export type AdminTogetherSessionDto = {
  sessionId: string;
  activity: string;
  status: string;
  createdAt: string;
  deadlineAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  sourceSessionId: string | null;
  participantUserIds: string[];
  participantCount: number;
  participants: AdminTogetherSessionParticipantDto[];
  hasStaleParticipant: boolean;
  lastHeartbeatAt: string | null;
  leftAt: string | null;
  eventCount: number;
  strokeEventCount: number;
  storyChoiceCount: number;
  revealDecisions: {
    open: number;
    skip: number;
    continueStory: number;
    pending: number;
    total: number;
  };
};

export type AdminTogetherSessionsResponse = {
  items: AdminTogetherSessionDto[];
  nextCursor: null;
};

type AdminOpsDeps = {
  dbCheck: () => Promise<boolean>;
  counts: () => Promise<AdminOpsHealthResponse["counts"]>;
  dashboardCounts: () => Promise<AdminReleaseDashboardCounts>;
  objectStorageCheck: () => Promise<AdminOpsHealthResponse["objectStorage"]>;
  smtpCheck: () => Promise<void>;
  smtpTimeoutMs: number;
  nearbyDiagnostics: Pick<typeof nearbyRepo, "getNearbyAdminDiagnostics">;
  togetherQueue: Pick<
    typeof togetherRepo,
    "listQueueEntriesForAdmin" | "cancelQueueEntryForAdmin" | "listSessionsForAdmin"
  >;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminOpsDeps = {
  dbCheck: async () => {
    await db.execute(sql`select 1`);
    return true;
  },
  counts: async () => ({
    openClientErrors: await countOpenClientErrors(),
    openReports: await countOpenReports(),
    pendingMediaModerationItems: await countPendingMediaModerationItems(),
  }),
  dashboardCounts: getReleaseDashboardCounts,
  objectStorageCheck: checkObjectStorageHealth,
  smtpCheck: verifyEmailDeliveryReadiness,
  smtpTimeoutMs: DEPENDENCY_READINESS_TIMEOUT_MS,
  nearbyDiagnostics: nearbyRepo,
  togetherQueue: togetherRepo,
  audit: auditService,
};

let deps: AdminOpsDeps = defaultDeps;

export function __setAdminOpsServiceDepsForTests(
  overrides: Partial<AdminOpsDeps>,
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

export async function getOpsHealth(
  admin: AdminContext,
  requestContext: AdminRequestContext,
): Promise<AdminOpsHealthResponse> {
  let databaseOk = false;
  try {
    databaseOk = await deps.dbCheck();
  } catch {
    databaseOk = false;
  }

  let counts: AdminOpsHealthResponse["counts"] = {
    openClientErrors: null,
    openReports: null,
    pendingMediaModerationItems: null,
  };
  try {
    counts = await deps.counts();
  } catch {
    counts = {
      openClientErrors: null,
      openReports: null,
      pendingMediaModerationItems: null,
    };
  }

  let objectStorage: AdminOpsHealthResponse["objectStorage"];
  try {
    objectStorage = normalizeObjectStorageHealth(await deps.objectStorageCheck());
  } catch {
    objectStorage = {
      status: "error",
      checkedAt: new Date().toISOString(),
      errorCode: "health_check_exception",
    };
  }

  const smtp = await getSafeSmtpHealth();

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.opsHealth.read",
    targetType: "ops_health",
    metadata: {
      databaseOk,
      objectStorageStatus: objectStorage.status,
      smtpStatus: smtp.status,
      counts,
    },
    ...requestContext,
  });

  return {
    ok: true,
    service: "amoria-admin-ops",
    time: new Date().toISOString(),
    admin: {
      id: admin.adminUser.id,
      userId: admin.adminUser.userId,
      roles: admin.adminUser.roles,
    },
    nodeEnv: env.NODE_ENV,
    database: {
      ok: databaseOk,
    },
    objectStorage,
    smtp,
    counts,
  };
}

export async function getReleaseDashboardForAdmin(
  admin: AdminContext,
  requestContext: AdminRequestContext,
): Promise<AdminReleaseDashboardResponse> {
  let databaseOk = false;
  try {
    databaseOk = await deps.dbCheck();
  } catch {
    databaseOk = false;
  }

  const objectStorage = await getSafeObjectStorageHealth();
  const smtp = await getSafeSmtpHealth();
  const counts = await getSafeReleaseDashboardCounts();
  const nearby = await getSafeNearbyDashboardCounts();

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.dashboard.releaseControl.read",
    targetType: "release_control_dashboard",
    metadata: {
      databaseStatus: databaseOk ? "ok" : "failed",
      objectStorageStatus: objectStorage.status,
      smtpStatus: smtp.status,
      reports: counts.reports,
      clientErrors: counts.clientErrors,
      mediaModeration: counts.mediaModeration,
      togetherQueue: counts.togetherQueue,
      togetherSessions: counts.togetherSessions,
      nearby,
    },
    ...requestContext,
  });

  return {
    ok: true,
    service: "amoria-admin-ops",
    time: new Date().toISOString(),
    admin: {
      id: admin.adminUser.id,
      userId: admin.adminUser.userId,
      roles: admin.adminUser.roles,
    },
    health: {
      apiStatus: "ok",
      databaseStatus: databaseOk ? "ok" : "failed",
      objectStorage,
      smtp,
    },
    reports: counts.reports,
    clientErrors: counts.clientErrors,
    mediaModeration: counts.mediaModeration,
    togetherQueue: counts.togetherQueue,
    togetherSessions: counts.togetherSessions,
    nearby,
  };
}

export async function getNearbyDiagnosticsForAdmin(
  admin: AdminContext,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyDiagnosticsResponse> {
  const diagnostics = await deps.nearbyDiagnostics.getNearbyAdminDiagnostics();

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyDiagnostics.read",
    targetType: "nearby_diagnostics",
    metadata: {
      activeVisibilityCount: diagnostics.activeVisibilityCount,
      offVisibilityCount: diagnostics.offVisibilityCount,
      expiredVisibilityCount: diagnostics.expiredVisibilityCount,
      recentlyUpdatedCount: diagnostics.recentlyUpdatedCount,
      profileReadinessMissing: diagnostics.profileReadinessMissing,
      profileReadinessItemCount: diagnostics.profileReadinessItems.length,
      feedExclusionReasons: diagnostics.feedExclusionReasons,
    },
    ...requestContext,
  });

  return {
    ok: true,
    status: "ok",
    checkedAt: diagnostics.checkedAt.toISOString(),
    activeVisibilityCount: diagnostics.activeVisibilityCount,
    offVisibilityCount: diagnostics.offVisibilityCount,
    expiredVisibilityCount: diagnostics.expiredVisibilityCount,
    recentlyUpdatedCount: diagnostics.recentlyUpdatedCount,
    profileReadinessMissing: diagnostics.profileReadinessMissing,
    profileReadinessItems: diagnostics.profileReadinessItems.map((item) => ({
      amoriaId: item.amoriaId,
      displayName: item.displayName,
      emailMasked: item.emailMasked,
      missingReasons: item.missingReasons,
      visibilityStatus: item.visibilityStatus,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    feedExclusionReasons: diagnostics.feedExclusionReasons,
  };
}

function normalizeObjectStorageHealth(input: ObjectStorageHealth): ObjectStorageHealth {
  const checkedAt = Number.isNaN(Date.parse(input.checkedAt))
    ? new Date().toISOString()
    : input.checkedAt;

  if (input.status === "ok") {
    return {
      status: "ok",
      checkedAt,
    };
  }

  if (input.status === "not_configured") {
    return {
      status: "not_configured",
      checkedAt,
      reason: "missing_config",
    };
  }

  if (input.status === "not_checked") {
    return {
      status: "not_checked",
      checkedAt,
      reason: "safe_check_unavailable",
    };
  }

  return {
    status: "error",
    checkedAt,
    errorCode: safeObjectStorageHealthErrorCode(input.errorCode),
  };
}

function safeObjectStorageHealthErrorCode(errorCode: string | undefined): string {
  switch (errorCode) {
    case "access_denied":
    case "bucket_not_found":
    case "credentials_error":
    case "health_check_exception":
    case "request_failed":
    case "storage_check_failed":
      return errorCode;
    default:
      return "storage_check_failed";
  }
}

async function getSafeObjectStorageHealth(): Promise<ObjectStorageHealth> {
  try {
    return normalizeObjectStorageHealth(await deps.objectStorageCheck());
  } catch {
    return {
      status: "error",
      checkedAt: new Date().toISOString(),
      errorCode: "health_check_exception",
    };
  }
}

async function getSafeSmtpHealth(): Promise<AdminSmtpHealth> {
  return {
    status: await boundedDependencyStatus(deps.smtpCheck, deps.smtpTimeoutMs),
    checkedAt: new Date().toISOString(),
  };
}

async function getSafeReleaseDashboardCounts(): Promise<AdminReleaseDashboardCounts> {
  try {
    return await deps.dashboardCounts();
  } catch {
    return unavailableReleaseDashboardCounts();
  }
}

async function getSafeNearbyDashboardCounts(): Promise<AdminReleaseDashboardResponse["nearby"]> {
  try {
    const diagnostics = await deps.nearbyDiagnostics.getNearbyAdminDiagnostics();
    return {
      checkedAt: diagnostics.checkedAt.toISOString(),
      activeVisibilityCount: diagnostics.activeVisibilityCount,
      offVisibilityCount: diagnostics.offVisibilityCount,
      expiredVisibilityCount: diagnostics.expiredVisibilityCount,
      profileReadinessMissingCount: Object.values(diagnostics.profileReadinessMissing).reduce(
        (total, value) => total + value,
        0,
      ),
    };
  } catch {
    return {
      checkedAt: null,
      activeVisibilityCount: null,
      offVisibilityCount: null,
      expiredVisibilityCount: null,
      profileReadinessMissingCount: null,
    };
  }
}

function unavailableReleaseDashboardCounts(): AdminReleaseDashboardCounts {
  return {
    reports: {
      open: null,
      underReview: null,
      escalated: null,
    },
    clientErrors: {
      open: null,
    },
    mediaModeration: {
      pending: null,
    },
    togetherQueue: {
      waiting: null,
    },
    togetherSessions: {
      active: null,
      recent24h: null,
    },
  };
}

export async function listTogetherQueueForAdmin(
  admin: AdminContext,
  query: AdminTogetherQueueQuery,
  requestContext: AdminRequestContext,
): Promise<AdminTogetherQueueResponse> {
  const entries = await deps.togetherQueue.listQueueEntriesForAdmin(query);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.togetherQueue.read",
    targetType: "together_queue",
    metadata: {
      filters: {
        status: query.status ?? null,
        activity: query.activity ?? null,
        radiusKm: query.radiusKm ?? null,
        geoMode: query.geoMode ?? null,
        hasCoordinates: query.hasCoordinates ?? null,
        ageGroup: query.ageGroup ?? null,
        waitingReason: query.waitingReason ?? null,
      },
      resultCount: entries.length,
    },
    ...requestContext,
  });

  return {
    items: entries.map(toAdminTogetherQueueEntryDto),
    nextCursor: null,
  };
}

export async function actionTogetherQueueEntryForAdmin(
  admin: AdminContext,
  entryId: string,
  input: AdminTogetherQueueActionBody,
  requestContext: AdminRequestContext,
): Promise<AdminTogetherQueueActionResponse> {
  const entry = await deps.togetherQueue.cancelQueueEntryForAdmin(entryId, input.reason);
  if (!entry) {
    throw new AppError("not_found", "Together queue entry not found", 404);
  }

  if (entry.status !== "cancelled") {
    throw new AppError(
      "together_queue_not_waiting",
      "Only waiting Together queue entries can be cancelled",
      409,
    );
  }

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.togetherQueue.cancel",
    targetType: "together_queue",
    targetId: entry.entryId,
    metadata: {
      action: input.action,
      activity: entry.activity,
      radiusKm: entry.radiusKm,
      hasCoordinates: entry.hasCoordinates,
      geoMode: entry.geoMode,
      waitingReason: entry.waitingReason,
      userAgeGroup: entry.userAgeGroup,
      preferredAgeRange: entry.preferredAgeRange,
      cancelSource: entry.cancelSource,
      cancelReason: entry.cancelReason,
      cancelledAt: entry.cancelledAt?.toISOString() ?? null,
      reason: input.reason,
    },
    ...requestContext,
  });

  return {
    ok: true,
    entry: toAdminTogetherQueueEntryDto(entry),
  };
}

export async function listTogetherSessionsForAdmin(
  admin: AdminContext,
  query: AdminTogetherSessionsQuery,
  requestContext: AdminRequestContext,
): Promise<AdminTogetherSessionsResponse> {
  const sessions = await deps.togetherQueue.listSessionsForAdmin(query);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.togetherSessions.read",
    targetType: "together_sessions",
    metadata: {
      filters: {
        status: query.status ?? null,
        activity: query.activity ?? null,
        sessionId: query.sessionId ?? null,
      },
      resultCount: sessions.length,
    },
    ...requestContext,
  });

  return {
    items: sessions.map(toAdminTogetherSessionDto),
    nextCursor: null,
  };
}

function toAdminTogetherQueueEntryDto(
  entry: togetherRepo.AdminTogetherQueueEntryRow,
): AdminTogetherQueueEntryDto {
  return {
    entryId: entry.entryId,
    userId: entry.userId,
    amoriaId: entry.amoriaId,
    displayName: entry.displayName,
    activity: entry.activity,
    status: entry.status,
    radiusKm: entry.radiusKm,
    hasCoordinates: entry.hasCoordinates,
    geoMode: entry.geoMode,
    userAgeGroup: entry.userAgeGroup,
    preferredAgeRange: entry.preferredAgeRange,
    waitingReason: entry.waitingReason,
    cancelledAt: entry.cancelledAt?.toISOString() ?? null,
    cancelSource: entry.cancelSource,
    cancelReason: entry.cancelReason,
    lastAction: entry.lastAction,
    lastActionAt: entry.lastActionAt?.toISOString() ?? null,
    lastClientPollAt: entry.lastClientPollAt?.toISOString() ?? null,
    ageSeconds: entry.ageSeconds,
    createdAt: entry.createdAt.toISOString(),
    expiresAt: entry.expiresAt.toISOString(),
    matchedSessionId: entry.matchedSessionId,
  };
}

function toAdminTogetherSessionDto(
  session: togetherRepo.AdminTogetherSessionRow,
): AdminTogetherSessionDto {
  const now = Date.now();
  const participants = session.participants.map((participant) => {
    const lastHeartbeatAt = participant.lastHeartbeatAt?.toISOString() ?? null;
    const isStale =
      session.status === "active" &&
      (!participant.lastHeartbeatAt ||
        now - participant.lastHeartbeatAt.getTime() > TOGETHER_HEARTBEAT_TIMEOUT_MS);

    return {
      userId: participant.userId,
      lastHeartbeatAt,
      leftAt: participant.leftAt?.toISOString() ?? null,
      isStale,
    };
  });

  return {
    sessionId: session.sessionId,
    activity: session.activity,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    deadlineAt: session.deadlineAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    endedReason: session.endedReason,
    sourceSessionId: session.sourceSessionId,
    participantUserIds: session.participantUserIds,
    participantCount: session.participantCount,
    participants,
    hasStaleParticipant: participants.some((participant) => participant.isStale),
    lastHeartbeatAt: session.lastHeartbeatAt?.toISOString() ?? null,
    leftAt: session.leftAt?.toISOString() ?? null,
    eventCount: session.eventCount,
    strokeEventCount: session.strokeEventCount,
    storyChoiceCount: session.storyChoiceCount,
    revealDecisions: session.revealDecisions,
  };
}

async function countOpenClientErrors(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(clientErrorReports)
    .where(eq(clientErrorReports.status, "open"));

  return row?.value ?? 0;
}

async function countOpenReports(): Promise<number> {
  return countSafetyReportsByStatus("open");
}

async function getReleaseDashboardCounts(): Promise<AdminReleaseDashboardCounts> {
  const [
    openReports,
    underReviewReports,
    escalatedReports,
    openClientErrors,
    pendingMediaModeration,
    waitingTogetherQueue,
    activeTogetherSessions,
    recentTogetherSessions,
  ] = await Promise.all([
    countSafetyReportsByStatus("open"),
    countSafetyReportsByStatus("under_review"),
    countSafetyReportsByStatus("escalated"),
    countOpenClientErrors(),
    countPendingMediaModerationItems(),
    countTogetherQueueByStatus("waiting"),
    countTogetherSessionsByStatus("active"),
    countRecentTogetherSessions(),
  ]);

  return {
    reports: {
      open: openReports,
      underReview: underReviewReports,
      escalated: escalatedReports,
    },
    clientErrors: {
      open: openClientErrors,
    },
    mediaModeration: {
      pending: pendingMediaModeration,
    },
    togetherQueue: {
      waiting: waitingTogetherQueue,
    },
    togetherSessions: {
      active: activeTogetherSessions,
      recent24h: recentTogetherSessions,
    },
  };
}

async function countSafetyReportsByStatus(status: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(safetyReports)
    .where(eq(safetyReports.status, status));

  return row?.value ?? 0;
}

async function countPendingMediaModerationItems(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(mediaFiles)
    .where(inArray(mediaFiles.moderationState, ["pending", "needs_review", "restricted"]));

  return row?.value ?? 0;
}

async function countTogetherQueueByStatus(status: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(togetherQueue)
    .where(eq(togetherQueue.status, status));

  return row?.value ?? 0;
}

async function countTogetherSessionsByStatus(status: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(togetherSessions)
    .where(eq(togetherSessions.status, status));

  return row?.value ?? 0;
}

async function countRecentTogetherSessions(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(togetherSessions)
    .where(sql`${togetherSessions.createdAt} >= now() - interval '24 hours'`);

  return row?.value ?? 0;
}
