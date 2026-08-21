import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { signAccessToken, verifyAccessToken } from "../src/auth/jwt";
import { signAdminAccessTokenWithExpiry, verifyAdminAccessToken } from "../src/admin/admin-jwt";
import {
  decodeBase32,
  encodeBase32,
  encryptTotpSecret,
  decryptTotpSecret,
  findMatchingTotpCounter,
  generateRecoveryCodes,
  generateTotpCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "../src/admin/admin-mfa.crypto";
import {
  assertAdminSessionRequest,
  serializeAdminRefreshCookie,
  serializeClearedAdminRefreshCookie,
} from "../src/admin/admin-session.routes";
import { ipMatchesCidr, isLoopbackAddress, parseCidr, parseIpAddress } from "../src/common/security/ip-cidr";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

test("RFC 6238 SHA-1 vectors produce the expected six-digit suffix and +/-1 matching window", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
  assert.deepEqual(decodeBase32(secret), Buffer.from("12345678901234567890", "ascii"));
  const vectors = [
    [59_000, "287082"],
    [1_111_111_109_000, "081804"],
    [1_111_111_111_000, "050471"],
    [1_234_567_890_000, "005924"],
    [2_000_000_000_000, "279037"],
    [20_000_000_000_000, "353130"],
  ] as const;
  for (const [time, expected] of vectors) {
    const counter = Math.floor(time / 30_000);
    assert.equal(generateTotpCode(secret, counter), expected);
    assert.equal(findMatchingTotpCounter(secret, expected, new Date(time), 1), counter);
  }
  const now = new Date(1_234_567_890_000);
  assert.equal(findMatchingTotpCounter(secret, generateTotpCode(secret, Math.floor(now.getTime() / 30_000) - 2), now, 1), undefined);
  assert.equal(findMatchingTotpCounter(secret, "12ab56", now, 1), undefined);
});

test("TOTP secrets use randomized AES-256-GCM authenticated encryption", () => {
  const adminUserId = "11111111-1111-4111-8111-111111111111";
  const secret = "JBSWY3DPEHPK3PXP";
  const first = encryptTotpSecret(secret, adminUserId);
  const second = encryptTotpSecret(secret, adminUserId);
  assert.notEqual(first.ciphertext, secret);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(decryptTotpSecret(first, adminUserId), secret);
  assert.throws(() => decryptTotpSecret({ ...first, authTag: Buffer.alloc(16).toString("base64") }, adminUserId));
  assert.throws(() => decryptTotpSecret(first, "22222222-2222-4222-8222-222222222222"));
});

test("recovery codes are high-entropy, normalized, unique, and stored through keyed hashes", () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, RECOVERY_CODE_COUNT);
  assert.equal(new Set(codes).size, RECOVERY_CODE_COUNT);
  for (const code of codes) {
    assert.match(code, /^(?:[A-Z2-7]{4}-){7}[A-Z2-7]{4}$/u);
    assert.equal(normalizeRecoveryCode(code)?.length, 32);
    assert.match(hashRecoveryCode(code), /^[a-f0-9]{64}$/u);
    assert.notEqual(hashRecoveryCode(code), code);
  }
  assert.equal(normalizeRecoveryCode("not-a-code"), undefined);
});

test("mobile and Admin access tokens are cryptographically audience-separated", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const adminUserId = "22222222-2222-4222-8222-222222222222";
  const mobile = signAccessToken(userId, 4);
  const admin = signAdminAccessTokenWithExpiry({
    userId,
    adminUserId,
    adminSessionVersion: 7,
    userAuthVersion: 4,
  }).accessToken;
  assert.equal(verifyAccessToken(mobile).sub, userId);
  assert.equal(verifyAdminAccessToken(admin).auid, adminUserId);
  assert.throws(() => verifyAdminAccessToken(mobile));
  assert.throws(() => verifyAccessToken(admin));
});

test("Admin refresh cookie is host-only HttpOnly SameSite Strict and Secure in production", () => {
  const cookie = serializeAdminRefreshCookie("refresh-token-value-00000000000001", {
    secure: true,
    now: new Date("2026-08-21T00:00:00.000Z"),
  });
  assert.match(cookie, /^amoria_admin_refresh=/u);
  assert.match(cookie, /Path=\/admin\/session/u);
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /SameSite=Strict/u);
  assert.match(cookie, /Secure/u);
  assert.doesNotMatch(cookie, /Domain=/u);
  assert.match(serializeClearedAdminRefreshCookie({ secure: true }), /Max-Age=0/u);
});

