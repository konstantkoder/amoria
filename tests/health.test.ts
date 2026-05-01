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
