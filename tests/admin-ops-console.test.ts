import assert from "node:assert/strict";
import test from "node:test";
import type { AdminMediaRow } from "../src/admin/admin-media.types";
import type { AdminReportRow, ReportStatus } from "../src/admin/admin-reports.types";
import type { AdminContextRow } from "../src/admin/admin.repo";
import type { AdminAuditInput, AdminRoleKey } from "../src/admin/admin.types";
import type {
  AdminUserRow,
  MediaModerationReviewRow,
  ReportReviewActionRow,
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
const { verifyPassword } = require("../src/auth/passwords") as typeof import("../src/auth/passwords");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const adminService = require("../src/admin/admin.service") as typeof import("../src/admin/admin.service");
const adminOwnerService = require("../src/admin/admin-owner.service") as typeof import("../src/admin/admin-owner.service");
const adminReportsService = require("../src/admin/admin-reports.service") as typeof import("../src/admin/admin-reports.service");
const adminMediaService = require("../src/admin/admin-media.service") as typeof import("../src/admin/admin-media.service");

const userId = "00000000-0000-4000-8000-000000000001";
const adminUserId = "00000000-0000-4000-8000-0000000000a1";
const reportId = "00000000-0000-4000-8000-0000000000d1";
const mediaId = "00000000-0000-4000-8000-0000000000e1";
const reviewId = "00000000-0000-4000-8000-0000000000f1";

let restoreAdminDeps: (() => void) | null = null;
let restoreOwnerDeps: (() => void) | null = null;
let restoreReportsDeps: (() => void) | null = null;
let restoreMediaDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("admin owner account bootstrap creates a real password-backed user if configured", async (t) => {
  t.after(restoreDeps);
  const state = mockOwnerBootstrap();

  const result = await adminOwnerService.createOwnerAdminAccount({
    email: "owner@example.test",
    password: "StrongOwnerPassword123!",
    displayName: "Amoria Owner",
  });

  assert.equal(result.createdUser, true);
  assert.equal(result.generatedPassword, false);
  assert.equal(result.email, "owner@example.test");
  assert.equal(state.createdUsers.length, 1);
  assert.equal(await verifyPassword("StrongOwnerPassword123!", state.createdUsers[0]?.passwordHash ?? ""), true);
  assert.deepEqual(state.assignedRoles, [{ adminUserId, role: "owner" }]);
});

test("admin owner bootstrap does not duplicate an existing user", async (t) => {
  t.after(restoreDeps);
  const existing = userRow({ email: "owner@example.test", displayName: "Existing Owner" });
  const state = mockOwnerBootstrap({ existingUser: existing });

  const result = await adminOwnerService.createOwnerAdminAccount({
    email: "owner@example.test",
    password: "StrongOwnerPassword123!",
    displayName: "Amoria Owner",
  });

  assert.equal(result.createdUser, false);
  assert.equal(result.userId, existing.id);
  assert.equal(state.createdUsers.length, 0);
  assert.deepEqual(state.assignedRoles, [{ adminUserId, role: "owner" }]);
});

test("created owner can use normal auth credentials and access /admin/me", async (t) => {
  t.after(restoreDeps);
  const state = mockOwnerBootstrap();
  const result = await adminOwnerService.createOwnerAdminAccount({
    email: "owner@example.test",
    password: "StrongOwnerPassword123!",
    displayName: "Amoria Owner",
  });

  assert.equal(await verifyPassword("StrongOwnerPassword123!", state.createdUsers[0]?.passwordHash ?? ""), true);
  mockAdmin({ roles: ["owner"], user: state.createdUsers[0] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/me",
    headers: authHeaders(result.userId),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.email, "owner@example.test");
  assert.deepEqual(response.json().adminUser.roles, ["owner"]);
});

test("non-admin cannot access new admin web APIs", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ adminContext: undefined });
  mockReports();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/reports",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 403);
});

