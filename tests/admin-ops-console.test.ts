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
const adminOpsService = require("../src/admin/admin-ops.service") as typeof import("../src/admin/admin-ops.service");

const userId = "00000000-0000-4000-8000-000000000001";
const adminUserId = "00000000-0000-4000-8000-0000000000a1";
const reportId = "00000000-0000-4000-8000-0000000000d1";
const mediaId = "00000000-0000-4000-8000-0000000000e1";
const reviewId = "00000000-0000-4000-8000-0000000000f1";
const adminTogetherSessionId = "00000000-0000-4000-8000-000000000501";

let restoreAdminDeps: (() => void) | null = null;
let restoreOwnerDeps: (() => void) | null = null;
let restoreReportsDeps: (() => void) | null = null;
let restoreMediaDeps: (() => void) | null = null;
let restoreOpsDeps: (() => void) | null = null;

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

test("/admin/ops/health returns database status and real counts", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  const state = mockOpsHealth();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/ops/health",
    headers: authHeaders(userId),
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.database.ok, true);
  assert.deepEqual(body.counts, {
    openClientErrors: 3,
    openReports: 2,
    pendingMediaModerationItems: 1,
  });
  assert.equal(body.objectStorage.status, "not_checked");
  assert.equal(body.databaseUrl, undefined);
  assert.equal(body.s3AccessKey, undefined);
  assert.equal(state.auditInputs[0]?.action, "admin.opsHealth.read");
  const auditMetadata = state.auditInputs[0]?.metadata as Record<string, unknown> | undefined;
  assert.equal(auditMetadata?.databaseOk, true);
});

test("GET /admin/together/queue returns safe queue observability and writes audit log", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  const state = mockOpsHealth();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/together/queue",
    headers: authHeaders(userId),
  });
  const bodyText = response.body;
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, 1);
  assert.deepEqual(body.items[0], {
    entryId: "00000000-0000-4000-8000-000000000401",
    userId,
    amoriaId: "AM23456",
    displayName: "Test Admin",
    activity: "story_sparks",
    status: "waiting",
    radiusKm: null,
    hasCoordinates: false,
    geoMode: "missing_location_invalid_old_entry",
    waitingReason: "missing_coordinates_old_entry",
    cancelledAt: null,
    cancelSource: null,
    cancelReason: null,
    lastAction: "queued",
    lastActionAt: "2026-01-01T00:00:00.000Z",
    lastClientPollAt: null,
    ageSeconds: 42,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:05:00.000Z",
    matchedSessionId: null,
  });
  assert.equal(body.nextCursor, null);
  assert.equal(bodyText.includes("latitude"), false);
  assert.equal(bodyText.includes("longitude"), false);
  assert.equal(state.auditInputs[0]?.action, "admin.togetherQueue.read");
  assert.deepEqual(state.auditInputs[0]?.metadata, {
    filters: {
      status: null,
      activity: null,
      radiusKm: null,
      geoMode: null,
      hasCoordinates: null,
    },
    resultCount: 1,
  });
});

test("GET /admin/together/sessions returns safe session diagnostics and writes audit log", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  const state = mockOpsHealth();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/admin/together/sessions?status=active&sessionId=${sessionIdForAdmin()}`,
    headers: authHeaders(userId),
  });
  const bodyText = response.body;
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].sessionId, sessionIdForAdmin());
  assert.equal(body.items[0].participantCount, 2);
  assert.deepEqual(body.items[0].participantUserIds, [
    userId,
    "00000000-0000-4000-8000-000000000002",
  ]);
  assert.equal(body.items[0].hasStaleParticipant, true);
  assert.equal(typeof body.items[0].lastHeartbeatAt, "string");
  assert.equal(body.items[0].leftAt, null);
  assert.equal(body.items[0].eventCount, 3);
  assert.equal(body.items[0].strokeEventCount, 2);
  assert.equal(body.items[0].storyChoiceCount, 1);
  assert.deepEqual(body.items[0].revealDecisions, {
    open: 1,
    skip: 0,
    continueStory: 0,
    pending: 1,
    total: 1,
  });
  assert.equal(bodyText.includes("latitude"), false);
  assert.equal(bodyText.includes("longitude"), false);
  assert.equal(bodyText.includes("payload"), false);
  assert.equal(state.auditInputs[0]?.action, "admin.togetherSessions.read");
  assert.deepEqual(state.auditInputs[0]?.metadata, {
    filters: {
      status: "active",
      activity: null,
      sessionId: sessionIdForAdmin(),
    },
    resultCount: 1,
  });
});

test("POST /admin/together/queue/:entryId/actions cancels waiting entry and audits safe metadata", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  const state = mockOpsHealth();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/admin/together/queue/00000000-0000-4000-8000-000000000401/actions",
    headers: authHeaders(userId),
    payload: {
      action: "cancel",
      reason: "Smoke test stale waiting entry",
    },
  });
  const bodyText = response.body;
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.entry.status, "cancelled");
  assert.equal(bodyText.includes("latitude"), false);
  assert.equal(bodyText.includes("longitude"), false);
  assert.equal(state.auditInputs[0]?.action, "admin.togetherQueue.cancel");
  assert.equal(state.auditInputs[0]?.targetType, "together_queue");
  assert.equal(state.auditInputs[0]?.targetId, "00000000-0000-4000-8000-000000000401");
  assert.deepEqual(state.auditInputs[0]?.metadata, {
    action: "cancel",
    activity: "story_sparks",
    radiusKm: null,
    hasCoordinates: false,
    geoMode: "missing_location_invalid_old_entry",
    waitingReason: "candidate_cancelled",
    cancelSource: "admin_cancel",
    cancelReason: "Smoke test stale waiting entry",
    cancelledAt: "2026-01-01T00:00:43.000Z",
    reason: "Smoke test stale waiting entry",
  });
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
  const item = allowed.json().items[0];
  assert.equal(item.id, mediaId);
  assert.equal(item.previewUrl, `/media/public/${mediaId}`);
  assert.equal(item.publicUrl, `/media/public/${mediaId}`);
  assert.equal(item.moderationStatus, "pending_review");
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

test("reject or restrict media decisions require a reason", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
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
      action: "remove",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(state.decisions.length, 0);
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
  assert.equal(allowed.json().media.url, null);
  assert.equal(allowed.json().media.publicUrl, null);
  assert.equal(allowed.json().media.path, "users/owner/profile/media.webp");
  assert.equal(state.auditInputs[0]?.action, "admin.media.locked.view");
  assert.equal(state.auditInputs[0]?.reason, "Moderation review");
});

test("locked media content is served only through audited admin content route", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockMedia({ visibility: "locked" });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/admin/media/${mediaId}/content?reason=Moderation%20review`,
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "image/webp");
  assert.deepEqual(response.rawPayload, Buffer.from("media-bytes"));
  assert.deepEqual(state.contentReads, ["users/owner/profile/media.webp"]);
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
    contentReads: string[];
  } = {
    auditInputs: [],
    decisions: [],
    contentReads: [],
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
    getObjectBuffer: async (objectInput) => {
      state.contentReads.push(objectInput.key);
      return Buffer.from("media-bytes");
    },
  });

  return state;
}

