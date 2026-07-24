import { AppError, validationError } from "../common/errors";
import { TOGETHER_ARTIFACT_PURGE_DELAY_MS } from "../config/constants";
import { pool } from "../db/client";
import { runMaintenance } from "../together/together-turn-based.service";
import * as audit from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";

type Query = Record<string, unknown>;
type ActionBody = { action: string; reason: string };

export function parseQuery(input: unknown): Query {
  const value = input && typeof input === "object" ? input as Query : {};
  const limit = Math.min(200, Math.max(1, Number(value.limit ?? 50)));
  return { ...value, limit };
}
export function parseAction(input: unknown): ActionBody {
  const value = input && typeof input === "object" ? input as Query : {};
  const action = String(value.action ?? "");
  const reason = String(value.reason ?? "").trim();
  if (!action || reason.length < 10 || reason.length > 500) {
    throw validationError("Action and a 10-500 character reason are required", { reason: "invalid" });
  }
  return { action, reason };
}

export async function listMoments(admin:AdminContext,query:Query,ctx:AdminRequestContext):Promise<unknown> {
  await runMaintenance();
  const values: unknown[] = [];
  const where = filters(query, values, "m");
  const result = await pool.query(`
    SELECT m.id,m.status,m.stage,starter.amoria_id "starterAmoriaId",partner.amoria_id "partnerAmoriaId",
      m.draw_session_id "drawSessionId",m.story_session_id "storySessionId",
      CASE WHEN m.current_turn_user_id=m.starter_user_id THEN 'starter'
        WHEN m.current_turn_user_id=m.partner_user_id THEN 'partner' ELSE NULL END "currentTurnRole",
      m.current_round_id "currentRoundId",
      (SELECT concat(floor(geo.latitude)::int,':',floor(geo.longitude)::int)
        FROM together_turn_based_moments geo WHERE geo.id=m.id) "coarseGeoBucket",
      m.radius_km "radiusKm",
      m.last_transition "lastTransition",m.last_transition_at "lastTransitionAt",
      m.claim_expires_at "claimExpiresAt",m.waiting_expires_at "waitingExpiresAt",
      m.turn_expires_at "turnExpiresAt",m.decision_expires_at "decisionExpiresAt",
      m.artifact_purge_after "artifactPurgeAfter",m.artifact_purged_at "artifactPurgedAt",
      m.created_at "createdAt",m.updated_at "updatedAt",
      (SELECT count(*)::int FROM together_events e
        WHERE e.session_id=m.draw_session_id OR e.session_id=m.story_session_id) "eventCount",
      (SELECT count(*)::int FROM together_turn_based_problems p WHERE p.moment_id=m.id AND p.status='open') "openProblemCount"
    FROM together_turn_based_moments m
    JOIN users starter ON starter.id=m.starter_user_id
    LEFT JOIN users partner ON partner.id=m.partner_user_id
    ${where}
    ORDER BY m.updated_at DESC LIMIT $${values.push(query.limit)}
  `, values);
  await log(admin,"admin.togetherTurnBased.read","together_turn_based_moments",null,{ filters: safeFilters(query),resultCount:result.rows.length },ctx);
  const overview = await pool.query(`
    SELECT
      count(*) FILTER (WHERE status IN ('starter_turn','waiting_for_partner','partner_turn','awaiting_draw_reveal','story_turn','awaiting_story_reveal'))::int "activeMoments",
      count(*) FILTER (WHERE status='waiting_for_partner')::int "waitingForPartner",
      count(*) FILTER (WHERE current_turn_user_id IS NOT NULL)::int "currentUserTurns",
      count(*) FILTER (WHERE status IN ('awaiting_draw_reveal','awaiting_story_reveal'))::int "awaitingDecisions",
      count(*) FILTER (WHERE status='story_turn')::int "activeStorySparks",
      count(*) FILTER (WHERE status='expired' AND updated_at>=now()-interval '24 hours')::int "expiredLast24Hours",
      count(*) FILTER (WHERE artifact_purge_after IS NOT NULL AND artifact_purged_at IS NULL)::int "artifactsAwaitingCleanup",
      (SELECT count(*)::int FROM together_turn_based_problems WHERE status='open') "openProblems"
    FROM together_turn_based_moments`);
  return { items: result.rows.map(withSafeActions), overview: overview.rows[0], nextCursor: null };
}

