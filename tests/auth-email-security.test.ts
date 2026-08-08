import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.AUTH_SECURITY_HMAC_SECRET = "test-auth-security-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

test("challenge codes are six random digits and only keyed hashes are persisted", () => {
  const { generateChallengeCode, hashChallengeCode } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  const code = generateChallengeCode();
  const digest = hashChallengeCode("09d07885-e593-4f7c-99b9-a38a260ee129", "verify_email", code);

  assert.match(code, /^[0-9]{6}$/);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digest.includes(code), false);
  assert.notEqual(
    digest,
    hashChallengeCode("09d07885-e593-4f7c-99b9-a38a260ee129", "password_reset", code),
  );
});

test("local disposable-domain policy blocks exact domains and subdomains", () => {
  const { DisposableEmailDomainService } = require("../src/email/disposable-email-domain.service") as typeof import("../src/email/disposable-email-domain.service");
  const service = new DisposableEmailDomainService(["mailinator.com"]);

  assert.equal(service.isBlocked("mailinator.com"), true);
  assert.equal(service.isBlocked("inbox.mailinator.com"), true);
  assert.equal(service.isBlocked("gmail.com"), false);
  assert.equal(service.isBlocked("notmailinator.com"), false);
});

test("email domain validation accepts MX and RFC address fallback", async () => {
  const { EmailDomainValidationService } = require("../src/email/email-domain-validation.service") as typeof import("../src/email/email-domain-validation.service");
  const noData = Object.assign(new Error("no data"), { code: "ENODATA" });
  const withMx = new EmailDomainValidationService({
    resolveMx: async () => [{ exchange: "mail.example.test", priority: 10 }],
    resolve4: async () => [],
    resolve6: async () => [],
  }, 100, 1000);
  await withMx.assertUsable("example.test");

  const withFallback = new EmailDomainValidationService({
    resolveMx: async () => Promise.reject(noData),
    resolve4: async () => ["192.0.2.10"],
    resolve6: async () => Promise.reject(noData),
  }, 100, 1000);
  await withFallback.assertUsable("fallback.example.test");
});

test("email domain validation separates permanent and transient DNS failures", async () => {
  const { EmailDomainValidationError, EmailDomainValidationService } = require("../src/email/email-domain-validation.service") as typeof import("../src/email/email-domain-validation.service");
  const noData = Object.assign(new Error("no data"), { code: "ENODATA" });
  const invalid = new EmailDomainValidationService({
    resolveMx: async () => Promise.reject(noData),
    resolve4: async () => Promise.reject(noData),
    resolve6: async () => Promise.reject(noData),
  }, 100, 1000);
  await assert.rejects(() => invalid.assertUsable("invalid.example.test"), (error) => {
    assert.equal(error instanceof EmailDomainValidationError, true);
    assert.equal((error as InstanceType<typeof EmailDomainValidationError>).kind, "invalid");
    return true;
  });

  const transient = new EmailDomainValidationService({
    resolveMx: async () => Promise.reject(Object.assign(new Error("again"), { code: "EAI_AGAIN" })),
    resolve4: async () => [],
    resolve6: async () => [],
  }, 100, 1000);
  await assert.rejects(() => transient.assertUsable("retry.example.test"), (error) => {
    assert.equal((error as InstanceType<typeof EmailDomainValidationError>).kind, "transient");
    return true;
  });
});

test("email domain validation rejects an RFC 7505 null MX without address fallback", async () => {
  const { EmailDomainValidationError, EmailDomainValidationService } = require("../src/email/email-domain-validation.service") as typeof import("../src/email/email-domain-validation.service");
  let fallbackLookups = 0;
  const nullMx = new EmailDomainValidationService({
    resolveMx: async () => [{ exchange: ".", priority: 0 }],
    resolve4: async () => {
      fallbackLookups += 1;
      return ["192.0.2.10"];
    },
    resolve6: async () => {
      fallbackLookups += 1;
      return [];
    },
  }, 100, 1000);

  await assert.rejects(() => nullMx.assertUsable("null-mx.example.test"), (error) => {
    assert.equal(error instanceof EmailDomainValidationError, true);
    assert.equal((error as InstanceType<typeof EmailDomainValidationError>).kind, "invalid");
    return true;
  });
  assert.equal(fallbackLookups, 0);
});

test("verification and reset templates are localized and contain no session secret", () => {
  const { renderAuthEmail } = require("../src/email/email-templates") as typeof import("../src/email/email-templates");
  for (const locale of ["en", "ru", "hr"] as const) {
    for (const purpose of ["verify_email", "password_reset"] as const) {
      const rendered = renderAuthEmail({ purpose, locale, code: "123456", expiresInMinutes: 15 });
      assert.match(rendered.text, /123456/);
      assert.match(rendered.html, /123456/);
      assert.equal(/accessToken|refreshToken|passwordHash/i.test(`${rendered.text}${rendered.html}`), false);
    }
  }
});

test("migration grandfathers existing users while schema leaves new users unverified", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "src/db/migrations/0029_auth_email_antiabuse.sql"),
    "utf8",
  );
  const schema = fs.readFileSync(path.resolve(process.cwd(), "src/db/schema.ts"), "utf8");

  assert.match(migration, /UPDATE "users" SET "email_verified_at" = "created_at"/);
  assert.match(schema, /emailVerifiedAt: timestamp\("email_verified_at"/);
  assert.doesNotMatch(schema, /emailVerifiedAt:[^\n]*defaultNow/);
  assert.match(migration, /auth_email_challenges/);
  assert.match(migration, /auth_rate_limits/);
});

test("public registration response schema cannot serialize auth tokens or challenge secrets", () => {
  const { registerRouteSchema } = require("../src/auth/auth.schemas") as typeof import("../src/auth/auth.schemas");
  const properties = registerRouteSchema.response[201].properties as Record<string, unknown>;
  assert.deepEqual(Object.keys(properties).sort(), ["email", "ok", "resendAfterSec", "verificationRequired"]);
  assert.equal("accessToken" in properties, false);
  assert.equal("refreshToken" in properties, false);
  assert.equal("code" in properties, false);
  assert.equal("codeHash" in properties, false);
});

test("anti-abuse keys are keyed hashes and never contain raw identity values", () => {
  const { hashRateLimitKey } = require("../src/auth/registration-abuse.guard") as typeof import("../src/auth/registration-abuse.guard");
  const raw = "203.0.113.25";
  const hash = hashRateLimitKey("register:ip", raw);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(raw), false);
});
