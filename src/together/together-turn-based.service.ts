import type { PoolClient } from "pg";
import { AppError, validationError } from "../common/errors";
import { geographicBounds, MAX_FINITE_MATCH_RADIUS_KM } from "../common/geography";
import {
  TOGETHER_ARTIFACT_PURGE_DELAY_MS,
  TURN_BASED_DRAFT_TTL_MS,
  TURN_BASED_PARTNER_CLAIM_TTL_MS,
  TURN_BASED_REVEAL_TTL_MS,
  TURN_BASED_STORY_TURN_TTL_MS,
  TURN_BASED_WAITING_FOR_PARTNER_TTL_MS,
  TURN_BASED_WAITING_WARNING_MS,
  TURN_BASED_STORY_STALLED_WARNING_MS,
  TURN_BASED_REVEAL_STALLED_WARNING_MS,
  PROFILE_GENDERS,
} from "../config/constants";
import { pool } from "../db/client";
import { incrementMetric } from "../observability/metrics";
import type { JsonValue } from "../db/schema";
import { requireAdultAgeFromBirthDate, normalizePreferredAgeRange } from "../users/age";
import {
  getStorySparksPackDto,
  isSameStoryChoice,
  STORY_SPARKS_ROUND_IDS,
  validateStoryChoicePayload,
} from "./story-sparks";
import type {
  TurnBasedAction,
  TurnBasedActionBody,
  TurnBasedMomentDto,
  TurnBasedMomentResponse,
  TurnBasedStartBody,
  TurnBasedStatus,
} from "./together-turn-based.types";

type MomentRow = {
  id: string; status: TurnBasedStatus; stage: "draw" | "story" | "done";
  starter_user_id: string; partner_user_id: string | null; draw_session_id: string;
  story_session_id: string | null; current_turn_user_id: string | null;
  current_round_id: "place" | "detail" | "twist" | "ending" | null;
  current_round_index: number | null; current_round_choice_index: number | null;
  claim_expires_at: Date | null; waiting_expires_at: Date | null;
  turn_expires_at: Date | null; decision_expires_at: Date | null;
  artifact_purged_at: Date | null; created_at: Date; updated_at: Date;
  client_request_id: string | null;
  own_event_count?: string;
  my_decision?: "open" | "skip" | "continue_story" | null;
  peer_decision_present?: boolean;
  identity_revealed?: boolean;
};
type ParticipantMomentRow = MomentRow & { role: "starter" | "partner" };

const activeStatuses = "('starter_turn','waiting_for_partner','partner_turn','awaiting_draw_reveal','story_turn','awaiting_story_reveal')";
const drawPrompts = [
  "Draw a tiny place you would both want to visit.",
  "Draw two characters meeting for the first time.",
  "Draw a shared dream room.",
];
const terminalStatuses = "('completed','expired','cancelled','blocked','reported')";

function projection(): string {
  return `
    m.*,p.role,
    (SELECT count(*)::text FROM together_events own_events
      WHERE own_events.session_id=m.draw_session_id AND own_events.from_user_id=p.user_id
        AND own_events.type='stroke_batch') own_event_count,
    (SELECT mine.decision FROM together_reveals mine
      WHERE mine.session_id=CASE WHEN m.stage='story' OR m.story_session_id IS NOT NULL
        THEN m.story_session_id ELSE m.draw_session_id END
        AND mine.user_id=p.user_id LIMIT 1) my_decision,
    EXISTS(SELECT 1 FROM together_reveals peer_decision
      WHERE peer_decision.session_id=CASE WHEN m.stage='story' OR m.story_session_id IS NOT NULL
        THEN m.story_session_id ELSE m.draw_session_id END
        AND peer_decision.user_id<>p.user_id) peer_decision_present,
    ((SELECT count(*) FROM together_reveals open_decisions
      WHERE open_decisions.session_id=CASE WHEN m.stage='story' OR m.story_session_id IS NOT NULL
        THEN m.story_session_id ELSE m.draw_session_id END
        AND open_decisions.decision='open')=2) identity_revealed`;
}

