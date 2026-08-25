import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { AppError, validationError } from "../common/errors";
import { env } from "../config/env";
import { pool } from "../db/client";
import { calculateAge } from "../users/age";
import { writeAuditLog } from "../admin/admin-audit.service";
import type { AdminContext, AdminRequestContext } from "../admin/admin.types";
import {
  MONETIZATION_MODES,
  PREMIUM_FRAME_STYLES,
  type EntitlementSource,
  type MonetizationMode,
  type MonetizationSnapshot,
  type PremiumFeature,
  type PremiumFrameStyle,
} from "./monetization.types";
import { notifyUser } from "../notifications/notifications.service";

export const FREE_PROFILE_GALLERY_LIMIT = 6 as const;
export const PREMIUM_PROFILE_GALLERY_LIMIT = 15 as const;
export const PREMIUM_LOCKED_GALLERY_LIMIT = 10 as const;
export const FOUNDER_CAP = 500 as const;
export const FOUNDER_RESERVATION_TTL_HOURS = 24 as const;

type SettingsRow = QueryResultRow & {
  mode: MonetizationMode;
  first_monetization_enabled_at: Date | null;
  founder_campaign_status: "ACTIVE" | "PAUSED";
};

type EntitlementRow = QueryResultRow & {
  source: EntitlementSource;
  status: string;
  starts_at: Date;
  ends_at: Date;
};

type FounderRow = QueryResultRow & {
  id: string;
  status: "reserved" | "activated" | "expired";
  founder_number: number | null;
  reserved_at: Date;
  reservation_expires_at: Date;
  activated_at: Date | null;
  premium_starts_at: Date | null;
  premium_ends_at: Date | null;
};

type PublicIdentity = {
  founderNumber: number | null;
  profileFrame: PremiumFrameStyle;
};