export async function getMoment(admin:AdminContext,id:string,ctx:AdminRequestContext):Promise<unknown> {
  await runMaintenance();
  const moment = await pool.query(`
    SELECT m.id,m.status,m.stage,starter.amoria_id "starterAmoriaId",partner.amoria_id "partnerAmoriaId",
      m.draw_session_id "drawSessionId",m.story_session_id "storySessionId",
      CASE WHEN m.current_turn_user_id=m.starter_user_id THEN 'starter'
        WHEN m.current_turn_user_id=m.partner_user_id THEN 'partner' ELSE NULL END "currentTurnRole",
      m.current_round_id "currentRoundId",
      m.current_round_index "currentRoundIndex",m.current_round_choice_index "currentRoundChoiceIndex",
      m.last_transition "lastTransition",m.last_transition_at "lastTransitionAt",
      m.starter_submitted_at "starterSubmittedAt",m.partner_claimed_at "partnerClaimedAt",
      m.claim_expires_at "claimExpiresAt",m.waiting_expires_at "waitingExpiresAt",
      m.turn_expires_at "turnExpiresAt",m.decision_expires_at "decisionExpiresAt",
      m.artifact_purge_after "artifactPurgeAfter",m.artifact_purged_at "artifactPurgedAt",
      m.cancel_reason "cancelReason",m.created_at "createdAt",m.updated_at "updatedAt"
    FROM together_turn_based_moments m
    JOIN users starter ON starter.id=m.starter_user_id
    LEFT JOIN users partner ON partner.id=m.partner_user_id
    WHERE m.id=$1`, [id]);
  if (!moment.rows[0]) throw new AppError("not_found","Together moment not found",404);
  const [participants,problems] = await Promise.all([
    pool.query(`SELECT u.amoria_id "amoriaId",p.role,p.active,p.joined_at "joinedAt",
      p.completed_at "completedAt",p.dismissed_at "dismissedAt"
      FROM together_turn_based_participants p JOIN users u ON u.id=p.user_id
      WHERE p.moment_id=$1 ORDER BY p.joined_at`,[id]),
    pool.query(`SELECT id,code,severity,status,summary,first_seen_at "firstSeenAt",
      last_seen_at "lastSeenAt",occurrence_count "occurrenceCount"
      FROM together_turn_based_problems WHERE moment_id=$1 ORDER BY last_seen_at DESC`,[id]),
  ]);
  await log(admin,"admin.togetherTurnBased.detail.read","together_turn_based_moment",id,{ participantCount:participants.rows.length,problemCount:problems.rows.length },ctx);
  return { moment: moment.rows[0], participants: participants.rows, problems: problems.rows };
}

export async function listProblems(admin:AdminContext,query:Query,ctx:AdminRequestContext):Promise<unknown> {
  await runMaintenance();
  const values: unknown[]=[]; const clauses:string[]=[];
  for (const key of ["status","severity","code"] as const) if (query[key]) { values.push(query[key]); clauses.push(`p.${key}=$${values.length}`); }
  if (query.momentId) { values.push(query.momentId); clauses.push(`p.moment_id=$${values.length}`); }
  values.push(query.limit);
  const result=await pool.query(`SELECT p.id,p.moment_id "momentId",p.session_id "sessionId",
    u.amoria_id "userAmoriaId",p.code,p.severity,p.status,p.summary,
    p.first_seen_at "firstSeenAt",p.last_seen_at "lastSeenAt",p.occurrence_count "occurrenceCount",
    p.resolved_at "resolvedAt",p.resolution_note "resolutionNote"
    FROM together_turn_based_problems p LEFT JOIN users u ON u.id=p.user_id
    ${clauses.length?`WHERE ${clauses.join(" AND ")}`:""}
    ORDER BY p.last_seen_at DESC LIMIT $${values.length}`,values);
  await log(admin,"admin.togetherTurnBasedProblems.read","together_turn_based_problems",null,{filters:safeFilters(query),resultCount:result.rows.length},ctx);
  return {items:result.rows,nextCursor:null};
}

