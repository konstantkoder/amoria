import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

test("a lost refresh response can derive the same replacement token during retry grace", () => {
  const { deriveRotatedRefreshToken } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  const original = "independent-original-refresh-token";
  const replacementId = "4e5e6fb5-5125-438f-9940-89e193ab2754";

  const first = deriveRotatedRefreshToken(original, replacementId);
  const retry = deriveRotatedRefreshToken(original, replacementId);

  assert.equal(retry, first);
  assert.notEqual(first, original);
  assert.equal(first.includes(original), false);
});

test("different replacement sessions derive different refresh tokens", () => {
  const { deriveRotatedRefreshToken } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  const original = "independent-original-refresh-token";

  assert.notEqual(
    deriveRotatedRefreshToken(original, "4e5e6fb5-5125-438f-9940-89e193ab2754"),
    deriveRotatedRefreshToken(original, "f34d4d64-f5df-4b71-ab36-b05e5643ab67"),
  );
});

test("access tokens carry the durable authentication generation", () => {
  const { signAccessToken, verifyAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
  const token = signAccessToken("00000000-0000-4000-8000-000000000001", 7);
  assert.equal(verifyAccessToken(token).ver, 7);
});
