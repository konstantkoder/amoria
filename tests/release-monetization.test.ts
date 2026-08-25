import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../src/common/errors";
import {
  founderEligibility,
  premiumCapabilitiesAvailable,
  purchasesAllowed,
} from "../src/monetization/monetization.service";
import { normalizeGoogleSubscription, hashPurchaseToken } from "../src/billing/google-play.service";
import { recordProductEvent } from "../src/growth/growth.service";

test("OFF, TEST, ON and PAUSED apply the fixed capability and purchase rules", () => {
  assert.equal(premiumCapabilitiesAvailable("OFF", false, false), true);
  assert.equal(premiumCapabilitiesAvailable("TEST", false, false), true);
  assert.equal(premiumCapabilitiesAvailable("TEST", true, false), false);
  assert.equal(premiumCapabilitiesAvailable("ON", false, false), false);
  assert.equal(premiumCapabilitiesAvailable("ON", false, true), true);
  assert.equal(premiumCapabilitiesAvailable("PAUSED", false, true), true);
  assert.equal(premiumCapabilitiesAvailable("PAUSED", false, false), false);
  assert.equal(purchasesAllowed("OFF", false), false);
  assert.equal(purchasesAllowed("TEST", false), false);
  assert.equal(purchasesAllowed("TEST", true), true);
  assert.equal(purchasesAllowed("ON", false), true);
  assert.equal(purchasesAllowed("PAUSED", false), false);
});

test("Founder activation requires verified adult profile, approved photo and a useful action", () => {
  const complete = {
    email_verified_at: new Date(),
    birth_date: "1990-05-01",
    display_name: "Founder",
    gender: "woman",
    preferred_genders: ["man"],
    goal: "relationship",
    has_approved_photo: true,
    has_useful_action: true,
  };
  assert.deepEqual(founderEligibility(complete), { candidate: true, activate: true });
  assert.deepEqual(founderEligibility({ ...complete, has_useful_action: false }), {
    candidate: true,
    activate: false,
  });
  assert.deepEqual(founderEligibility({ ...complete, email_verified_at: null }), {
    candidate: false,
    activate: false,
  });
  assert.deepEqual(founderEligibility({ ...complete, birth_date: "2012-05-01" }), {
    candidate: false,
    activate: false,
  });
});

test("Google subscription normalization preserves paid access after cancellation until verified expiry", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const result = normalizeGoogleSubscription({
    startTime: "2026-08-01T12:00:00.000Z",
    subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
    latestOrderId: "order-id",
    lineItems: [{
      productId: "amoria_premium_monthly",
      expiryTime: "2026-09-01T12:00:00.000Z",
      autoRenewingPlan: { autoRenewEnabled: false },
    }],
  }, "amoria_premium_monthly", now);
  assert.equal(result.subscriptionStatus, "cancelled");
  assert.equal(result.entitlementStatus, "active");
  assert.equal(result.autoRenewEnabled, false);
});

test("Google verification rejects mismatched products and token hashes are stable without exposing tokens", () => {
  assert.throws(() => normalizeGoogleSubscription({
    startTime: "2026-08-01T12:00:00.000Z",
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    lineItems: [{ productId: "wrong", expiryTime: "2026-09-01T12:00:00.000Z" }],
  }, "amoria_premium_monthly"), (error: unknown) => (
    error instanceof AppError && error.code === "purchase_product_mismatch"
  ));
  const token = "opaque-google-play-purchase-token";
  const digest = hashPurchaseToken(token);
  assert.equal(digest, hashPurchaseToken(token));
  assert.equal(digest.includes(token), false);
});

test("analytics rejects sensitive metadata before persistence", async () => {
  await assert.rejects(
    recordProductEvent({
      userId: null,
      eventName: "app_opened",
      metadata: { messageText: "private" },
    }),
    (error: unknown) => error instanceof AppError && error.code === "validation_error",
  );
  await assert.rejects(
    recordProductEvent({ eventName: "not_allowlisted" }),
    (error: unknown) => error instanceof AppError && error.code === "validation_error",
  );
});