test("GET /admin/reports enforces report role policy", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  mockReports();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const denied = await app.inject({
    method: "GET",
    url: "/admin/reports",
    headers: authHeaders(userId),
  });

  assert.equal(denied.statusCode, 403);

  restoreDeps();
  mockAdmin({ roles: ["moderator"] });
  mockReports();
  const allowedApp = buildApp();
  t.after(async () => {
    await allowedApp.close();
  });

  const allowed = await allowedApp.inject({
    method: "GET",
    url: "/admin/reports?status=open&limit=5",
    headers: authHeaders(userId),
  });

  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().items[0].id, reportId);
});

test("POST /admin/reports/:id/actions writes review action and audit log", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockReports();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/admin/reports/${reportId}/actions`,
    headers: authHeaders(userId),
    payload: {
      action: "resolve",
      reason: "Reviewed evidence",
      note: "Handled by moderator",
      metadata: { accessToken: "must-redact", safe: "visible" },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(state.reviewActions[0]?.action, "resolve");
  assert.equal(state.reviewActions[0]?.status, "resolved");
  assert.equal(state.reviewActions[0]?.metadata?.accessToken, "[redacted]");
  assert.equal(state.auditInputs[0]?.action, "admin.reports.action");
  assert.equal(state.auditInputs[0]?.targetId, reportId);
});

test("GET /admin/media enforces media role policy", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  mockMedia();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const denied = await app.inject({
    method: "GET",
    url: "/admin/media",
    headers: authHeaders(userId),
  });

  assert.equal(denied.statusCode, 403);

  restoreDeps();
  mockAdmin({ roles: ["support"] });
  mockMedia();
  const allowedApp = buildApp();
  t.after(async () => {
    await allowedApp.close();
  });

  const allowed = await allowedApp.inject({
    method: "GET",
    url: "/admin/media?ownerAmoriaId=AMOWNER1",
    headers: authHeaders(userId),
  });

  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().items[0].id, mediaId);
});

test("POST /admin/media/:mediaId/decision writes moderation review and audit log", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  const state = mockMedia();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/admin/media/${mediaId}/decision`,
    headers: authHeaders(userId),
    payload: {
      action: "restrict",
      reason: "Policy issue",
      metadata: { password: "must-redact", safe: "visible" },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(state.decisions[0]?.action, "restrict");
  assert.equal(state.decisions[0]?.metadata?.password, "[redacted]");
  assert.equal(state.auditInputs[0]?.action, "admin.media.decision");
  assert.equal(state.auditInputs[0]?.targetId, mediaId);
});

test("locked media access requires elevated role and reason", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["support"] });
  mockMedia({ visibility: "locked" });
  const supportApp = buildApp();
  t.after(async () => {
    await supportApp.close();
  });

  const supportDenied = await supportApp.inject({
    method: "GET",
    url: `/admin/media/${mediaId}?reason=Support%20check`,
    headers: authHeaders(userId),
  });
  assert.equal(supportDenied.statusCode, 403);

  restoreDeps();
  mockAdmin({ roles: ["moderator"] });
  mockMedia({ visibility: "locked" });
  const missingReasonApp = buildApp();
  t.after(async () => {
    await missingReasonApp.close();
  });

  const missingReason = await missingReasonApp.inject({
    method: "GET",
    url: `/admin/media/${mediaId}`,
    headers: authHeaders(userId),
  });
  assert.equal(missingReason.statusCode, 400);

  restoreDeps();
  mockAdmin({ roles: ["moderator"] });
  const state = mockMedia({ visibility: "locked" });
  const allowedApp = buildApp();
  t.after(async () => {
    await allowedApp.close();
  });

  const allowed = await allowedApp.inject({
    method: "GET",
    url: `/admin/media/${mediaId}?reason=Moderation%20review`,
    headers: authHeaders(userId),
  });

  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().media.url, "https://cdn.example.test/media.webp");
  assert.equal(state.auditInputs[0]?.action, "admin.media.locked.view");
  assert.equal(state.auditInputs[0]?.reason, "Moderation review");
});

