import { createHmac, randomBytes } from "node:crypto";
import { AppError, validationError } from "../common/errors";
import { env } from "../config/env";
import { pool } from "../db/client";
import { notifyUser } from "../notifications/notifications.service";
import { progressFounderCandidate } from "../monetization/monetization.service";

export const ANALYTICS_EVENT_ALLOWLIST = new Set([
  "app_opened",
  "registration_completed",
  "profile_completed",
  "first_photo_approved",
  "nearby_enabled",
  "together_started",
  "together_matched",
  "together_completed",
  "chat_started",
  "invite_shared",
  "invite_opened",
  "invite_registered",
  "invite_activated",
  "premium_paywall_opened",
  "premium_purchase_started",
  "premium_activated",
  "premium_expired",
  "returned_day_1",
  "returned_day_7",
]);

const ANALYTICS_METADATA_KEYS = new Set([
  "entryPoint",
  "feature",
  "platform",
  "appVersion",
  "mode",
  "outcome",
  "activity",
  "source",
]);
const SENSITIVE_KEY = /message|text|photo|password|token|secret|email|phone|lat|lng|longitude|latitude|coordinate|receipt|purchase/i;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SOURCE_CODE = /^[a-z0-9_]{2,40}$/u;

function hashInstallId(value: string): string {
  return createHmac("sha256", env.AUTH_SECURITY_HMAC_SECRET).update(value, "utf8").digest("hex");
}

function normalizeMetadata(input: unknown): Record<string, string | number | boolean> {
  if (input === undefined || input === null) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("Analytics metadata is invalid", { metadata: "invalid" });
  }
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key) || !ANALYTICS_METADATA_KEYS.has(key)) {
      throw validationError("Analytics metadata key is not allowlisted", { [`metadata.${key}`]: "forbidden" });
    }
    if (
      (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") ||
      (typeof value === "string" && value.length > 100) ||
      (typeof value === "number" && !Number.isFinite(value))
    ) {
      throw validationError("Analytics metadata value is invalid", { [`metadata.${key}`]: "invalid" });
    }
    output[key] = value;
  }
  return output;
}

export async function recordProductEvent(input: {
  userId?: string | null;
  eventName: unknown;
  sourceCode?: unknown;
  metadata?: unknown;
  occurredAt?: Date;
}): Promise<{ ok: true }> {
  const eventName = typeof input.eventName === "string" ? input.eventName.trim() : "";
  if (!ANALYTICS_EVENT_ALLOWLIST.has(eventName)) {
    throw validationError("Analytics event is not allowlisted", { eventName: "forbidden" });
  }
  const sourceCode = typeof input.sourceCode === "string" && input.sourceCode.trim()
    ? input.sourceCode.trim().toLowerCase()
    : null;
  if (sourceCode && !SOURCE_CODE.test(sourceCode)) {
    throw validationError("Acquisition source is invalid", { sourceCode: "invalid" });
  }
  const metadata = normalizeMetadata(input.metadata);
  const occurredAt = input.occurredAt ?? new Date();
  await pool.query(
    `INSERT INTO product_analytics_events
       (user_id, event_name, source_code, metadata, occurred_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [input.userId ?? null, eventName, sourceCode, JSON.stringify(metadata), occurredAt],
  );
  if (input.userId && eventName === "app_opened") {
    await deriveReturnEvents(input.userId, occurredAt);
  }
  return { ok: true };
}

async function deriveReturnEvents(userId: string, now: Date): Promise<void> {
  const user = await pool.query<{ created_at: Date }>(`SELECT created_at FROM users WHERE id = $1`, [userId]);
  const createdAt = user.rows[0]?.created_at;
  if (!createdAt) return;
  const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
  for (const [eventName, threshold] of [["returned_day_1", 1], ["returned_day_7", 7]] as const) {
    if (ageDays < threshold) continue;
    await pool.query(
      `INSERT INTO product_analytics_events (user_id, event_name, metadata, occurred_at)
       SELECT $1, $2, '{}'::jsonb, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM product_analytics_events WHERE user_id = $1 AND event_name = $2
        )`,
      [userId, eventName, now],
    );
  }
}

function createInviteCode(): string {
  const bytes = randomBytes(6);
  return [...bytes].map((byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

async function ensureInviteCode(userId: string): Promise<{ id: string; code: string; share_count: number }> {
  const existing = await pool.query<{ id: string; code: string; share_count: number }>(
    `SELECT id, code, share_count FROM invite_codes WHERE user_id = $1 AND status = 'active'`,
    [userId],
  );
  if (existing.rows[0]) return existing.rows[0];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createInviteCode();
    const created = await pool.query<{ id: string; code: string; share_count: number }>(
      `INSERT INTO invite_codes (user_id, code)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id, code, share_count`,
      [userId, code],
    );
    if (created.rows[0]) return created.rows[0];
    const raced = await pool.query<{ id: string; code: string; share_count: number }>(
      `SELECT id, code, share_count FROM invite_codes WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
    if (raced.rows[0]) return raced.rows[0];
  }
  throw new Error("Could not allocate unique invite code");
}

