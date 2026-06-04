import { count, eq, sql } from "drizzle-orm";
import * as auditService from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";
import { AppError } from "../common/errors";
import { db } from "../db/client";
import { env } from "../config/env";
import { TOGETHER_HEARTBEAT_TIMEOUT_MS } from "../config/constants";
import {
  clientErrorReports,
  mediaFiles,
  mediaModerationReviews,
  safetyReports,
} from "../db/schema";
import {
  checkObjectStorageHealth,
  type ObjectStorageHealth,
} from "../media/object-storage";
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
  counts: {
    openClientErrors: number | null;
    openReports: number | null;
    pendingMediaModerationItems: number | null;
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
  objectStorageCheck: () => Promise<AdminOpsHealthResponse["objectStorage"]>;
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
  objectStorageCheck: checkObjectStorageHealth,
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

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.opsHealth.read",
    targetType: "ops_health",
    metadata: {
      databaseOk,
      objectStorageStatus: objectStorage.status,
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
    counts,
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
  const [row] = await db
    .select({ value: count() })
    .from(safetyReports)
    .where(eq(safetyReports.status, "open"));

  return row?.value ?? 0;
}

async function countPendingMediaModerationItems(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(mediaFiles)
    .where(
      sql`not exists (
          select 1
          from ${mediaModerationReviews}
          where ${mediaModerationReviews.mediaId} = ${mediaFiles.id}
        )
        or (
          select ${mediaModerationReviews.action}
          from ${mediaModerationReviews}
          where ${mediaModerationReviews.mediaId} = ${mediaFiles.id}
          order by ${mediaModerationReviews.createdAt} desc
          limit 1
        ) = 'mark_under_review'`,
    );

  return row?.value ?? 0;
}
