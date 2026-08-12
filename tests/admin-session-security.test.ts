import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import Fastify from "fastify";
import type { AuthResponse } from "../src/auth/auth.types";
import type { AdminContext, AdminRoleKey } from "../src/admin/admin.types";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://unused";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5174";

const { AppError, errorHandler, forbidden } = require("../src/common/errors") as typeof import("../src/common/errors");
const sessionService = require("../src/admin/admin-session.service") as typeof import("../src/admin/admin-session.service");
const sessionRoutes = require("../src/admin/admin-session.routes") as typeof import("../src/admin/admin-session.routes");
type FrontendAdminSessionClient = {
  clearLegacyStorage(storage: { removeItem(key: string): void }): void;
  getAccessToken(): string | undefined;
  restore(): Promise<{ accessToken: string } | null>;
  refresh(): Promise<boolean>;
};
const frontendSession = require("../admin-web/src/admin-session") as {
  AdminSessionClient: new (
    apiBaseUrl: string,
    fetchImplementation?: (input: string, init?: RequestInit) => Promise<Response>,
  ) => FrontendAdminSessionClient;
  LEGACY_ADMIN_TOKEN_STORAGE_KEY: string;
};
const { AdminSessionClient, LEGACY_ADMIN_TOKEN_STORAGE_KEY } = frontendSession;

const userId = "00000000-0000-4000-8000-000000000001";
const allowedHeaders = {
  origin: "http://localhost:5174",
  "x-amoria-admin-session": "1",
};

function authResponse(refreshToken: string): AuthResponse {
  return {
    accessToken: `access-${refreshToken}`,
    refreshToken,
    accessTokenExpiresAt: "2026-08-12T12:00:00.000Z",
    user: {
      id: userId,
      email: "admin@example.test",
      displayName: "Admin",
      amoriaId: "AM12345",
      avatarUrl: null,
    },
  };
}

function adminContext(role: AdminRoleKey, status: "active" | "disabled" = "active"): AdminContext {
  return {
    adminUser: {
      id: "00000000-0000-4000-8000-0000000000a1",
      userId,
      status,
      roles: [role],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    user: {
      id: userId,
      amoriaId: "AM12345",
      displayName: "Admin",
      email: "admin@example.test",
    },
  };
}

function adminContextWithoutRoles(): AdminContext {
  const context = adminContext("owner");
  return {
    ...context,
    adminUser: { ...context.adminUser, roles: [] },
  };
}

function installSessionDeps(input: {
  login?: () => Promise<AuthResponse>;
  refresh?: (refreshToken: string) => Promise<AuthResponse>;
  logout?: (refreshToken: string) => Promise<{ ok: true }>;
  getAdmin?: () => Promise<AdminContext>;
} = {}): { restore: () => void; revoked: string[] } {
  const revoked: string[] = [];
  const restore = sessionService.__setAdminSessionServiceDepsForTests({
    auth: {
      login: async () => input.login ? input.login() : authResponse("login-refresh-token-value-00000001"),
      refresh: async ({ refreshToken }) => input.refresh
        ? input.refresh(refreshToken)
        : authResponse("rotated-refresh-token-value-00000002"),
      logout: async ({ refreshToken }) => {
        revoked.push(refreshToken);
        return input.logout ? input.logout(refreshToken) : { ok: true };
      },
    },
    admin: {
      getAdminContextByUserId: async () => input.getAdmin ? input.getAdmin() : adminContext("owner"),
      assertAdminHasAnyRole: (admin, roles) => {
        if (!roles.some((role) => admin.adminUser.roles.includes(role))) {
          throw forbidden("Admin access is required");
        }
      },
    },
  });
  return { restore, revoked };
}

async function sessionApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  await app.register(sessionRoutes.adminSessionRoutes, { prefix: "/admin/session" });
  return app;
}

function cookieValue(setCookie: string): string {
  return setCookie.split(";", 1)[0]?.split("=", 2)[1] ?? "";
}