export async function getInvite(userId: string) {
  const invite = await ensureInviteCode(userId);
  const activated = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM invite_attributions
      WHERE inviter_user_id = $1 AND activated_at IS NOT NULL`,
    [userId],
  );
  const httpsLink = env.PUBLIC_APP_URL ? `${env.PUBLIC_APP_URL}/i/${invite.code}` : null;
  return {
    code: invite.code,
    link: httpsLink ?? `amoria://i/${invite.code}`,
    verifiedHttpsLink: httpsLink,
    shares: invite.share_count,
    activatedInvites: activated.rows[0]?.count ?? 0,
  };
}

export async function markInviteShared(userId: string): Promise<ReturnType<typeof getInvite>> {
  const invite = await ensureInviteCode(userId);
  await pool.query(
    `UPDATE invite_codes SET share_count = share_count + 1, updated_at = now() WHERE id = $1`,
    [invite.id],
  );
  await recordProductEvent({ userId, eventName: "invite_shared", metadata: { source: "personal_invite" } });
  return getInvite(userId);
}

export async function recordInviteOpened(code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  const invite = await pool.query<{ id: string }>(
    `SELECT id FROM invite_codes WHERE code = $1 AND status = 'active'`,
    [normalized],
  );
  if (!invite.rows[0]) return false;
  await recordProductEvent({ eventName: "invite_opened", sourceCode: "personal_invite" });
  return true;
}

export async function claimAttribution(userId: string, input: {
  code?: unknown;
  sourceCode?: unknown;
  installId?: unknown;
}) {
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  const sourceCode = typeof input.sourceCode === "string" && input.sourceCode.trim()
    ? input.sourceCode.trim().toLowerCase()
    : code ? "personal_invite" : "organic_play";
  const installId = typeof input.installId === "string" ? input.installId.trim() : "";
  if (!SOURCE_CODE.test(sourceCode)) {
    throw validationError("Acquisition source is invalid", { sourceCode: "invalid" });
  }
  if (installId && (installId.length < 8 || installId.length > 256)) {
    throw validationError("Install attribution identifier is invalid", { installId: "invalid" });
  }
  const invite = code
    ? await pool.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM invite_codes WHERE code = $1 AND status = 'active'`,
        [code],
      )
    : null;
  if (code && !invite?.rows[0]) throw new AppError("invite_invalid", "Invitation is invalid", 404);
  if (invite?.rows[0]?.user_id === userId) {
    throw new AppError("self_referral_forbidden", "Self-referral is not allowed", 409);
  }
  const installHash = installId ? hashInstallId(installId) : null;
  try {
    await pool.query(
      `INSERT INTO invite_attributions
        (invite_code_id, inviter_user_id, invitee_user_id, anonymous_install_id_hash,
         source_code, opened_at, registered_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $1 IS NULL THEN NULL ELSE now() END, now(), now())
       ON CONFLICT (invitee_user_id) DO NOTHING`,
      [invite?.rows[0]?.id ?? null, invite?.rows[0]?.user_id ?? null, userId, installHash, sourceCode],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AppError("attribution_already_claimed", "Install attribution was already claimed", 409);
    }
    throw error;
  }
  await recordProductEvent({ userId, eventName: "invite_registered", sourceCode });
  return { ok: true as const };
}

export async function progressAttributionForUser(userId: string): Promise<void> {
  const result = await pool.query<{
    profile_complete: boolean;
    useful_action: boolean;
    activated_at: Date | null;
    source_code: string;
  }>(
    `SELECT
       (u.email_verified_at IS NOT NULL AND u.birth_date IS NOT NULL AND u.gender IS NOT NULL
        AND u.goal IS NOT NULL AND jsonb_array_length(u.preferred_genders) > 0
        AND EXISTS (SELECT 1 FROM media_files mf WHERE mf.owner_user_id = u.id
          AND mf.type IN ('avatar', 'profile_photo') AND mf.moderation_state = 'approved')) AS profile_complete,
       (EXISTS (SELECT 1 FROM together_session_members tsm WHERE tsm.user_id = u.id)
        OR EXISTS (SELECT 1 FROM nearby_profile_visibility npv WHERE npv.user_id = u.id AND npv.status = 'active')
        OR EXISTS (SELECT 1 FROM user_activity_preferences uap WHERE uap.user_id = u.id AND uap.status = 'active')) AS useful_action,
       ia.activated_at, ia.source_code
      FROM invite_attributions ia JOIN users u ON u.id = ia.invitee_user_id
     WHERE ia.invitee_user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return;
  await pool.query(
    `UPDATE invite_attributions SET
       profile_completed_at = CASE WHEN $2 THEN COALESCE(profile_completed_at, now()) ELSE profile_completed_at END,
       first_useful_action_at = CASE WHEN $3 THEN COALESCE(first_useful_action_at, now()) ELSE first_useful_action_at END,
       activated_at = CASE WHEN $2 AND $3 THEN COALESCE(activated_at, now()) ELSE activated_at END,
       updated_at = now()
     WHERE invitee_user_id = $1`,
    [userId, row.profile_complete, row.useful_action],
  );
  if (row.profile_complete && row.useful_action && !row.activated_at) {
    await recordProductEvent({ userId, eventName: "invite_activated", sourceCode: row.source_code });
  }
}

