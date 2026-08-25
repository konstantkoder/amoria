import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { AppError, validationError } from "../common/errors";
import { env } from "../config/env";
import { pool } from "../db/client";
import { getMonetizationSnapshot } from "../monetization/monetization.service";
import { notifyUser } from "../notifications/notifications.service";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const SUBSCRIPTION_STATES = new Set([
  "SUBSCRIPTION_STATE_PENDING",
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_PAUSED",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_ON_HOLD",
  "SUBSCRIPTION_STATE_CANCELED",
  "SUBSCRIPTION_STATE_EXPIRED",
  "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
]);

type GoogleSubscription = {
  kind?: string;
  startTime?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  canceledStateContext?: unknown;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
};

type VerifiedGoogleState = {
  productId: string;
  storeSubscriptionId: string | null;
  linkedPurchaseTokenHash: string | null;
  startsAt: Date;
  expiresAt: Date;
  subscriptionStatus: "active" | "grace_period" | "on_hold" | "paused" | "cancelled" | "expired" | "revoked" | "pending";
  entitlementStatus: "active" | "expired" | "billing_issue" | "revoked";
  autoRenewEnabled: boolean | null;
};

type StoredSubscription = {
  id: string;
  user_id: string;
  product_id: string;
  purchase_token_ciphertext: string;
  purchase_token_iv: string;
  purchase_token_auth_tag: string;
};

function decodeSecretKey(value: string): Buffer {
  const normalized = value.trim();
  const decoded = /^[0-9a-f]{64}$/iu.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
  if (decoded.length !== 32) throw new Error("BILLING_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return decoded;
}

function billingKey(): Buffer {
  if (!env.BILLING_TOKEN_ENCRYPTION_KEY) {
    throw new AppError("billing_not_configured", "Google Play billing is not configured", 503);
  }
  return decodeSecretKey(env.BILLING_TOKEN_ENCRYPTION_KEY);
}

export function hashPurchaseToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function encryptPurchaseToken(token: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", billingKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptPurchaseToken(row: Pick<StoredSubscription, "purchase_token_ciphertext" | "purchase_token_iv" | "purchase_token_auth_tag">): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    billingKey(),
    Buffer.from(row.purchase_token_iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.purchase_token_auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.purchase_token_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function serviceAccountCredentials(): Record<string, unknown> {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64) {
    throw new AppError("billing_not_configured", "Google Play service account is not configured", 503);
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8"),
    ) as Record<string, unknown>;
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
      throw new Error("missing service account fields");
    }
    return parsed;
  } catch {
    throw new AppError("billing_not_configured", "Google Play service account secret is invalid", 503);
  }
}

async function googleAuthorizationHeaders(): Promise<Headers> {
  const auth = new GoogleAuth({
    credentials: serviceAccountCredentials(),
    scopes: [ANDROID_PUBLISHER_SCOPE],
  });
  const client = await auth.getClient();
  return client.getRequestHeaders();
}

