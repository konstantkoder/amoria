import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { AdminContext, AdminAuditInput } from "../src/admin/admin.types";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://unused";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";

const adminOpsService = require("../src/admin/admin-ops.service") as typeof import("../src/admin/admin-ops.service");
const emailDelivery = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");

const admin: AdminContext = {
  adminUser: {
    id: "00000000-0000-4000-8000-0000000000a1",
    userId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    roles: ["owner", "ops"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    amoriaId: "AM12345",
    displayName: "Ops Owner",
    email: "owner@example.test",
  },
};

function installOpsDeps(input: {
  smtpCheck?: () => Promise<void>;
  smtpTimeoutMs?: number;
  auditInputs?: AdminAuditInput[];
} = {}): () => void {
  const auditInputs = input.auditInputs ?? [];
  return adminOpsService.__setAdminOpsServiceDepsForTests({
    dbCheck: async () => true,
    counts: async () => ({
      openClientErrors: 3,
      openReports: 2,
      pendingMediaModerationItems: 1,
    }),
    dashboardCounts: async () => ({
      reports: { open: 2, underReview: 1, escalated: 1 },
      clientErrors: { open: 3 },
      mediaModeration: { pending: 1 },
      togetherQueue: { waiting: 4 },
      togetherSessions: { active: 2, recent24h: 5 },
    }),
    objectStorageCheck: async () => ({
      status: "ok",
      checkedAt: "2026-08-12T10:00:00.000Z",
    }),
    ...(input.smtpCheck ? { smtpCheck: input.smtpCheck } : {}),
    ...(input.smtpTimeoutMs ? { smtpTimeoutMs: input.smtpTimeoutMs } : {}),
    nearbyDiagnostics: {
      getNearbyAdminDiagnostics: async () => ({
        checkedAt: new Date("2026-08-12T10:00:00.000Z"),
        activeVisibilityCount: 7,
        offVisibilityCount: 2,
        expiredVisibilityCount: 1,
        recentlyUpdatedCount: 4,
        profileReadinessMissing: {
          missingBirthDate: 0,
          missingGender: 0,
          missingPreferredGenders: 0,
          missingAvatar: 0,
          missingDisplayName: 0,
        },
        profileReadinessItems: [],
        feedExclusionReasons: {
          self: 0,
          blocked: 0,
          visibility_off: 0,
          visibility_expired: 0,
          distance_too_far: 0,
          age_mismatch: 0,
          gender_mismatch: 0,
          missing_birth_date: 0,
          missing_gender: 0,
          missing_preferred_genders: 0,
        },
      }),
    },
    audit: {
      writeAuditLog: async (auditInput) => {
        auditInputs.push(auditInput);
      },
    },
  });
}

test("Admin Ops Health uses the existing email delivery verify path and reports SMTP ok", async (t) => {
  let verifyCalls = 0;
  emailDelivery.setEmailDeliveryServiceForTests({
    send: async () => undefined,
    verify: async () => { verifyCalls += 1; },
  });
  t.after(() => emailDelivery.setEmailDeliveryServiceForTests(undefined));
  const auditInputs: AdminAuditInput[] = [];
  const restore = installOpsDeps({ auditInputs });
  t.after(restore);

  const response = await adminOpsService.getOpsHealth(admin, {});

  assert.equal(verifyCalls, 1);
  assert.equal(response.smtp.status, "ok");
  assert.equal(typeof response.smtp.checkedAt, "string");
  assert.equal(response.database.ok, true);
  assert.deepEqual(response.objectStorage, {
    status: "ok",
    checkedAt: "2026-08-12T10:00:00.000Z",
  });
  assert.deepEqual(response.counts, {
    openClientErrors: 3,
    openReports: 2,
    pendingMediaModerationItems: 1,
  });
  assert.equal((auditInputs[0]?.metadata as Record<string, unknown>)?.smtpStatus, "ok");
});

test("SMTP connection failure returns degraded Admin health without exposing connection details", async (t) => {
  const auditInputs: AdminAuditInput[] = [];
  const restore = installOpsDeps({
    auditInputs,
    smtpCheck: async () => {
      throw new Error("ECONNREFUSED smtp.private.test smtp-user smtp-password-secret 10.0.0.8");
    },
  });
  t.after(restore);

  const response = await adminOpsService.getOpsHealth(admin, {});
  const serialized = JSON.stringify(response);

  assert.equal(response.ok, true);
  assert.equal(response.database.ok, true);
  assert.equal(response.objectStorage.status, "ok");
  assert.equal(response.smtp.status, "error");
  assert.doesNotMatch(serialized, /smtp\.private\.test|smtp-user|smtp-password-secret|10\.0\.0\.8|ECONNREFUSED/);
  assert.deepEqual(auditInputs[0]?.metadata, {
    databaseOk: true,
    objectStorageStatus: "ok",
    smtpStatus: "error",
    counts: {
      openClientErrors: 3,
      openReports: 2,
      pendingMediaModerationItems: 1,
    },
  });
});

test("hung SMTP verification is bounded and Admin health still responds with SMTP error", async (t) => {
  const restore = installOpsDeps({
    smtpCheck: () => new Promise<void>(() => undefined),
    smtpTimeoutMs: 25,
  });
  t.after(restore);
  const startedAt = Date.now();

  const response = await adminOpsService.getOpsHealth(admin, {});

  assert.equal(response.smtp.status, "error");
  assert.equal(response.database.ok, true);
  assert.equal(response.objectStorage.status, "ok");
  assert.ok(Date.now() - startedAt < 500);
});

test("release dashboard includes SMTP error while API, database, and object storage remain available", async (t) => {
  const auditInputs: AdminAuditInput[] = [];
  const restore = installOpsDeps({
    auditInputs,
    smtpCheck: async () => { throw new Error("TLS unavailable"); },
  });
  t.after(restore);

  const response = await adminOpsService.getReleaseDashboardForAdmin(admin, {});

  assert.equal(response.health.apiStatus, "ok");
  assert.equal(response.health.databaseStatus, "ok");
  assert.equal(response.health.objectStorage.status, "ok");
  assert.equal(response.health.smtp.status, "error");
  assert.deepEqual(response.reports, { open: 2, underReview: 1, escalated: 1 });
  assert.equal((auditInputs[0]?.metadata as Record<string, unknown>)?.smtpStatus, "error");
});

test("Admin Web Ops Health renders backend SMTP OK and degraded states", () => {
  const appSource = readFileSync(path.join(process.cwd(), "admin-web/src/App.tsx"), "utf8");
  assert.match(appSource, /Fact label=\{t\("ops\.emailDelivery"\)\} value=\{formatSmtpStatus\(data\.smtp, t\)\}/);
  assert.match(appSource, /smtp\.status === "ok" \? t\("status\.ok"\) : t\("status\.degraded"\)/);
  assert.doesNotMatch(appSource, /SMTP_HOST|SMTP_USER|SMTP_PASSWORD/);
});

test("release dashboard renders SMTP beside API, database, and object storage and degrades on error", () => {
  const appSource = readFileSync(path.join(process.cwd(), "admin-web/src/App.tsx"), "utf8");
  assert.match(appSource, /formatSmtpStatus\(data\.health\.smtp, t\)/);
  assert.match(appSource, /if \(health\.smtp\.status !== "ok"\)/);
  assert.match(appSource, /return t\("status\.degraded"\)/);
});

test("Ops Health and release dashboard RBAC declarations remain unchanged", () => {
  const routesSource = readFileSync(path.join(process.cwd(), "src/admin/admin.routes.ts"), "utf8");
  assert.match(routesSource, /"\/ops\/health"[\s\S]*?requireAdmin\(\["owner", "support", "ops"\]\)/);
  assert.match(routesSource, /"\/dashboard\/release-control"[\s\S]*?requireAdmin\(\)/);
});
