import type { PoolClient } from "pg";
import { AppError, validationError } from "../common/errors";
import {
  TOGETHER_ARTIFACT_PURGE_DELAY_MS,
  TURN_BASED_DRAFT_TTL_MS,
  TURN_BASED_PARTNER_CLAIM_TTL_MS,
  TURN_BASED_REVEAL_TTL_MS,
  TURN_BASED_STORY_TURN_TTL_MS,
  TURN_BASED_WAITING_FOR_PARTNER_TTL_MS,
  PROFILE_GENDERS,
} from "../config/constants";
import { pool } from "../db/client";
import { requireAdultAgeFromBirthDate, normalizePreferredAgeRange } from "../users/age";
import { getStorySparksPackDto, STORY_SPARKS_ROUND_IDS } from "./story-sparks";
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
};
type ParticipantMomentRow = MomentRow & { role: "starter" | "partner" };

const activeStatuses = "('starter_turn','waiting_for_partner','partner_turn','awaiting_draw_reveal','story_turn','awaiting_story_reveal')";
const drawPrompts = [
  "Draw a tiny place you would both want to visit.",
  "Draw two characters meeting for the first time.",
  "Draw a shared dream room.",
];

export async function start(userId: string, input: TurnBasedStartBody): Promise<TurnBasedMomentResponse> {
  await runMaintenance();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`together_turn_based:${userId}`]);
    const existing = await findCurrent(client, userId, true);
    if (existing) {
      await client.query("COMMIT");
      return { moment: toDto(existing, userId) };
    }
    const profileResult = await client.query<{
      birth_date: string | null; gender: string | null; preferred_genders: string[];
      preferred_age_min: number; preferred_age_max: number | null;
    }>("SELECT birth_date, gender, preferred_genders, preferred_age_min, preferred_age_max FROM users WHERE id=$1", [userId]);
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

    const candidateResult = await client.query<ParticipantMomentRow>(`
      SELECT m.*, 'partner'::text role
      FROM together_turn_based_moments m
      JOIN users starter ON starter.id=m.starter_user_id
      WHERE m.status='waiting_for_partner' AND m.waiting_expires_at>now()
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
          (m.radius_km IS NULL OR 6371*acos(LEAST(1,GREATEST(-1,
            cos(radians(m.latitude))*cos(radians($7))*cos(radians($8)-radians(m.longitude))+
            sin(radians(m.latitude))*sin(radians($7))
          ))) <= m.radius_km)
          AND
          ($9::integer IS NULL OR 6371*acos(LEAST(1,GREATEST(-1,
            cos(radians(m.latitude))*cos(radians($7))*cos(radians($8)-radians(m.longitude))+
            sin(radians(m.latitude))*sin(radians($7))
          ))) <= $9)
        )
      ORDER BY m.created_at ASC LIMIT 1 FOR UPDATE OF m SKIP LOCKED
    `, [userId, age, preferred.min, preferred.max, profile.gender, preferredGenders,
      input.location.latitude, input.location.longitude, input.location.radiusKm]);

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
          starter_gender,preferred_genders,turn_expires_at,last_transition
        ) VALUES('starter_turn','draw',$1,$2,$1,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'started')
        RETURNING *`, [userId, drawSessionId, input.location.latitude, input.location.longitude,
          input.location.radiusKm, age, preferred.min, preferred.max, profile.gender,
          JSON.stringify(preferredGenders), new Date(Date.now() + TURN_BASED_DRAFT_TTL_MS)]);
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
  const row = await findCurrent(pool, userId, false);
  return { moment: row ? toDto(row, userId) : null };
}

export async function getMoment(userId: string, id: string): Promise<TurnBasedMomentResponse> {
  await runMaintenance();
  const result = await pool.query<ParticipantMomentRow>(`
    SELECT m.*,p.role FROM together_turn_based_moments m
    JOIN together_turn_based_participants p ON p.moment_id=m.id
    WHERE m.id=$1 AND p.user_id=$2`, [id, userId]);
  const row = result.rows[0];
  if (!row) throw new AppError("not_found", "Together moment not found", 404);
  return { moment: toDto(row, userId) };
}

export async function getMomentBroadcasts(id: string): Promise<Array<{ userId: string; moment: TurnBasedMomentDto }>> {
  const result = await pool.query<ParticipantMomentRow & { user_id: string }>(`
    SELECT m.*,p.role,p.user_id FROM together_turn_based_moments m
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
      const purgeAfter = new Date(Date.now() + TOGETHER_ARTIFACT_PURGE_DELAY_MS);
      await client.query("UPDATE together_sessions SET status='finished',finished_at=now(),ended_reason='completed',artifact_purge_after=$2,updated_at=now() WHERE id=$1", [row.draw_session_id, purgeAfter]);
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
  const result = await pool.query<ParticipantMomentRow>(`
    WITH owned AS (
      SELECT m.id FROM together_turn_based_moments m JOIN together_turn_based_participants p ON p.moment_id=m.id
      WHERE m.id=$1 AND p.user_id=$2 AND m.status IN ${activeStatuses}
    ), updated AS (
      UPDATE together_turn_based_moments m SET status='cancelled',stage='done',cancel_reason=$3,
        current_turn_user_id=NULL,artifact_purge_after=$4,last_transition='user_cancelled',
        last_transition_at=now(),updated_at=now() FROM owned WHERE m.id=owned.id RETURNING m.*
    )
    SELECT updated.*,p.role FROM updated JOIN together_turn_based_participants p ON p.moment_id=updated.id AND p.user_id=$2
  `, [id, userId, input.reason?.trim().slice(0,500) ?? null, new Date(Date.now() + TOGETHER_ARTIFACT_PURGE_DELAY_MS)]);
  const row = result.rows[0];
  if (!row) throw new AppError("not_found", "Active Together moment not found", 404);
  await pool.query("UPDATE together_turn_based_participants SET active=false,completed_at=now() WHERE moment_id=$1", [id]);
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

