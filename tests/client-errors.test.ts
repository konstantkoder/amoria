import assert from "node:assert/strict";
import test from "node:test";
import type { AdminContextRow } from "../src/admin/admin.repo";
import type { AdminAuditInput, AdminRoleKey } from "../src/admin/admin.types";
import type {
  ClientErrorReportListQuery,
  ClientErrorReportSnapshot,
  ClientErrorStatus,
} from "../src/client-errors/client-errors.types";
import type {
  ClientErrorReportRow,
  NewClientErrorReportRow,
  UserRow,
} from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const adminService = require("../src/admin/admin.service") as typeof import("../src/admin/admin.service");
const clientErrorsService = require(
  "../src/client-errors/client-errors.service",
) as typeof import("../src/client-errors/client-errors.service");

const userId = "00000000-0000-4000-8000-000000000001";
const adminUserId = "00000000-0000-4000-8000-0000000000a1";
const reportId = "00000000-0000-4000-8000-0000000000c1";

let restoreAdminDeps: (() => void) | null = null;
let restoreClientErrorDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("POST /client/error-reports saves authenticated report with user snapshot", async (t) => {
  t.after(restoreDeps);
  const state = mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/client/error-reports",
    headers: authHeaders(userId),
    payload: {
      screen: "PhotoManagerScreen",
      action: "uploadProfilePhoto",
      step: "putUpload",
      code: "media.uploadPutFailed",
      message: "PUT upload failed",
      metadata: {
        uploadUrlHost: "localhost:9000",
      },
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), { ok: true, id: reportId });
  assert.equal(state.created[0]?.userId, userId);
  assert.equal(state.created[0]?.amoriaId, "AMOWNER1");
  assert.equal(state.created[0]?.displayName, "Admin Owner");
  assert.equal(state.created[0]?.email, "owner@example.test");
  assert.equal(state.created[0]?.screen, "PhotoManagerScreen");
  assert.equal(state.created[0]?.step, "putUpload");
});

test("POST /client/error-reports saves anonymous report without auth", async (t) => {
  t.after(restoreDeps);
  const state = mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/client/error-reports",
    payload: {
      screen: "LoginScreen",
      action: "login",
      code: "network_error",
      message: "Network request failed",
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(state.created[0]?.userId, null);
  assert.equal(state.created[0]?.amoriaId, null);
  assert.equal(state.created[0]?.email, null);
});

test("POST /client/error-reports rejects invalid oversized fields", async (t) => {
  t.after(restoreDeps);
  mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/client/error-reports",
    payload: {
      screen: "x".repeat(121),
      action: "uploadProfilePhoto",
      message: "failed",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "validation_error");
});

test("POST /client/error-reports redacts token password and secret metadata keys", async (t) => {
  t.after(restoreDeps);
  const state = mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/client/error-reports",
    payload: {
      screen: "PhotoManagerScreen",
      action: "uploadProfilePhoto",
      message: "failed",
      metadata: {
        accessToken: "secret-token",
        accountPassword: "secret-password",
        s3SecretKey: "secret-s3",
        nested: {
          refreshToken: "secret-refresh",
          safe: "visible",
        },
      },
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(state.created[0]?.metadata, {
    accessToken: "[redacted]",
    accountPassword: "[redacted]",
    s3SecretKey: "[redacted]",
    nested: {
      refreshToken: "[redacted]",
      safe: "visible",
    },
  });
});

test("POST /client/error-reports truncates stack and message", async (t) => {
  t.after(restoreDeps);
  const state = mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/client/error-reports",
    payload: {
      screen: "PhotoManagerScreen",
      action: "uploadProfilePhoto",
      message: "m".repeat(3000),
      stack: "s".repeat(9000),
    },
  });

  assert.equal(response.statusCode, 201);
  assert.ok((state.created[0]?.message ?? "").length < 2020);
  assert.ok((state.created[0]?.stack ?? "").length < 8020);
  assert.match(state.created[0]?.message ?? "", /\[truncated\]$/);
  assert.match(state.created[0]?.stack ?? "", /\[truncated\]$/);
});