function toIso(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function billingConfigured(): boolean {
  return Boolean(
    env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID &&
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 &&
    env.BILLING_TOKEN_ENCRYPTION_KEY,
  );
}

export async function getSettings(client: PoolClient | typeof pool = pool): Promise<SettingsRow> {
  const result = await client.query<SettingsRow>(
    `SELECT mode, first_monetization_enabled_at, founder_campaign_status
       FROM monetization_settings WHERE id = 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("monetization_settings singleton is missing");
  return row;
}

async function getActiveEntitlement(
  userId: string,
  client: PoolClient | typeof pool = pool,
): Promise<EntitlementRow | null> {
  const result = await client.query<EntitlementRow>(
    `SELECT source, status, starts_at, ends_at
       FROM premium_entitlements
      WHERE user_id = $1
        AND status = 'active'
        AND starts_at <= now()
        AND ends_at > now()
      ORDER BY CASE source WHEN 'google_play' THEN 1 WHEN 'admin_grant' THEN 2 ELSE 3 END,
               ends_at DESC
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function getFounder(
  userId: string,
  client: PoolClient | typeof pool = pool,
): Promise<FounderRow | null> {
  const result = await client.query<FounderRow>(
    `SELECT id, status, founder_number, reserved_at, reservation_expires_at,
            activated_at, premium_starts_at, premium_ends_at
       FROM founders WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function isBillingTester(
  userId: string,
  client: PoolClient | typeof pool = pool,
): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM billing_testers WHERE user_id = $1`, [userId]);
  return Boolean(result.rowCount);
}

async function selectedFrame(
  userId: string,
  client: PoolClient | typeof pool = pool,
): Promise<PremiumFrameStyle> {
  const result = await client.query<{ frame_style: PremiumFrameStyle }>(
    `SELECT frame_style FROM premium_profile_preferences WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.frame_style ?? "NONE";
}

export function premiumCapabilitiesAvailable(
  mode: MonetizationMode,
  tester: boolean,
  premiumActive: boolean,
): boolean {
  if (mode === "OFF") return true;
  if (mode === "TEST" && !tester) return true;
  return premiumActive;
}

export function purchasesAllowed(mode: MonetizationMode, tester: boolean): boolean {
  return mode === "ON" || (mode === "TEST" && tester);
}

export async function getMonetizationSnapshot(
  userId: string,
  options: { progressFounder?: boolean } = {},
): Promise<MonetizationSnapshot> {
  if (options.progressFounder !== false) await progressFounderCandidate(userId);
  const [settings, entitlement, founder, tester, frame] = await Promise.all([
    getSettings(),
    getActiveEntitlement(userId),
    getFounder(userId),
    isBillingTester(userId),
    selectedFrame(userId),
  ]);
  const premiumActive = Boolean(entitlement);
  const capabilities = premiumCapabilitiesAvailable(settings.mode, tester, premiumActive);
  const canPurchase = purchasesAllowed(settings.mode, tester) && billingConfigured();
  return {
    mode: settings.mode,
    firstMonetizationEnabledAt: toIso(settings.first_monetization_enabled_at),
    tester,
    tier: premiumActive ? "PREMIUM" : "FREE",
    premiumActive,
    premiumCapabilitiesAvailable: capabilities,
    purchaseAllowed: canPurchase,
    billingConfigured: billingConfigured(),
    billingHealthy: billingConfigured(),
    productId: env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID ?? null,
    entitlement: entitlement
      ? {
          source: entitlement.source,
          startsAt: entitlement.starts_at.toISOString(),
          endsAt: entitlement.ends_at.toISOString(),
          status: entitlement.status,
        }
      : null,
    founder: founder
      ? {
          status: founder.status,
          number: founder.founder_number,
          reservedAt: founder.reserved_at.toISOString(),
          reservationExpiresAt: founder.reservation_expires_at.toISOString(),
          activatedAt: toIso(founder.activated_at),
          premiumStartsAt: toIso(founder.premium_starts_at),
          premiumEndsAt: toIso(founder.premium_ends_at),
        }
      : null,
    profileFrame: {
      selected: frame,
      rendered: capabilities ? frame : "NONE",
    },
    limits: {
      galleryPhotos: capabilities ? PREMIUM_PROFILE_GALLERY_LIMIT : FREE_PROFILE_GALLERY_LIMIT,
      lockedPhotos: capabilities ? PREMIUM_LOCKED_GALLERY_LIMIT : 0,
    },
  };
}

export async function assertPremiumFeature(
  userId: string,
  feature: PremiumFeature,
): Promise<MonetizationSnapshot> {
  const snapshot = await getMonetizationSnapshot(userId, { progressFounder: false });
  if (!snapshot.premiumCapabilitiesAvailable) {
    throw new AppError("premium_required", "Amoria Premium is required", 403, {
      feature,
      mode: snapshot.mode,
    });
  }
  return snapshot;
}

export async function effectiveGalleryLimits(userId: string): Promise<{
  maxProfileGalleryPhotos: 6 | 15;
  maxLockedProfilePhotos: 0 | 10;
}> {
  const snapshot = await getMonetizationSnapshot(userId, { progressFounder: false });
  return {
    maxProfileGalleryPhotos: snapshot.limits.galleryPhotos,
    maxLockedProfilePhotos: snapshot.limits.lockedPhotos,
  };
}

export async function setProfileFrame(
  userId: string,
  frameStyle: PremiumFrameStyle,
): Promise<MonetizationSnapshot["profileFrame"]> {
  if (!PREMIUM_FRAME_STYLES.includes(frameStyle)) {
    throw validationError("Profile frame is invalid", { frameStyle: "invalid" });
  }
  if (frameStyle !== "NONE") await assertPremiumFeature(userId, "premium_frames");
  await pool.query(
    `INSERT INTO premium_profile_preferences (user_id, frame_style, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET frame_style = EXCLUDED.frame_style, updated_at = now()`,
    [userId, frameStyle],
  );
  return (await getMonetizationSnapshot(userId, { progressFounder: false })).profileFrame;
}

export async function getPublicIdentity(userId: string): Promise<PublicIdentity> {
  const [founder, frame, snapshot] = await Promise.all([
    getFounder(userId),
    selectedFrame(userId),
    getMonetizationSnapshot(userId, { progressFounder: false }),
  ]);
  return {
    founderNumber: founder?.status === "activated" ? founder.founder_number : null,
    profileFrame: snapshot.premiumCapabilitiesAvailable ? frame : "NONE",
  };
}

type FounderEligibilityRow = QueryResultRow & {
  email_verified_at: Date | null;
  birth_date: string | null;
  display_name: string;
  gender: string | null;
  preferred_genders: unknown;
  goal: string | null;
  has_approved_photo: boolean;
  has_useful_action: boolean;
};

export function founderEligibility(row: FounderEligibilityRow): { candidate: boolean; activate: boolean } {
  const age = calculateAge(row.birth_date);
  const candidate = Boolean(row.email_verified_at && age !== null && age >= 18);
  const basics = Boolean(
    candidate &&
    row.display_name.trim() &&
    row.gender &&
    row.goal &&
    Array.isArray(row.preferred_genders) &&
    row.preferred_genders.length > 0 &&
    row.has_approved_photo,
  );
  return { candidate, activate: basics && row.has_useful_action };
}

async function loadFounderEligibility(client: PoolClient, userId: string): Promise<FounderEligibilityRow | null> {
  const result = await client.query<FounderEligibilityRow>(
    `SELECT u.email_verified_at, u.birth_date::text AS birth_date, u.display_name, u.gender,
            u.preferred_genders, u.goal,
            EXISTS (
              SELECT 1 FROM media_files mf
               WHERE mf.owner_user_id = u.id
                 AND mf.type IN ('avatar', 'profile_photo')
                 AND mf.moderation_state = 'approved'
                 AND mf.physically_purged_at IS NULL
            ) AS has_approved_photo,
            (
              EXISTS (SELECT 1 FROM together_session_members tsm WHERE tsm.user_id = u.id)
              OR EXISTS (SELECT 1 FROM nearby_profile_visibility npv WHERE npv.user_id = u.id AND npv.status = 'active')
              OR EXISTS (SELECT 1 FROM user_activity_preferences uap WHERE uap.user_id = u.id AND uap.status = 'active')
            ) AS has_useful_action
       FROM users u
      WHERE u.id = $1 AND u.account_status = 'active'`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function progressFounderCandidate(userId: string): Promise<void> {
  const client = await pool.connect();
  let activated: { number: number; premiumStarted: boolean } | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('amoria_founders_500'))");
    await client.query(
      `UPDATE founders SET status = 'expired', updated_at = now()
        WHERE status = 'reserved' AND reservation_expires_at <= now()`,
    );
    const settings = await getSettings(client);
    const eligibilityRow = await loadFounderEligibility(client, userId);
    if (!eligibilityRow) {
      await client.query("ROLLBACK");
      return;
    }
    const eligibility = founderEligibility(eligibilityRow);
    let founder = await getFounder(userId, client);
    if (!eligibility.candidate || settings.founder_campaign_status !== "ACTIVE") {
      await client.query("COMMIT");
      return;
    }

    if (!founder || founder.status === "expired") {
      const capacity = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM founders
          WHERE status = 'activated' OR (status = 'reserved' AND reservation_expires_at > now())`,
      );
      if ((capacity.rows[0]?.count ?? FOUNDER_CAP) >= FOUNDER_CAP) {
        await client.query("COMMIT");
        return;
      }
      const reserved = await client.query<FounderRow>(
        `INSERT INTO founders (user_id, status, reserved_at, reservation_expires_at, updated_at)
         VALUES ($1, 'reserved', now(), now() + interval '24 hours', now())
         ON CONFLICT (user_id) DO UPDATE SET
           status = 'reserved', founder_number = NULL, activated_at = NULL,
           reserved_at = now(), reservation_expires_at = now() + interval '24 hours',
           premium_starts_at = NULL, premium_ends_at = NULL, updated_at = now()
         RETURNING id, status, founder_number, reserved_at, reservation_expires_at,
                   activated_at, premium_starts_at, premium_ends_at`,
        [userId],
      );
      founder = reserved.rows[0] ?? null;
    }

    if (!founder || founder.status !== "reserved" || !eligibility.activate) {
      await client.query("COMMIT");
      return;
    }
    const numberResult = await client.query<{ founder_number: number }>(
      `SELECT n AS founder_number
         FROM generate_series(1, 500) AS n
        WHERE NOT EXISTS (SELECT 1 FROM founders f WHERE f.founder_number = n)
        ORDER BY n LIMIT 1`,
    );
    const number = numberResult.rows[0]?.founder_number;
    if (!number) {
      await client.query("COMMIT");
      return;
    }
    const premiumStarted = Boolean(settings.first_monetization_enabled_at);
    const updated = await client.query<FounderRow>(
      `UPDATE founders SET
         status = 'activated', founder_number = $2, activated_at = now(),
         premium_starts_at = CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE now() END,
         premium_ends_at = CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE now() + interval '1 year' END,
         updated_at = now()
       WHERE id = $1 AND status = 'reserved'
       RETURNING id, status, founder_number, reserved_at, reservation_expires_at,
                 activated_at, premium_starts_at, premium_ends_at`,
      [founder.id, number, settings.first_monetization_enabled_at],
    );
    const activatedRow = updated.rows[0];
    if (!activatedRow) throw new Error("Founder activation lost its reservation lock");
    if (activatedRow.premium_starts_at && activatedRow.premium_ends_at) {
      await client.query(
        `INSERT INTO premium_entitlements
           (user_id, source, status, starts_at, ends_at, source_reference, verification_status, verified_at)
         VALUES ($1, 'founder', 'active', $2, $3, $4, 'verified', now())
         ON CONFLICT (source, source_reference) DO NOTHING`,
        [userId, activatedRow.premium_starts_at, activatedRow.premium_ends_at, founder.id],
      );
    }
    activated = { number, premiumStarted };
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (activated) {
    await notifyUser({
      userId,
      type: "founder_activated",
      titleKey: "notifications.founderActivated",
      payload: { founderNumber: String(activated.number) },
      eventKey: `founder_activated:${activated.number}`,
    });
    if (activated.premiumStarted) {
      await notifyUser({
        userId,
        type: "founder_premium_started",
        titleKey: "notifications.founderPremiumStarted",
        payload: {},
        eventKey: `founder_premium_started:${activated.number}`,
      });
    }
  }
}

function assertMode(value: unknown): MonetizationMode {
  if (typeof value !== "string" || !MONETIZATION_MODES.includes(value as MonetizationMode)) {
    throw validationError("Monetization mode is invalid", { mode: "invalid" });
  }
  return value as MonetizationMode;
}

function requireReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 8 || value.trim().length > 500) {
    throw validationError("Reason must be between 8 and 500 characters", { reason: "invalid" });
  }
  return value.trim();
}

export async function changeMode(
  admin: AdminContext,
  input: { mode?: unknown; reason?: unknown; confirmFirstOn?: unknown },
  context: AdminRequestContext,
): Promise<ReturnType<typeof getAdminMonetizationOverview>> {
  const mode = assertMode(input.mode);
  const reason = requireReason(input.reason);
  const client = await pool.connect();
  let firstOnCreated = false;
  let previousMode: MonetizationMode = "OFF";
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('amoria_monetization_mode'))");
    const current = await getSettings(client);
    previousMode = current.mode;
    if (mode === "ON" && !current.first_monetization_enabled_at && input.confirmFirstOn !== true) {
      throw new AppError(
        "first_on_confirmation_required",
        "The first real ON starts every existing Founder's 12-month Premium clock",
        409,
      );
    }
    firstOnCreated = mode === "ON" && !current.first_monetization_enabled_at;
    await client.query(
      `UPDATE monetization_settings SET
         mode = $1,
         first_monetization_enabled_at = CASE
           WHEN $1 = 'ON' THEN COALESCE(first_monetization_enabled_at, now())
           ELSE first_monetization_enabled_at
         END,
         updated_at = now(), updated_by_admin_user_id = $2
       WHERE id = 1`,
      [mode, admin.adminUser.id],
    );
    if (firstOnCreated) {
      await client.query(
        `UPDATE founders SET
           premium_starts_at = COALESCE(premium_starts_at, (SELECT first_monetization_enabled_at FROM monetization_settings WHERE id = 1)),
           premium_ends_at = COALESCE(premium_ends_at, (SELECT first_monetization_enabled_at + interval '1 year' FROM monetization_settings WHERE id = 1)),
           updated_at = now()
         WHERE status = 'activated'`,
      );
      await client.query(
        `INSERT INTO premium_entitlements
           (user_id, source, status, starts_at, ends_at, source_reference, verification_status, verified_at)
         SELECT user_id, 'founder', 'active', premium_starts_at, premium_ends_at, id::text, 'verified', now()
           FROM founders
          WHERE status = 'activated' AND premium_starts_at IS NOT NULL AND premium_ends_at IS NOT NULL
         ON CONFLICT (source, source_reference) DO NOTHING`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "monetization.mode_changed",
    targetType: "monetization_settings",
    targetId: "1",
    reason,
    metadata: { previousMode, mode, firstOnCreated },
    ...context,
  });
  return getAdminMonetizationOverview();
}

