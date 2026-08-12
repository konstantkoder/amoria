import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

test("GET /health returns service status", async (t) => {
  const { buildApp } = require("../src/app") as typeof import("../src/app");
  const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
  const app = buildApp();

  t.after(async () => {
    await app.close();
    await closeDb();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().service, "amoria-api");
  assert.equal(typeof response.json().time, "string");
});

test("readiness distinguishes degraded SMTP from unavailable core dependencies", () => {
  const { summarizeReadiness } = require("../src/app") as typeof import("../src/app");
  assert.deepEqual(summarizeReadiness("ok", "ok", "ok"), { ok: true, degraded: false });
  assert.deepEqual(summarizeReadiness("ok", "ok", "error"), { ok: true, degraded: true });
  assert.deepEqual(summarizeReadiness("error", "ok", "ok"), { ok: false, degraded: true });
  assert.deepEqual(summarizeReadiness("ok", "error", "ok"), { ok: false, degraded: true });
});

test("liveness and version endpoints expose safe release identity", async (t) => {
  const { buildApp, EXPECTED_MIGRATION } = require("../src/app") as typeof import("../src/app");
  const app = buildApp();
  t.after(async () => app.close());

  const live = await app.inject({ method: "GET", url: "/health/live" });
  assert.equal(live.statusCode, 200);
  assert.equal(live.json().ok, true);

  const version = await app.inject({ method: "GET", url: "/version" });
  assert.equal(version.statusCode, 200);
  assert.equal(version.json().migration, EXPECTED_MIGRATION);
  assert.equal(version.json().releaseSha, "development");
  assert.equal(JSON.stringify(version.json()).includes("secret"), false);
});

test("untrusted forwarded IP and static upload paths are not trusted in local/test mode", async (t) => {
  const { buildApp } = require("../src/app") as typeof import("../src/app");
  const app = buildApp();
  app.get("/__qa/request-ip", async (request) => ({ ip: request.ip }));
  t.after(async () => app.close());

  const ip = await app.inject({
    method: "GET",
    url: "/__qa/request-ip",
    headers: { "x-forwarded-for": "198.51.100.77" },
  });
  assert.notEqual(ip.json().ip, "198.51.100.77");

  const staticBypass = await app.inject({ method: "GET", url: "/media/private-marker.jpg" });
  assert.equal(staticBypass.statusCode, 404);
});

test("CORS allows configured Admin origin, allows native calls, and rejects untrusted/null origins", async (t) => {
  const { buildApp } = require("../src/app") as typeof import("../src/app");
  const app = buildApp();
  t.after(async () => app.close());

  const allowed = await app.inject({
    method: "OPTIONS",
    url: "/health",
    headers: {
      origin: "http://localhost:5174",
      "access-control-request-method": "GET",
      "access-control-request-headers": "x-amoria-admin-session,content-type",
    },
  });
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5174");
  assert.equal(allowed.headers["access-control-allow-credentials"], "true");
  assert.match(String(allowed.headers["access-control-allow-headers"]), /x-amoria-admin-session/i);

  const untrusted = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
  assert.equal(untrusted.headers["access-control-allow-origin"], undefined);
  const nullOrigin = await app.inject({ method: "GET", url: "/health", headers: { origin: "null" } });
  assert.equal(nullOrigin.headers["access-control-allow-origin"], undefined);
  const native = await app.inject({ method: "GET", url: "/health" });
  assert.equal(native.statusCode, 200);
});
