import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";

const presence = require("../src/users/user-presence.service") as typeof import("../src/users/user-presence.service");

test("50 concurrent stale presence heartbeats produce one durable update", async (t) => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  let sharedClaims = 0;
  let updates = 0;
  const restore = presence.__setUserPresenceDepsForTests({
    now: () => new Date(now),
    heartbeatIntervalMs: 60_000,
    claimShared: async () => {
      sharedClaims += 1;
      return undefined;
    },
    touch: async () => { updates += 1; },
  });
  t.after(restore);

  const stale = new Date(now.getTime() - 120_000);
  const results = await Promise.all(
    Array.from({ length: 50 }, () => presence.refreshUserPresence("presence-user", stale)),
  );
  assert.equal(sharedClaims, 1);
  assert.equal(updates, 1);
  assert.equal(results.filter(Boolean).length, 1);
});

test("fresh presence skips shared coordination and the DB update", async (t) => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  let sharedClaims = 0;
  let updates = 0;
  const restore = presence.__setUserPresenceDepsForTests({
    now: () => new Date(now),
    heartbeatIntervalMs: 60_000,
    claimShared: async () => {
      sharedClaims += 1;
      return true;
    },
    touch: async () => { updates += 1; },
  });
  t.after(restore);

  assert.equal(
    await presence.refreshUserPresence("presence-user", new Date(now.getTime() - 30_000)),
    false,
  );
  assert.equal(sharedClaims, 0);
  assert.equal(updates, 0);
});