async function loadGoogleSubscription(purchaseToken: string): Promise<GoogleSubscription> {
  const headers = await googleAuthorizationHeaders();
  headers.set("Accept", "application/json");
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (response.status === 404 || response.status === 400) {
      throw new AppError("purchase_invalid", "Google Play purchase is invalid", 400);
    }
    if (!response.ok) {
      throw new AppError("billing_verification_unavailable", "Google Play verification is unavailable", 503, {
        status: String(response.status),
      });
    }
    return await response.json() as GoogleSubscription;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("billing_verification_unavailable", "Google Play verification is unavailable", 503);
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeGoogleSubscription(
  subscription: GoogleSubscription,
  expectedProductId: string,
  now = new Date(),
): VerifiedGoogleState {
  const state = subscription.subscriptionState ?? "";
  if (!SUBSCRIPTION_STATES.has(state)) {
    throw new AppError("purchase_invalid", "Google Play subscription state is invalid", 400);
  }
  const matchingLine = subscription.lineItems?.find((line) => line.productId === expectedProductId);
  if (!matchingLine?.expiryTime) {
    throw new AppError("purchase_product_mismatch", "Google Play product does not match", 400);
  }
  const startsAt = new Date(subscription.startTime ?? now);
  const expiresAt = new Date(matchingLine.expiryTime);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt) {
    throw new AppError("purchase_invalid", "Google Play subscription dates are invalid", 400);
  }
  const stillWithinPaidPeriod = expiresAt > now;
  let subscriptionStatus: VerifiedGoogleState["subscriptionStatus"] = "pending";
  let entitlementStatus: VerifiedGoogleState["entitlementStatus"] = "billing_issue";
  if (state === "SUBSCRIPTION_STATE_ACTIVE") {
    subscriptionStatus = stillWithinPaidPeriod ? "active" : "expired";
    entitlementStatus = stillWithinPaidPeriod ? "active" : "expired";
  } else if (state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
    subscriptionStatus = "grace_period";
    entitlementStatus = stillWithinPaidPeriod ? "active" : "billing_issue";
  } else if (state === "SUBSCRIPTION_STATE_CANCELED") {
    subscriptionStatus = stillWithinPaidPeriod ? "cancelled" : "expired";
    entitlementStatus = stillWithinPaidPeriod ? "active" : "expired";
  } else if (state === "SUBSCRIPTION_STATE_EXPIRED") {
    subscriptionStatus = "expired";
    entitlementStatus = "expired";
  } else if (state === "SUBSCRIPTION_STATE_PAUSED") {
    subscriptionStatus = "paused";
  } else if (state === "SUBSCRIPTION_STATE_ON_HOLD") {
    subscriptionStatus = "on_hold";
  } else if (state === "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED") {
    subscriptionStatus = "revoked";
    entitlementStatus = "revoked";
  }
  return {
    productId: matchingLine.productId!,
    storeSubscriptionId: subscription.latestOrderId ?? null,
    linkedPurchaseTokenHash: subscription.linkedPurchaseToken
      ? hashPurchaseToken(subscription.linkedPurchaseToken)
      : null,
    startsAt,
    expiresAt,
    subscriptionStatus,
    entitlementStatus,
    autoRenewEnabled: typeof matchingLine.autoRenewingPlan?.autoRenewEnabled === "boolean"
      ? matchingLine.autoRenewingPlan.autoRenewEnabled
      : null,
  };
}

function normalizeProof(input: { purchaseToken?: unknown; productId?: unknown }): {
  purchaseToken: string;
  productId: string;
} {
  const purchaseToken = typeof input.purchaseToken === "string" ? input.purchaseToken.trim() : "";
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (purchaseToken.length < 20 || purchaseToken.length > 4096) {
    throw validationError("Purchase token is invalid", { purchaseToken: "invalid" });
  }
  if (!env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID || productId !== env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID) {
    throw new AppError("purchase_product_mismatch", "Google Play product does not match", 400);
  }
  return { purchaseToken, productId };
}