test("admin endpoints do not expose password hashes refresh tokens or secrets", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  mockReports();
  mockMedia();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const reports = await app.inject({
    method: "GET",
    url: "/admin/reports",
    headers: authHeaders(userId),
  });
  const media = await app.inject({
    method: "GET",
    url: "/admin/media",
    headers: authHeaders(userId),
  });
  const combined = `${reports.body}\n${media.body}`;

  assert.equal(reports.statusCode, 200);
  assert.equal(media.statusCode, 200);
  assert.equal(combined.includes("passwordHash"), false);
  assert.equal(combined.includes("refreshToken"), false);
  assert.equal(combined.includes("secret"), false);
});

function mockOwnerBootstrap(input: { existingUser?: UserRow } = {}) {
  restoreOwnerDeps?.();
  restoreOwnerDeps = null;

  const state: {
    createdUsers: UserRow[];
    assignedRoles: Array<{ adminUserId: string; role: AdminRoleKey }>;
  } = {
    createdUsers: [],
    assignedRoles: [],
  };

  restoreOwnerDeps = adminOwnerService.__setAdminOwnerDepsForTests({
    authRepo: {
      findUserByEmail: async () => input.existingUser,
      createUser: async (userInput) => {
        const created = userRow({
          email: userInput.email,
          passwordHash: userInput.passwordHash,
          displayName: userInput.displayName,
          amoriaId: userInput.amoriaId,
        });
        state.createdUsers.push(created);
        return created;
      },
      uniqueConstraint: () => undefined,
    },
    adminRepo: {
      ensureRequiredRoles: async () => undefined,
      upsertActiveAdminUserForUser: async (user) => adminUserRow({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
      }),
      assignRole: async (nextAdminUserId, role) => {
        state.assignedRoles.push({ adminUserId: nextAdminUserId, role });
      },
    },
    generateAmoriaId: () => "AMOWNER1",
    writeCredentialsFile: async () => "F:\\Dev\\AmoriaAdminSecrets\\owner-admin-test.txt",
  });

  return state;
}