export async function actionMoment(admin:AdminContext,id:string,body:ActionBody,ctx:AdminRequestContext):Promise<unknown> {
  const allowed=["release_claim","return_to_pool","cancel_moment","expire_moment","retry_cleanup"];
  if(!allowed.includes(body.action)) throw validationError("Unsupported moment action",{action:"unsupported"});
  const client=await pool.connect();
  let beforeStatus="";
  try {
    await client.query("BEGIN");
    const before=await client.query<{
      status:string;stage:string;partner_user_id:string|null;draw_session_id:string;
      story_session_id:string|null;claim_expires_at:Date|null;
    }>("SELECT status,stage,partner_user_id,draw_session_id,story_session_id,claim_expires_at FROM together_turn_based_moments WHERE id=$1 FOR UPDATE",[id]);
    const row=before.rows[0];
    if(!row) throw new AppError("not_found","Together moment not found",404);
    beforeStatus=row.status;
    if(body.action==="release_claim"){
      const stuck=await client.query("SELECT 1 FROM together_turn_based_problems WHERE moment_id=$1 AND code='claim_stuck' AND status='open' LIMIT 1",[id]);
      if(row.status!=="partner_turn"||!row.partner_user_id||(!(row.claim_expires_at&&row.claim_expires_at<=new Date())&&!stuck.rowCount)){
        throw invalidAdminTransition("release_claim requires an expired or diagnosed stuck partner claim");
      }
      await removePartnerClaim(client,id,row.draw_session_id,row.partner_user_id,"admin_claim_released");
    } else if(body.action==="return_to_pool"){
      if(row.stage!=="draw"||row.story_session_id||!["waiting_for_partner","partner_turn"].includes(row.status)){
        throw invalidAdminTransition("Only a drawing-stage moment can return to the pool");
      }
      if(row.partner_user_id) await removePartnerClaim(client,id,row.draw_session_id,row.partner_user_id,"admin_returned_to_pool");
      else await client.query(`UPDATE together_turn_based_moments SET status='waiting_for_partner',
        current_turn_user_id=NULL,last_transition='admin_returned_to_pool',
        last_transition_at=now(),updated_at=now() WHERE id=$1`,[id]);
    } else if(body.action==="retry_cleanup") {
      if(!["completed","expired","cancelled"].includes(row.status)) {
        throw invalidAdminTransition("Cleanup can only be retried for an eligible terminal moment");
      }
      const purgeAfter=new Date(Date.now()+TOGETHER_ARTIFACT_PURGE_DELAY_MS);
      await client.query("UPDATE together_sessions SET artifact_purge_after=$2,updated_at=now() WHERE id=$1 OR id=$3",[row.draw_session_id,purgeAfter,row.story_session_id]);
      await client.query(`UPDATE together_turn_based_problems SET status='resolved',resolved_at=now(),
        resolved_by_admin_user_id=$2,resolution_note=$3,updated_at=now()
        WHERE moment_id=$1 AND code='cleanup_failed' AND status='open'`,[id,admin.adminUser.id,body.reason]);
    } else {
      if(["completed","expired","cancelled","blocked","reported"].includes(row.status)){
        throw invalidAdminTransition("Terminal moments cannot be rewritten");
      }
      const status=body.action==="expire_moment"?"expired":"cancelled";
      const purgeAfter=new Date(Date.now()+TOGETHER_ARTIFACT_PURGE_DELAY_MS);
      await client.query(`UPDATE together_turn_based_moments SET status=$2,stage='done',current_turn_user_id=NULL,
        cancel_reason=$3,artifact_purge_after=$4,last_transition='admin_action',last_transition_at=now(),updated_at=now()
        WHERE id=$1`,[id,status,body.reason,purgeAfter]);
      await client.query("UPDATE together_sessions SET artifact_purge_after=$2,updated_at=now() WHERE id=$1 OR id=$3",[row.draw_session_id,purgeAfter,row.story_session_id]);
      await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=COALESCE(completed_at,now()) WHERE moment_id=$1",[id]);
    }
    await client.query("COMMIT");
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await log(admin,"admin.togetherTurnBased.action","together_turn_based_moment",id,{action:body.action,beforeStatus},ctx,body.reason);
  return getMoment(admin,id,ctx);
}

export async function actionProblem(admin:AdminContext,id:string,body:ActionBody,ctx:AdminRequestContext):Promise<unknown>{
  const statuses:Record<string,string>={resolve:"resolved",ignore:"ignored",reopen:"open"};
  const status=statuses[body.action]; if(!status) throw validationError("Unsupported problem action",{action:"unsupported"});
  const result=await pool.query(`UPDATE together_turn_based_problems SET status=$2,resolution_note=$3,
    resolved_at=CASE WHEN $2='open' THEN NULL ELSE now() END,
    resolved_by_admin_user_id=CASE WHEN $2='open' THEN NULL ELSE $4 END,updated_at=now()
    WHERE id=$1 RETURNING id,moment_id "momentId",code,severity,status,summary,
    last_seen_at "lastSeenAt",occurrence_count "occurrenceCount"`,[id,status,body.reason,admin.adminUser.id]);
  if(!result.rows[0]) throw new AppError("not_found","Together problem not found",404);
  await log(admin,"admin.togetherTurnBasedProblem.action","together_turn_based_problem",id,{action:body.action},ctx,body.reason);
  return {problem:result.rows[0]};
}

function filters(query:Query,values:unknown[],alias:string):string{
  const clauses:string[]=[];
  for(const key of ["status","stage"] as const) if(query[key]){values.push(query[key]);clauses.push(`${alias}.${key}=$${values.length}`);}
  if(query.momentId){values.push(query.momentId);clauses.push(`${alias}.id=$${values.length}`);}
  if(query.participantUserId){values.push(query.participantUserId);clauses.push(`EXISTS(SELECT 1 FROM together_turn_based_participants px JOIN users ux ON ux.id=px.user_id WHERE px.moment_id=${alias}.id AND (px.user_id::text=$${values.length} OR ux.amoria_id=$${values.length}))`);}
  if(query.problemCode){values.push(query.problemCode);clauses.push(`EXISTS(SELECT 1 FROM together_turn_based_problems pp WHERE pp.moment_id=${alias}.id AND pp.code=$${values.length})`);}
  return clauses.length?`WHERE ${clauses.join(" AND ")}`:"";
}
function safeFilters(query:Query):Query{return Object.fromEntries(Object.entries(query).filter(([key])=>key!=="latitude"&&key!=="longitude"));}
async function log(admin:AdminContext,action:string,targetType:string,targetId:string|null,metadata:unknown,ctx:AdminRequestContext,reason?:string):Promise<void>{
  await audit.writeAuditLog({adminUserId:admin.adminUser.id,action,targetType,targetId,metadata,reason,...ctx});
}

function invalidAdminTransition(message:string):AppError {
  return new AppError("together_turn_invalid_transition",message,409);
}

async function removePartnerClaim(
  client:{query:(text:string,values?:unknown[])=>Promise<unknown>},
  id:string,
  drawSessionId:string,
  partnerUserId:string,
  transition:string,
):Promise<void>{
  await client.query("DELETE FROM together_events WHERE session_id=$1 AND from_user_id=$2",[drawSessionId,partnerUserId]);
  await client.query("DELETE FROM together_session_members WHERE session_id=$1 AND user_id=$2",[drawSessionId,partnerUserId]);
  await client.query("UPDATE together_turn_based_participants SET active=false,completed_at=COALESCE(completed_at,now()) WHERE moment_id=$1 AND user_id=$2",[id,partnerUserId]);
  await client.query(`UPDATE together_turn_based_moments SET status='waiting_for_partner',partner_user_id=NULL,
    current_turn_user_id=NULL,partner_claimed_at=NULL,claim_expires_at=NULL,turn_expires_at=NULL,
    last_transition=$2,last_transition_at=now(),updated_at=now() WHERE id=$1`,[id,transition]);
}

function withSafeActions(row:Record<string,unknown>):Record<string,unknown>{
  const status=String(row.status);
  const stage=String(row.stage);
  const actions:string[]=[];
  if(status==="partner_turn") actions.push("release_claim");
  if(stage==="draw"&&["waiting_for_partner","partner_turn"].includes(status)) actions.push("return_to_pool");
  if(!["completed","expired","cancelled","blocked","reported"].includes(status)) actions.push("cancel_moment","expire_moment");
  if(["completed","expired","cancelled"].includes(status)) actions.push("retry_cleanup");
  return {...row,safeActions:actions};
}
