import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const strongA = "0123456789abcdefGHIJKLMNOPqrstuvwxyz-ABCD";
const strongB = "fedcba9876543210ZYXWVUTSrqponmlkjihg-DCBA";
const strongC = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0";

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: "postgres://runtime:disposable@db:5432/amoria",
    JWT_SECRET: strongA,
    AUTH_SECURITY_HMAC_SECRET: strongB,
    MESSAGE_ABUSE_HMAC_SECRET: strongC,
    PUBLIC_API_URL: "https://api.example.test",
    PUBLIC_MEDIA_URL: "https://api.example.test/media",
    ALLOW_LOCAL_PUBLIC_URLS: "false",
    OBJECT_STORAGE_PROVIDER: "s3",
    S3_ENDPOINT: "http://minio:9000",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "QaAccessKey-7F3kP9",
    S3_SECRET_KEY: strongC,
    S3_BUCKET: "amoria",
    S3_PUBLIC_BASE_URL: "https://api.example.test/media",
    S3_FORCE_PATH_STYLE: "1",
    TEXT_MODERATION_ENABLED: "true",
    TEXT_MODERATION_PYTHON: "/usr/bin/python3",
    TEXT_MODERATION_MODEL_DIR: "/models/text",
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_REQUIRE_TLS: "true",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    MAIL_FROM: "no-reply@example.test",
    MAIL_FROM_NAME: "Amoria",
    TRUST_PROXY: "172.28.0.1/32",
    CORS_ALLOWED_ORIGINS: "https://admin.example.test",
    RELEASE_SHA: "0123456789abcdef0123456789abcdef01234567",
    ...overrides,
  };
}

function loadProductionEnv(overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--eval", "import('./src/config/env.ts')"],
    { cwd: process.cwd(), env: productionEnv(overrides), encoding: "utf8", timeout: 15_000 },
  );
}

test("complete production configuration loads", () => {
  const result = loadProductionEnv();
  assert.equal(result.status, 0, result.stderr);
});

test("production SMTP supports either a credential pair or an intentional private relay", () => {
  assert.equal(loadProductionEnv({ SMTP_USER: "", SMTP_PASSWORD: "" }).status, 0);
  assert.equal(loadProductionEnv({ SMTP_USER: "smtp-user", SMTP_PASSWORD: "smtp-password" }).status, 0);
  assert.notEqual(loadProductionEnv({ SMTP_USER: "smtp-user", SMTP_PASSWORD: "" }).status, 0);
  assert.notEqual(loadProductionEnv({ SMTP_USER: "", SMTP_PASSWORD: "smtp-password" }).status, 0);
});

test("production SMTP requires safe host and sender header configuration", () => {
  for (const overrides of [
    { SMTP_HOST: "" },
    { SMTP_HOST: "smtp.example.test\r\nX-Injected: yes" },
    { MAIL_FROM: "" },
    { MAIL_FROM: "not-an-email" },
    { MAIL_FROM: "no-reply@example.test\r\nBcc: injected@example.test" },
    { MAIL_FROM_NAME: "Amoria\r\nBcc: injected@example.test" },
  ]) {
    assert.notEqual(loadProductionEnv(overrides).status, 0);
  }
});

test("production SMTP timeout is explicitly bounded", () => {
  assert.equal(loadProductionEnv({ SMTP_CONNECTION_TIMEOUT_MS: "100" }).status, 0);
  assert.equal(loadProductionEnv({ SMTP_CONNECTION_TIMEOUT_MS: "30000" }).status, 0);
  assert.notEqual(loadProductionEnv({ SMTP_CONNECTION_TIMEOUT_MS: "99" }).status, 0);
  assert.notEqual(loadProductionEnv({ SMTP_CONNECTION_TIMEOUT_MS: "30001" }).status, 0);
});

for (const name of [
  "JWT_SECRET",
  "AUTH_SECURITY_HMAC_SECRET",
  "MESSAGE_ABUSE_HMAC_SECRET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "PUBLIC_API_URL",
  "TEXT_MODERATION_MODEL_DIR",
  "CORS_ALLOWED_ORIGINS",
  "TRUST_PROXY",
] as const) {
  test(`production fails closed when ${name} is missing`, () => {
    const result = loadProductionEnv({ [name]: "" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(name));
  });
}

test("production rejects repository sample/default secrets", () => {
  assert.notEqual(loadProductionEnv({ JWT_SECRET: "change-me-change-me-change-me-change-me" }).status, 0);
  assert.notEqual(loadProductionEnv({ S3_ACCESS_KEY: "minioadmin" }).status, 0);
});

test("production rejects trust-all proxy and wildcard/null CORS policies", () => {
  assert.notEqual(loadProductionEnv({ TRUST_PROXY: "true" }).status, 0);
  assert.notEqual(loadProductionEnv({ CORS_ALLOWED_ORIGINS: "*" }).status, 0);
  assert.notEqual(loadProductionEnv({ CORS_ALLOWED_ORIGINS: "null" }).status, 0);
});

test("production bounds database pool and timeout configuration", () => {
  assert.notEqual(loadProductionEnv({ DB_POOL_MAX: "51" }).status, 0);
  assert.notEqual(loadProductionEnv({ DB_CONNECTION_TIMEOUT_MS: "60001" }).status, 0);
  assert.notEqual(loadProductionEnv({ DB_IDLE_TIMEOUT_MS: "600001" }).status, 0);
  assert.notEqual(loadProductionEnv({ DB_STATEMENT_TIMEOUT_MS: "300001" }).status, 0);
});