export async function advanceStoryTurn(sessionId: string, userId: string, created: boolean): Promise<void> {
  if (!created) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<MomentRow>("SELECT * FROM together_turn_based_moments WHERE story_session_id=$1 FOR UPDATE", [sessionId]);
    const row = result.rows[0];
    if (!row || row.status !== "story_turn" || row.current_turn_user_id !== userId) {
      await client.query("ROLLBACK"); return;
    }
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
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
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
          current_turn_user_id=NULL,artifact_purge_after=$2,last_transition='pair_blocked',
          last_transition_at=now(),updated_at=now() WHERE id=$1`,
        [row.id,new Date(Date.now()+TOGETHER_ARTIFACT_PURGE_DELAY_MS)]);
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
        await client.query("UPDATE together_sessions SET mode='turn_based' WHERE id=$1", [storySessionId]);
        await client.query(`UPDATE together_turn_based_moments SET status='story_turn',stage='story',
          story_session_id=$2,current_turn_user_id=starter_user_id,current_round_id='place',
          current_round_index=0,current_round_choice_index=0,turn_expires_at=$3,decision_expires_at=NULL,
          last_transition='story_started',last_transition_at=now(),updated_at=now() WHERE id=$1`,
        [row.id, storySessionId, new Date(Date.now() + TURN_BASED_STORY_TURN_TTL_MS)]);
      }
    } else {
      const terminal = values.every((v) => v === "open") ? "completed" : "completed";
      await client.query(`UPDATE together_turn_based_moments SET status=$2,stage='done',
        current_turn_user_id=NULL,artifact_purge_after=$3,last_transition='reveal_completed',
        last_transition_at=now(),updated_at=now() WHERE id=$1`, [row.id, terminal,
        new Date(Date.now() + TOGETHER_ARTIFACT_PURGE_DELAY_MS)]);
      await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=now() WHERE moment_id=$1", [row.id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function runMaintenance(): Promise<void> {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('together_turn_based_maintenance')) locked");
    if (!lock.rows[0]?.locked) return;
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
        SELECT id,'waiting_too_long','warning','Turn-based drawing has waited more than 12 hours'
        FROM together_turn_based_moments
        WHERE status='waiting_for_partner' AND starter_submitted_at<=now()-interval '12 hours'
        ON CONFLICT(moment_id,code) WHERE status='open'
        DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`);
      await client.query(`
        INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
        SELECT id,'story_round_stalled','warning','Story turn has been stalled more than 12 hours'
        FROM together_turn_based_moments
        WHERE status='story_turn' AND last_transition_at<=now()-interval '12 hours'
        ON CONFLICT(moment_id,code) WHERE status='open'
        DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`);
      await client.query(`
        INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
        SELECT id,'reveal_stalled','warning','Reveal decision has been stalled more than 24 hours'
        FROM together_turn_based_moments
        WHERE status IN ('awaiting_draw_reveal','awaiting_story_reveal')
          AND stage_completed_at<=now()-interval '24 hours'
        ON CONFLICT(moment_id,code) WHERE status='open'
        DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`);
      const expiredClaims = await client.query<{ id: string; draw_session_id: string; partner_user_id: string }>(`
        SELECT id,draw_session_id,partner_user_id FROM together_turn_based_moments
        WHERE status='partner_turn' AND claim_expires_at<=now() FOR UPDATE SKIP LOCKED LIMIT 100`);
      for (const row of expiredClaims.rows) {
        await client.query("DELETE FROM together_events WHERE session_id=$1 AND from_user_id=$2", [row.draw_session_id,row.partner_user_id]);
        await client.query("DELETE FROM together_session_members WHERE session_id=$1 AND user_id=$2", [row.draw_session_id,row.partner_user_id]);
        await client.query("DELETE FROM together_turn_based_participants WHERE moment_id=$1 AND user_id=$2", [row.id,row.partner_user_id]);
        await client.query(`UPDATE together_turn_based_moments SET status='waiting_for_partner',partner_user_id=NULL,
          current_turn_user_id=NULL,partner_claimed_at=NULL,claim_expires_at=NULL,turn_expires_at=NULL,
          last_transition='claim_expired',last_transition_at=now(),updated_at=now() WHERE id=$1`, [row.id]);
        await recordProblem(client,row.id,"claim_expired","warning","Partner claim expired and was released");
      }
      const expired = await client.query<{ id: string }>(`
        UPDATE together_turn_based_moments SET status='expired',stage='done',current_turn_user_id=NULL,
          artifact_purge_after=now()+interval '24 hours',last_transition='expired',last_transition_at=now(),updated_at=now()
        WHERE status IN ${activeStatuses} AND (
          (status='starter_turn' AND turn_expires_at<=now()) OR
          (status='waiting_for_partner' AND waiting_expires_at<=now()) OR
          (status='story_turn' AND turn_expires_at<=now()) OR
          (status IN ('awaiting_draw_reveal','awaiting_story_reveal') AND decision_expires_at<=now())
        ) RETURNING id`);
      for (const row of expired.rows) {
        await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=now() WHERE moment_id=$1", [row.id]);
      }
      await client.query(`
        WITH eligible AS (
          SELECT s.id,(SELECT count(*) FROM together_events e WHERE e.session_id=s.id) event_count
          FROM together_sessions s LEFT JOIN together_turn_based_moments m ON m.draw_session_id=s.id OR m.story_session_id=s.id
          WHERE s.artifact_purged_at IS NULL AND s.artifact_purge_after<=now()
            AND COALESCE(m.status,'completed') NOT IN ('reported','blocked')
          ORDER BY s.artifact_purge_after LIMIT 100 FOR UPDATE OF s SKIP LOCKED
        ), deleted AS (DELETE FROM together_events e USING eligible x WHERE e.session_id=x.id)
        UPDATE together_sessions s SET artifact_purged_at=now(),event_count_snapshot=x.event_count,updated_at=now()
        FROM eligible x WHERE s.id=x.id`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      await recordProblem(client,null,"cleanup_failed","error","Together maintenance failed");
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('together_turn_based_maintenance'))");
    }
  } finally { client.release(); }
}

