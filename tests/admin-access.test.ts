import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { AdminContextRow } from "../src/admin/admin.repo";
import type { AdminAuditInput, AdminAuditLogItem, AdminRoleKey } from "../src/admin/admin.types";
import type { UserRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { signAdminAccessTokenWithExpiry } = require("../src/admin/admin-jwt") as typeof import("../src/admin/admin-jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const adminService = require("../src/admin/admin.service") as typeof import("../src/admin/admin.service");

const userId = "00000000-0000-4000-8000-000000000001";
const adminUserId = "00000000-0000-4000-8000-0000000000a1";
const targetUserId = "00000000-0000-4000-8000-000000000002";
const auditLogId = "00000000-0000-4000-8000-0000000000b1";

let restoreDeps: (() => void) | null = null;

test("owner management serializes cross-row final-owner checks", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/admin/admin-user-control.repo.ts"),
    "utf8",
  );
  assert.match(source, /pg_advisory_xact_lock\(hashtext\('amoria_admin_owner_control'\)\)/);
  assert.ok(
    source.indexOf("pg_advisory_xact_lock") < source.indexOf("removesActiveOwner"),
    "owner lock must be acquired before checking the remaining active owners",
  );
});

test.after(async () => {
  restoreAdminDeps();
  await closeDb();
});

test("unauthenticated request cannot access /admin/health", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/health",
  });

  assert.equal(response.statusCode, 401);
});

test("normal authenticated user cannot access /admin/health", async (t) => {
  t.after(restoreAdminDeps);
  mockAdmin({ adminContext: undefined });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/health",
    headers: mobileAuthHeaders(userId),
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "unauthorized");
});

