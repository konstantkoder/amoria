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
import * as togetherRepo from "../together/together.repo";
import type {
  AdminTogetherQueueActionBody,
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
  objectStorage: {
    status: "ok" | "failed" | "not_checked";
    reason: string;
  };
  counts: {
    openClientErrors: number | null;
    openReports: number | null;
    pendingMediaModerationItems: number | null;
  };
};

export type AdminTogetherQueueEntryDto = {
  entryId: string;
  userId: string;
  activity: string;
  status: string;
  radiusKm: number | null;
  hasCoordinates: boolean;
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
  objectStorageCheck: async () => ({
    status: "not_checked",
    reason: "No safe non-mutating object storage health check is configured for this release block.",
  }),
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
    objectStorage = await deps.objectStorageCheck();
  } catch {
    objectStorage = {
      status: "failed",
      reason: "Object storage health check failed.",
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

export async function listTogetherQueueForAdmin(
  admin: AdminContext,
  requestContext: AdminRequestContext,
): Promise<AdminTogetherQueueResponse> {
  const entries = await deps.togetherQueue.listQueueEntriesForAdmin();

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.togetherQueue.read",
    targetType: "together_queue",
    metadata: {
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
  const entry = await deps.togetherQueue.cancelQueueEntryForAdmin(entryId);
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
    activity: entry.activity,
    status: entry.status,
    radiusKm: entry.radiusKm,
    hasCoordinates: entry.hasCoordinates,
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