test("Admin Origin/header policy denies missing, null, foreign, and lookalike origins", () => {
  const valid = { headers: { origin: "http://localhost:5174", "x-amoria-admin-session": "1" } };
  assert.doesNotThrow(() => assertAdminSessionRequest(valid as never));
  for (const headers of [
    { origin: "http://localhost:5174" },
    { "x-amoria-admin-session": "1" },
    { origin: "null", "x-amoria-admin-session": "1" },
    { origin: "https://evil.example", "x-amoria-admin-session": "1" },
    { origin: "http://localhost:5174.evil.example", "x-amoria-admin-session": "1" },
    { origin: "http://evil.localhost:5174", "x-amoria-admin-session": "1" },
    { origin: "*", "x-amoria-admin-session": "1" },
    { origin: "http://localhost:5174", "x-amoria-admin-session": "yes" },
  ]) assert.throws(() => assertAdminSessionRequest({ headers } as never));
});

test("IPv4, IPv4-mapped IPv6, and IPv6 CIDR matching is exact and malformed CIDRs fail", () => {
  assert.equal(ipMatchesCidr(parseIpAddress("10.20.30.8"), parseCidr("10.20.30.0/24")), true);
  assert.equal(ipMatchesCidr(parseIpAddress("10.20.31.8"), parseCidr("10.20.30.0/24")), false);
  assert.equal(ipMatchesCidr(parseIpAddress("::ffff:127.0.0.1"), parseCidr("127.0.0.1/32")), true);
  assert.equal(ipMatchesCidr(parseIpAddress("2001:db8::2"), parseCidr("2001:db8::/32")), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("127.88.1.2"), true);
  assert.throws(() => parseCidr("10.0.0.1/24"));
  assert.throws(() => parseCidr("10.0.0.999/24"));
  assert.throws(() => parseCidr("0.0.0.0/0/0"));
});

