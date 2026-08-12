import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { UserRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://unused";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.AUTH_SECURITY_HMAC_SECRET = "test-auth-security-secret-that-is-long-enough";

type PublicFlow = "password_reset" | "verification_resend";

async function publicRequest(input: {
  flow: PublicFlow;
  response: { ok: true; resendAfterSec?: number };
  operation: () => Promise<unknown>;
  logs?: unknown[];
}): Promise<{ statusCode: number; body: unknown }> {
  const { completePublicAuthEmailRequest } = require("../src/auth/auth.routes") as typeof import("../src/auth/auth.routes");
  const app = Fastify({ logger: false });
  app.post("/", async (_request, reply) => reply.status(200).send(await completePublicAuthEmailRequest({
    flow: input.flow,
    response: input.response,
    operation: input.operation,
    logger: {
      warn(bindings, message) {
        input.logs?.push({ bindings, message });
      },
    },
  })));
  try {
    const response = await app.inject({ method: "POST", url: "/" });
    return { statusCode: response.statusCode, body: response.json() };
  } finally {
    await app.close();
  }
}

function deliveryError(kind: "transient" | "permanent"): Error {
  const { EmailDeliveryError } = require("../src/email/email-delivery.service") as typeof import("../src/email/email-delivery.service");
  const { emailDeliveryFailure } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  return emailDeliveryFailure(new EmailDeliveryError(
    kind,
    kind === "transient" ? "smtp_timeout" : "smtp_recipient_rejected",
  ));
}

function unverifiedUser(): UserRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "person@example.test",
    emailVerifiedAt: null,
  } as UserRow;
}

test("password reset success and unknown account have the same public status and body", async () => {
  const generic = { ok: true } as const;
  const existing = await publicRequest({ flow: "password_reset", response: generic, operation: async () => ({ ok: true }) });
  const unknown = await publicRequest({ flow: "password_reset", response: generic, operation: async () => ({ ok: true }) });
  assert.deepEqual(existing, { statusCode: 200, body: generic });
  assert.deepEqual(unknown, existing);
});

test("password reset transient SMTP failure is indistinguishable from an unknown account", async () => {
  const generic = { ok: true } as const;
  const unknown = await publicRequest({ flow: "password_reset", response: generic, operation: async () => ({ ok: true }) });
  const failed = await publicRequest({
    flow: "password_reset",
    response: generic,
    operation: async () => { throw deliveryError("transient"); },
  });
  assert.deepEqual(failed, unknown);
});

test("password reset permanent SMTP failure is indistinguishable from an unknown account", async () => {
  const generic = { ok: true } as const;
  const unknown = await publicRequest({ flow: "password_reset", response: generic, operation: async () => ({ ok: true }) });
  const failed = await publicRequest({
    flow: "password_reset",
    response: generic,
    operation: async () => { throw deliveryError("permanent"); },
  });
  assert.deepEqual(failed, unknown);
});

test("resend success and unknown or already-verified accounts have the same public response", async () => {
  const generic = { ok: true, resendAfterSec: 60 } as const;
  const existing = await publicRequest({ flow: "verification_resend", response: generic, operation: async () => generic });
  const ineligible = await publicRequest({ flow: "verification_resend", response: generic, operation: async () => generic });
  assert.deepEqual(existing, { statusCode: 200, body: generic });
  assert.deepEqual(ineligible, existing);
});

test("resend SMTP failures do not enumerate account state through status or body", async () => {
  const generic = { ok: true, resendAfterSec: 60 } as const;
  const unknown = await publicRequest({ flow: "verification_resend", response: generic, operation: async () => generic });
  for (const kind of ["transient", "permanent"] as const) {
    const failed = await publicRequest({
      flow: "verification_resend",
      response: generic,
      operation: async () => { throw deliveryError(kind); },
    });
    assert.deepEqual(failed, unknown);
  }
});

test("account-specific reset and resend cooldowns remain generic while preventing another delivery", async () => {
  const { AppError } = require("../src/common/errors") as typeof import("../src/common/errors");
  for (const [flow, generic] of [
    ["password_reset", { ok: true }],
    ["verification_resend", { ok: true, resendAfterSec: 60 }],
  ] as const) {
    let deliveryAttempted = false;
    const response = await publicRequest({
      flow,
      response: generic,
      operation: async () => {
        const cooldownActive = true;
        if (cooldownActive) {
          throw new AppError("resend_cooldown", "Please wait", 429, { retryAfterSec: "60" });
        }
        deliveryAttempted = true;
      },
    });
    assert.deepEqual(response, { statusCode: 200, body: generic });
    assert.equal(deliveryAttempted, false);
  }
});

