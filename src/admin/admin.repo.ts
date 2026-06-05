import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  type AdminAuditLogRow,
  type AdminUserRow,
  type NewAdminAuditLogRow,
  adminAuditLog,
  adminRoles,
  adminUserRoles,
  adminUsers,
  users,
} from "../db/schema";
import type {
  AdminRoleKey,
  AdminStatus,
  AdminUserListItem,
  AdminUserSearchItem,
  AdminUserSearchQuery,
} from "./admin.types";
import { toAdminUserListItem } from "./admin.types";

const requiredRoles: Array<{ key: AdminRoleKey; name: string; description: string }> = [
  {
    key: "owner",
    name: "Owner",
    description: "Full Admin/Ops access, role management, and sensitive audit review.",
  },
  {
    key: "support",
    name: "Support",
    description: "User lookup and non-destructive account support workflows.",
  },
  {
    key: "moderator",
    name: "Moderator",
    description: "Reports, complaints, moderation queue, and media review workflows.",
  },
  {
    key: "ops",
    name: "Ops",
    description: "Operational health, diagnostics, and rate-limit visibility.",
  },
];

export type AdminContextRow = {
  adminUser: AdminUserRow & { userId: string; status: AdminStatus };
  user: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  };
  roles: AdminRoleKey[];
};

export async function ensureRequiredRoles(): Promise<void> {
  for (const role of requiredRoles) {
    await db
      .insert(adminRoles)
      .values(role)
      .onConflictDoUpdate({
        target: adminRoles.key,
        set: {
          name: role.name,
          description: role.description,
        },
      });
  }
}

export async function findUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function findUsersByAmoriaIds(amoriaIds: string[]) {
  if (amoriaIds.length === 0) {
    return [];
  }

  return db.select().from(users).where(inArray(users.amoriaId, amoriaIds));
}

export async function upsertActiveAdminUserForUser(user: {
  id: string;
  email: string;
  displayName: string;
}): Promise<AdminUserRow & { userId: string }> {
  const [adminUser] = await db
    .insert(adminUsers)
    .values({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      status: "active",
    })
    .onConflictDoUpdate({
      target: adminUsers.userId,
      set: {
        email: user.email,
        displayName: user.displayName,
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!adminUser?.userId) {
    throw new Error("Failed to create admin user");
  }

  return adminUser as AdminUserRow & { userId: string };
}

export async function assignRole(adminUserId: string, roleKey: AdminRoleKey): Promise<void> {
  const role = await db.query.adminRoles.findFirst({
    where: eq(adminRoles.key, roleKey),
  });

  if (!role) {
    throw new Error(`Admin role is missing: ${roleKey}`);
  }

  await db
    .insert(adminUserRoles)
    .values({
      adminUserId,
      roleId: role.id,
    })
    .onConflictDoNothing();
}

export async function findAdminContextByUserId(userId: string): Promise<AdminContextRow | undefined> {
  const [row] = await db
    .select({
      adminUser: adminUsers,
      user: {
        id: users.id,
        amoriaId: users.amoriaId,
        displayName: users.displayName,
        email: users.email,
      },
    })
    .from(adminUsers)
    .innerJoin(users, eq(adminUsers.userId, users.id))
    .where(eq(adminUsers.userId, userId))
    .limit(1);

  if (!row || !row.adminUser.userId) {
    return undefined;
  }

  const roles = await listRoleKeysForAdminUser(row.adminUser.id);

  return {
    adminUser: row.adminUser as AdminUserRow & { userId: string; status: AdminStatus },
    user: row.user,
    roles,
  };
}

export async function listRoleKeysForAdminUser(adminUserId: string): Promise<AdminRoleKey[]> {
  const rows = await db
    .select({ key: adminRoles.key })
    .from(adminUserRoles)
    .innerJoin(adminRoles, eq(adminUserRoles.roleId, adminRoles.id))
    .where(eq(adminUserRoles.adminUserId, adminUserId));

  return rows.map((row) => row.key as AdminRoleKey);
}

export async function searchUsers(query: AdminUserSearchQuery): Promise<AdminUserSearchItem[]> {
  const conditions: SQL[] = [];

  if (query.amoriaId) {
    conditions.push(eq(users.amoriaId, query.amoriaId));
  }

  if (query.q) {
    const pattern = `%${query.q}%`;
    const qConditions: SQL[] = [
      ilike(users.amoriaId, pattern),
      ilike(users.displayName, pattern),
      ilike(users.email, pattern),
    ];
    if (isUuidLike(query.q)) {
      qConditions.push(eq(users.id, query.q));
    }
    conditions.push(or(...qConditions) as SQL);
  }

  let selectQuery = db
    .select({
      id: users.id,
      amoriaId: users.amoriaId,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .$dynamic();

  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const rows = await selectQuery.orderBy(desc(users.createdAt)).limit(query.limit);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const rows = await db
    .select({
      adminUser: adminUsers,
      user: {
        id: users.id,
        amoriaId: users.amoriaId,
        displayName: users.displayName,
        email: users.email,
      },
    })
    .from(adminUsers)
    .innerJoin(users, eq(adminUsers.userId, users.id))
    .orderBy(desc(adminUsers.createdAt))
    .limit(200);

  const adminUserIds = rows.map((row) => row.adminUser.id);
  const rolesByAdminUserId = new Map<string, AdminRoleKey[]>();

  if (adminUserIds.length > 0) {
    const roleRows = await db
      .select({
        adminUserId: adminUserRoles.adminUserId,
        key: adminRoles.key,
      })
      .from(adminUserRoles)
      .innerJoin(adminRoles, eq(adminUserRoles.roleId, adminRoles.id))
      .where(inArray(adminUserRoles.adminUserId, adminUserIds));

    for (const row of roleRows) {
      const roles = rolesByAdminUserId.get(row.adminUserId) ?? [];
      roles.push(row.key as AdminRoleKey);
      rolesByAdminUserId.set(row.adminUserId, roles);
    }
  }

  return rows.map((row) =>
    toAdminUserListItem(
      row.adminUser as AdminUserRow & { userId: string; status: AdminStatus },
      rolesByAdminUserId.get(row.adminUser.id) ?? [],
      row.user,
    ),
  );
}

export async function createAuditLog(input: NewAdminAuditLogRow): Promise<AdminAuditLogRow> {
  const [created] = await db.insert(adminAuditLog).values(input).returning();
  if (!created) {
    throw new Error("Failed to create admin audit log entry");
  }
  return created;
}

export async function listAuditLog(limit: number): Promise<AdminAuditLogRow[]> {
  return db
    .select()
    .from(adminAuditLog)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit);
}