test("normal user cannot GET /admin/client-errors", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ adminContext: undefined });
  mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/client-errors",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 403);
});

for (const role of ["owner", "support", "ops"] as const) {
  test(`admin ${role} can GET /admin/client-errors`, async (t) => {
    t.after(restoreDeps);
    mockAdmin({ roles: [role] });
    mockClientErrors();
    const app = buildApp();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/client-errors?limit=5",
      headers: authHeaders(userId),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().items[0].id, reportId);
  });
}

test("admin client error feed does not expose password hashes or refresh tokens", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/client-errors",
    headers: authHeaders(userId),
  });
  const bodyText = response.body;

  assert.equal(response.statusCode, 200);
  assert.equal(bodyText.includes("passwordHash"), false);
  assert.equal(bodyText.includes("refreshToken"), false);
  assert.equal(bodyText.includes("token"), false);
});

test("GET /admin/client-errors filters by amoriaId screen action and code", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["support"] });
  const state = mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/client-errors?amoriaId=AMOWNER1&screen=PhotoManagerScreen&action=uploadProfilePhoto&code=media.uploadPutFailed&limit=7",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(state.listQueries[0], {
    amoriaId: "AMOWNER1",
    screen: "PhotoManagerScreen",
    action: "uploadProfilePhoto",
    code: "media.uploadPutFailed",
    limit: 7,
  });
});

test("reading admin client errors writes audit log", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  const state = mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/client-errors?screen=PhotoManagerScreen",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(state.auditInputs.length, 1);
  assert.equal(state.auditInputs[0]?.action, "admin.clientErrors.read");
  assert.equal(state.auditInputs[0]?.adminUserId, adminUserId);
  assert.equal(state.auditInputs[0]?.targetType, "client_error_reports");
  assert.deepEqual(state.auditInputs[0]?.metadata, {
    filters: {
      screen: "PhotoManagerScreen",
      action: null,
      code: null,
      amoriaId: null,
      userId: null,
      status: null,
      createdFrom: null,
      createdTo: null,
    },
    limit: 50,
    resultCount: 1,
  });
});

for (const input of [
  { action: "resolve", expectedStatus: "resolved", title: "Admin can resolve client error" },
  { action: "ignore", expectedStatus: "ignored", title: "Admin can ignore client error" },
  { action: "archive", expectedStatus: "archived", title: "Admin can archive client error" },
  { action: "reopen", expectedStatus: "open", title: "Admin can reopen client error" },
] as const) {
  test(input.title, async (t) => {
    t.after(restoreDeps);
    mockAdmin({ roles: ["ops"] });
    const state = mockClientErrors({
      previousStatus: input.action === "reopen" ? "resolved" : "open",
    });
    const app = buildApp();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "POST",
      url: `/admin/client-errors/${reportId}/actions`,
      headers: authHeaders(userId),
      payload: {
        action: input.action,
        note: "Handled during release smoke",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().nextStatus, input.expectedStatus);
    assert.equal(state.statusUpdates[0]?.status, input.expectedStatus);
    assert.equal(state.auditInputs[0]?.action, "admin.clientErrors.action");
    assert.equal(state.auditInputs[0]?.targetType, "client_error_report");
    assert.equal(state.auditInputs[0]?.targetId, reportId);
    const auditMetadata = state.auditInputs[0]?.metadata as Record<string, unknown> | undefined;
    assert.equal(auditMetadata?.action, input.action);
    assert.equal(auditMetadata?.nextStatus, input.expectedStatus);

    if (input.action === "reopen") {
      assert.equal(state.statusUpdates[0]?.resolvedAt, null);
      assert.equal(state.statusUpdates[0]?.resolvedByAdminUserId, null);
      assert.equal(state.statusUpdates[0]?.resolutionNote, null);
    } else {
      assert.ok(state.statusUpdates[0]?.resolvedAt instanceof Date);
      assert.equal(state.statusUpdates[0]?.resolvedByAdminUserId, adminUserId);
      assert.equal(state.statusUpdates[0]?.resolutionNote, "Handled during release smoke");
    }
  });
}