test("ordinary user cannot create an Admin session and the newly issued refresh token is revoked", async (t) => {
  const deps = installSessionDeps({ getAdmin: async () => { throw forbidden("Admin access is required"); } });
  t.after(deps.restore);
  await assert.rejects(
    () => sessionService.loginAdminSession({ email: "user@example.test", password: "password" }, {}),
    (error) => (error as { statusCode?: number }).statusCode === 403,
  );
  assert.deepEqual(deps.revoked, ["login-refresh-token-value-00000001"]);
});

for (const role of ["owner", "moderator", "support", "ops"] as const) {
  test(`${role} can establish an Admin session`, async (t) => {
    const deps = installSessionDeps({ getAdmin: async () => adminContext(role) });
    t.after(deps.restore);
    const session = await sessionService.loginAdminSession({
      email: `${role}@example.test`,
      password: "password",
    }, {});
    assert.equal(session.response.accessToken, "access-login-refresh-token-value-00000001");
    assert.equal("refreshToken" in session.response, false);
    assert.equal(session.refreshToken, "login-refresh-token-value-00000001");
  });
}

test("disabled Admin cannot establish a session and the refresh token is revoked", async (t) => {
  const deps = installSessionDeps({
    getAdmin: async () => { throw forbidden("Admin access is required"); },
  });
  t.after(deps.restore);
  await assert.rejects(() => sessionService.loginAdminSession({
    email: "disabled@example.test",
    password: "password",
  }, {}));
  assert.deepEqual(deps.revoked, ["login-refresh-token-value-00000001"]);
});

test("Admin login sets a host-only HttpOnly SameSite Strict cookie and omits refresh token from JSON", async (t) => {
  const deps = installSessionDeps();
  t.after(deps.restore);
  const app = await sessionApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/admin/session/login",
    headers: allowedHeaders,
    payload: { email: "admin@example.test", password: "password" },
  });
  const body = response.json();
  const setCookie = String(response.headers["set-cookie"]);

  assert.equal(response.statusCode, 200);
  assert.equal(body.refreshToken, undefined);
  assert.equal(body.accessToken, "access-login-refresh-token-value-00000001");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/admin\/session/i);
  assert.match(setCookie, /Max-Age=2592000/i);
  assert.doesNotMatch(setCookie, /Domain=/i);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("production cookie serialization is always Secure and never sets Domain", () => {
  const setCookie = sessionRoutes.serializeAdminRefreshCookie("refresh-token-value-00000000000001", {
    secure: true,
    now: new Date("2026-08-12T00:00:00.000Z"),
  });
  assert.match(setCookie, /; Secure(?:;|$)/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, /Domain=/i);
  const routeSource = readFileSync(path.join(process.cwd(), "src/admin/admin-session.routes.ts"), "utf8");
  assert.match(routeSource, /serializeAdminRefreshCookie\(refreshToken, \{ secure: env\.isProduction \}\)/);
  assert.match(routeSource, /serializeClearedAdminRefreshCookie\(\{ secure: env\.isProduction \}\)/);
});

test("refresh reads only the cookie, rotates it, omits refresh token from JSON, and rejects old-token reuse", async (t) => {
  const usable = new Set(["refresh-token-value-00000000000001"]);
  const refreshCalls: string[] = [];
  const deps = installSessionDeps({
    refresh: async (refreshToken) => {
      refreshCalls.push(refreshToken);
      if (!usable.delete(refreshToken)) throw new AppError("invalid_refresh", "Invalid refresh token", 401);
      usable.add("refresh-token-value-00000000000002");
      return authResponse("refresh-token-value-00000000000002");
    },
  });
  t.after(deps.restore);
  const app = await sessionApp();
  t.after(() => app.close());

  const rotated = await app.inject({
    method: "POST",
    url: "/admin/session/refresh",
    headers: { ...allowedHeaders, cookie: "amoria_admin_refresh=refresh-token-value-00000000000001" },
    payload: {},
  });
  assert.equal(rotated.statusCode, 200);
  assert.equal(rotated.json().refreshToken, undefined);
  assert.equal(decodeURIComponent(cookieValue(String(rotated.headers["set-cookie"]))), "refresh-token-value-00000000000002");

  const replay = await app.inject({
    method: "POST",
    url: "/admin/session/refresh",
    headers: { ...allowedHeaders, cookie: "amoria_admin_refresh=refresh-token-value-00000000000001" },
    payload: {},
  });
  assert.equal(replay.statusCode, 401);
  assert.match(String(replay.headers["set-cookie"]), /Max-Age=0/);
  assert.deepEqual(refreshCalls, [
    "refresh-token-value-00000000000001",
    "refresh-token-value-00000000000001",
  ]);
});