export async function setFounderCampaign(
  admin: AdminContext,
  input: { status?: unknown; reason?: unknown },
  context: AdminRequestContext,
): Promise<ReturnType<typeof getAdminMonetizationOverview>> {
  const status = input.status === "ACTIVE" || input.status === "PAUSED" ? input.status : null;
  if (!status) throw validationError("Founder campaign status is invalid", { status: "invalid" });
  const reason = requireReason(input.reason);
  await pool.query(
    `UPDATE monetization_settings SET founder_campaign_status = $1, updated_at = now(),
            updated_by_admin_user_id = $2 WHERE id = 1`,
    [status, admin.adminUser.id],
  );
  await writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "founder_campaign.status_changed",
    targetType: "monetization_settings",
    targetId: "1",
    reason,
    metadata: { status },
    ...context,
  });
  return getAdminMonetizationOverview();
}

export async function setBillingTester(
  admin: AdminContext,
  input: { amoriaId?: unknown; enabled?: unknown; reason?: unknown },
  context: AdminRequestContext,
): Promise<{ ok: true }> {
  const amoriaId = typeof input.amoriaId === "string" ? input.amoriaId.trim().toUpperCase() : "";
  const enabled = input.enabled;
  const reason = requireReason(input.reason);
  if (!amoriaId || typeof enabled !== "boolean") {
    throw validationError("Billing tester input is invalid", { amoriaId: "invalid" });
  }
  const user = await pool.query<{ id: string }>(`SELECT id FROM users WHERE amoria_id = $1`, [amoriaId]);
  const userId = user.rows[0]?.id;
  if (!userId) throw new AppError("not_found", "User not found", 404);
  if (enabled) {
    await pool.query(
      `INSERT INTO billing_testers (user_id, created_by_admin_user_id, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET created_by_admin_user_id = EXCLUDED.created_by_admin_user_id,
         reason = EXCLUDED.reason, created_at = now()`,
      [userId, admin.adminUser.id, reason],
    );
  } else {
    await pool.query(`DELETE FROM billing_testers WHERE user_id = $1`, [userId]);
  }
  await writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: enabled ? "billing_tester.added" : "billing_tester.removed",
    targetType: "user",
    targetId: userId,
    reason,
    metadata: { amoriaId },
    ...context,
  });
  return { ok: true };
}