test("non-admin cannot act on client error", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ adminContext: undefined });
  mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/admin/client-errors/${reportId}/actions`,
    headers: authHeaders(userId),
    payload: {
      action: "resolve",
    },
  });

  assert.equal(response.statusCode, 403);
});

test("bulk archive with filters updates only matching rows and writes audit log", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["support"] });
  const state = mockClientErrors({ bulkCount: 2 });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/admin/client-errors/actions/bulk",
    headers: authHeaders(userId),
    payload: {
      action: "archive",
      filters: {
        screen: "PhotoManagerScreen",
        action: "uploadProfilePhoto",
        code: "media.uploadPutFailed",
        amoriaId: "AMOWNER1",
        status: "open",
      },
      note: "Archive old release smoke errors",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().count, 2);
  assert.equal(response.json().maxAffectedRows, 500);
  assert.deepEqual(state.bulkUpdates[0]?.filters, {
    screen: "PhotoManagerScreen",
    action: "uploadProfilePhoto",
    code: "media.uploadPutFailed",
    amoriaId: "AMOWNER1",
    status: "open",
  });
  assert.equal(state.bulkUpdates[0]?.actionStatus, "archived");
  assert.equal(state.bulkUpdates[0]?.limit, 500);
  assert.equal(state.auditInputs[0]?.action, "admin.clientErrors.bulkAction");
  assert.equal(state.auditInputs[0]?.targetType, "client_error_reports");
  const auditMetadata = state.auditInputs[0]?.metadata as Record<string, unknown> | undefined;
  assert.equal(auditMetadata?.count, 2);
});

test("GET /admin/client-errors status filter works", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  const state = mockClientErrors();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/client-errors?status=archived",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(state.listQueries[0]?.status, "archived");
});

function mockClientErrors(input: { previousStatus?: ClientErrorStatus; bulkCount?: number } = {}) {
  restoreClientErrorDeps?.();
  restoreClientErrorDeps = null;

  const state: {
    created: NewClientErrorReportRow[];
    listQueries: ClientErrorReportListQuery[];
    auditInputs: AdminAuditInput[];
    statusUpdates: Array<{
      status: string;
      resolvedAt: Date | null;
      resolvedByAdminUserId: string | null;
      resolutionNote: string | null;
    }>;
    bulkUpdates: Array<{
      actionStatus: string;
      filters: Record<string, unknown>;
      limit: number;
    }>;
  } = {
    created: [],
    listQueries: [],
    auditInputs: [],
    statusUpdates: [],
    bulkUpdates: [],
  };

  restoreClientErrorDeps = clientErrorsService.__setClientErrorsServiceDepsForTests({
    repo: {
      findUserSnapshotById: async () => userSnapshot(),
      createClientErrorReport: async (input) => {
        state.created.push(input);
        return reportRow(input);
      },
      listClientErrorReports: async (query) => {
        state.listQueries.push(query);
        return [reportRow({})];
      },
      updateClientErrorReportStatus: async (statusInput) => {
        state.statusUpdates.push({
          status: statusInput.status,
          resolvedAt: statusInput.resolvedAt,
          resolvedByAdminUserId: statusInput.resolvedByAdminUserId,
          resolutionNote: statusInput.resolutionNote,
        });
        return {
          previousStatus: input.previousStatus ?? "open",
          row: reportRow({
            status: statusInput.status,
            resolvedAt: statusInput.resolvedAt,
            resolvedByAdminUserId: statusInput.resolvedByAdminUserId,
            resolutionNote: statusInput.resolutionNote,
          }),
        };
      },
      bulkUpdateClientErrorReportStatus: async (bulkInput) => {
        state.bulkUpdates.push({
          actionStatus: bulkInput.actionStatus,
          filters: bulkInput.filters,
          limit: bulkInput.limit,
        });
        return { count: input.bulkCount ?? 0 };
      },
    },
    audit: {
      writeAuditLog: async (input) => {
        state.auditInputs.push(input);
      },
    },
  });

  return state;
}

function mockAdmin(input: {
  adminContext?: AdminContextRow;
  roles?: AdminRoleKey[];
} = {}) {
  restoreAdminDeps?.();
  restoreAdminDeps = null;

  const adminContext = "adminContext" in input
    ? input.adminContext
    : adminContextRow(input.roles ?? ["owner"]);

  restoreAdminDeps = adminService.__setAdminServiceDepsForTests({
    repo: {
      ensureRequiredRoles: async () => undefined,
      findAdminContextByUserId: async () => adminContext,
      findUserById: async () => userRow({ id: userId, amoriaId: "AMOWNER1" }),
      findUsersByAmoriaIds: async () => [],
      upsertActiveAdminUserForUser: async () => ({
        id: adminUserId,
        userId,
        email: "owner@example.test",
        displayName: "Admin Owner",
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      assignRole: async () => undefined,
      searchUsers: async () => [],
      listAdminUsers: async () => [],
      listAuditLog: async () => [],
    },
  });
}

function restoreDeps(): void {
  if (restoreAdminDeps) {
    restoreAdminDeps();
    restoreAdminDeps = null;
  }
  if (restoreClientErrorDeps) {
    restoreClientErrorDeps();
    restoreClientErrorDeps = null;
  }
}

function authHeaders(id: string) {
  return {
    Authorization: `Bearer ${signAccessToken(id)}`,
  };
}

function adminContextRow(roles: AdminRoleKey[]): AdminContextRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    adminUser: {
      id: adminUserId,
      userId,
      email: "owner@example.test",
      displayName: "Admin Owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    user: {
      id: userId,
      amoriaId: "AMOWNER1",
      displayName: "Admin Owner",
      email: "owner@example.test",
    },
    roles,
  };
}

function userSnapshot(): ClientErrorReportSnapshot {
  return {
    id: userId,
    amoriaId: "AMOWNER1",
    displayName: "Admin Owner",
    email: "owner@example.test",
  };
}

function reportRow(input: Partial<NewClientErrorReportRow>): ClientErrorReportRow {
  return {
    id: reportId,
    userId: input.userId ?? userId,
    amoriaId: input.amoriaId ?? "AMOWNER1",
    displayName: input.displayName ?? "Admin Owner",
    email: input.email ?? "owner@example.test",
    screen: input.screen ?? "PhotoManagerScreen",
    action: input.action ?? "uploadProfilePhoto",
    step: input.step ?? "putUpload",
    code: input.code ?? "media.uploadPutFailed",
    message: input.message ?? "PUT upload failed",
    stack: input.stack ?? null,
    metadata: input.metadata ?? { uploadUrlHost: "localhost:9000" },
    platform: input.platform ?? "ios",
    appVersion: input.appVersion ?? "1.0.0",
    buildNumber: input.buildNumber ?? null,
    deviceModel: input.deviceModel ?? "iPhone",
    osVersion: input.osVersion ?? "18.0",
    requestId: input.requestId ?? "req-1",
    backendUrl: input.backendUrl ?? "https://api.example.test",
    status: input.status ?? "open",
    resolvedAt: input.resolvedAt ?? null,
    resolvedByAdminUserId: input.resolvedByAdminUserId ?? null,
    resolutionNote: input.resolutionNote ?? null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

function userRow(input: Partial<UserRow>): UserRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: userId,
    email: "owner@example.test",
    passwordHash: "hash",
    displayName: "Admin Owner",
    about: null,
    amoriaId: "AMOWNER1",
    avatarUrl: null,
    photos: [],
    goal: null,
    mood: null,
    interests: [],
    flirtEnabled: false,
    allowAdultMode: false,
    mysteryMode: false,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}