export async function start(userId: string, input: TurnBasedStartBody): Promise<TurnBasedMomentResponse> {
  await runMaintenance();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`together_turn_based:${userId}`]);
    const retried = await client.query<ParticipantMomentRow>(`
      SELECT ${projection()} FROM together_turn_based_moments m
      JOIN together_turn_based_participants p ON p.moment_id=m.id AND p.user_id=$1
      WHERE m.starter_user_id=$1 AND m.client_request_id=$2
      ORDER BY m.created_at DESC LIMIT 1 FOR UPDATE OF m`, [userId, input.clientRequestId]);
    if (retried.rows[0]) {
      await client.query("COMMIT");
      return { moment: toDto(retried.rows[0], userId) };
    }
    const existing = await findCurrent(client, userId, true, false);
    if (existing) {
      await client.query("COMMIT");
      return { moment: toDto(existing, userId) };
    }
    const profileResult = await client.query<{
      birth_date: string | null; gender: string | null; preferred_genders: string[];
      preferred_age_min: number; preferred_age_max: number | null;
    }>("SELECT birth_date::text birth_date, gender, preferred_genders, preferred_age_min, preferred_age_max FROM users WHERE id=$1", [userId]);
    const profile = profileResult.rows[0];
    if (!profile?.gender || !Array.isArray(profile.preferred_genders)) {
      throw validationError("A complete Together profile is required", { profile: "gender_preferences_required" });
    }
    const preferredGenders = profile.preferred_genders.length
      ? profile.preferred_genders
      : [...PROFILE_GENDERS];
    const age = requireAdultAgeFromBirthDate(profile.birth_date);
    const preferred = normalizePreferredAgeRange(input.preferredAgeRange, {
      min: profile.preferred_age_min, max: profile.preferred_age_max,
    });
    if (input.preferredAgeRange) {
      await client.query("UPDATE users SET preferred_age_min=$2, preferred_age_max=$3, updated_at=now() WHERE id=$1", [userId, preferred.min, preferred.max]);
    }
    const candidateBounds = geographicBounds(
      input.location.latitude,
      input.location.longitude,
      input.location.radiusKm ?? MAX_FINITE_MATCH_RADIUS_KM,
    );

    const candidateResult = await client.query<ParticipantMomentRow>(`
      SELECT m.*, 'partner'::text role
      FROM together_turn_based_moments m
      JOIN users starter ON starter.id=m.starter_user_id
      WHERE m.status='waiting_for_partner' AND m.waiting_expires_at>now()
        AND starter.account_status='active'
        AND m.starter_user_id<>$1
        AND $2 BETWEEN m.preferred_age_min AND COALESCE(m.preferred_age_max,120)
        AND m.starter_age BETWEEN $3 AND COALESCE($4,120)
        AND $5 = ANY(SELECT jsonb_array_elements_text(m.preferred_genders))
        AND m.starter_gender = ANY($6::text[])
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users b
          WHERE (b.user_id=$1 AND b.blocked_user_id=m.starter_user_id)
             OR (b.user_id=m.starter_user_id AND b.blocked_user_id=$1)
        )
        AND (
          ($9::integer IS NULL AND m.radius_km IS NULL)
          OR (
            m.latitude BETWEEN $10 AND $11
            AND (
              $14::boolean
              OR ($15::boolean AND (m.longitude >= $12 OR m.longitude <= $13))
              OR (NOT $15::boolean AND m.longitude BETWEEN $12 AND $13)
            )
          )
        )
        AND CASE
          WHEN m.radius_km IS NULL AND $9::integer IS NULL THEN true
          ELSE 6371 * 2 * asin(LEAST(1, sqrt(
            pow(sin(radians(m.latitude - $7) / 2), 2) +
            cos(radians($7)) * cos(radians(m.latitude)) *
            pow(sin(radians(m.longitude - $8) / 2), 2)
          ))) <= LEAST(
            COALESCE(m.radius_km, 2147483647),
            COALESCE($9::integer, 2147483647)
          )
        END
      ORDER BY m.created_at ASC, m.id ASC LIMIT 1 FOR UPDATE OF m SKIP LOCKED
    `, [userId, age, preferred.min, preferred.max, profile.gender, preferredGenders,
      input.location.latitude, input.location.longitude, input.location.radiusKm,
      candidateBounds.minLatitude, candidateBounds.maxLatitude,
      candidateBounds.minLongitude, candidateBounds.maxLongitude,
      candidateBounds.allLongitudes, candidateBounds.crossesAntimeridian]);

    let row: ParticipantMomentRow;
    const candidate = candidateResult.rows[0];
    if (candidate) {
      const claimExpiresAt = new Date(Date.now() + TURN_BASED_PARTNER_CLAIM_TTL_MS);
      await client.query("INSERT INTO together_turn_based_participants(moment_id,user_id,role) VALUES($1,$2,'partner')", [candidate.id, userId]);
      await client.query("INSERT INTO together_session_members(session_id,user_id,last_seen_at) VALUES($1,$2,now()) ON CONFLICT DO NOTHING", [candidate.draw_session_id, userId]);
      const updated = await client.query<MomentRow>(`
        UPDATE together_turn_based_moments SET partner_user_id=$2,status='partner_turn',
          current_turn_user_id=$2,partner_claimed_at=now(),claim_expires_at=$3,
          turn_expires_at=$3,last_transition='partner_claimed',last_transition_at=now(),updated_at=now()
        WHERE id=$1 RETURNING *`, [candidate.id, userId, claimExpiresAt]);
      row = { ...updated.rows[0]!, role: "partner" };
    } else {
      const session = await client.query<{ id: string }>(`
        INSERT INTO together_sessions(mode,activity,status,prompt_text,deadline_at)
        VALUES('turn_based','draw','active',$1,$2) RETURNING id
      `, [drawPrompts[Math.floor(Math.random() * drawPrompts.length)], new Date(Date.now() + TURN_BASED_DRAFT_TTL_MS)]);
      const drawSessionId = session.rows[0]!.id;
      await client.query("INSERT INTO together_session_members(session_id,user_id,last_seen_at) VALUES($1,$2,now())", [drawSessionId, userId]);
      const created = await client.query<MomentRow>(`
        INSERT INTO together_turn_based_moments(
          status,stage,starter_user_id,draw_session_id,current_turn_user_id,
          latitude,longitude,radius_km,starter_age,preferred_age_min,preferred_age_max,
          starter_gender,preferred_genders,turn_expires_at,last_transition,client_request_id
        ) VALUES('starter_turn','draw',$1,$2,$1,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'started',$12)
        RETURNING *`, [userId, drawSessionId, input.location.latitude, input.location.longitude,
          input.location.radiusKm, age, preferred.min, preferred.max, profile.gender,
          JSON.stringify(preferredGenders), new Date(Date.now() + TURN_BASED_DRAFT_TTL_MS),
          input.clientRequestId]);
      await client.query("INSERT INTO together_turn_based_participants(moment_id,user_id,role) VALUES($1,$2,'starter')", [created.rows[0]!.id, userId]);
      row = { ...created.rows[0]!, role: "starter" };
    }
    await client.query("COMMIT");
    return { moment: toDto(row, userId) };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      const current = await getCurrent(userId);
      if (current.moment) return current;
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getCurrent(userId: string): Promise<TurnBasedMomentResponse> {
  await runMaintenance();
  const row = await findCurrent(pool, userId, false, true);
  return { moment: row ? toDto(row, userId) : null };
}

