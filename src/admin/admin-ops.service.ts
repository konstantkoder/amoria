import { sql } from "drizzle-orm";
import * as auditService from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";
import { db } from "../db/client";
import { env } from "../config/env";

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
    status: "not_checked";
    reason: string;
  };
};

type AdminOpsDeps = {
  dbCheck: () => Promise<boolean>;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminOpsDeps = {
  dbCheck: async () => {
    await db.execute(sql`select 1`);
    return true;
  },
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

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.opsHealth.read",
    targetType: "ops_health",
    metadata: {
      databaseOk,
      objectStorageStatus: "not_checked",
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
    objectStorage: {
      status: "not_checked",
      reason: "Object storage health check is not wired yet; no placeholder status is reported.",
    },
  };
}