export async function manualPremiumGrant(
  admin: AdminContext,
  input: { amoriaId?: unknown; endsAt?: unknown; reason?: unknown },
  context: AdminRequestContext,
): Promise<{ ok: true; entitlementId: string }> {
  const amoriaId = typeof input.amoriaId === "string" ? input.amoriaId.trim().toUpperCase() : "";
  const endsAt = typeof input.endsAt === "string" ? new Date(input.endsAt) : new Date(Number.NaN);
  const reason = requireReason(input.reason);
  if (!amoriaId || Number.isNaN(endsAt.getTime()) || endsAt <= new Date()) {
    throw validationError("Manual grant input is invalid", { endsAt: "must_be_future" });
  }
  const user = await pool.query<{ id: string }>(`SELECT id FROM users WHERE amoria_id = $1`, [amoriaId]);
  const userId = user.rows[0]?.id;
  if (!userId) throw new AppError("not_found", "User not found", 404);
  const entitlementId = randomUUID();
  await pool.query(
    `INSERT INTO premium_entitlements
       (id, user_id, source, status, starts_at, ends_at, source_reference, verification_status, verified_at)
     VALUES ($1, $2, 'admin_grant', 'active', now(), $3, $1, 'verified', now())`,
    [entitlementId, userId, endsAt],
  );
  await writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "premium.admin_granted",
    targetType: "user",
    targetId: userId,
    reason,
    metadata: { amoriaId, entitlementId, endsAt: endsAt.toISOString() },
    ...context,
  });
  return { ok: true, entitlementId };
}

