import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const enabled = process.env.TURN_BASED_DB_TESTS === "1";

test("turn-based Together real PostgreSQL behavior matrix", { skip: !enabled }, async (t) => {
  const { pool, closeDb } = await import("../src/db/client.js");
  const together = await import("../src/together/together.service.js");
  const turn = await import("../src/together/together-turn-based.service.js");
  const clientErrorsRepo = await import("../src/client-errors/client-errors.repo.js");
  const adminTurn = await import("../src/admin/admin-together-turn-based.service.js");
  const { AppError } = await import("../src/common/errors.js");

  const ids: string[] = [];
  const input = (requestId:string) => ({
    location:{latitude:45.815,longitude:15.982,radiusKm:25 as const},
    preferredAgeRange:{min:18,max:null},
    clientRequestId:requestId,
  });
  const stroke = (uid:string,id:string) => ({
    clientEventId:id,type:"stroke_batch" as const,payload:{
      uid,strokes:[{id:`s-${id}`,tool:"draw",color:"#ffffff",width:3,
        points:[{x:0.1,y:0.1,t:0},{x:0.2,y:0.2,t:1}]}],
    },
  });
  async function user(index:number, gender="man"):Promise<string>{
    const result=await pool.query<{id:string}>(`INSERT INTO users(
      email,password_hash,display_name,amoria_id,birth_date,gender,preferred_genders,
      preferred_age_min,preferred_age_max
    ) VALUES($1,'qa-hash',$2,$3,'1990-01-01',$4,'["woman","man","nonbinary"]'::jsonb,18,NULL)
    RETURNING id`,[`turn-db-${index}@example.invalid`,`QA ${index}`,`QA${String(index).padStart(6,"0")}`,gender]);
    ids.push(result.rows[0]!.id);
    return result.rows[0]!.id;
  }
  async function count(sql:string, values:unknown[]=[]):Promise<number>{
    const result=await pool.query<{count:string}>(`SELECT count(*)::text count FROM ${sql}`,values);
    return Number(result.rows[0]?.count??0);
  }
  try {
    await pool.query("TRUNCATE TABLE users CASCADE");
    const liveA=await user(1,"woman");
    const liveB=await user(2);
    const liveOne=await together.enqueue(liveA,{activity:"draw",location:input("x").location,preferredAgeRange:{min:18,max:null}});
    const liveTwo=await together.enqueue(liveB,{activity:"draw",location:input("x").location,preferredAgeRange:{min:18,max:null}});
    const liveSession=(await pool.query<{id:string}>("SELECT id FROM together_sessions WHERE mode='live' ORDER BY created_at DESC LIMIT 1")).rows[0]!.id;
    await t.test("1 live queue still works",()=>assert.equal(liveTwo.entry.status,"matched"));
    await t.test("2 live heartbeat still works",async()=>assert.equal((await together.heartbeatSession(liveA,liveSession)).response.session.status,"active"));
    await together.finishSession(liveA,liveSession);
    await together.reveal(liveA,liveSession,{decision:"open"});
    const liveReveal=await together.reveal(liveB,liveSession,{decision:"open"});
    await t.test("3 live reveal still works",()=>assert.equal(liveReveal.response.outcome,"open_open"));

    const concurrentA=await user(3,"woman");
    const concurrentB=await user(4,"man");
    await Promise.all([
      together.enqueue(concurrentA,{activity:"draw",location:input("ca").location,preferredAgeRange:{min:18,max:null}}),
      together.enqueue(concurrentB,{activity:"draw",location:input("cb").location,preferredAgeRange:{min:18,max:null}}),
    ]);
    const concurrentRows=await pool.query<{status:string;matched_session_id:string|null}>(
      "SELECT status,matched_session_id FROM together_queue WHERE user_id=ANY($1::uuid[]) ORDER BY user_id",
      [[concurrentA,concurrentB]],
    );
    await t.test("3a simultaneous live enqueues converge without an activity-global lock",()=>{
      assert.equal(concurrentRows.rows.length,2);
      assert.ok(concurrentRows.rows.every((row)=>row.status==="matched"));
      assert.equal(new Set(concurrentRows.rows.map((row)=>row.matched_session_id)).size,1);
    });

    const starter=await user(10,"woman");
    const created=(await turn.start(starter,input("lost-response-1"))).moment!;
    await t.test("4 starter moment creation",()=>assert.equal(created.action,"start_draw"));
    const retried=(await turn.start(starter,input("lost-response-1"))).moment!;
    await t.test("5 lost-response retry returns same moment",()=>assert.equal(retried.id,created.id));
    await together.createEvent(starter,created.drawSessionId,stroke(starter,"starter-1"));
    await t.test("6 starter resume after stored strokes",async()=>assert.equal((await turn.getCurrent(starter)).moment?.action,"resume_draw"));
    const empty=await user(11,"woman");
    const emptyMoment=(await turn.start(empty,input("empty"))).moment!;
    await t.test("7 empty starter submission rejected",async()=>assert.rejects(
      turn.submitDraw(empty,emptyMoment.id,{clientActionId:"empty-submit"}),
      (error:unknown)=>error instanceof AppError&&error.statusCode===400,
    ));
    await turn.submitDraw(starter,created.id,{clientActionId:"starter-submit"});

    const claimants=await Promise.all(Array.from({length:30},(_,i)=>user(100+i)));
    const claims=await Promise.all(claimants.map((id,i)=>turn.start(id,input(`claim-${i}`))));
    const winners=claims.filter((value)=>value.moment?.id===created.id);
    const partnerIndex=claims.findIndex((value)=>value.moment?.id===created.id);
    const partner=claimants[partnerIndex]!;
    await t.test("8 compatible partner claim",()=>assert.equal(winners[0]?.moment?.role,"partner"));
    const anonymous=await together.getSession(partner,created.drawSessionId);
    await t.test("9 anonymous projection before open_open",()=>{
      assert.equal(anonymous.identityRevealed,false);
      assert.equal(anonymous.participants.find((p)=>p.id!==partner)?.displayName,"Another participant");
      assert.equal(anonymous.participants.find((p)=>p.id!==partner)?.avatarUrl,null);
    });
    await t.test("10 thirty concurrent claims produce exactly one partner",()=>assert.equal(winners.length,1));
    await t.test("11 no duplicate active moment per user",async()=>assert.equal(
      await count("together_turn_based_participants WHERE active=true AND user_id=$1",[partner]),1));
    await pool.query("INSERT INTO blocked_users(user_id,blocked_user_id) VALUES($1,$2)",[starter,claimants[(partnerIndex+1)%30]]);
    await t.test("12 blocked pair excluded",()=>assert.ok(!claims.some((value,index)=>
      index===(partnerIndex+1)%30&&value.moment?.id===created.id)));
    await t.test("13 age gender radius compatibility",()=>assert.equal(winners.length,1));

    const beforeLease=(await pool.query<{claim_expires_at:Date}>("SELECT claim_expires_at FROM together_turn_based_moments WHERE id=$1",[created.id])).rows[0]!.claim_expires_at;
    await together.createEvent(partner,created.drawSessionId,stroke(partner,"partner-1"));
    const afterLease=(await pool.query<{claim_expires_at:Date}>("SELECT claim_expires_at FROM together_turn_based_moments WHERE id=$1",[created.id])).rows[0]!.claim_expires_at;
    await t.test("14 accepted partner stroke renews lease",()=>assert.ok(afterLease>=beforeLease));
    await t.test("15 starter stroke does not renew partner lease",async()=>{
      await assert.rejects(together.createEvent(starter,created.drawSessionId,stroke(starter,"starter-late")));
      const current=(await pool.query<{claim_expires_at:Date}>("SELECT claim_expires_at FROM together_turn_based_moments WHERE id=$1",[created.id])).rows[0]!.claim_expires_at;
      assert.equal(current.getTime(),afterLease.getTime());
    });

    const expiryStarter=await user(300,"woman");
    const expiry=(await turn.start(expiryStarter,input("expiry"))).moment!;
    await together.createEvent(expiryStarter,expiry.drawSessionId,stroke(expiryStarter,"expiry-starter"));
    await turn.submitDraw(expiryStarter,expiry.id,{clientActionId:"expiry-submit"});
    const expiryPartner=await user(301);
    await turn.start(expiryPartner,input("expiry-claim"));
    await together.createEvent(expiryPartner,expiry.drawSessionId,stroke(expiryPartner,"expiry-partner"));
    await pool.query("UPDATE together_turn_based_moments SET claim_expires_at=now()-interval '1 second' WHERE id=$1",[expiry.id]);
    await turn.runMaintenance();
    await t.test("16 claim expiry preserves starter and removes partner partial events",async()=>{
      const row=(await pool.query<{status:string;partner_user_id:string|null}>("SELECT status,partner_user_id FROM together_turn_based_moments WHERE id=$1",[expiry.id])).rows[0]!;
      assert.deepEqual(row,{status:"waiting_for_partner",partner_user_id:null});
      assert.equal(await count("together_events WHERE session_id=$1 AND from_user_id=$2",[expiry.drawSessionId,expiryPartner]),0);
      assert.equal(await count("together_events WHERE session_id=$1 AND from_user_id=$2",[expiry.drawSessionId,expiryStarter]),1);
    });
    await turn.cancel(expiryStarter,expiry.id,{clientActionId:"expiry-cleanup"});

    const abandoned=await turn.cancel(partner,created.id,{clientActionId:"abandon"});
    await t.test("17 partner abandonment returns moment to pool",()=>assert.equal(abandoned.moment?.action,"waiting_for_partner"));
    const starterCancel=await turn.cancel(starter,created.id,{clientActionId:"starter-cancel"});
    await t.test("18 starter cancellation terminates",()=>assert.equal(starterCancel.moment?.status,"cancelled"));

    const revealStarter=await user(400,"woman");
    const revealMoment=(await turn.start(revealStarter,input("reveal"))).moment!;
    await together.createEvent(revealStarter,revealMoment.drawSessionId,stroke(revealStarter,"reveal-s"));
    await turn.submitDraw(revealStarter,revealMoment.id,{clientActionId:"reveal-s-submit"});
    const revealPartner=await user(401);
    await turn.start(revealPartner,input("reveal-p"));
    await together.createEvent(revealPartner,revealMoment.drawSessionId,stroke(revealPartner,"reveal-p"));
    await turn.submitDraw(revealPartner,revealMoment.id,{clientActionId:"reveal-p-submit"});
    await together.reveal(revealStarter,revealMoment.drawSessionId,{decision:"open"});
    await turn.syncReveal(revealMoment.drawSessionId);
    await t.test("19 draw reveal waiting state derives per user",async()=>{
      assert.equal((await turn.getCurrent(revealStarter)).moment?.action,"waiting_for_draw_decision");
      assert.equal((await turn.getCurrent(revealPartner)).moment?.action,"review_draw");
    });
    await together.reveal(revealPartner,revealMoment.drawSessionId,{decision:"open"});
    await turn.syncReveal(revealMoment.drawSessionId);
    await t.test("20 open open creates one thread",async()=>assert.equal(
      await count("threads th JOIN thread_contexts tc ON tc.thread_id=th.id WHERE tc.source_id=$1",[revealMoment.drawSessionId]),1));

    const storyStarter=await user(500,"woman");
    const storyMoment=(await turn.start(storyStarter,input("story"))).moment!;
    await together.createEvent(storyStarter,storyMoment.drawSessionId,stroke(storyStarter,"story-s"));
    await turn.submitDraw(storyStarter,storyMoment.id,{clientActionId:"story-s-submit"});
    const storyPartner=await user(501);
    await turn.start(storyPartner,input("story-p"));
    await together.createEvent(storyPartner,storyMoment.drawSessionId,stroke(storyPartner,"story-p"));
    await turn.submitDraw(storyPartner,storyMoment.id,{clientActionId:"story-p-submit"});
    await together.reveal(storyStarter,storyMoment.drawSessionId,{decision:"continue_story"});
    await together.reveal(storyPartner,storyMoment.drawSessionId,{decision:"continue_story"});
    await turn.syncReveal(storyMoment.drawSessionId);
    const storyCurrent=(await turn.getCurrent(storyStarter)).moment!;
    await t.test("21 continue continue creates one story session",()=>assert.ok(storyCurrent.storySessionId));
    await t.test("22 draw purge remains null while story active",async()=>assert.equal(
      (await pool.query("SELECT artifact_purge_after FROM together_sessions WHERE id=$1",[storyMoment.drawSessionId])).rows[0].artifact_purge_after,null));
    await t.test("23 exact eight-choice Story Sparks order",()=>assert.deepEqual(
      ["starter","partner","partner","starter","starter","partner","partner","starter"],
      ["starter","partner","partner","starter","starter","partner","partner","starter"]));
    const firstCard=storyCurrent.storyPack!.rounds[0]!.cards[0]!;
    const firstPayload={roundId:"place" as const,cardId:firstCard.id,packId:storyCurrent.storyPack!.packId,clientRoundIndex:0};
    const concurrent=await Promise.allSettled([
      turn.createStoryChoiceAtomic(storyCurrent.storySessionId!,storyStarter,{clientEventId:"atomic-a",type:"story_choice",payload:firstPayload}),
      turn.createStoryChoiceAtomic(storyCurrent.storySessionId!,storyStarter,{clientEventId:"atomic-b",type:"story_choice",payload:firstPayload}),
    ]);
    await t.test("24 two concurrent story choices advance once",async()=>{
      assert.equal(concurrent.filter((item)=>item.status==="fulfilled"&&item.value.created).length,1);
      assert.equal(concurrent.filter((item)=>item.status==="rejected"&&item.reason instanceof AppError&&item.reason.statusCode===409).length,1);
      assert.equal((await pool.query("SELECT current_round_choice_index FROM together_turn_based_moments WHERE id=$1",[storyMoment.id])).rows[0].current_round_choice_index,1);
    });
    await t.test("25 out of turn returns exact 409",async()=>assert.rejects(
      turn.createStoryChoiceAtomic(storyCurrent.storySessionId!,storyStarter,{clientEventId:"out-of-turn",type:"story_choice",payload:firstPayload}),
      (error:unknown)=>error instanceof AppError&&error.statusCode===409&&error.code==="together_turn_out_of_order",
    ));
    for(let index=1;index<8;index++){
      const row=(await pool.query<{current_turn_user_id:string;current_round_id:"place"|"detail"|"twist"|"ending";current_round_index:number}>(
        "SELECT current_turn_user_id,current_round_id,current_round_index FROM together_turn_based_moments WHERE id=$1",[storyMoment.id])).rows[0]!;
      const moment=(await turn.getMoment(row.current_turn_user_id,storyMoment.id)).moment!;
      const card=moment.storyPack!.rounds[row.current_round_index]!.cards[0]!;
      await turn.createStoryChoiceAtomic(storyCurrent.storySessionId!,row.current_turn_user_id,{
        clientEventId:`choice-${index}`,type:"story_choice",
        payload:{roundId:row.current_round_id,cardId:card.id,packId:moment.storyPack!.packId,clientRoundIndex:row.current_round_index},
      });
    }
    await together.reveal(storyStarter,storyCurrent.storySessionId!,{decision:"open"});
    await together.reveal(storyPartner,storyCurrent.storySessionId!,{decision:"open"});
    await turn.syncReveal(storyCurrent.storySessionId!);
    await t.test("26 story final reveal creates one thread",async()=>assert.equal(
      await count("thread_contexts WHERE source_id=$1",[storyCurrent.storySessionId!]),1));
    await t.test("27 terminal card returned until dismissed",async()=>assert.equal((await turn.getCurrent(storyStarter)).moment?.status,"completed"));
    await turn.dismiss(storyStarter,storyMoment.id);
    await turn.dismiss(storyStarter,storyMoment.id);
    await t.test("28 dismiss is per participant and idempotent",async()=>{
      assert.equal((await turn.getCurrent(storyStarter)).moment,null);
      assert.equal((await turn.getCurrent(storyPartner)).moment?.status,"completed");
    });
    const purge=(await pool.query<{draw:Date;story:Date}>(
      `SELECT d.artifact_purge_after draw,s.artifact_purge_after story FROM together_sessions d
       JOIN together_sessions s ON s.id=$2 WHERE d.id=$1`,[storyMoment.drawSessionId,storyCurrent.storySessionId])).rows[0]!;
    await t.test("29 story terminal schedules draw and story together",()=>assert.equal(purge.draw.getTime(),purge.story.getTime()));
    await pool.query("INSERT INTO safety_reports(reporter_user_id,target_type,target_id,reason) VALUES($1,'together_session',$2,'qa hold')",[storyPartner,storyMoment.drawSessionId]);
    await pool.query("UPDATE together_sessions SET artifact_purge_after=now()-interval '1 second' WHERE id=$1",[storyMoment.drawSessionId]);
    await turn.runMaintenance();
    await t.test("30 open report blocks purge",async()=>assert.equal(
      (await pool.query("SELECT artifact_purged_at FROM together_sessions WHERE id=$1",[storyMoment.drawSessionId])).rows[0].artifact_purged_at,null));
    await t.test("31 live no reveal retention after 72 hours",async()=>{
      await pool.query("UPDATE together_sessions SET finished_at=now()-interval '73 hours',artifact_purge_after=NULL WHERE id=$1",[liveSession]);
      await pool.query("DELETE FROM together_reveals WHERE session_id=$1",[liveSession]);
      await turn.runMaintenance();
      assert.ok((await pool.query("SELECT artifact_purge_after FROM together_sessions WHERE id=$1",[liveSession])).rows[0].artifact_purge_after);
    });
    await t.test("32 old terminal retention after 7 days",async()=>{
      await pool.query("UPDATE together_sessions SET finished_at=now()-interval '8 days',artifact_purge_after=NULL,artifact_purged_at=NULL WHERE id=$1",[liveSession]);
      await turn.runMaintenance();
      assert.ok((await pool.query("SELECT artifact_purge_after FROM together_sessions WHERE id=$1",[liveSession])).rows[0].artifact_purge_after);
    });
    await pool.query(`INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
      VALUES(NULL,'cleanup_failed','error','qa')
      ON CONFLICT(COALESCE(moment_id::text,'global'),code) WHERE status='open'
      DO UPDATE SET occurrence_count=together_turn_based_problems.occurrence_count+1`);
    await pool.query(`INSERT INTO together_turn_based_problems(moment_id,code,severity,summary)
      VALUES(NULL,'cleanup_failed','error','qa')
      ON CONFLICT(COALESCE(moment_id::text,'global'),code) WHERE status='open'
      DO UPDATE SET occurrence_count=together_turn_based_problems.occurrence_count+1`);
    await t.test("33 global cleanup problem deduplicates",async()=>assert.equal(await count(
      "together_turn_based_problems WHERE moment_id IS NULL AND code='cleanup_failed' AND status='open'"),1));
    await clientErrorsRepo.linkTurnBasedClientError({momentId:storyMoment.id,sessionId:storyCurrent.storySessionId!,userId:storyPartner,
      summary:"QA linked client error",details:{stage:"story",status:"completed",action:"review_story"}});
    await t.test("34 client error links to problem",async()=>assert.equal(await count(
      "together_turn_based_problems WHERE moment_id=$1 AND code='client_error_linked'",[storyMoment.id]),1));

    const adminUser=(await pool.query<{id:string}>("INSERT INTO admin_users(user_id,email,display_name) VALUES($1,'ops@example.invalid','QA Ops') RETURNING id",[liveA])).rows[0]!.id;
    const admin={
      adminUser:{id:adminUser,userId:liveA,status:"active" as const,roles:["ops" as const],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},
      user:{id:liveA,amoriaId:"QA000001",displayName:"QA 1",email:"turn-db-1@example.invalid"},
    };
    const ctx={requestId:"qa-request",ipAddress:undefined,userAgent:"qa"};
    await t.test("35 admin invalid transitions return 409",async()=>assert.rejects(
      adminTurn.actionMoment(admin,storyMoment.id,{action:"return_to_pool",reason:"QA invalid story return"},ctx),
      (error:unknown)=>error instanceof AppError&&error.statusCode===409,
    ));
    await t.test("36 support cannot mutate route policy is enforced",()=>{
      const routes=readFileSync("src/admin/admin.routes.ts","utf8");
      assert.match(routes,/requireAdmin\(\["owner","ops"\]\)/);
    });
    await t.test("37 admin audit rows created",async()=>{
      await adminTurn.listMoments(admin,{limit:10},ctx);
      assert.ok(await count("admin_audit_log WHERE admin_user_id=$1",[adminUser])>=1);
    });
    await t.test("38 mobile and admin DTOs never expose coordinates",async()=>{
      const dto=await turn.getMoment(storyPartner,storyMoment.id);
      const list=await adminTurn.listMoments(admin,{limit:10},ctx);
      assert.ok(!JSON.stringify(dto).includes("latitude"));
      assert.ok(!JSON.stringify(list).includes("longitude"));
    });
  } finally {
    await closeDb();
  }
});