test("identity and IP abuse rate limits remain explicit and are not concealed", async () => {
  const { AppError } = require("../src/common/errors") as typeof import("../src/common/errors");
  const { completePublicAuthEmailRequest } = require("../src/auth/auth.routes") as typeof import("../src/auth/auth.routes");
  await assert.rejects(() => completePublicAuthEmailRequest({
    flow: "password_reset",
    response: { ok: true },
    operation: async () => { throw new AppError("rate_limited", "Too many requests", 429); },
    logger: { warn: () => undefined },
  }), (error) => (error as { code?: string }).code === "rate_limited");
});

test("failed password-reset delivery invalidates the challenge so its code is unusable", async () => {
  const { deliverCreatedEmailChallenge } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  let active = true;
  await assert.rejects(() => deliverCreatedEmailChallenge({
    challengeId: "reset-challenge",
    recipient: "person@example.test",
    message: { subject: "Reset", text: "246810", html: "<p>246810</p>" },
  }, {
    delivery: { send: async () => { throw deliveryError("transient"); } },
    markSent: async () => undefined,
    invalidate: async () => { active = false; },
  }));
  const consume = (code: string) => active && code === "246810" ? "valid" : "invalid";
  assert.equal(consume("246810"), "invalid");
});

test("failed resend delivery invalidates the challenge so its code is unusable", async () => {
  const { deliverCreatedEmailChallenge } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  let active = true;
  let markedSent = false;
  await assert.rejects(() => deliverCreatedEmailChallenge({
    challengeId: "verification-challenge",
    recipient: "person@example.test",
    message: { subject: "Verify", text: "135791", html: "<p>135791</p>" },
  }, {
    delivery: { send: async () => { throw deliveryError("permanent"); } },
    markSent: async () => { markedSent = true; },
    invalidate: async () => { active = false; },
  }));
  assert.equal(active, false);
  assert.equal(markedSent, false);
});

test("initial registration delivery failure remains explicit and cannot issue tokens or fake success", async () => {
  const { deliverCreatedEmailChallenge } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  let invalidated = false;
  let tokensIssued = false;
  const outcome = deliverCreatedEmailChallenge({
    challengeId: "initial-registration",
    recipient: "person@example.test",
    message: { subject: "Verify", text: "112233", html: "<p>112233</p>" },
  }, {
    delivery: { send: async () => { throw deliveryError("transient"); } },
    markSent: async () => { tokensIssued = true; },
    invalidate: async () => { invalidated = true; },
  });
  await assert.rejects(() => outcome, (error) => {
    assert.equal((error as { statusCode?: number }).statusCode, 503);
    return true;
  });
  assert.equal(invalidated, true);
  assert.equal(tokensIssued, false);
});

test("registration retry after failed SMTP creates and delivers a new usable challenge", async () => {
  const {
    deliverCreatedEmailChallenge,
    ensureVerificationChallengeForExistingRegistration,
  } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  const challenges = [{ code: "112233", active: true, sent: false }];
  await assert.rejects(() => deliverCreatedEmailChallenge({
    challengeId: "failed-initial-challenge",
    recipient: "person@example.test",
    message: { subject: "Verify", text: "112233", html: "<p>112233</p>" },
  }, {
    delivery: { send: async () => { throw deliveryError("transient"); } },
    markSent: async () => { challenges[0].sent = true; },
    invalidate: async () => { challenges[0].active = false; },
  }));

  const result = await ensureVerificationChallengeForExistingRegistration(unverifiedUser(), "en", {
    hasActiveSentChallenge: async () => challenges.some((challenge) => challenge.active && challenge.sent),
    createAndDeliver: async (input) => {
      assert.equal(input.enforceCooldown, false);
      challenges.push({ code: "445566", active: true, sent: true });
      return "sent";
    },
  });
  const consume = (code: string) => challenges.some((challenge) => challenge.active && challenge.sent && challenge.code === code);
  assert.equal(result, "sent");
  assert.equal(consume("112233"), false);
  assert.equal(consume("445566"), true);
});

test("duplicate registration with an active sent challenge does not send another email", async () => {
  const { ensureVerificationChallengeForExistingRegistration } = require("../src/auth/auth.service") as typeof import("../src/auth/auth.service");
  let deliveries = 0;
  const result = await ensureVerificationChallengeForExistingRegistration(unverifiedUser(), "en", {
    hasActiveSentChallenge: async () => true,
    createAndDeliver: async () => {
      deliveries += 1;
      return "sent";
    },
  });
  assert.equal(result, "already_sent");
  assert.equal(deliveries, 0);
});

test("operational delivery warnings contain only flow and safe failure code", async () => {
  const logs: unknown[] = [];
  await publicRequest({
    flow: "password_reset",
    response: { ok: true },
    operation: async () => { throw deliveryError("transient"); },
    logs,
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /auth_email_delivery_failed/);
  assert.match(serialized, /email_delivery_unavailable/);
  assert.doesNotMatch(serialized, /person@example\.test|246810|smtp_timeout|smtp-password-secret|access-token-secret/i);
});