function mockOpsHealth() {
  restoreOpsDeps?.();
  restoreOpsDeps = null;

  const state: {
    auditInputs: AdminAuditInput[];
  } = {
    auditInputs: [],
  };

  restoreOpsDeps = adminOpsService.__setAdminOpsServiceDepsForTests({
    dbCheck: async () => true,
    counts: async () => ({
      openClientErrors: 3,
      openReports: 2,
      pendingMediaModerationItems: 1,
    }),
    objectStorageCheck: async () => ({
      status: "not_checked",
      reason: "Not checked in tests.",
    }),
    togetherQueue: {
      listQueueEntriesForAdmin: async () => [
        {
          entryId: "00000000-0000-4000-8000-000000000401",
          userId,
          amoriaId: "AM23456",
          displayName: "Test Admin",
          activity: "story_sparks",
          status: "waiting",
          radiusKm: null,
          hasCoordinates: false,
          geoMode: "missing_location_invalid_old_entry",
          waitingReason: "missing_coordinates_old_entry",
          cancelledAt: null,
          cancelSource: null,
          cancelReason: null,
          lastAction: "queued",
          lastActionAt: new Date("2026-01-01T00:00:00.000Z"),
          lastClientPollAt: null,
          ageSeconds: 42,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          expiresAt: new Date("2026-01-01T00:05:00.000Z"),
          matchedSessionId: null,
        },
      ],
      cancelQueueEntryForAdmin: async () => ({
        entryId: "00000000-0000-4000-8000-000000000401",
        userId,
        amoriaId: "AM23456",
        displayName: "Test Admin",
        activity: "story_sparks",
        status: "cancelled",
        radiusKm: null,
        hasCoordinates: false,
          geoMode: "missing_location_invalid_old_entry",
          waitingReason: "candidate_cancelled",
          cancelledAt: new Date("2026-01-01T00:00:43.000Z"),
          cancelSource: "admin_cancel",
          cancelReason: "Smoke test stale waiting entry",
          lastAction: "cancelled",
          lastActionAt: new Date("2026-01-01T00:00:43.000Z"),
          lastClientPollAt: null,
          ageSeconds: 43,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-01T00:05:00.000Z"),
        matchedSessionId: null,
      }),
      listSessionsForAdmin: async () => [
        {
          sessionId: adminTogetherSessionId,
          activity: "draw",
          status: "active",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          deadlineAt: new Date("2026-01-01T00:07:00.000Z"),
          endedAt: null,
          endedReason: null,
          sourceSessionId: null,
          participantUserIds: [
            userId,
            "00000000-0000-4000-8000-000000000002",
          ],
          participantCount: 2,
          participants: [
            {
              userId,
              lastHeartbeatAt: new Date(),
              leftAt: null,
            },
            {
              userId: "00000000-0000-4000-8000-000000000002",
              lastHeartbeatAt: null,
              leftAt: null,
            },
          ],
          lastHeartbeatAt: new Date("2026-01-01T00:00:30.000Z"),
          leftAt: null,
          eventCount: 3,
          strokeEventCount: 2,
          storyChoiceCount: 1,
          revealDecisions: {
            open: 1,
            skip: 0,
            continueStory: 0,
            pending: 1,
            total: 1,
          },
        },
      ],
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
  if (restoreOpsDeps) {
    restoreOpsDeps();
    restoreOpsDeps = null;
  }
}

function authHeaders(id: string) {
  return {
    Authorization: `Bearer ${signAccessToken(id)}`,
  };
}

function sessionIdForAdmin(): string {
  return adminTogetherSessionId;
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