function mockReports() {
  restoreReportsDeps?.();
  restoreReportsDeps = null;

  const state: {
    auditInputs: AdminAuditInput[];
    reviewActions: Array<{
      action: string;
      status?: ReportStatus;
      metadata?: Record<string, unknown> | null;
    }>;
  } = {
    auditInputs: [],
    reviewActions: [],
  };

  restoreReportsDeps = adminReportsService.__setAdminReportsServiceDepsForTests({
    repo: {
      listReports: async () => [reportRow({})],
      findReportById: async () => reportRow({}),
      listReportReviewActions: async () => [reportReviewActionRow({})],
      createReportReviewAction: async (input) => {
        state.reviewActions.push({
          action: input.action,
          status: input.status,
          metadata: input.metadata as Record<string, unknown> | null,
        });
        return {
          report: reportRow({ status: input.status ?? "open" }),
          reviewAction: reportReviewActionRow({
            action: input.action,
            reason: input.reason ?? null,
            note: input.note ?? null,
            metadata: input.metadata ?? null,
          }),
        };
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

function mockMedia(input: { visibility?: AdminMediaRow["visibility"] } = {}) {
  restoreMediaDeps?.();
  restoreMediaDeps = null;

  const state: {
    auditInputs: AdminAuditInput[];
    decisions: Array<{ action: string; metadata?: Record<string, unknown> | null }>;
  } = {
    auditInputs: [],
    decisions: [],
  };

  restoreMediaDeps = adminMediaService.__setAdminMediaServiceDepsForTests({
    repo: {
      listMedia: async () => [mediaRow({ visibility: input.visibility ?? "public" })],
      findMediaById: async () => mediaRow({ visibility: input.visibility ?? "public" }),
      listMediaReviews: async () => [mediaReviewRow({})],
      createMediaModerationReview: async (reviewInput) => {
        state.decisions.push({
          action: reviewInput.action,
          metadata: reviewInput.metadata as Record<string, unknown> | null,
        });
        return mediaReviewRow({
          action: reviewInput.action,
          reason: reviewInput.reason ?? null,
          metadata: reviewInput.metadata ?? null,
        });
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
  user?: UserRow;
} = {}) {
  restoreAdminDeps?.();
  restoreAdminDeps = null;

  const adminContext = "adminContext" in input
    ? input.adminContext
    : adminContextRow(input.roles ?? ["owner"], input.user);

  restoreAdminDeps = adminService.__setAdminServiceDepsForTests({
    repo: {
      ensureRequiredRoles: async () => undefined,
      findAdminContextByUserId: async () => adminContext,
      findUserById: async () => userRow({ id: userId, amoriaId: "AMOWNER1" }),
      findUsersByAmoriaIds: async () => [],
      upsertActiveAdminUserForUser: async () => adminUserRow({}),
      assignRole: async () => undefined,
      searchUsers: async () => [],
      listAuditLog: async () => [],
    },
  });
}

function restoreDeps(): void {
  if (restoreAdminDeps) {
    restoreAdminDeps();
    restoreAdminDeps = null;
  }
  if (restoreOwnerDeps) {
    restoreOwnerDeps();
    restoreOwnerDeps = null;
  }
  if (restoreReportsDeps) {
    restoreReportsDeps();
    restoreReportsDeps = null;
  }
  if (restoreMediaDeps) {
    restoreMediaDeps();
    restoreMediaDeps = null;
  }
}

function authHeaders(id: string) {
  return {
    Authorization: `Bearer ${signAccessToken(id)}`,
  };
}

function adminContextRow(roles: AdminRoleKey[], user = userRow({})): AdminContextRow {
  return {
    adminUser: adminUserRow({ userId: user.id, email: user.email, displayName: user.displayName }),
    user: {
      id: user.id,
      amoriaId: user.amoriaId,
      displayName: user.displayName,
      email: user.email,
    },
    roles,
  };
}

function adminUserRow(
  input: Partial<AdminUserRow & { userId: string; status: "active" | "disabled" }> = {},
): AdminUserRow & { userId: string; status: "active" | "disabled" } {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: adminUserId,
    userId,
    email: "owner@example.test",
    displayName: "Amoria Owner",
    status: "active",
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
    passwordHash: "hash",
    displayName: "Amoria Owner",
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

function reportRow(input: Partial<AdminReportRow>): AdminReportRow {
  const now = new Date("2026-01-02T00:00:00.000Z");
  return {
    id: reportId,
    reporterUserId: userId,
    reporter: {
      id: userId,
      amoriaId: "AMOWNER1",
      displayName: "Amoria Owner",
      email: "owner@example.test",
    },
    targetType: "user",
    targetId: "00000000-0000-4000-8000-000000000099",
    targetOwnerUserId: "00000000-0000-4000-8000-000000000099",
    targetOwner: {
      id: "00000000-0000-4000-8000-000000000099",
      amoriaId: "AMTARGET",
      displayName: "Target User",
      email: "target@example.test",
    },
    reason: "abuse",
    comment: "Review this profile",
    status: "open",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function reportReviewActionRow(input: Partial<ReportReviewActionRow>): ReportReviewActionRow {
  return {
    id: reviewId,
    reportId,
    adminUserId,
    action: "mark_under_review",
    reason: "reviewing",
    note: null,
    metadata: null,
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    ...input,
  };
}

function mediaRow(input: Partial<AdminMediaRow>): AdminMediaRow {
  return {
    id: mediaId,
    ownerUserId: userId,
    owner: {
      id: userId,
      amoriaId: "AMOWNER1",
      displayName: "Amoria Owner",
      email: "owner@example.test",
    },
    type: "profile_photo",
    path: "users/owner/profile/media.webp",
    url: "https://cdn.example.test/media.webp",
    mimeType: "image/webp",
    sizeBytes: 12345,
    width: 800,
    height: 800,
    checksumSha256: "checksum",
    visibility: "public",
    createdAt: new Date("2026-01-04T00:00:00.000Z"),
    latestReview: null,
    ...input,
  };
}

function mediaReviewRow(input: Partial<MediaModerationReviewRow>): MediaModerationReviewRow {
  return {
    id: reviewId,
    mediaId,
    ownerUserId: userId,
    adminUserId,
    action: "mark_under_review",
    reason: "reviewing",
    metadata: null,
    createdAt: new Date("2026-01-05T00:00:00.000Z"),
    ...input,
  };
}