test("disabled Admin fails on refresh, rotated token is revoked, and cookie is cleared", async (t) => {
  const deps = installSessionDeps({ getAdmin: async () => { throw forbidden("Admin access is required"); } });
  t.after(deps.restore);
  const app = await sessionApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/admin/session/refresh",
    headers: { ...allowedHeaders, cookie: "amoria_admin_refresh=refresh-token-value-00000000000001" },
    payload: {},
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(deps.revoked, ["rotated-refresh-token-value-00000002"]);
  assert.match(String(response.headers["set-cookie"]), /Max-Age=0/);
});

test("Admin with all roles removed fails on refresh, rotated token is revoked, and cookie is cleared", async (t) => {
  const deps = installSessionDeps({ getAdmin: async () => adminContextWithoutRoles() });
  t.after(deps.restore);
  const app = await sessionApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/admin/session/refresh",
    headers: { ...allowedHeaders, cookie: "amoria_admin_refresh=refresh-token-value-00000000000001" },
    payload: {},
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(deps.revoked, ["rotated-refresh-token-value-00000002"]);
  assert.match(String(response.headers["set-cookie"]), /Max-Age=0/);
});

test("logout revokes cookie token, clears cookie, and repeated logout is safe", async (t) => {
  const deps = installSessionDeps();
  t.after(deps.restore);
  const app = await sessionApp();
  t.after(() => app.close());

  const first = await app.inject({
    method: "POST",
    url: "/admin/session/logout",
    headers: { ...allowedHeaders, cookie: "amoria_admin_refresh=refresh-token-value-00000000000001" },
    payload: {},
  });
  const repeated = await app.inject({
    method: "POST",
    url: "/admin/session/logout",
    headers: allowedHeaders,
    payload: {},
  });
  assert.equal(first.statusCode, 200);
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(deps.revoked, ["refresh-token-value-00000000000001"]);
  assert.match(String(first.headers["set-cookie"]), /Max-Age=0/);
  assert.match(String(repeated.headers["set-cookie"]), /Max-Age=0/);
});

test("missing custom header, missing Origin, and untrusted Origin reject Admin session mutations", async (t) => {
  const deps = installSessionDeps();
  t.after(deps.restore);
  const app = await sessionApp();
  t.after(() => app.close());
  const variants = [
    { origin: "http://localhost:5174" },
    { "x-amoria-admin-session": "1" },
    { origin: "https://evil.example", "x-amoria-admin-session": "1" },
  ];
  for (const headers of variants) {
    const response = await app.inject({
      method: "POST",
      url: "/admin/session/login",
      headers,
      payload: { email: "admin@example.test", password: "password" },
    });
    assert.equal(response.statusCode, 403);
  }
});

test("exact allowed Admin origin and custom header permit a session request", async (t) => {
  const deps = installSessionDeps();
  t.after(deps.restore);
  const app = await sessionApp();
  t.after(() => app.close());
  const response = await app.inject({
    method: "POST",
    url: "/admin/session/login",
    headers: allowedHeaders,
    payload: { email: "admin@example.test", password: "password" },
  });
  assert.equal(response.statusCode, 200);
});

test("application registers isolated Admin session endpoints alongside unchanged mobile auth endpoints", async (t) => {
  const { buildApp } = require("../src/app") as typeof import("../src/app");
  const app = buildApp();
  t.after(() => app.close());
  await app.ready();
  for (const url of [
    "/admin/session/login",
    "/admin/session/refresh",
    "/admin/session/logout",
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
  ]) {
    assert.equal(app.hasRoute({ method: "POST", url }), true, url);
  }
});