async function findCurrent(queryable: Pick<PoolClient,"query"> | typeof pool, userId: string, lock: boolean): Promise<ParticipantMomentRow | undefined> {
  const result = await queryable.query<ParticipantMomentRow>(`
    SELECT m.*,p.role FROM together_turn_based_moments m
    JOIN together_turn_based_participants p ON p.moment_id=m.id
    WHERE p.user_id=$1 AND p.active=true AND m.status IN ${activeStatuses}
    ORDER BY m.created_at LIMIT 1 ${lock ? "FOR UPDATE OF m" : ""}`, [userId]);
  return result.rows[0];
}

function toDto(row: ParticipantMomentRow, userId: string): TurnBasedMomentDto {
  const dto: TurnBasedMomentDto = {
    id: row.id, mode: "turn_based", status: row.status, stage: row.stage, role: row.role,
    action: actionFor(row,userId), drawSessionId: row.draw_session_id,
    storySessionId: row.story_session_id, currentTurnUserId: row.current_turn_user_id,
    isMyTurn: row.current_turn_user_id === userId, currentRoundId: row.current_round_id,
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
  if (row.status === "starter_turn") return "start_draw";
  if (row.status === "waiting_for_partner") return "waiting_for_partner";
  if (row.status === "partner_turn") return row.current_turn_user_id===userId ? "continue_draw" : "waiting_for_partner";
  if (row.status === "awaiting_draw_reveal") return "review_draw";
  if (row.status === "story_turn") return row.current_turn_user_id===userId ? "continue_story" : "waiting_for_story_turn";
  if (row.status === "awaiting_story_reveal") return "review_story";
  return row.status;
}
function iso(value: Date | null): string | null { return value?.toISOString() ?? null; }
function outOfOrder(): AppError {
  return new AppError("together_turn_out_of_order","It is not your turn",409);
}
async function recordProblem(client: Pick<PoolClient,"query">, momentId:string|null,code:string,severity:string,summary:string):Promise<void> {
  await client.query(`INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
    VALUES($1,$2,$3,$4) ON CONFLICT(moment_id,code) WHERE status='open'
    DO UPDATE SET last_seen_at=now(),occurrence_count=together_turn_based_problems.occurrence_count+1,updated_at=now()`,
  [momentId,code,severity,summary]);
}
