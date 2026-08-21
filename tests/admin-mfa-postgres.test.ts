import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.ADMIN_MFA_TEST_DATABASE_URL;

test("real PostgreSQL Admin MFA, replay, recovery, step-up, revocation, and owner concurrency", {
  skip: databaseUrl ? false : "ADMIN_MFA_TEST_DATABASE_URL is not configured",
  timeout: 60_000,
}, async (t) => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = "admin-mfa-postgres-test-jwt-secret";
  process.env.ADMIN_MFA_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZkFCQ0RFRkdISUpLTE1OT1A=";
  process.env.ADMIN_NETWORK_ACCESS_MODE = "development_local";
  process.env.ADMIN_ALLOWED_CIDRS = "";
  process.env.PUBLIC_API_URL = "http://localhost:4000";
  process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
  process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5174";

  const { buildApp } = require("../src/app") as typeof import("../src/app");
  const { pool, closeDb } = require("../src/db/client") as typeof import("../src/db/client");
  const { hashPassword } = require("../src/auth/passwords") as typeof import("../src/auth/passwords");
  const { generateTotpCode, hashOpaqueToken, totpCounter } = require("../src/admin/admin-mfa.crypto") as typeof import("../src/admin/admin-mfa.crypto");
  const mfaRepo = require("../src/admin/admin-mfa.repo") as typeof import("../src/admin/admin-mfa.repo");
  const userControlRepo = require("../src/admin/admin-user-control.repo") as typeof import("../src/admin/admin-user-control.repo");
  const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");

  const app = buildApp();
  t.after(async () => {
    await app.close();
    await closeDb();
  });

  await pool.query("DELETE FROM users WHERE email LIKE 'mfa-%@example.test'");

  const suffix = randomUUID().slice(0, 8);
  const ownerUserId = randomUUID();
  const targetUserId = randomUUID();
  const ownerAdminUserId = randomUUID();
  const password = `Owner-${suffix}-Password!`;
  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO users (id,email,email_verified_at,password_hash,display_name,amoria_id,account_status,auth_version)
     VALUES ($1,$2,now(),$3,$4,$5,'active',0),($6,$7,now(),$3,$8,$9,'active',0)`,
    [
      ownerUserId, `mfa-owner-${suffix}@example.test`, passwordHash, "MFA Owner", `MFAO${suffix}`,
      targetUserId, `mfa-target-${suffix}@example.test`, "MFA Target", `MFAT${suffix}`,
    ],
  );
  await pool.query(
    `INSERT INTO admin_users (id,user_id,email,display_name,status,session_version)
     VALUES ($1,$2,$3,$4,'active',0)`,
    [ownerAdminUserId, ownerUserId, `mfa-owner-${suffix}@example.test`, "MFA Owner"],
  );
  await pool.query(
    `INSERT INTO admin_roles (key,name,description) VALUES
      ('owner','Owner','test'),('support','Support','test'),('moderator','Moderator','test'),('ops','Ops','test')
     ON CONFLICT (key) DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO admin_user_roles (admin_user_id,role_id)
     SELECT $1,id FROM admin_roles WHERE key='owner'`,
    [ownerAdminUserId],
  );

  const sessionHeaders = {
    origin: "http://localhost:5174",
    "x-amoria-admin-session": "1",
    "user-agent": "amoria-admin-security-integration",
  };
  const loginPayload = { email: `mfa-owner-${suffix}@example.test`, password };
  const loginResponse = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  assert.equal(loginResponse.statusCode, 200, loginResponse.body);
  assert.equal(loginResponse.json().state, "enrollment_required");
  assert.equal(loginResponse.json().accessToken, undefined);
  assert.equal(cookieValue(loginResponse, "amoria_admin_refresh") || undefined, undefined);
  const preAuth = requiredCookie(loginResponse, "amoria_admin_pre_auth");
  const secret = loginResponse.json().enrollment.manualKey as string;
  assert.match(secret, /^[A-Z2-7]{32}$/u);

  await waitForStableTotpWindow();
  const baseCounter = totpCounter(new Date());
  const enrollmentCode = generateTotpCode(secret, baseCounter - 1);
  const enrollmentRequests = [1, 2].map(() => app.inject({
    method: "POST",
    url: "/admin/session/mfa/enroll/confirm",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${preAuth}` },
    payload: { method: "totp", code: enrollmentCode },
  }));
  const enrollmentResponses = await Promise.all(enrollmentRequests);
  assert.deepEqual(enrollmentResponses.map((response) => response.statusCode).sort(), [200, 429]);
  const enrolled = enrollmentResponses.find((response) => response.statusCode === 200)!;
  const initialRecoveryCodes = enrolled.json().recoveryCodes as string[];
  assert.equal(initialRecoveryCodes.length, 10);
  assert.equal(enrolled.json().recoveryUsed, false);

  const mobileToken = signAccessToken(ownerUserId, 0);
  const mobileToAdmin = await app.inject({ method: "GET", url: "/admin/health", headers: { authorization: `Bearer ${mobileToken}` } });
  assert.equal(mobileToAdmin.statusCode, 401);

  const secondLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  assert.equal(secondLogin.json().state, "mfa_required");
  const verifyPreAuth = requiredCookie(secondLogin, "amoria_admin_pre_auth");
  const currentCode = generateTotpCode(secret, baseCounter);
  const verifyResponses = await Promise.all([1, 2].map(() => app.inject({
    method: "POST",
    url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${verifyPreAuth}` },
    payload: { method: "totp", code: currentCode },
  })));
  assert.deepEqual(verifyResponses.map((response) => response.statusCode).sort(), [200, 429]);
  const verified = verifyResponses.find((response) => response.statusCode === 200)!;
  const accessToken = verified.json().accessToken as string;
  const originalRefresh = requiredCookie(verified, "amoria_admin_refresh");
  assert.equal((await app.inject({ method: "GET", url: "/admin/health", headers: { authorization: `Bearer ${accessToken}` } })).statusCode, 200);

  const rotated = await app.inject({
    method: "POST", url: "/admin/session/refresh",
    headers: { ...sessionHeaders, cookie: `amoria_admin_refresh=${originalRefresh}` }, payload: {},
  });
  assert.equal(rotated.statusCode, 200, rotated.body);
  const rotatedRefresh = requiredCookie(rotated, "amoria_admin_refresh");
  const replayedRefresh = await app.inject({
    method: "POST", url: "/admin/session/refresh",
    headers: { ...sessionHeaders, cookie: `amoria_admin_refresh=${originalRefresh}` }, payload: {},
  });
  assert.equal(replayedRefresh.statusCode, 401);
  const revokedFamilyRefresh = await app.inject({
    method: "POST", url: "/admin/session/refresh",
    headers: { ...sessionHeaders, cookie: `amoria_admin_refresh=${rotatedRefresh}` }, payload: {},
  });
  assert.equal(revokedFamilyRefresh.statusCode, 401);

  const createWithoutStepUp = await app.inject({
    method: "POST", url: "/admin/admin-users",
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { userId: targetUserId, roles: ["support"], reason: "Integration step-up check" },
  });
  assert.equal(createWithoutStepUp.statusCode, 403);
  assert.equal(createWithoutStepUp.json().error.code, "step_up_required");

  const stepUp = await app.inject({
    method: "POST", url: "/admin/session/step-up",
    headers: { ...sessionHeaders, authorization: `Bearer ${accessToken}` },
    payload: { code: generateTotpCode(secret, baseCounter + 1) },
  });
  assert.equal(stepUp.statusCode, 200, stepUp.body);
  const stepUpCookie = requiredCookie(stepUp, "amoria_admin_step_up");
  assert.equal(await mfaRepo.hasValidStepUp({
    adminUserId: ownerAdminUserId,
    adminSessionVersion: 0,
    tokenHash: hashOpaqueToken(stepUpCookie),
    now: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }), false);
  assert.equal(await mfaRepo.hasValidStepUp({
    adminUserId: ownerAdminUserId,
    adminSessionVersion: 0,
    tokenHash: hashOpaqueToken("forged-step-up-token-value-000000000"),
    now: new Date(),
  }), false);

  const regenerated = await app.inject({
    method: "POST", url: "/admin/session/recovery-codes/regenerate",
    headers: { ...sessionHeaders, authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: {},
  });
  assert.equal(regenerated.statusCode, 200, regenerated.body);
  const nextRecoveryCodes = regenerated.json().recoveryCodes as string[];
  assert.equal(nextRecoveryCodes.length, 10);
  assert.equal(new Set(nextRecoveryCodes).size, 10);

  const createdAdmin = await app.inject({
    method: "POST", url: "/admin/admin-users",
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { userId: targetUserId, roles: ["support"], reason: "Integration owner creates support Admin" },
  });
  assert.equal(createdAdmin.statusCode, 200, createdAdmin.body);
  const targetAdminUserId = (createdAdmin.json().items as Array<{ id: string; userId: string }>).find((item) => item.userId === targetUserId)?.id;
  assert.ok(targetAdminUserId);

  for (const payload of [
    { status: "active", roles: ["moderator"], reason: "Integration role change without step-up" },
    { status: "disabled", roles: ["support"], reason: "Integration disable without step-up" },
  ]) {
    const withoutStepUp: { statusCode: number; body: string; json(): { error: { code: string } } } = await app.inject({
      method: "POST", url: `/admin/admin-users/${targetAdminUserId}`,
      headers: { authorization: `Bearer ${accessToken}` }, payload,
    });
    assert.equal(withoutStepUp.statusCode, 403);
    assert.equal(withoutStepUp.json().error.code, "step_up_required");
  }
  const resetWithoutStepUp = await app.inject({
    method: "POST", url: `/admin/admin-users/${targetAdminUserId}/mfa/reset`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { reason: "Integration MFA reset without step-up" },
  });
  assert.equal(resetWithoutStepUp.statusCode, 403);
  assert.equal(resetWithoutStepUp.json().error.code, "step_up_required");

  const targetLoginPayload = { email: `mfa-target-${suffix}@example.test`, password };
  for (const role of ["support", "moderator", "ops"] as const) {
    if (role !== "support") {
      const roleUpdateResponse: { statusCode: number; body: string } = await app.inject({
        method: "POST", url: `/admin/admin-users/${targetAdminUserId}`,
        headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
        payload: { status: "active", roles: [role], reason: `Integration mandatory MFA for ${role}` },
      });
      assert.equal(roleUpdateResponse.statusCode, 200, roleUpdateResponse.body);
    }
    const roleLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: targetLoginPayload });
    assert.equal(roleLogin.statusCode, 200, roleLogin.body);
    assert.equal(roleLogin.json().state, "enrollment_required", role);
    assert.equal(roleLogin.json().accessToken, undefined, role);
    assert.equal(cookieValue(roleLogin, "amoria_admin_refresh") || undefined, undefined, role);
  }

  const targetEnrollmentLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: targetLoginPayload });
  const targetSecret = targetEnrollmentLogin.json().enrollment.manualKey as string;
  await waitForStableTotpWindow();
  const targetEnrollment = await app.inject({
    method: "POST", url: "/admin/session/mfa/enroll/confirm",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${requiredCookie(targetEnrollmentLogin, "amoria_admin_pre_auth")}` },
    payload: { method: "totp", code: generateTotpCode(targetSecret, totpCounter(new Date()) - 1) },
  });
  assert.equal(targetEnrollment.statusCode, 200, targetEnrollment.body);
  const targetAccessBeforeRoleRemoval = targetEnrollment.json().accessToken as string;
  const targetRefreshBeforeRoleRemoval = requiredCookie(targetEnrollment, "amoria_admin_refresh");
  const targetRecoveryCodes = targetEnrollment.json().recoveryCodes as string[];
  assert.equal((await app.inject({ method: "GET", url: "/admin/health", headers: { authorization: `Bearer ${targetAccessBeforeRoleRemoval}` } })).statusCode, 200);

  const removeTargetRole: { statusCode: number; body: string } = await app.inject({
    method: "POST", url: `/admin/admin-users/${targetAdminUserId}`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { status: "active", roles: ["support"], reason: "Integration removed-role live-session revocation" },
  });
  assert.equal(removeTargetRole.statusCode, 200, removeTargetRole.body);
  assert.equal((await app.inject({ method: "GET", url: "/admin/health", headers: { authorization: `Bearer ${targetAccessBeforeRoleRemoval}` } })).statusCode, 401);
  assert.equal((await app.inject({
    method: "POST", url: "/admin/session/refresh", headers: { ...sessionHeaders, cookie: `amoria_admin_refresh=${targetRefreshBeforeRoleRemoval}` }, payload: {},
  })).statusCode, 401);

  const targetRecoveryLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: targetLoginPayload });
  const targetRecoverySession = await app.inject({
    method: "POST", url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${requiredCookie(targetRecoveryLogin, "amoria_admin_pre_auth")}` },
    payload: { method: "recovery", code: targetRecoveryCodes[0] },
  });
  assert.equal(targetRecoverySession.statusCode, 200, targetRecoverySession.body);
  const targetAccessBeforeDisable = targetRecoverySession.json().accessToken as string;
  const disableTarget: { statusCode: number; body: string } = await app.inject({
    method: "POST", url: `/admin/admin-users/${targetAdminUserId}`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { status: "disabled", roles: ["support"], reason: "Integration disabled Admin revocation" },
  });
  assert.equal(disableTarget.statusCode, 200, disableTarget.body);
  assert.equal((await app.inject({ method: "GET", url: "/admin/health", headers: { authorization: `Bearer ${targetAccessBeforeDisable}` } })).statusCode, 403);
  const disabledLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: targetLoginPayload });
  assert.equal(disabledLogin.statusCode, 401);
  assert.equal(disabledLogin.json().error.code, "invalid_admin_credentials");

  const reactivateTarget: { statusCode: number; body: string } = await app.inject({
    method: "POST", url: `/admin/admin-users/${targetAdminUserId}`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { status: "active", roles: ["support"], reason: "Integration owner concurrency setup reactivation" },
  });
  assert.equal(reactivateTarget.statusCode, 200, reactivateTarget.body);

  const ownerPromote = await app.inject({
    method: "POST", url: `/admin/admin-users/${targetAdminUserId}`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { status: "active", roles: ["owner"], reason: "Integration final-owner concurrency setup" },
  });
  assert.equal(ownerPromote.statusCode, 200, ownerPromote.body);

  const secondOwnerLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: targetLoginPayload });
  const secondOwnerSession = await app.inject({
    method: "POST", url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${requiredCookie(secondOwnerLogin, "amoria_admin_pre_auth")}` },
    payload: { method: "recovery", code: targetRecoveryCodes[1] },
  });
  assert.equal(secondOwnerSession.statusCode, 200, secondOwnerSession.body);
  const secondOwnerAccess = secondOwnerSession.json().accessToken as string;
  const secondOwnerStepUp = await app.inject({
    method: "POST", url: "/admin/session/step-up",
    headers: { ...sessionHeaders, authorization: `Bearer ${secondOwnerAccess}` },
    payload: { code: generateTotpCode(targetSecret, totpCounter(new Date())) },
  });
  assert.equal(secondOwnerStepUp.statusCode, 200, secondOwnerStepUp.body);
  const secondOwnerStepUpCookie = requiredCookie(secondOwnerStepUp, "amoria_admin_step_up");

  const purgePreview = await app.inject({
    method: "POST", url: "/admin/bulk-jobs/preview", headers: { authorization: `Bearer ${accessToken}` },
    payload: { kind: "physical_media_purge", action: "purge", reason: "Integration empty purge preview", idempotencyKey: `purge-${suffix}`, maxItems: 1, scope: {} },
  });
  assert.equal(purgePreview.statusCode, 200, purgePreview.body);
  const purgeJob = purgePreview.json();
  const stolenJobAttempt = await app.inject({
    method: "POST", url: `/admin/bulk-jobs/${purgeJob.job.id}/confirm`,
    headers: { authorization: `Bearer ${secondOwnerAccess}`, cookie: `amoria_admin_step_up=${secondOwnerStepUpCookie}` },
    payload: { confirmationToken: purgeJob.confirmationToken },
  });
  assert.equal(stolenJobAttempt.statusCode, 404);
  const purgeWithoutStepUp = await app.inject({
    method: "POST", url: `/admin/bulk-jobs/${purgeJob.job.id}/confirm`, headers: { authorization: `Bearer ${accessToken}` },
    payload: { confirmationToken: purgeJob.confirmationToken },
  });
  assert.equal(purgeWithoutStepUp.statusCode, 403);
  const purgeWithStepUp = await app.inject({
    method: "POST", url: `/admin/bulk-jobs/${purgeJob.job.id}/confirm`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { confirmationToken: purgeJob.confirmationToken },
  });
  assert.equal(purgeWithStepUp.statusCode, 200, purgeWithStepUp.body);
  const purgeReplay = await app.inject({
    method: "POST", url: `/admin/bulk-jobs/${purgeJob.job.id}/confirm`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { confirmationToken: purgeJob.confirmationToken },
  });
  assert.equal(purgeReplay.statusCode, 200, purgeReplay.body);
  assert.equal(purgeReplay.json().job.status, "completed");

  const parallelPreview = await app.inject({
    method: "POST", url: "/admin/bulk-jobs/preview", headers: { authorization: `Bearer ${accessToken}` },
    payload: { kind: "physical_media_purge", action: "purge", reason: "Integration parallel empty purge", idempotencyKey: `purge-parallel-${suffix}`, maxItems: 1, scope: {} },
  });
  assert.equal(parallelPreview.statusCode, 200, parallelPreview.body);
  const parallelJob = parallelPreview.json();
  const invalidConfirmation = await app.inject({
    method: "POST", url: `/admin/bulk-jobs/${parallelJob.job.id}/confirm`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { confirmationToken: "invalid-confirmation-token-value" },
  });
  assert.equal(invalidConfirmation.statusCode, 403);
  const parallelConfirmations = await Promise.all([1, 2].map(() => app.inject({
    method: "POST", url: `/admin/bulk-jobs/${parallelJob.job.id}/confirm`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { confirmationToken: parallelJob.confirmationToken },
  })));
  assert.equal(parallelConfirmations.some((response) => response.statusCode === 200), true);
  assert.equal(parallelConfirmations.every((response) => [200, 409].includes(response.statusCode)), true);
  const parallelAudit = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM admin_audit_log WHERE action='admin.bulk.confirm' AND target_id=$1",
    [parallelJob.job.id],
  );
  assert.equal(Number(parallelAudit.rows[0]?.count), 1);

  const resetOtherAdmin = await app.inject({
    method: "POST", url: `/admin/admin-users/${targetAdminUserId}/mfa/reset`,
    headers: { authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { reason: "Integration owner resets another Admin MFA" },
  });
  assert.equal(resetOtherAdmin.statusCode, 200, resetOtherAdmin.body);
  assert.equal((await app.inject({ method: "GET", url: "/admin/health", headers: { authorization: `Bearer ${secondOwnerAccess}` } })).statusCode, 401);
  const targetAfterOwnerReset = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: targetLoginPayload });
  assert.equal(targetAfterOwnerReset.statusCode, 200, targetAfterOwnerReset.body);
  assert.equal(targetAfterOwnerReset.json().state, "enrollment_required");

  const oldRecoveryLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  const oldRecoveryAttempt = await app.inject({
    method: "POST", url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${requiredCookie(oldRecoveryLogin, "amoria_admin_pre_auth")}` },
    payload: { method: "recovery", code: initialRecoveryCodes[0] },
  });
  assert.equal(oldRecoveryAttempt.statusCode, 401);

  const recoveryLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  const recoveryPreAuth = requiredCookie(recoveryLogin, "amoria_admin_pre_auth");
  const recoveryResponses = await Promise.all([1, 2].map(() => app.inject({
    method: "POST", url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${recoveryPreAuth}` },
    payload: { method: "recovery", code: nextRecoveryCodes[0] },
  })));
  assert.deepEqual(recoveryResponses.map((response) => response.statusCode).sort(), [200, 429]);
  const recoverySuccess = recoveryResponses.find((response) => response.statusCode === 200)!;
  assert.equal(recoverySuccess.json().recoveryUsed, true);
  assert.equal(recoverySuccess.json().remainingRecoveryCodes, 9);

  const recoveryReplayLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  const recoveryReplay = await app.inject({
    method: "POST", url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${requiredCookie(recoveryReplayLogin, "amoria_admin_pre_auth")}` },
    payload: { method: "recovery", code: nextRecoveryCodes[0] },
  });
  assert.equal(recoveryReplay.statusCode, 401);

  const expiringLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  const expiringPreAuth = requiredCookie(expiringLogin, "amoria_admin_pre_auth");
  await pool.query(
    "UPDATE admin_mfa_pre_auth_challenges SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [hashOpaqueToken(expiringPreAuth)],
  );
  const expiredChallenge = await app.inject({
    method: "POST", url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${expiringPreAuth}` },
    payload: { method: "totp", code: "000000" },
  });
  assert.equal(expiredChallenge.statusCode, 401);
  assert.equal(expiredChallenge.json().error.code, "admin_pre_auth_expired");

  const bruteLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  const brutePreAuth = requiredCookie(bruteLogin, "amoria_admin_pre_auth");
  const bruteCounter = totpCounter(new Date());
  const validNow = new Set([-1, 0, 1].map((offset) => generateTotpCode(secret, bruteCounter + offset)));
  let definitelyWrongCode = "000000";
  while (validNow.has(definitelyWrongCode)) definitelyWrongCode = String(Number(definitelyWrongCode) + 1).padStart(6, "0");
  const bruteStatuses: number[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await app.inject({
      method: "POST", url: "/admin/session/mfa/verify",
      headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${brutePreAuth}` },
      payload: { method: "totp", code: definitelyWrongCode },
    });
    bruteStatuses.push(response.statusCode);
  }
  assert.deepEqual(bruteStatuses, [401, 401, 401, 401, 429]);

  const selfReset = await app.inject({
    method: "POST", url: "/admin/session/mfa/reset",
    headers: { ...sessionHeaders, authorization: `Bearer ${accessToken}`, cookie: `amoria_admin_step_up=${stepUpCookie}` },
    payload: { reason: "Integration self reset and reenrollment check" },
  });
  assert.equal(selfReset.statusCode, 200, selfReset.body);
  assert.equal((await app.inject({ method: "GET", url: "/admin/health", headers: { authorization: `Bearer ${accessToken}` } })).statusCode, 401);

  const afterResetLogin = await app.inject({ method: "POST", url: "/admin/session/login", headers: sessionHeaders, payload: loginPayload });
  assert.equal(afterResetLogin.json().state, "enrollment_required");
  const afterResetRecovery = await app.inject({
    method: "POST", url: "/admin/session/mfa/verify",
    headers: { ...sessionHeaders, cookie: `amoria_admin_pre_auth=${requiredCookie(afterResetLogin, "amoria_admin_pre_auth")}` },
    payload: { method: "recovery", code: nextRecoveryCodes[1] },
  });
  assert.equal(afterResetRecovery.statusCode, 401);

  const ownerRace = await Promise.allSettled([
    userControlRepo.updateAdminUser(ownerAdminUserId, { roles: ["support"], reason: "Concurrent owner race A" }),
    userControlRepo.updateAdminUser(targetAdminUserId, { roles: ["support"], reason: "Concurrent owner race B" }),
  ]);
  assert.equal(ownerRace.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(ownerRace.filter((result) => result.status === "rejected").length, 1);
  const activeOwnerCount = await pool.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM admin_users au
      JOIN admin_user_roles aur ON aur.admin_user_id=au.id JOIN admin_roles ar ON ar.id=aur.role_id
     WHERE au.status='active' AND ar.key='owner' AND au.id=ANY($1::uuid[])`, [[ownerAdminUserId, targetAdminUserId]]);
  assert.equal(Number(activeOwnerCount.rows[0]?.count), 1);

  const audit = await pool.query<{ action: string; metadata: unknown }>(
    "SELECT action,metadata FROM admin_audit_log WHERE target_id=$1::text OR admin_user_id=$1::uuid ORDER BY created_at",
    [ownerAdminUserId],
  );
  for (const action of ["admin.mfa.enrolled", "admin.login.success", "admin.mfa.step_up.success", "admin.mfa.recovery_regenerated", "admin.mfa.recovery_used", "admin.mfa.reset"]) {
    assert.equal(audit.rows.some((row) => row.action === action), true, action);
  }
  const auditText = JSON.stringify(audit.rows);
  assert.equal(auditText.includes(secret), false);
  for (const code of [...initialRecoveryCodes, ...nextRecoveryCodes]) assert.equal(auditText.includes(code), false);

  const passwordBruteStatuses: number[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await app.inject({
      method: "POST", url: "/admin/session/login", headers: sessionHeaders,
      payload: { ...loginPayload, password: "definitely-wrong-password" },
    });
    passwordBruteStatuses.push(response.statusCode);
    assert.equal(response.json().error.message.includes("owner"), false);
  }
  assert.deepEqual(passwordBruteStatuses, [401, 401, 401, 401, 429]);
});

function setCookieLines(response: { headers: Record<string, string | string[] | number | undefined> }): string[] {
  const value = response.headers["set-cookie"];
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function cookieValue(response: { headers: Record<string, string | string[] | number | undefined> }, name: string): string | undefined {
  for (const line of setCookieLines(response)) {
    for (const candidate of line.split(/,(?=[^;,]+=)/u)) {
      const match = candidate.match(new RegExp(`(?:^|\\s)${name}=([^;]*)`, "u"));
      if (match) return decodeURIComponent(match[1]);
    }
  }
  return undefined;
}

function requiredCookie(response: { headers: Record<string, string | string[] | number | undefined> }, name: string): string {
  const value = cookieValue(response, name);
  assert.ok(value, `${name} cookie is required`);
  return value;
}

async function waitForStableTotpWindow(): Promise<void> {
  for (;;) {
    const second = Math.floor(Date.now() / 1000) % 30;
    if (second >= 4 && second <= 20) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