export async function getMoment(userId: string, id: string): Promise<TurnBasedMomentResponse> {
  await runMaintenance();
  const result = await pool.query<ParticipantMomentRow>(`
    SELECT ${projection()} FROM together_turn_based_moments m
    JOIN together_turn_based_participants p ON p.moment_id=m.id
    WHERE m.id=$1 AND p.user_id=$2`, [id, userId]);
  const row = result.rows[0];
  if (!row) throw new AppError("not_found", "Together moment not found", 404);
  return { moment: toDto(row, userId) };
}

export async function getMomentBroadcasts(id: string): Promise<Array<{ userId: string; moment: TurnBasedMomentDto }>> {
  const result = await pool.query<ParticipantMomentRow & { user_id: string }>(`
    SELECT ${projection()},p.user_id FROM together_turn_based_moments m
    JOIN together_turn_based_participants p ON p.moment_id=m.id WHERE m.id=$1`, [id]);
  return result.rows.map((row) => ({ userId: row.user_id, moment: toDto(row, row.user_id) }));
}

export async function findMomentIdBySession(sessionId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM together_turn_based_moments WHERE draw_session_id=$1 OR story_session_id=$1 LIMIT 1",
    [sessionId],
  );
  return result.rows[0]?.id ?? null;
}

export async function submitDraw(userId: string, id: string, _input: TurnBasedActionBody): Promise<TurnBasedMomentResponse> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<ParticipantMomentRow>(`
      SELECT m.*,p.role FROM together_turn_based_moments m
      JOIN together_turn_based_participants p ON p.moment_id=m.id
      WHERE m.id=$1 AND p.user_id=$2 FOR UPDATE OF m`, [id, userId]);
    const row = found.rows[0];
    if (!row) throw new AppError("not_found", "Together moment not found", 404);
    const expected = row.role === "starter" ? "starter_turn" : "partner_turn";
    if (row.status !== expected || row.current_turn_user_id !== userId) throw outOfOrder();
    const strokes = await client.query<{ count: string }>(`
      SELECT count(*)::text count FROM together_events
      WHERE session_id=$1 AND from_user_id=$2 AND type='stroke_batch'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'strokes') s WHERE COALESCE(s->>'tool','draw')='draw')
    `, [row.draw_session_id, userId]);
    if (Number(strokes.rows[0]?.count ?? 0) < 1) {
      throw validationError("Add at least one drawing stroke before submitting", { drawing: "non_empty_stroke_required" });
    }
    let updated: MomentRow;
    if (row.role === "starter") {
      const waitingExpires = new Date(Date.now() + TURN_BASED_WAITING_FOR_PARTNER_TTL_MS);
      updated = (await client.query<MomentRow>(`
        UPDATE together_turn_based_moments SET status='waiting_for_partner',
          current_turn_user_id=NULL,starter_submitted_at=now(),waiting_expires_at=$2,
          turn_expires_at=NULL,last_transition='starter_draw_submitted',last_transition_at=now(),updated_at=now()
        WHERE id=$1 RETURNING *`, [id, waitingExpires])).rows[0]!;
    } else {
      const decisionExpires = new Date(Date.now() + TURN_BASED_REVEAL_TTL_MS);
      await client.query("UPDATE together_sessions SET status='finished',finished_at=now(),ended_reason='completed',artifact_purge_after=NULL,updated_at=now() WHERE id=$1", [row.draw_session_id]);
      updated = (await client.query<MomentRow>(`
        UPDATE together_turn_based_moments SET status='awaiting_draw_reveal',
          current_turn_user_id=NULL,stage_completed_at=now(),decision_expires_at=$2,
          claim_expires_at=NULL,turn_expires_at=NULL,last_transition='partner_draw_submitted',
          last_transition_at=now(),updated_at=now() WHERE id=$1 RETURNING *`, [id, decisionExpires])).rows[0]!;
    }
    await client.query("COMMIT");
    return { moment: toDto({ ...updated, role: row.role }, userId) };
  } catch (error) {
    await client.query("ROLLBACK"); throw error;
  } finally { client.release(); }
}