test("legacy Admin token storage is deleted and no Admin auth token is persisted by frontend runtime", () => {
  const removed: string[] = [];
  const client = new AdminSessionClient("", async () => new Response(null, { status: 401 }));
  client.clearLegacyStorage({ removeItem: (key) => removed.push(key) });
  assert.deepEqual(removed, [LEGACY_ADMIN_TOKEN_STORAGE_KEY]);

  const sessionSource = readFileSync(path.join(process.cwd(), "admin-web/src/admin-session.ts"), "utf8");
  const apiSource = readFileSync(path.join(process.cwd(), "admin-web/src/api.ts"), "utf8");
  assert.doesNotMatch(`${sessionSource}\n${apiSource}`, /localStorage\.setItem|sessionStorage|indexedDB|document\.cookie/i);
  assert.doesNotMatch(apiSource, /\/auth\/login|\/auth\/refresh|\/auth\/logout/);
});

test("Admin refresh cookie is redacted from application logs and absent from audit metadata", () => {
  const loggerSource = readFileSync(path.join(process.cwd(), "src/config/logger.ts"), "utf8");
  const sessionSource = readFileSync(path.join(process.cwd(), "src/admin/admin-session.service.ts"), "utf8");
  const routesSource = readFileSync(path.join(process.cwd(), "src/admin/admin-session.routes.ts"), "utf8");
  assert.match(loggerSource, /"req\.headers\.cookie"/);
  assert.match(loggerSource, /"request\.headers\.cookie"/);
  assert.doesNotMatch(`${sessionSource}\n${routesSource}`, /writeAuditLog|request\.log|console\./);
});

test("Admin Web reload restores access session through cookie refresh and expired session returns login state", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const successful = new AdminSessionClient("https://api.example.test", async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      accessToken: "memory-access-token",
      accessTokenExpiresAt: "2026-08-12T12:00:00.000Z",
      user: authResponse("unused").user,
    }), { status: 200 });
  });
  assert.equal((await successful.restore())?.accessToken, "memory-access-token");
  assert.equal(calls[0]?.url, "https://api.example.test/admin/session/refresh");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-amoria-admin-session"), "1");

  const expired = new AdminSessionClient("", async () => new Response(null, { status: 401 }));
  assert.equal(await expired.restore(), null);
  assert.equal(expired.getAccessToken(), undefined);
});

test("concurrent frontend refresh requests share exactly one cookie rotation", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const client = new AdminSessionClient("", async () => {
    calls += 1;
    await gate;
    return new Response(JSON.stringify({
      accessToken: "rotated-access-token",
      accessTokenExpiresAt: "2026-08-12T12:00:00.000Z",
      user: authResponse("unused").user,
    }), { status: 200 });
  });

  const refreshes = [client.refresh(), client.refresh(), client.refresh(), client.refresh(), client.refresh()];
  await Promise.resolve();
  assert.equal(calls, 1);
  release?.();
  assert.deepEqual(await Promise.all(refreshes), [true, true, true, true, true]);
  assert.equal(calls, 1);
});

test("mobile auth endpoint contracts remain unchanged and still include refreshToken in JSON schemas", () => {
  const { loginRouteSchema, refreshRouteSchema } = require("../src/auth/auth.schemas") as typeof import("../src/auth/auth.schemas");
  const loginRequired = loginRouteSchema.response[200].required;
  const refreshRequired = refreshRouteSchema.response[200].required;
  assert.equal(loginRequired.includes("refreshToken"), true);
  assert.equal(refreshRequired.includes("refreshToken"), true);
  const authRoutesSource = readFileSync(path.join(process.cwd(), "src/auth/auth.routes.ts"), "utf8");
  assert.match(authRoutesSource, /"\/login"/);
  assert.match(authRoutesSource, /"\/refresh"/);
  assert.match(authRoutesSource, /"\/logout"/);
});