async function persistVerification(
  userId: string,
  purchaseToken: string,
  verified: VerifiedGoogleState,
): Promise<void> {
  const tokenHash = hashPurchaseToken(purchaseToken);
  const encrypted = encryptPurchaseToken(purchaseToken);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ user_id: string }>(
      `SELECT user_id FROM google_play_subscriptions WHERE purchase_token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    if (existing.rows[0] && existing.rows[0].user_id !== userId) {
      throw new AppError("purchase_already_claimed", "Purchase belongs to another account", 409);
    }
    await client.query(
      `INSERT INTO google_play_subscriptions
        (user_id, package_name, product_id, purchase_token_hash, purchase_token_ciphertext,
         purchase_token_iv, purchase_token_auth_tag, status, store_subscription_id,
         linked_purchase_token_hash, starts_at, expires_at, auto_renew_enabled,
         last_verified_at, verification_error_code, cancelled_at, revoked_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), NULL,
         CASE WHEN $8 = 'cancelled' THEN now() ELSE NULL END,
         CASE WHEN $8 = 'revoked' THEN now() ELSE NULL END, now())
       ON CONFLICT (purchase_token_hash) DO UPDATE SET
         product_id = EXCLUDED.product_id, status = EXCLUDED.status,
         store_subscription_id = EXCLUDED.store_subscription_id,
         linked_purchase_token_hash = EXCLUDED.linked_purchase_token_hash,
         starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
         auto_renew_enabled = EXCLUDED.auto_renew_enabled, last_verified_at = now(),
         verification_error_code = NULL,
         cancelled_at = CASE WHEN EXCLUDED.status = 'cancelled' THEN COALESCE(google_play_subscriptions.cancelled_at, now()) ELSE google_play_subscriptions.cancelled_at END,
         revoked_at = CASE WHEN EXCLUDED.status = 'revoked' THEN COALESCE(google_play_subscriptions.revoked_at, now()) ELSE google_play_subscriptions.revoked_at END,
         updated_at = now()`,
      [
        userId,
        env.GOOGLE_PLAY_PACKAGE_NAME,
        verified.productId,
        tokenHash,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        verified.subscriptionStatus,
        verified.storeSubscriptionId,
        verified.linkedPurchaseTokenHash,
        verified.startsAt,
        verified.expiresAt,
        verified.autoRenewEnabled,
      ],
    );
    await client.query(
      `INSERT INTO premium_entitlements
        (user_id, source, status, starts_at, ends_at, source_reference, store, product_id,
         verification_status, verified_at, cancelled_at, revoked_at, updated_at)
       VALUES ($1, 'google_play', $2, $3, $4, $5, 'google_play', $6,
         CASE WHEN $2 = 'revoked' THEN 'revoked' ELSE 'verified' END, now(),
         CASE WHEN $7 = 'cancelled' THEN now() ELSE NULL END,
         CASE WHEN $2 = 'revoked' THEN now() ELSE NULL END, now())
       ON CONFLICT (source, source_reference) DO UPDATE SET
         status = EXCLUDED.status, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
         product_id = EXCLUDED.product_id, verification_status = EXCLUDED.verification_status,
         verified_at = now(),
         cancelled_at = CASE WHEN $7 = 'cancelled' THEN COALESCE(premium_entitlements.cancelled_at, now()) ELSE premium_entitlements.cancelled_at END,
         revoked_at = CASE WHEN $2 = 'revoked' THEN COALESCE(premium_entitlements.revoked_at, now()) ELSE premium_entitlements.revoked_at END,
         updated_at = now()`,
      [
        userId,
        verified.entitlementStatus,
        verified.startsAt,
        verified.expiresAt,
        tokenHash,
        verified.productId,
        verified.subscriptionStatus,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyGooglePurchase(
  userId: string,
  input: { purchaseToken?: unknown; productId?: unknown; origin?: unknown },
) {
  const proof = normalizeProof(input);
  const origin = input.origin === "restore" ? "restore" : "purchase";
  const before = await getMonetizationSnapshot(userId, { progressFounder: false });
  if (origin === "purchase" && !before.purchaseAllowed) {
    throw new AppError("purchases_unavailable", "New Premium purchases are unavailable", 409, {
      mode: before.mode,
    });
  }
  const googleState = await loadGoogleSubscription(proof.purchaseToken);
  const verified = normalizeGoogleSubscription(googleState, proof.productId);
  await persistVerification(userId, proof.purchaseToken, verified);
  const snapshot = await getMonetizationSnapshot(userId, { progressFounder: false });
  if (snapshot.premiumActive) {
    await notifyUser({
      userId,
      type: origin === "restore" ? "premium_restored" : "premium_activated",
      titleKey: origin === "restore" ? "notifications.premiumRestored" : "notifications.premiumActivated",
      payload: {},
      eventKey: `${origin === "restore" ? "premium_restored" : "premium_activated"}:${hashPurchaseToken(proof.purchaseToken)}`,
    });
  }
  return {
    verified: true as const,
    storeStatus: verified.subscriptionStatus,
    premiumActive: snapshot.premiumActive,
    entitlement: snapshot.entitlement,
  };
}

async function verifyStoredSubscription(row: StoredSubscription): Promise<void> {
  const purchaseToken = decryptPurchaseToken(row);
  const subscription = await loadGoogleSubscription(purchaseToken);
  const verified = normalizeGoogleSubscription(subscription, row.product_id);
  await persistVerification(row.user_id, purchaseToken, verified);
}

export async function runGooglePlayReconciliation(limit = 100): Promise<number> {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 || !env.BILLING_TOKEN_ENCRYPTION_KEY) return 0;
  const rows = await pool.query<StoredSubscription>(
    `SELECT id, user_id, product_id, purchase_token_ciphertext, purchase_token_iv, purchase_token_auth_tag
       FROM google_play_subscriptions
      WHERE last_verified_at <= now() - interval '6 hours'
      ORDER BY last_verified_at
      LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  );
  for (const row of rows.rows) {
    try {
      await verifyStoredSubscription(row);
    } catch (error) {
      const code = error instanceof AppError ? error.code : "verification_failed";
      await pool.query(
        `UPDATE google_play_subscriptions SET verification_error_code = $2,
                last_verified_at = now(), updated_at = now() WHERE id = $1`,
        [row.id, code],
      );
      await notifyUser({
        userId: row.user_id,
        type: "premium_billing_issue",
        titleKey: "notifications.premiumBillingIssue",
        payload: {},
        eventKey: `premium_billing_issue:${row.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }
  return rows.rowCount ?? 0;
}

export async function verifyRtdnAuthorization(authorization: string | undefined): Promise<void> {
  if (!env.GOOGLE_RTDN_AUDIENCE) {
    throw new AppError("rtdn_not_configured", "RTDN authentication is not configured", 503);
  }
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new AppError("unauthorized", "RTDN authentication is required", 401);
  try {
    const client = new OAuth2Client();
    await client.verifyIdToken({ idToken: token, audience: env.GOOGLE_RTDN_AUDIENCE });
  } catch {
    throw new AppError("unauthorized", "RTDN authentication is invalid", 401);
  }
}

export async function handleRtdn(input: unknown): Promise<{ ok: true; matched: boolean }> {
  const envelope = input as { message?: { data?: unknown } } | null;
  const data = envelope?.message?.data;
  if (typeof data !== "string" || data.length > 16_384) {
    throw validationError("RTDN message is invalid", { message: "invalid" });
  }
  let decoded: { packageName?: unknown; subscriptionNotification?: { purchaseToken?: unknown } };
  try {
    decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    throw validationError("RTDN message is invalid", { message: "invalid" });
  }
  if (decoded.packageName !== env.GOOGLE_PLAY_PACKAGE_NAME) {
    throw new AppError("purchase_package_mismatch", "RTDN package does not match", 400);
  }
  const purchaseToken = decoded.subscriptionNotification?.purchaseToken;
  if (typeof purchaseToken !== "string" || purchaseToken.length < 20) {
    return { ok: true, matched: false };
  }
  const tokenHash = hashPurchaseToken(purchaseToken);
  const row = await pool.query<StoredSubscription>(
    `SELECT id, user_id, product_id, purchase_token_ciphertext, purchase_token_iv, purchase_token_auth_tag
       FROM google_play_subscriptions WHERE purchase_token_hash = $1`,
    [tokenHash],
  );
  if (!row.rows[0]) return { ok: true, matched: false };
  await verifyStoredSubscription(row.rows[0]);
  return { ok: true, matched: true };
}
