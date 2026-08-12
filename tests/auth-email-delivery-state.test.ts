import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://unused";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.AUTH_SECURITY_HMAC_SECRET = "test-auth-security-secret-that-is-long-enough";

const message = {
  subject: "Verify your Amoria email",
  text: "Use code 123456",
  html: "<p>Use code 123456</p>",
};

test("successful SMTP delivery marks the challenge sent only after transport acceptance", async () => {
  const { deliverCreatedEmailChallenge } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  const events: string[] = [];

  await deliverCreatedEmailChallenge({
    challengeId: "challenge-id",
    recipient: "recipient@example.test",
    message,
  }, {
    delivery: { send: async () => { events.push("accepted"); } },
    markSent: async () => { events.push("marked"); },
    invalidate: async () => { events.push("invalidated"); },
  });

  assert.deepEqual(events, ["accepted", "marked"]);
});

test("transient SMTP failure invalidates only the failed challenge and returns retryable generic error", async () => {
  const { deliverCreatedEmailChallenge } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  const { EmailDeliveryError } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const events: string[] = [];

  await assert.rejects(() => deliverCreatedEmailChallenge({
    challengeId: "challenge-id",
    recipient: "recipient@example.test",
    message,
  }, {
    delivery: { send: async () => { throw new EmailDeliveryError("transient", "smtp_timeout"); } },
    markSent: async () => { events.push("marked"); },
    invalidate: async (challengeId) => { events.push(`invalidated:${challengeId}`); },
  }), (error) => {
    const appError = error as { code?: string; statusCode?: number; message?: string };
    assert.equal(appError.code, "email_delivery_unavailable");
    assert.equal(appError.statusCode, 503);
    assert.doesNotMatch(appError.message ?? "", /smtp|host|recipient@example\.test/i);
    return true;
  });
  assert.deepEqual(events, ["invalidated:challenge-id"]);
});

test("permanent SMTP failure is generic, non-successful, and does not mark the challenge sent", async () => {
  const { deliverCreatedEmailChallenge } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  const { EmailDeliveryError } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const events: string[] = [];

  await assert.rejects(() => deliverCreatedEmailChallenge({
    challengeId: "challenge-id",
    recipient: "recipient@example.test",
    message,
  }, {
    delivery: { send: async () => { throw new EmailDeliveryError("permanent", "smtp_recipient_rejected"); } },
    markSent: async () => { events.push("marked"); },
    invalidate: async (challengeId) => { events.push(`invalidated:${challengeId}`); },
  }), (error) => {
    const appError = error as { code?: string; statusCode?: number; message?: string };
    assert.equal(appError.code, "email_delivery_failed");
    assert.equal(appError.statusCode, 502);
    assert.doesNotMatch(appError.message ?? "", /smtp|host|recipient@example\.test/i);
    return true;
  });
  assert.deepEqual(events, ["invalidated:challenge-id"]);
});

test("post-acceptance database failure does not consume the delivered challenge", async () => {
  const { deliverCreatedEmailChallenge } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  let invalidated = false;

  await assert.rejects(() => deliverCreatedEmailChallenge({
    challengeId: "challenge-id",
    recipient: "recipient@example.test",
    message,
  }, {
    delivery: { send: async () => undefined },
    markSent: async () => { throw new Error("database unavailable"); },
    invalidate: async () => { invalidated = true; },
  }), /database unavailable/);
  assert.equal(invalidated, false);
});
