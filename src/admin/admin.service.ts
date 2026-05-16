import { AppError, forbidden, validationError } from "../common/errors";
import type { UserRow } from "../db/schema";
import * as auditService from "./admin-audit.service";
import * as adminRepo from "./admin.repo";
import {
  ADMIN_ROLE_KEYS,
  type AdminAuditLogResponse,
  type AdminContext,
  type AdminHealthResponse,
  type AdminMeResponse,
  type AdminRequestContext,
  type AdminRoleKey,
  type AdminUserSearchQuery,
  type AdminUserSearchResponse,
  type BootstrapAdminResult,
  toAdminAuditLogItem,
  toAdminUserWithRoles,
} from "./admin.types";

type AdminServiceDeps = {
  repo: Pick<
    typeof adminRepo,
    | "assignRole"
    | "ensureRequiredRoles"
    | "findAdminContextByUserId"
    | "findUserById"
    | "findUsersByAmoriaIds"
    | "listAuditLog"
    | "searchUsers"
    | "upsertActiveAdminUserForUser"
  >;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminServiceDeps = {
  repo: adminRepo,
  audit: auditService,
};

let deps: AdminServiceDeps = defaultDeps;

export function __setAdminServiceDepsForTests(
  overrides: Partial<AdminServiceDeps>,
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

export async function getAdminContextByUserId(userId: string): Promise<AdminContext> {
  const row = await deps.repo.findAdminContextByUserId(userId);
  if (!row || row.adminUser.status !== "active") {
    throw forbidden("Admin access is required");
  }

  return {
    adminUser: toAdminUserWithRoles(row.adminUser, row.roles),
    user: row.user,
  };
}

export function assertAdminHasAnyRole(admin: AdminContext, allowedRoles: AdminRoleKey[]): void {
  if (allowedRoles.length === 0) {
    return;
  }

  if (!allowedRoles.some((role) => admin.adminUser.roles.includes(role))) {
    throw forbidden("Admin role is not allowed for this action");
  }
}

export function getAdminHealth(admin: AdminContext): AdminHealthResponse {
  return {
    ok: true,
    service: "amoria-admin",
    time: new Date().toISOString(),
    admin: {
      id: admin.adminUser.id,
      userId: admin.adminUser.userId,
      roles: admin.adminUser.roles,
    },
  };
}

export function getAdminMe(admin: AdminContext): AdminMeResponse {
  return {
    adminUser: admin.adminUser,
    user: admin.user,
  };
}

export async function searchAdminUsers(
  admin: AdminContext,
  query: AdminUserSearchQuery,
  requestContext: AdminRequestContext,
): Promise<AdminUserSearchResponse> {
  const items = await deps.repo.searchUsers(query);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.users.search",
    targetType: "users",
    metadata: {
      amoriaId: query.amoriaId ?? null,
      q: query.q ?? null,
      limit: query.limit,
      resultCount: items.length,
    },
    ...requestContext,
  });

  return { items };
}

export async function listAdminAuditLog(
  admin: AdminContext,
  limit: number,
  requestContext: AdminRequestContext,
): Promise<AdminAuditLogResponse> {
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.auditLog.read",
    targetType: "admin_audit_log",
    metadata: { limit },
    ...requestContext,
  });

  const rows = await deps.repo.listAuditLog(limit);
  return {
    items: rows.map(toAdminAuditLogItem),
    nextCursor: null,
  };
}

export async function bootstrapOwners(input: {
  amoriaIds: string[];
  userIds: string[];
}): Promise<BootstrapAdminResult> {
  const amoriaIds = uniqueNonEmpty(input.amoriaIds);
  const userIds = uniqueNonEmpty(input.userIds);

  if (amoriaIds.length === 0 && userIds.length === 0) {
    throw validationError(
      "ADMIN_BOOTSTRAP_AMORIA_IDS or ADMIN_BOOTSTRAP_USER_IDS must include at least one existing user",
    );
  }

  await deps.repo.ensureRequiredRoles();

  const usersById = new Map<string, UserRow>();
  for (const user of await deps.repo.findUsersByAmoriaIds(amoriaIds)) {
    usersById.set(user.id, user);
  }

  for (const userId of userIds) {
    const user = await deps.repo.findUserById(userId);
    if (!user) {
      throw new AppError("not_found", `Bootstrap user does not exist: ${userId}`, 404);
    }
    usersById.set(user.id, user);
  }

  for (const amoriaId of amoriaIds) {
    const matched = [...usersById.values()].some((user) => user.amoriaId === amoriaId);
    if (!matched) {
      throw new AppError("not_found", `Bootstrap Amoria ID does not exist: ${amoriaId}`, 404);
    }
  }

  const usersPromoted: BootstrapAdminResult["usersPromoted"] = [];
  for (const user of usersById.values()) {
    const adminUser = await deps.repo.upsertActiveAdminUserForUser(user);
    await deps.repo.assignRole(adminUser.id, "owner");
    usersPromoted.push({
      userId: user.id,
      amoriaId: user.amoriaId,
      adminUserId: adminUser.id,
    });
  }

  return {
    usersPromoted,
    roleKeys: [...ADMIN_ROLE_KEYS],
  };
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
