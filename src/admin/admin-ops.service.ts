import { count, eq, sql } from "drizzle-orm";
import * as auditService from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";
import { db } from "../db/client";
import { env } from "../config/env";
import {
  clientErrorReports,
  mediaFiles,
  mediaModerationReviews,
  safetyReports,
} from "../db/schema";
import * as togetherRepo from "../together/together.repo";

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

type AdminOpsDeps = {
  dbCheck: () => Promise<boolean>;
  counts: () => Promise<AdminOpsHealthResponse["counts"]>;
  objectStorageCheck: () => Promise<AdminOpsHealthResponse["objectStorage"]>;
  togetherQueue: Pick<typeof togetherRepo, "listQueueEntriesForAdmin">;
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
    items: entries.map((entry) => ({
      entryId: entry.entryId,
      userId: entry.userId,
      activity: entry.activity,
      status: entry.status,
      radiusKm: entry.radiusKm,
      hasCoordinates: entry.hasCoordinates,
      createdAt: entry.createdAt.toISOString(),
      expiresAt: entry.expiresAt.toISOString(),
      matchedSessionId: entry.matchedSessionId,
    })),
    nextCursor: null,
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
      )`,
    );

  return row?.value ?? 0;
}
