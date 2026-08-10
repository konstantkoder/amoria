import type { FastifyRequest } from "fastify";
import type { AdminAuditLogRow, AdminUserRow, JsonValue, UserRow } from "../db/schema";

export const ADMIN_ROLE_KEYS = ["owner", "support", "moderator", "ops"] as const;
export type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];
export type AdminStatus = "active" | "disabled";

export type AdminRole = {
  id: string;
  key: AdminRoleKey;
  name: string;
  description: string | null;
};

export type AdminUserWithRoles = {
  id: string;
  userId: string;
  status: AdminStatus;
  roles: AdminRoleKey[];
  createdAt: string;
  updatedAt: string;
};

export type AdminUserRecord = AdminUserRow & {
  userId: string;
  status: AdminStatus;
};

export type AdminUserListItem = AdminUserWithRoles & {
  email: string | null;
  displayName: string | null;
  user: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  };
};

export type AdminUserSearchQuery = {
  amoriaId?: string;
  q?: string;
  limit: number;
};

export type AdminUserSearchItem = {
  id: string;
  amoriaId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  emailVerifiedAt?: string | null;
  accountStatus?: "active" | "suspended";
  suspendedAt?: string | null;
  suspensionReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserDetail = AdminUserSearchItem & {
  gender: string | null;
  goal: string | null;
  mood: string | null;
  lastSeenAt: string | null;
  adminUserId: string | null;
};

export type AdminUserStatusActionBody = {
  action: "suspend" | "restore";
  reason: string;
};

export type AdminUserStatusActionResponse = {
  ok: true;
  user: AdminUserDetail;
  sessionsRevoked: boolean;
};

export type AdminCreateAdminUserBody = {
  userId: string;
  roles: AdminRoleKey[];
  reason: string;
};

export type AdminUpdateAdminUserBody = {
  status?: AdminStatus;
  roles?: AdminRoleKey[];
  reason: string;
};

export type AdminRequestContext = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AdminAuditMetadata = JsonValue | null;

export type AdminAuditInput = {
  adminUserId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  metadata?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AdminAuditLogItem = {
  id: string;
  adminUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadata: AdminAuditMetadata;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type AdminContext = {
  adminUser: AdminUserWithRoles;
  user: Pick<UserRow, "id" | "amoriaId" | "displayName" | "email">;
};

export type AdminHealthResponse = {
  ok: true;
  service: "amoria-admin";
  time: string;
  admin: {
    id: string;
    userId: string;
    roles: AdminRoleKey[];
  };
};

export type AdminMeResponse = {
  adminUser: AdminUserWithRoles;
  user: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  };
};

export type AdminUserSearchResponse = {
  items: AdminUserSearchItem[];
};

export type AdminUsersListResponse = {
  items: AdminUserListItem[];
  nextCursor: null;
};

export type AdminAuditLogResponse = {
  items: AdminAuditLogItem[];
  nextCursor: null;
};

export type BootstrapAdminResult = {
  usersPromoted: Array<{
    userId: string;
    amoriaId: string;
    adminUserId: string;
  }>;
  roleKeys: AdminRoleKey[];
};

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminContext;
  }
}

export function firstHeaderValue(value: FastifyRequest["headers"][string]): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized ? normalized : undefined;
}

export function toAdminUserWithRoles(adminUser: AdminUserRecord, roles: AdminRoleKey[]): AdminUserWithRoles {
  return {
    id: adminUser.id,
    userId: adminUser.userId,
    status: adminUser.status,
    roles,
    createdAt: adminUser.createdAt.toISOString(),
    updatedAt: adminUser.updatedAt.toISOString(),
  };
}

export function toAdminUserListItem(
  adminUser: AdminUserRecord,
  roles: AdminRoleKey[],
  user: AdminUserListItem["user"],
): AdminUserListItem {
  return {
    ...toAdminUserWithRoles(adminUser, roles),
    email: adminUser.email,
    displayName: adminUser.displayName,
    user,
  };
}

export function toAdminAuditLogItem(row: AdminAuditLogRow): AdminAuditLogItem {
  return {
    id: row.id,
    adminUserId: row.adminUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    metadata: row.metadata ?? null,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}