export async function renewLease(userId: string, id: string): Promise<TurnBasedMomentResponse> {
  const expires = new Date(Date.now() + TURN_BASED_PARTNER_CLAIM_TTL_MS);
  const result = await pool.query<MomentRow>(`
    UPDATE together_turn_based_moments SET claim_expires_at=$3,turn_expires_at=$3,updated_at=now()
    WHERE id=$1 AND partner_user_id=$2 AND status='partner_turn' AND claim_expires_at>now()
    RETURNING *`, [id, userId, expires]);
  if (!result.rows[0]) throw outOfOrder();
  return { moment: toDto({ ...result.rows[0], role: "partner" }, userId) };
}

export async function cancel(userId: string, id: string, input: TurnBasedActionBody): Promise<TurnBasedMomentResponse> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<ParticipantMomentRow>(`
      SELECT m.*,p.role FROM together_turn_based_moments m
      JOIN together_turn_based_participants p ON p.moment_id=m.id
      WHERE m.id=$1 AND p.user_id=$2 FOR UPDATE OF m`, [id, userId]);
    const row = found.rows[0];
    if (!row) throw new AppError("not_found", "Together moment not found", 404);
    if (["awaiting_draw_reveal","awaiting_story_reveal"].includes(row.status)) {
      throw new AppError("together_turn_invalid_transition", "Submitted reveal decisions cannot be cancelled", 409);
    }
    if ((row.status as string) === "partner_turn" && row.role === "partner") {
      await releasePartner(client, row, "partner_abandoned");
      const updated = await client.query<ParticipantMomentRow>(`
        SELECT m.*,p.role FROM together_turn_based_moments m
        JOIN together_turn_based_participants p ON p.moment_id=m.id AND p.user_id=$2
        WHERE m.id=$1`, [id, userId]);
      await client.query("COMMIT");
      return { moment: toDto(updated.rows[0] ?? { ...row, status: "waiting_for_partner" }, userId) };
    }
    if (!(["starter_turn","waiting_for_partner","partner_turn","story_turn"] as string[]).includes(row.status)) {
      throw new AppError("together_turn_invalid_transition", "Together moment cannot be cancelled in its current state", 409);
    }
    const updated = (await client.query<MomentRow>(`
      UPDATE together_turn_based_moments SET status='cancelled',stage='done',cancel_reason=$2,
        current_turn_user_id=NULL,last_transition='user_cancelled',
        last_transition_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,
    [id, input.reason?.trim().slice(0,500) ?? null])).rows[0]!;
    await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=COALESCE(completed_at,now()) WHERE moment_id=$1", [id]);
    await scheduleTerminalPurge(client, updated);
    await client.query("COMMIT");
    return { moment: toDto({ ...updated, role: row.role }, userId) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function dismiss(userId: string, id: string): Promise<TurnBasedMomentResponse> {
  const result = await pool.query<ParticipantMomentRow>(`
    WITH dismissed AS (
      UPDATE together_turn_based_participants p SET dismissed_at=COALESCE(p.dismissed_at,now())
      FROM together_turn_based_moments m
      WHERE p.moment_id=m.id AND p.moment_id=$1 AND p.user_id=$2
        AND m.status IN ${terminalStatuses}
      RETURNING p.moment_id,p.user_id,p.role
    )
    SELECT m.*,d.role FROM together_turn_based_moments m JOIN dismissed d ON d.moment_id=m.id`,
  [id, userId]);
  const row = result.rows[0];
  if (!row) throw new AppError("together_turn_invalid_transition", "Only terminal Together moments can be dismissed", 409);
  return { moment: toDto(row, userId) };
}

export async function validateEventTurn(sessionId: string, userId: string, type: string): Promise<void> {
  const result = await pool.query<MomentRow>(`
    SELECT * FROM together_turn_based_moments WHERE draw_session_id=$1 OR story_session_id=$1 LIMIT 1
  `, [sessionId]);
  const row = result.rows[0];
  if (!row) return;
  if (row.current_turn_user_id !== userId) throw outOfOrder();
  if (sessionId === row.draw_session_id && !["starter_turn","partner_turn"].includes(row.status)) throw outOfOrder();
  if (sessionId === row.story_session_id && (row.status !== "story_turn" || type !== "story_choice")) throw outOfOrder();
}

export async function createStoryChoiceAtomic(
  sessionId: string,
  userId: string,
  input: { clientEventId: string; type: string; payload: JsonValue },
): Promise<{
  event: {
    id: string; sessionId: string; fromUserId: string; clientEventId: string;
    type: string; payload: JsonValue; createdAt: Date;
  };
  created: boolean;
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<MomentRow>("SELECT * FROM together_turn_based_moments WHERE story_session_id=$1 FOR UPDATE", [sessionId]);
    const row = result.rows[0];
    if (!row) throw new AppError("not_found", "Turn-based Story Sparks moment not found", 404);
    if (input.type !== "story_choice") {
      throw validationError("Story Sparks sessions only accept story choices", { type: "unsupported_for_story_sparks" });
    }
    const { choice, details } = validateStoryChoicePayload(input.payload);
    if (!choice) throw validationError("Invalid Story Sparks choice", details);
    const existingByRequest = await client.query<{
      id:string;session_id:string;from_user_id:string;client_event_id:string;type:string;payload:JsonValue;created_at:Date;
    }>(`SELECT * FROM together_events WHERE session_id=$1 AND from_user_id=$2 AND client_event_id=$3 LIMIT 1`,
    [sessionId,userId,input.clientEventId]);
    const requestedPayload: JsonValue = {
      roundId: choice.roundId,
      cardId: choice.cardId,
      packId: choice.packId,
      clientRoundIndex: choice.clientRoundIndex,
    };
    if (existingByRequest.rows[0]) {
      const existing = existingByRequest.rows[0];
      if (!isSameStoryChoice(existing.payload, choice)) {
        throw new AppError("together_event_id_conflict", "Client event ID was already used for a different choice", 409);
      }
      await client.query("COMMIT");
      return { event: eventRow(existing), created: false };
    }
    if (row.status !== "story_turn" || row.current_turn_user_id !== userId) throw outOfOrder();
    if (row.current_round_id !== choice.roundId || row.current_round_index !== choice.clientRoundIndex) {
      throw new AppError("together_turn_out_of_order", "Story round is out of order", 409);
    }
    const existingRound = await client.query<{
      id:string;session_id:string;from_user_id:string;client_event_id:string;type:string;payload:JsonValue;created_at:Date;
    }>(`SELECT * FROM together_events WHERE session_id=$1 AND from_user_id=$2 AND type='story_choice'
      AND payload->>'roundId'=$3 ORDER BY created_at,id LIMIT 1`, [sessionId,userId,choice.roundId]);
    if (existingRound.rows[0]) {
      const existing = existingRound.rows[0];
      if (!isSameStoryChoice(existing.payload, choice)) {
        throw new AppError("together_turn_out_of_order", "A different choice already advanced this turn", 409);
      }
      await client.query("COMMIT");
      return { event: eventRow(existing), created: false };
    }
    const inserted = await client.query<{
      id:string;session_id:string;from_user_id:string;client_event_id:string;type:string;payload:JsonValue;created_at:Date;
    }>(`INSERT INTO together_events(session_id,from_user_id,client_event_id,type,payload)
      VALUES($1,$2,$3,'story_choice',$4::jsonb) RETURNING *`,
    [sessionId,userId,input.clientEventId,JSON.stringify(requestedPayload)]);
    const nextChoice = (row.current_round_choice_index ?? 0) + 1;
    if (nextChoice >= 8) {
      const decisionExpires = new Date(Date.now() + TURN_BASED_REVEAL_TTL_MS);
      await client.query("UPDATE together_sessions SET status='finished',finished_at=now(),ended_reason='completed',updated_at=now() WHERE id=$1", [sessionId]);
      await client.query(`UPDATE together_turn_based_moments SET status='awaiting_story_reveal',
        current_turn_user_id=NULL,stage_completed_at=now(),decision_expires_at=$2,turn_expires_at=NULL,
        last_transition='story_completed',last_transition_at=now(),updated_at=now() WHERE id=$1`, [row.id, decisionExpires]);
    } else {
      const order = [row.starter_user_id,row.partner_user_id,row.partner_user_id,row.starter_user_id,
        row.starter_user_id,row.partner_user_id,row.partner_user_id,row.starter_user_id];
      const roundIndex = Math.floor(nextChoice / 2);
      await client.query(`UPDATE together_turn_based_moments SET current_turn_user_id=$2,
        current_round_index=$3,current_round_choice_index=$4,current_round_id=$5,turn_expires_at=$6,
        last_transition='story_choice_submitted',last_transition_at=now(),updated_at=now() WHERE id=$1`,
      [row.id, order[nextChoice], roundIndex, nextChoice, STORY_SPARKS_ROUND_IDS[roundIndex],
        new Date(Date.now() + TURN_BASED_STORY_TURN_TTL_MS)]);
    }
    await client.query("COMMIT");
    return { event: eventRow(inserted.rows[0]!), created: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function renewClaimAfterAcceptedStroke(
  sessionId: string,
  userId: string,
  created: boolean,
  type: string,
): Promise<void> {
  if (!created || type !== "stroke_batch") return;
  const expires = new Date(Date.now() + TURN_BASED_PARTNER_CLAIM_TTL_MS);
  await pool.query(`
    UPDATE together_turn_based_moments
    SET claim_expires_at=$3,turn_expires_at=$3,updated_at=now()
    WHERE draw_session_id=$1 AND status='partner_turn'
      AND partner_user_id=$2 AND current_turn_user_id=$2 AND claim_expires_at>now()`,
  [sessionId,userId,expires]);
}

export async function syncReveal(sessionId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<MomentRow>("SELECT * FROM together_turn_based_moments WHERE draw_session_id=$1 OR story_session_id=$1 FOR UPDATE", [sessionId]);
    const row = found.rows[0];
    if (!row) { await client.query("COMMIT"); return; }
    if (row.partner_user_id) {
      const blocked = await client.query(`
        SELECT 1 FROM blocked_users
        WHERE (user_id=$1 AND blocked_user_id=$2) OR (user_id=$2 AND blocked_user_id=$1)
        LIMIT 1`, [row.starter_user_id, row.partner_user_id]);
      if (blocked.rowCount) {
        await client.query(`UPDATE together_turn_based_moments SET status='blocked',stage='done',
          current_turn_user_id=NULL,artifact_purge_after=NULL,last_transition='pair_blocked',
          last_transition_at=now(),updated_at=now() WHERE id=$1`,
        [row.id]);
        await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=now() WHERE moment_id=$1",[row.id]);
        await recordProblem(client,row.id,"blocked_pair","warning","Participant pair became blocked");
        await client.query("COMMIT");
        return;
      }
    }
    const decisions = await client.query<{ decision: string }>("SELECT decision FROM together_reveals WHERE session_id=$1 ORDER BY created_at", [sessionId]);
    if (decisions.rows.length < 2) { await client.query("COMMIT"); return; }
    const values = decisions.rows.map((r) => r.decision);
    if (sessionId === row.draw_session_id && values.every((v) => v === "continue_story")) {
      const continuation = await client.query<{ id: string }>("SELECT id FROM together_sessions WHERE source_session_id=$1 AND activity='story_sparks' LIMIT 1", [sessionId]);
      const storySessionId = continuation.rows[0]?.id;
      if (!storySessionId || !row.partner_user_id) {
        await recordProblem(client, row.id, "story_continuation_missing", "error", "Story continuation was not created");
      } else {
        await client.query("UPDATE together_sessions SET mode='turn_based',artifact_purge_after=NULL WHERE id=$1", [storySessionId]);
        await client.query("UPDATE together_sessions SET artifact_purge_after=NULL,updated_at=now() WHERE id=$1", [row.draw_session_id]);
        await client.query(`UPDATE together_turn_based_moments SET status='story_turn',stage='story',
          story_session_id=$2,current_turn_user_id=starter_user_id,current_round_id='place',
          current_round_index=0,current_round_choice_index=0,turn_expires_at=$3,decision_expires_at=NULL,
          last_transition='story_started',last_transition_at=now(),updated_at=now() WHERE id=$1`,
        [row.id, storySessionId, new Date(Date.now() + TURN_BASED_STORY_TURN_TTL_MS)]);
      }
    } else {
      const terminal = "completed";
      const updated = (await client.query<MomentRow>(`UPDATE together_turn_based_moments SET status=$2,stage='done',
        current_turn_user_id=NULL,last_transition='reveal_completed',
        last_transition_at=now(),updated_at=now() WHERE id=$1 RETURNING *`, [row.id, terminal])).rows[0]!;
      await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=now() WHERE moment_id=$1", [row.id]);
      await scheduleTerminalPurge(client, updated);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function runMaintenance(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('together_turn_based_maintenance')) locked");
    if (!lock.rows[0]?.locked) {
      incrementMetric("amoria_together_lock_contention_total", { lock: "maintenance" });
      await client.query("ROLLBACK");
      return;
    }
    try {
      await client.query(`
        UPDATE together_sessions s SET artifact_purge_after=NULL,updated_at=now()
        FROM together_turn_based_moments m
        WHERE (s.id=m.draw_session_id OR s.id=m.story_session_id)
          AND (m.status='awaiting_draw_reveal' OR m.status='story_turn')
          AND s.artifact_purge_after IS NOT NULL`);
      await client.query(`
        INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
        SELECT id,'waiting_too_long','warning','Turn-based drawing has waited more than 12 hours'
        FROM together_turn_based_moments
        WHERE status='waiting_for_partner' AND starter_submitted_at<=$1
        ON CONFLICT(COALESCE(moment_id::text,'global'),code) WHERE status='open'
        DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`,
      [new Date(Date.now() - TURN_BASED_WAITING_WARNING_MS)]);
      await client.query(`
        INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
        SELECT id,'story_round_stalled','warning','Story turn has been stalled more than 12 hours'
        FROM together_turn_based_moments
        WHERE status='story_turn' AND last_transition_at<=$1
        ON CONFLICT(COALESCE(moment_id::text,'global'),code) WHERE status='open'
        DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`,
      [new Date(Date.now() - TURN_BASED_STORY_STALLED_WARNING_MS)]);
      await client.query(`
        INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
        SELECT id,'reveal_stalled','warning','Reveal decision has been stalled more than 24 hours'
        FROM together_turn_based_moments
        WHERE status IN ('awaiting_draw_reveal','awaiting_story_reveal')
          AND stage_completed_at<=$1
        ON CONFLICT(COALESCE(moment_id::text,'global'),code) WHERE status='open'
        DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`,
      [new Date(Date.now() - TURN_BASED_REVEAL_STALLED_WARNING_MS)]);
      const expiredClaims = await client.query<{ id: string; draw_session_id: string; partner_user_id: string }>(`
        SELECT id,draw_session_id,partner_user_id FROM together_turn_based_moments
        WHERE status='partner_turn' AND claim_expires_at<=now() FOR UPDATE SKIP LOCKED LIMIT 100`);
      for (const row of expiredClaims.rows) {
        await releasePartner(client, { ...row, status: "partner_turn" } as MomentRow, "claim_expired");
        await recordProblem(client,row.id,"claim_expired","warning","Partner claim expired and was released");
      }
      const expired = await client.query<MomentRow>(`
        UPDATE together_turn_based_moments SET status='expired',stage='done',current_turn_user_id=NULL,
          last_transition='expired',last_transition_at=now(),updated_at=now()
        WHERE status IN ${activeStatuses} AND (
          (status='starter_turn' AND turn_expires_at<=now()) OR
          (status='waiting_for_partner' AND waiting_expires_at<=now()) OR
          (status='story_turn' AND turn_expires_at<=now()) OR
          (status IN ('awaiting_draw_reveal','awaiting_story_reveal') AND decision_expires_at<=now())
        ) RETURNING *`);
      for (const row of expired.rows) {
        await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=now() WHERE moment_id=$1", [row.id]);
        await scheduleTerminalPurge(client, row);
      }
      await client.query(`
        WITH eligible AS (
          SELECT s.id FROM together_sessions s
          WHERE s.mode='live' AND s.status='finished' AND s.finished_at<=$1
            AND s.artifact_purged_at IS NULL AND s.artifact_purge_after IS NULL
            AND NOT EXISTS(SELECT 1 FROM together_reveals r WHERE r.session_id=s.id)
          ORDER BY s.finished_at LIMIT 100 FOR UPDATE SKIP LOCKED
        )
        UPDATE together_sessions s SET artifact_purge_after=now(),updated_at=now()
        FROM eligible e WHERE s.id=e.id`, [new Date(Date.now() - 72 * 60 * 60 * 1000)]);
      await client.query(`
        WITH eligible AS (
          SELECT s.id FROM together_sessions s
          WHERE s.mode='live' AND s.status IN ('finished','abandoned','cancelled')
            AND s.finished_at<=$1 AND s.artifact_purged_at IS NULL
            AND NOT EXISTS(SELECT 1 FROM together_sessions c WHERE c.source_session_id=s.id AND c.status='active')
          ORDER BY s.finished_at LIMIT 100 FOR UPDATE SKIP LOCKED
        )
        UPDATE together_sessions s SET artifact_purge_after=LEAST(COALESCE(s.artifact_purge_after,now()),now()),updated_at=now()
        FROM eligible e WHERE s.id=e.id`, [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]);
      await client.query(`
        WITH eligible AS (
          SELECT s.id,(SELECT count(*) FROM together_events e WHERE e.session_id=s.id) event_count
          FROM together_sessions s LEFT JOIN together_turn_based_moments m ON m.draw_session_id=s.id OR m.story_session_id=s.id
          WHERE s.artifact_purged_at IS NULL AND s.artifact_purge_after<=now()
            AND COALESCE(m.status,'completed') NOT IN ('reported','blocked')
            AND NOT EXISTS(SELECT 1 FROM together_sessions c WHERE c.source_session_id=s.id AND c.status='active')
            AND NOT EXISTS(
              SELECT 1 FROM safety_reports r
              WHERE r.status IN ('open','under_review','escalated')
                AND r.target_id IN (s.id::text,COALESCE(m.id::text,''))
            )
          ORDER BY s.artifact_purge_after LIMIT 100 FOR UPDATE OF s SKIP LOCKED
        ), deleted AS (DELETE FROM together_events e USING eligible x WHERE e.session_id=x.id)
        UPDATE together_sessions s SET artifact_purged_at=now(),event_count_snapshot=x.event_count,updated_at=now()
        FROM eligible x WHERE s.id=x.id`);
      await client.query(`
        UPDATE together_turn_based_moments m SET artifact_purged_at=now(),updated_at=now()
        WHERE m.artifact_purged_at IS NULL
          AND EXISTS(SELECT 1 FROM together_sessions d WHERE d.id=m.draw_session_id AND d.artifact_purged_at IS NOT NULL)
          AND (m.story_session_id IS NULL OR EXISTS(
            SELECT 1 FROM together_sessions s WHERE s.id=m.story_session_id AND s.artifact_purged_at IS NOT NULL
          ))`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      await recordProblem(client,null,"cleanup_failed","error","Together maintenance failed");
      throw error;
    }
  } finally { client.release(); }
}

async function findCurrent(
  queryable: Pick<PoolClient,"query"> | typeof pool,
  userId: string,
  lock: boolean,
  includeTerminal: boolean,
): Promise<ParticipantMomentRow | undefined> {
  const result = await queryable.query<ParticipantMomentRow>(`
    SELECT ${projection()} FROM together_turn_based_moments m
    JOIN together_turn_based_participants p ON p.moment_id=m.id
    WHERE p.user_id=$1 AND (
      (p.active=true AND m.status IN ${activeStatuses})
      ${includeTerminal ? `OR (p.dismissed_at IS NULL AND m.status IN ${terminalStatuses})` : ""}
    )
    ORDER BY CASE WHEN p.active=true AND m.status IN ${activeStatuses} THEN 0 ELSE 1 END,
      m.updated_at DESC LIMIT 1 ${lock ? "FOR UPDATE OF m" : ""}`, [userId]);
  return result.rows[0];
}

function toDto(row: ParticipantMomentRow, userId: string): TurnBasedMomentDto {
  const dto: TurnBasedMomentDto = {
    id: row.id, mode: "turn_based", status: row.status, stage: row.stage, role: row.role,
    action: actionFor(row,userId), drawSessionId: row.draw_session_id,
    storySessionId: row.story_session_id, isMyTurn: row.current_turn_user_id === userId,
    identityRevealed: Boolean(row.identity_revealed),
    myRevealDecision: row.my_decision ?? null,
    peerDecisionPresent: Boolean(row.peer_decision_present),
    currentRoundId: row.current_round_id,
    currentRoundIndex: row.current_round_index, currentRoundChoiceIndex: row.current_round_choice_index,
    partnerPresent: Boolean(row.partner_user_id), claimExpiresAt: iso(row.claim_expires_at),
    waitingExpiresAt: iso(row.waiting_expires_at), turnExpiresAt: iso(row.turn_expires_at),
    decisionExpiresAt: iso(row.decision_expires_at), artifactPurged: Boolean(row.artifact_purged_at),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
  if (row.stage === "story") dto.storyPack = getStorySparksPackDto();
  return dto;
}
function actionFor(row: ParticipantMomentRow,userId:string): TurnBasedAction {
  if (row.status === "starter_turn") return Number(row.own_event_count ?? 0) > 0 ? "resume_draw" : "start_draw";
  if (row.status === "waiting_for_partner") return "waiting_for_partner";
  if (row.status === "partner_turn") return row.current_turn_user_id===userId ? "continue_draw" : "waiting_for_partner";
  if (row.status === "awaiting_draw_reveal") {
    return row.my_decision ? "waiting_for_draw_decision" : "review_draw";
  }
  if (row.status === "story_turn") return row.current_turn_user_id===userId ? "continue_story" : "waiting_for_story_turn";
  if (row.status === "awaiting_story_reveal") {
    return row.my_decision ? "waiting_for_story_decision" : "review_story";
  }
  return row.status;
}
function iso(value: Date | null): string | null { return value?.toISOString() ?? null; }
function outOfOrder(): AppError {
  return new AppError("together_turn_out_of_order","It is not your turn",409);
}
async function recordProblem(client: Pick<PoolClient,"query">, momentId:string|null,code:string,severity:string,summary:string):Promise<void> {
  await client.query(`INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
    VALUES($1,$2,$3,$4) ON CONFLICT(COALESCE(moment_id::text,'global'),code) WHERE status='open'
    DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`,
  [momentId,code,severity,summary]);
}

async function releasePartner(
  client: Pick<PoolClient,"query">,
  row: Pick<MomentRow,"id"|"draw_session_id"|"partner_user_id">,
  transition: "claim_expired" | "partner_abandoned" | "admin_claim_released",
): Promise<void> {
  if (!row.partner_user_id) return;
  await client.query(
    "DELETE FROM together_events WHERE session_id=$1 AND from_user_id=$2",
    [row.draw_session_id,row.partner_user_id],
  );
  await client.query(
    "DELETE FROM together_session_members WHERE session_id=$1 AND user_id=$2",
    [row.draw_session_id,row.partner_user_id],
  );
  await client.query(`
    UPDATE together_turn_based_participants
    SET active=false,completed_at=COALESCE(completed_at,now())
    WHERE moment_id=$1 AND user_id=$2`,
  [row.id,row.partner_user_id]);
  await client.query(`
    UPDATE together_turn_based_moments SET status='waiting_for_partner',partner_user_id=NULL,
      current_turn_user_id=NULL,partner_claimed_at=NULL,claim_expires_at=NULL,turn_expires_at=NULL,
      last_transition=$2,last_transition_at=now(),updated_at=now() WHERE id=$1`,
  [row.id,transition]);
}

async function scheduleTerminalPurge(
  client: Pick<PoolClient,"query">,
  row: Pick<MomentRow,"id"|"draw_session_id"|"story_session_id"|"status">,
): Promise<void> {
  if (row.status === "reported" || row.status === "blocked") return;
  const held = await client.query(`
    SELECT 1 FROM safety_reports
    WHERE status IN ('open','under_review','escalated')
      AND target_id IN ($1,$2,$3) LIMIT 1`,
  [row.id,row.draw_session_id,row.story_session_id ?? ""]);
  if (held.rowCount) return;
  const purgeAfter = new Date(Date.now() + TOGETHER_ARTIFACT_PURGE_DELAY_MS);
  await client.query(
    "UPDATE together_turn_based_moments SET artifact_purge_after=$2,updated_at=now() WHERE id=$1",
    [row.id,purgeAfter],
  );
  await client.query(`
    UPDATE together_sessions SET artifact_purge_after=$2,updated_at=now()
    WHERE id=$1 OR id=$3`,
  [row.draw_session_id,purgeAfter,row.story_session_id]);
}

function eventRow(row: {
  id:string;session_id:string;from_user_id:string;client_event_id:string;
  type:string;payload:JsonValue;created_at:Date;
}) {
  return {
    id: row.id,
    sessionId: row.session_id,
    fromUserId: row.from_user_id,
    clientEventId: row.client_event_id,
    type: row.type,
    payload: row.payload,
    createdAt: row.created_at,
  };
}