test("active admin can access /admin/health", async (t) => {
  t.after(restoreAdminDeps);
  mockAdmin({ roles: ["owner", "support"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/health",
    headers: authHeaders(userId),
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(body.ok, true);
  assert.equal(body.service, "amoria-admin");
  assert.equal(body.admin.id, adminUserId);
  assert.equal(body.admin.userId, userId);
  assert.deepEqual(body.admin.roles, ["owner", "support"]);
});

test("admin roles are returned correctly in /admin/me", async (t) => {
  t.after(restoreAdminDeps);
  mockAdmin({ roles: ["support", "moderator"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/me",
    headers: authHeaders(userId),
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.adminUser.roles, ["support", "moderator"]);
  assert.equal(body.user.id, userId);
  assert.equal(body.user.amoriaId, "AMOWNER1");
  assert.equal(body.user.displayName, "Admin Owner");
  assert.equal(body.user.email, "owner@example.test");
});

test("admin user search by amoriaId returns safe user data", async (t) => {
  t.after(restoreAdminDeps);
  const state = mockAdmin({ roles: ["support"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/users?amoriaId=AMTARGET&limit=10",
    headers: authHeaders(userId),
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.items, [
    {
      id: targetUserId,
      amoriaId: "AMTARGET",
      displayName: "Target User",
      email: "target@example.test",
      avatarUrl: "https://cdn.example.test/users/target/avatar.webp",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    },
  ]);
  assert.equal(state.searchQueries[0]?.amoriaId, "AMTARGET");
  assert.equal(state.searchQueries[0]?.limit, 10);
});

test("admin user search does not expose passwordHash or refresh tokens", async (t) => {
  t.after(restoreAdminDeps);
  mockAdmin({ roles: ["moderator"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/users?q=target",
    headers: authHeaders(userId),
  });
  const text = response.body;

  assert.equal(response.statusCode, 200);
  assert.equal(text.includes("passwordHash"), false);
  assert.equal(text.includes("refresh"), false);
  assert.equal(text.includes("token"), false);
  assert.equal(response.json().items[0].email, "target@example.test");
});

test("disabled admin cannot access /admin/health", async (t) => {
  t.after(restoreAdminDeps);
  mockAdmin({ status: "disabled", roles: ["owner"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/health",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 403);
});

test("admin audit log is written for user search", async (t) => {
  t.after(restoreAdminDeps);
  const state = mockAdmin({ roles: ["owner"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/users?amoriaId=AMTARGET",
    headers: {
      ...authHeaders(userId),
      "user-agent": "admin-test-agent",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(state.auditInputs.length, 1);
  assert.equal(state.auditInputs[0]?.action, "admin.users.search");
  assert.equal(state.auditInputs[0]?.adminUserId, adminUserId);
  assert.equal(state.auditInputs[0]?.targetType, "users");
  assert.deepEqual(state.auditInputs[0]?.metadata, {
    amoriaId: "AMTARGET",
    q: null,
    limit: 30,
    resultCount: 1,
  });
  assert.equal(state.auditInputs[0]?.userAgent, "admin-test-agent");
});

test("non-owner cannot access /admin/audit-log", async (t) => {
  t.after(restoreAdminDeps);
  const state = mockAdmin({ roles: ["support"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/audit-log",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 403);
  assert.equal(state.auditInputs.length, 0);
});

test("owner can access /admin/audit-log", async (t) => {
  t.after(restoreAdminDeps);
  const state = mockAdmin({ roles: ["owner"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/audit-log?limit=5",
    headers: authHeaders(userId),
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.items[0].id, auditLogId);
  assert.equal(body.nextCursor, null);
  assert.equal(state.auditInputs.length, 1);
  assert.equal(state.auditInputs[0]?.action, "admin.auditLog.read");
  assert.deepEqual(state.auditInputs[0]?.metadata, { limit: 5 });
});

test("owner can access /admin/admin-users without secrets", async (t) => {
  t.after(restoreAdminDeps);
  const state = mockAdmin({ roles: ["owner"] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/admin-users",
    headers: authHeaders(userId),
  });
  const bodyText = response.body;
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.items[0].id, adminUserId);
  assert.deepEqual(body.items[0].roles, ["owner"]);
  assert.equal(body.items[0].user.amoriaId, "AMOWNER1");
  assert.equal(bodyText.includes("passwordHash"), false);
  assert.equal(bodyText.includes("refreshToken"), false);
  assert.equal(bodyText.includes("secret"), false);
  assert.equal(state.auditInputs[0]?.action, "admin.adminUsers.read");
  assert.deepEqual(state.auditInputs[0]?.metadata, { resultCount: 1 });
});

for (const role of ["support", "moderator", "ops"] as const) {
  test(`${role} cannot access owner-only /admin/admin-users`, async (t) => {
    t.after(restoreAdminDeps);
    const state = mockAdmin({ roles: [role] });
    const app = buildApp();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/admin-users",
      headers: authHeaders(userId),
    });

    assert.equal(response.statusCode, 403);
    assert.equal(state.auditInputs.length, 0);
  });
}

function mockAdmin(input: {
  adminContext?: AdminContextRow;
  roles?: AdminRoleKey[];
  status?: "active" | "disabled";
} = {}) {
  restoreAdminDeps();

  const state: {
    auditInputs: AdminAuditInput[];
    searchQueries: Array<{ amoriaId?: string; q?: string; limit: number }>;
  } = {
    auditInputs: [],
    searchQueries: [],
  };

  const adminContext = "adminContext" in input
    ? input.adminContext
    : adminContextRow({
      roles: input.roles ?? ["owner"],
      status: input.status ?? "active",
    });

  restoreDeps = adminService.__setAdminServiceDepsForTests({
    repo: {
      ensureRequiredRoles: async () => undefined,
      findAdminContextByUserId: async () => adminContext,
      findUserById: async () => userRow({ id: userId, amoriaId: "AMOWNER1" }),
      findUsersByAmoriaIds: async () => [],
      upsertActiveAdminUserForUser: async () => adminUserRow({}),
      assignRole: async () => undefined,
      searchUsers: async (query) => {
        state.searchQueries.push(query);
        return [
          {
            id: targetUserId,
            amoriaId: "AMTARGET",
            displayName: "Target User",
            email: "target@example.test",
            avatarUrl: "https://cdn.example.test/users/target/avatar.webp",
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ];
      },
      listAdminUsers: async () => [
        {
          id: adminUserId,
          userId,
          email: "owner@example.test",
          displayName: "Admin Owner",
          status: "active",
          roles: ["owner"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          user: {
            id: userId,
            amoriaId: "AMOWNER1",
            displayName: "Admin Owner",
            email: "owner@example.test",
          },
        },
      ],
      listAuditLog: async () => [
        {
          id: auditLogId,
          adminUserId,
          action: "admin.users.search",
          targetType: "users",
          targetId: null,
          reason: null,
          metadata: { amoriaId: "AMTARGET", resultCount: 1 },
          requestId: "req-1",
          ipAddress: "127.0.0.1",
          userAgent: "admin-test-agent",
          createdAt: new Date("2026-01-04T00:00:00.000Z"),
        },
      ],
    },
    audit: {
      writeAuditLog: async (auditInput) => {
        state.auditInputs.push(auditInput);
      },
    },
  });

  return state;
}

function restoreAdminDeps(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function authHeaders(id: string) {
  return {
    Authorization: `Bearer ${signAdminAccessTokenWithExpiry({
      userId: id,
      adminUserId,
      adminSessionVersion: 0,
      userAuthVersion: 0,
    }).accessToken}`,
  };
}

function mobileAuthHeaders(id: string) {
  return { Authorization: `Bearer ${signAccessToken(id)}` };
}

function adminContextRow(input: {
  roles: AdminRoleKey[];
  status: "active" | "disabled";
}): AdminContextRow {
  return {
    adminUser: adminUserRow({ status: input.status }),
    user: {
      id: userId,
      amoriaId: "AMOWNER1",
      displayName: "Admin Owner",
      email: "owner@example.test",
      accountStatus: "active",
      authVersion: 0,
    },
    roles: input.roles,
    mfaEnabled: true,
  };
}

function adminUserRow(input: Partial<AdminContextRow["adminUser"]>): AdminContextRow["adminUser"] {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: adminUserId,
    userId,
    email: "owner@example.test",
    displayName: "Admin Owner",
    status: "active",
    sessionVersion: 0,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function userRow(input: Partial<UserRow>): UserRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: userId,
    email: "owner@example.test",
    emailVerifiedAt: now,
    passwordHash: "hash",
    displayName: "Admin Owner",
    about: null,
    amoriaId: "AMOWNER1",
    avatarUrl: null,
    photos: [],
    gender: null,
    preferredGenders: [],
    goal: null,
    mood: null,
    interests: [],
    flirtEnabled: false,
    allowAdultMode: false,
    mysteryMode: false,
    birthDate: "1995-01-01",
    preferredAgeMin: 18,
    preferredAgeMax: null,
    createdAt: now,
    updatedAt: now,
    ...input,
    lastSeenAt: input.lastSeenAt ?? null,
  };
}