export async function revokeManualPremium(
  admin: AdminContext,
  input: { entitlementId?: unknown; reason?: unknown },
  context: AdminRequestContext,
): Promise<{ ok: true }> {
  const entitlementId = typeof input.entitlementId === "string" ? input.entitlementId.trim() : "";
  const reason = requireReason(input.reason);
  const result = await pool.query<{ user_id: string }>(
    `UPDATE premium_entitlements SET status = 'revoked', revoked_at = now(), updated_at = now()
      WHERE id = $1 AND source = 'admin_grant' AND status = 'active'
      RETURNING user_id`,
    [entitlementId],
  );
  const userId = result.rows[0]?.user_id;
  if (!userId) throw new AppError("not_found", "Active admin grant not found", 404);
  await writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "premium.admin_revoked",
    targetType: "user",
    targetId: userId,
    reason,
    metadata: { entitlementId },
    ...context,
  });
  return { ok: true };
}

export async function getAdminMonetizationOverview() {
  const [settings, counts, testerRows, billingFailures] = await Promise.all([
    getSettings(),
    pool.query<{
      paid_active: number; founder_premium_active: number; admin_active: number;
      founders_activated: number; reservations_active: number; founder_ending_30: number;
      founder_ending_7: number; founder_expired: number;
    }>(
      `SELECT
        count(*) FILTER (WHERE pe.source = 'google_play' AND pe.status = 'active' AND pe.ends_at > now())::int AS paid_active,
        count(*) FILTER (WHERE pe.source = 'founder' AND pe.status = 'active' AND pe.ends_at > now())::int AS founder_premium_active,
        count(*) FILTER (WHERE pe.source = 'admin_grant' AND pe.status = 'active' AND pe.ends_at > now())::int AS admin_active,
        (SELECT count(*)::int FROM founders WHERE status = 'activated') AS founders_activated,
        (SELECT count(*)::int FROM founders WHERE status = 'reserved' AND reservation_expires_at > now()) AS reservations_active,
        (SELECT count(*)::int FROM founders WHERE premium_ends_at > now() AND premium_ends_at <= now() + interval '30 days') AS founder_ending_30,
        (SELECT count(*)::int FROM founders WHERE premium_ends_at > now() AND premium_ends_at <= now() + interval '7 days') AS founder_ending_7,
        (SELECT count(*)::int FROM founders WHERE status = 'activated' AND premium_ends_at <= now()) AS founder_expired
       FROM premium_entitlements pe`,
    ),
    pool.query<{ amoria_id: string; created_at: Date }>(
      `SELECT u.amoria_id, bt.created_at FROM billing_testers bt JOIN users u ON u.id = bt.user_id ORDER BY bt.created_at DESC`,
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM google_play_subscriptions
        WHERE verification_error_code IS NOT NULL OR status IN ('on_hold', 'revoked')`,
    ),
  ]);
  const count = counts.rows[0] ?? {
    paid_active: 0, founder_premium_active: 0, admin_active: 0,
    founders_activated: 0, reservations_active: 0, founder_ending_30: 0,
    founder_ending_7: 0, founder_expired: 0,
  };
  return {
    mode: settings.mode,
    firstMonetizationEnabledAt: toIso(settings.first_monetization_enabled_at),
    founderCampaignStatus: settings.founder_campaign_status,
    billing: {
      configured: billingConfigured(),
      healthy: billingConfigured() && (billingFailures.rows[0]?.count ?? 0) === 0,
      productId: env.GOOGLE_PLAY_PREMIUM_PRODUCT_ID ?? null,
      packageName: env.GOOGLE_PLAY_PACKAGE_NAME,
      failures: billingFailures.rows[0]?.count ?? 0,
    },
    counts: {
      activePaidPremium: count.paid_active,
      founderPremiumActive: count.founder_premium_active,
      adminGrantsActive: count.admin_active,
      foundersActivated: count.founders_activated,
      founderReservationsActive: count.reservations_active,
      foundersRemaining: Math.max(0, FOUNDER_CAP - count.founders_activated),
      founderEnding30Days: count.founder_ending_30,
      founderEnding7Days: count.founder_ending_7,
      founderPremiumExpired: count.founder_expired,
    },
    billingTesters: testerRows.rows.map((row) => ({
      amoriaId: row.amoria_id,
      createdAt: row.created_at.toISOString(),
    })),
  };
}

export async function listFounders(input: { q?: string; filter?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const q = input.q?.trim() || null;
  const filter = input.filter ?? "all";
  const result = await pool.query<{
    founder_number: number | null; amoria_id: string; account_status: string;
    status: string; reserved_at: Date; activated_at: Date | null;
    premium_starts_at: Date | null; premium_ends_at: Date | null;
    entitlement_source: string | null; converted_paid: boolean;
  }>(
    `SELECT f.founder_number, u.amoria_id, u.account_status, f.status,
            f.reserved_at, f.activated_at, f.premium_starts_at, f.premium_ends_at,
            current_entitlement.source AS entitlement_source,
            EXISTS (SELECT 1 FROM premium_entitlements paid
                     WHERE paid.user_id = u.id AND paid.source = 'google_play') AS converted_paid
       FROM founders f
       JOIN users u ON u.id = f.user_id
       LEFT JOIN LATERAL (
         SELECT source FROM premium_entitlements pe
          WHERE pe.user_id = u.id AND pe.status = 'active' AND pe.ends_at > now()
          ORDER BY pe.ends_at DESC LIMIT 1
       ) current_entitlement ON true
      WHERE ($1::text IS NULL OR u.amoria_id ILIKE '%' || $1 || '%' OR f.founder_number::text = $1)
        AND ($2 = 'all'
          OR ($2 = 'reserved' AND f.status = 'reserved')
          OR ($2 = 'active' AND f.status = 'activated' AND (f.premium_ends_at IS NULL OR f.premium_ends_at > now()))
          OR ($2 = 'ending_soon' AND f.premium_ends_at > now() AND f.premium_ends_at <= now() + interval '30 days')
          OR ($2 = 'expired' AND f.premium_ends_at <= now())
          OR ($2 = 'paid' AND EXISTS (SELECT 1 FROM premium_entitlements paid WHERE paid.user_id = u.id AND paid.source = 'google_play')))
      ORDER BY f.founder_number NULLS LAST, f.reserved_at
      LIMIT $3`,
    [q, filter, limit],
  );
  return {
    items: result.rows.map((row) => ({
      founderNumber: row.founder_number,
      amoriaId: row.amoria_id,
      userStatus: row.account_status,
      status: row.status,
      reservedAt: row.reserved_at.toISOString(),
      activatedAt: toIso(row.activated_at),
      premiumStartsAt: toIso(row.premium_starts_at),
      premiumEndsAt: toIso(row.premium_ends_at),
      daysRemaining: row.premium_ends_at
        ? Math.max(0, Math.ceil((row.premium_ends_at.getTime() - Date.now()) / 86_400_000))
        : null,
      entitlementSource: row.entitlement_source,
      convertedToPaid: row.converted_paid,
    })),
  };
}

export async function runEntitlementMaintenance(): Promise<void> {
  await pool.query(
    `UPDATE premium_entitlements SET status = 'expired', updated_at = now()
      WHERE status = 'active' AND ends_at <= now()`,
  );
  await pool.query(
    `UPDATE founders SET status = 'expired', updated_at = now()
      WHERE status = 'reserved' AND reservation_expires_at <= now()`,
  );
  const warnings = await pool.query<{ user_id: string; founder_number: number; bucket: string }>(
    `SELECT user_id, founder_number,
            CASE WHEN premium_ends_at <= now() + interval '7 days' THEN '7' ELSE '30' END AS bucket
       FROM founders
      WHERE status = 'activated' AND premium_ends_at > now()
        AND (premium_ends_at::date = (now() + interval '30 days')::date
          OR premium_ends_at::date = (now() + interval '7 days')::date)`,
  );
  await Promise.all(warnings.rows.map((row) => notifyUser({
    userId: row.user_id,
    type: "founder_premium_expiring",
    titleKey: "notifications.founderPremiumExpiring",
    payload: { days: row.bucket },
    eventKey: `founder_premium_expiring:${row.founder_number}:${row.bucket}`,
  })));
  const expiredFounders = await pool.query<{ user_id: string; founder_number: number }>(
    `SELECT user_id, founder_number FROM founders
      WHERE status = 'activated' AND premium_ends_at IS NOT NULL AND premium_ends_at <= now()`,
  );
  await Promise.all(expiredFounders.rows.map((row) => notifyUser({
    userId: row.user_id,
    type: "founder_premium_expired",
    titleKey: "notifications.founderPremiumExpired",
    payload: {},
    eventKey: `founder_premium_expired:${row.founder_number}`,
  })));
}