export async function progressReleaseState(userId: string): Promise<void> {
  if (env.isTest) return;
  await Promise.all([
    progressFounderCandidate(userId),
    progressAttributionForUser(userId),
    recordProfileMilestones(userId),
  ]);
}

async function recordProfileMilestones(userId: string): Promise<void> {
  const result = await pool.query<{ profile_complete: boolean; first_photo_approved: boolean }>(
    `SELECT
       (u.email_verified_at IS NOT NULL AND u.birth_date IS NOT NULL AND u.gender IS NOT NULL
        AND u.goal IS NOT NULL AND jsonb_array_length(u.preferred_genders) > 0
        AND EXISTS (SELECT 1 FROM media_files mf WHERE mf.owner_user_id = u.id
          AND mf.type IN ('avatar', 'profile_photo') AND mf.moderation_state = 'approved')) AS profile_complete,
       EXISTS (SELECT 1 FROM media_files mf WHERE mf.owner_user_id = u.id
         AND mf.type IN ('avatar', 'profile_photo') AND mf.moderation_state = 'approved') AS first_photo_approved
      FROM users u WHERE u.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  for (const [eventName, reached] of [
    ["first_photo_approved", row?.first_photo_approved],
    ["profile_completed", row?.profile_complete],
  ] as const) {
    if (!reached) continue;
    await pool.query(
      `INSERT INTO product_analytics_events (user_id, event_name, metadata, occurred_at)
       SELECT $1, $2, '{}'::jsonb, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM product_analytics_events WHERE user_id = $1 AND event_name = $2
        )`,
      [userId, eventName],
    );
  }
}

export async function getPushPreferences(userId: string) {
  const result = await pool.query<{
    messages: boolean; together: boolean; community_activity: boolean; premium_account: boolean;
  }>(
    `SELECT messages, together, community_activity, premium_account FROM push_preferences WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? {
    messages: true,
    together: true,
    community_activity: true,
    premium_account: true,
  };
}

export async function updatePushPreferences(userId: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("Push preferences are invalid", { body: "invalid" });
  }
  const body = input as Record<string, unknown>;
  const current = await getPushPreferences(userId);
  const next = { ...current };
  for (const [wireKey, key] of [
    ["messages", "messages"],
    ["together", "together"],
    ["communityActivity", "community_activity"],
    ["premiumAccount", "premium_account"],
  ] as const) {
    if (body[wireKey] !== undefined) {
      if (typeof body[wireKey] !== "boolean") {
        throw validationError("Push preference is invalid", { [wireKey]: "invalid" });
      }
      next[key] = body[wireKey] as boolean;
    }
  }
  await pool.query(
    `INSERT INTO push_preferences (user_id, messages, together, community_activity, premium_account, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET messages = EXCLUDED.messages,
       together = EXCLUDED.together, community_activity = EXCLUDED.community_activity,
       premium_account = EXCLUDED.premium_account, updated_at = now()`,
    [userId, next.messages, next.together, next.community_activity, next.premium_account],
  );
  return {
    messages: next.messages,
    together: next.together,
    communityActivity: next.community_activity,
    premiumAccount: next.premium_account,
    transactionalAlwaysOn: true,
  };
}