test("disabled Admin network mode denies Admin while the ordinary application remains live", () => {
  const script = `
    const { buildApp } = require('./src/app');
    const app = buildApp();
    (async () => {
      const publicResponse = await app.inject({ method: 'GET', url: '/health' });
      const adminResponse = await app.inject({
        method: 'POST', url: '/admin/session/login',
        headers: { origin: 'http://localhost:5174', 'x-amoria-admin-session': '1' },
        payload: { email: 'owner@example.test', password: 'irrelevant' },
      });
      process.stdout.write(JSON.stringify({ publicStatus: publicResponse.statusCode, adminStatus: adminResponse.statusCode }));
      await app.close();
    })().catch((error) => { process.stderr.write(String(error)); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--eval", script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      ADMIN_NETWORK_ACCESS_MODE: "disabled",
      ADMIN_ALLOWED_CIDRS: "",
      CORS_ALLOWED_ORIGINS: "http://localhost:5174",
      PUBLIC_API_URL: "http://localhost:4000",
      PUBLIC_MEDIA_URL: "http://localhost:4000/media",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout) as { publicStatus: number; adminStatus: number };
  assert.deepEqual(status, { publicStatus: 200, adminStatus: 403 });
});

test("legacy token storage is deleted and sensitive Admin state is not persisted by frontend runtime", () => {
  const session = read("admin-web/src/admin-session.ts");
  const api = read("admin-web/src/api.ts");
  assert.match(session, /LEGACY_ADMIN_TOKEN_STORAGE_KEY = "amoria\.admin\.tokens"/u);
  assert.match(session, /this\.accessSession = null;[\s\S]*\/admin\/session\/login/u);
  assert.match(session, /completeMfa[\s\S]*this\.accessSession = session/u);
  assert.doesNotMatch(`${session}\n${api}`, /localStorage\.setItem|sessionStorage|indexedDB|document\.cookie/iu);
  assert.doesNotMatch(api, /\/auth\/(?:login|refresh|logout)/u);
  assert.match(api, /fetch\(`\$\{API_BASE_URL\}\$\{path\}`,[\s\S]*credentials: "include"/u);
});

test("Admin Web password, enrollment, MFA, recovery, and step-up stages keep access memory-only", async () => {
  const { AdminSessionClient } = await import("../admin-web/src/admin-session.js");
  const requests: Array<{ path: string; body: Record<string, unknown>; credentials?: string }> = [];
  const responses = [
    jsonResponse({ state: "enrollment_required", enrollment: { manualKey: "TESTONLY", otpauthUri: "otpauth://totp/test" } }),
    jsonResponse({
      accessToken: "admin-access-after-mfa",
      accessTokenExpiresAt: "2026-08-21T01:00:00.000Z",
      user: testAdminUser(),
      recoveryCodes: ["TEST-RECOVERY-CODE"],
      recoveryUsed: false,
      remainingRecoveryCodes: 10,
    }),
    jsonResponse({ ok: true, expiresAt: "2026-08-21T00:10:00.000Z" }),
    jsonResponse({ ok: true }),
    jsonResponse({ state: "mfa_required" }),
    jsonResponse({
      accessToken: "admin-access-after-recovery",
      accessTokenExpiresAt: "2026-08-21T01:00:00.000Z",
      user: testAdminUser(),
      recoveryUsed: true,
      remainingRecoveryCodes: 9,
    }),
  ];
  const client = new AdminSessionClient("https://api.example.test", async (input, init) => {
    requests.push({
      path: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      credentials: init?.credentials,
    });
    const response = responses.shift();
    assert.ok(response);
    return response;
  });

  const enrollment = await client.login("owner@example.test", "password-stage-only");
  assert.equal(enrollment.state, "enrollment_required");
  assert.equal(client.getAccessToken(), undefined);
  const completed = await client.confirmEnrollment("123456");
  assert.equal(client.getAccessToken(), "admin-access-after-mfa");
  assert.deepEqual(completed.recoveryCodes, ["TEST-RECOVERY-CODE"]);
  await client.stepUp("654321");
  await client.logout();
  assert.equal(client.getAccessToken(), undefined);

  assert.equal((await client.login("owner@example.test", "password-stage-only")).state, "mfa_required");
  const recovered = await client.verifyMfa("recovery", "TEST-RECOVERY-CODE");
  assert.equal(recovered.recoveryUsed, true);
  assert.equal(client.getAccessToken(), "admin-access-after-recovery");
  assert.equal(requests.every((request) => request.credentials === "include"), true);
  assert.deepEqual(requests.map((request) => request.path), [
    "https://api.example.test/admin/session/login",
    "https://api.example.test/admin/session/mfa/enroll/confirm",
    "https://api.example.test/admin/session/step-up",
    "https://api.example.test/admin/session/logout",
    "https://api.example.test/admin/session/login",
    "https://api.example.test/admin/session/mfa/verify",
  ]);
});

test("Admin Web restore handles valid, expired, disabled, and generic auth responses without stale access", async () => {
  const { AdminSessionClient } = await import("../admin-web/src/admin-session.js");
  const responses = [
    jsonResponse({
      accessToken: "restored-admin-access",
      accessTokenExpiresAt: "2026-08-21T01:00:00.000Z",
      user: testAdminUser(),
    }),
    jsonResponse({ error: { code: "unauthorized", message: "Authentication failed" } }, 401),
    jsonResponse({ error: { code: "unauthorized", message: "Authentication failed" } }, 401),
  ];
  const client = new AdminSessionClient("https://api.example.test", async () => {
    const response = responses.shift();
    assert.ok(response);
    return response;
  });

  assert.equal((await client.restore())?.accessToken, "restored-admin-access");
  assert.equal(await client.restore(), null);
  assert.equal(client.getAccessToken(), undefined);
  await assert.rejects(
    () => client.verifyMfa("totp", "000000"),
    (error: unknown) => error instanceof Error
      && error.message === "Authentication failed"
      && (error as Error & { status?: number; code?: string }).status === 401
      && (error as Error & { status?: number; code?: string }).code === "unauthorized",
  );
  assert.equal(client.getAccessToken(), undefined);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function testAdminUser() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.test",
    displayName: "Owner",
    amoriaId: "AMOWNER1",
    avatarUrl: null,
  };
}

test("application registers MFA, step-up, isolated Admin, and unchanged mobile auth endpoints", async (t) => {
  const { buildApp } = require("../src/app") as typeof import("../src/app");
  const app = buildApp();
  t.after(() => app.close());
  await app.ready();
  for (const url of [
    "/admin/session/login",
    "/admin/session/mfa/verify",
    "/admin/session/mfa/enroll/confirm",
    "/admin/session/step-up",
    "/admin/session/refresh",
    "/admin/session/logout",
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
  ]) assert.equal(app.hasRoute({ method: "POST", url }), true, url);
});

test("security source has no production MFA bypass and no secret-bearing logging", () => {
  const source = [
    read("src/admin/admin-session.service.ts"),
    read("src/admin/admin-session.routes.ts"),
    read("src/admin/admin-mfa.repo.ts"),
  ].join("\n");
  assert.doesNotMatch(source, /MFA_BYPASS|SKIP_ADMIN_MFA|TEST_MFA_CODE|DISABLE_ADMIN_MFA/u);
  assert.doesNotMatch(source, /console\.|request\.log/u);
  assert.doesNotMatch(read("src/admin/admin-owner.bootstrap.ts"), /generatedPassword=/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/u);
});