export async function notificationCategoryEnabled(userId: string, type: string): Promise<boolean> {
  const preferences = await getPushPreferences(userId);
  if (type === "direct_message") return preferences.messages;
  if (type === "together_match" || type === "together_action") return preferences.together;
  if (type === "announcement" || type === "community_activity") return preferences.community_activity;
  return true;
}

export async function getAvailability(userId: string) {
  const result = await pool.query<{ active_today_until: Date | null; notify_when_activity: boolean }>(
    `SELECT active_today_until, notify_when_activity FROM user_availability_intents WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  const activeUntil = row?.active_today_until && row.active_today_until > new Date()
    ? row.active_today_until
    : null;
  return {
    activeToday: Boolean(activeUntil),
    activeTodayUntil: activeUntil?.toISOString() ?? null,
    notifyWhenActivity: row?.notify_when_activity ?? false,
  };
}

export async function updateAvailability(userId: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw validationError("Availability intent is invalid", { body: "invalid" });
  }
  const body = input as { activeToday?: unknown; notifyWhenActivity?: unknown };
  if (body.activeToday !== undefined && typeof body.activeToday !== "boolean") {
    throw validationError("Availability intent is invalid", { activeToday: "invalid" });
  }
  if (body.notifyWhenActivity !== undefined && typeof body.notifyWhenActivity !== "boolean") {
    throw validationError("Availability intent is invalid", { notifyWhenActivity: "invalid" });
  }
  const current = await getAvailability(userId);
  const activeToday = body.activeToday ?? current.activeToday;
  const notifyWhenActivity = body.notifyWhenActivity ?? current.notifyWhenActivity;
  await pool.query(
    `INSERT INTO user_availability_intents
       (user_id, active_today_until, notify_when_activity, updated_at)
     VALUES ($1, CASE WHEN $2 THEN now() + interval '12 hours' ELSE NULL END, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET
       active_today_until = CASE
         WHEN $2 THEN GREATEST(COALESCE(user_availability_intents.active_today_until, now()), now() + interval '12 hours')
         ELSE NULL END,
       notify_when_activity = $3, updated_at = now()`,
    [userId, activeToday, notifyWhenActivity],
  );
  if (body.activeToday === true) await notifyRealNearbyActivity(userId);
  return getAvailability(userId);
}

async function notifyRealNearbyActivity(activeUserId: string): Promise<void> {
  const watchers = await pool.query<{ user_id: string; geo_bucket: string }>(
    `SELECT watcher.user_id,
            floor(actor.latitude * 2)::text || ':' || floor(actor.longitude * 2)::text AS geo_bucket
       FROM nearby_profile_visibility actor
       JOIN nearby_profile_visibility watcher ON watcher.user_id <> actor.user_id
       JOIN user_availability_intents intent ON intent.user_id = watcher.user_id
       LEFT JOIN push_preferences pref ON pref.user_id = watcher.user_id
       LEFT JOIN activity_notification_cooldowns cooldown
         ON cooldown.watcher_user_id = watcher.user_id
        AND cooldown.geo_bucket = floor(actor.latitude * 2)::text || ':' || floor(actor.longitude * 2)::text
      WHERE actor.user_id = $1 AND actor.status = 'active' AND actor.expires_at > now()
        AND watcher.status = 'active' AND watcher.expires_at > now()
        AND intent.notify_when_activity = true
        AND COALESCE(pref.community_activity, true) = true
        AND point(actor.longitude, actor.latitude) <-> point(watcher.longitude, watcher.latitude)
              <= LEAST(actor.radius_km, watcher.radius_km) / 111.0
        AND (cooldown.last_notified_at IS NULL OR cooldown.last_notified_at <= now() - interval '6 hours')
      LIMIT 500`,
    [activeUserId],
  );
  for (const watcher of watchers.rows) {
    await pool.query(
      `INSERT INTO activity_notification_cooldowns (watcher_user_id, geo_bucket, last_notified_at)
       VALUES ($1, $2, now())
       ON CONFLICT (watcher_user_id, geo_bucket) DO UPDATE SET last_notified_at = now()`,
      [watcher.user_id, watcher.geo_bucket],
    );
    await notifyUser({
      userId: watcher.user_id,
      type: "community_activity",
      titleKey: "notifications.communityActivity",
      payload: {},
      eventKey: `community_activity:${watcher.geo_bucket}:${new Date().toISOString().slice(0, 13)}`,
    });
  }
}

export async function setTogetherShareConsent(userId: string, sessionId: string, consent: boolean) {
  const membership = await pool.query(
    `SELECT 1 FROM together_session_members WHERE session_id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  if (!membership.rowCount) throw new AppError("not_found", "Together session not found", 404);
  await pool.query(
    `INSERT INTO together_share_consents (session_id, user_id, consented_at, revoked_at)
     VALUES ($1, $2, now(), CASE WHEN $3 THEN NULL ELSE now() END)
     ON CONFLICT (session_id, user_id) DO UPDATE SET
       consented_at = CASE WHEN $3 THEN now() ELSE together_share_consents.consented_at END,
       revoked_at = CASE WHEN $3 THEN NULL ELSE now() END`,
    [sessionId, userId, consent],
  );
  const participants = await pool.query<{ participant_count: number; consent_count: number }>(
    `SELECT
       (SELECT count(*)::int FROM together_session_members WHERE session_id = $1) AS participant_count,
       (SELECT count(*)::int FROM together_share_consents WHERE session_id = $1 AND revoked_at IS NULL) AS consent_count`,
    [sessionId],
  );
  const counts = participants.rows[0] ?? { participant_count: 0, consent_count: 0 };
  return {
    consented: consent,
    shareMode: counts.participant_count >= 2 && counts.consent_count === counts.participant_count
      ? "joint_result" as const
      : "neutral_amoria_card" as const,
  };
}

export async function getGrowthAdminOverview() {
  const [funnel, health] = await Promise.all([
    pool.query<{ event_name: string; count: number }>(
      `SELECT event_name, count(DISTINCT user_id)::int AS count
         FROM product_analytics_events
        WHERE occurred_at >= now() - interval '30 days'
        GROUP BY event_name`,
    ),
    pool.query<{
      active_24h: number; active_today: number; nearby_active: number;
      together_started: number; together_matched: number; together_completed: number;
      chats_after_together: number; new_profiles: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM users WHERE last_seen_at >= now() - interval '24 hours' AND account_status = 'active') AS active_24h,
        (SELECT count(*)::int FROM user_availability_intents WHERE active_today_until > now()) AS active_today,
        (SELECT count(*)::int FROM nearby_profile_visibility WHERE status = 'active' AND expires_at > now()) AS nearby_active,
        (SELECT count(*)::int FROM together_sessions WHERE created_at >= now() - interval '24 hours') AS together_started,
        (SELECT count(*)::int FROM together_sessions ts WHERE ts.created_at >= now() - interval '24 hours'
          AND (SELECT count(*) FROM together_session_members tsm WHERE tsm.session_id = ts.id) >= 2) AS together_matched,
        (SELECT count(*)::int FROM together_sessions WHERE finished_at >= now() - interval '24 hours') AS together_completed,
        (SELECT count(DISTINCT tc.thread_id)::int FROM thread_contexts tc
          WHERE tc.source_type IN ('together', 'play') AND tc.created_at >= now() - interval '24 hours') AS chats_after_together,
        (SELECT count(*)::int FROM users WHERE created_at >= now() - interval '24 hours') AS new_profiles`,
    ),
  ]);
  const eventCounts = Object.fromEntries(funnel.rows.map((row) => [row.event_name, row.count]));
  const h = health.rows[0];
  const inviteRegistered = eventCounts.invite_registered ?? 0;
  const inviteActivated = eventCounts.invite_activated ?? 0;
  return {
    funnel: {
      registration: eventCounts.registration_completed ?? 0,
      profileCompleted: eventCounts.profile_completed ?? 0,
      firstUsefulAction: (eventCounts.nearby_enabled ?? 0) + (eventCounts.together_started ?? 0),
      successfulInteraction: (eventCounts.together_matched ?? 0) + (eventCounts.together_completed ?? 0),
      chat: eventCounts.chat_started ?? 0,
      returnedDay1: eventCounts.returned_day_1 ?? 0,
      returnedDay7: eventCounts.returned_day_7 ?? 0,
      inviteShared: eventCounts.invite_shared ?? 0,
      inviteRegistered,
      inviteActivated,
      inviteConversion: inviteRegistered ? inviteActivated / inviteRegistered : 0,
      premiumPaywallOpened: eventCounts.premium_paywall_opened ?? 0,
      premiumActivated: eventCounts.premium_activated ?? 0,
    },
    community: {
      activeLast24h: h?.active_24h ?? 0,
      activeToday: h?.active_today ?? 0,
      nearbyActive: h?.nearby_active ?? 0,
      togetherStarted: h?.together_started ?? 0,
      togetherMatched: h?.together_matched ?? 0,
      togetherCompleted: h?.together_completed ?? 0,
      chatsAfterTogether: h?.chats_after_together ?? 0,
      newProfiles: h?.new_profiles ?? 0,
    },
  };
}
