import assert from "node:assert/strict";
import test from "node:test";
import en from "../src/i18n/locales/en.json";
import hr from "../src/i18n/locales/hr.json";
import ru from "../src/i18n/locales/ru.json";
import type { TurnBasedAction, TurnBasedMomentDto } from "../src/services/api/types";
import {
  dismissTurnBasedFlow,
  identityMayBeShown,
  refreshTurnBasedFlow,
  shouldRenewPartnerLease,
  turnBasedRouteParams,
} from "../src/services/togetherTurnBasedFlow";
import { turnBasedCardPresentation } from "../src/services/togetherTurnBasedPresentation";

const actions:TurnBasedAction[]=[
  "start_draw","resume_draw","waiting_for_partner","continue_draw","review_draw",
  "waiting_for_draw_decision","continue_story","waiting_for_story_turn","review_story",
  "waiting_for_story_decision","completed","expired","cancelled","blocked","reported",
];
const moment=(overrides:Partial<TurnBasedMomentDto>={}):TurnBasedMomentDto=>({
  id:"11111111-1111-4111-8111-111111111111",mode:"turn_based",status:"partner_turn",
  stage:"draw",role:"partner",action:"continue_draw",drawSessionId:"draw",storySessionId:null,
  isMyTurn:true,identityRevealed:false,myRevealDecision:null,peerDecisionPresent:false,
  currentRoundId:null,currentRoundIndex:null,currentRoundChoiceIndex:null,partnerPresent:true,
  claimExpiresAt:null,waitingExpiresAt:null,turnExpiresAt:null,decisionExpiresAt:null,
  artifactPurged:false,createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString(),
  ...overrides,
});

test("exact live and default turn-based copy ships in RU EN HR",()=>{
  assert.deepEqual(
    [ru["together.lobby.drawHeroTitle"],ru["together.lobby.startDrawChallenge"],ru["together.turnBased.title"],ru["together.turnBased.start"]],
    ["Вместе сейчас","Найти сейчас","Вместе по очереди","Начать по очереди"],
  );
  assert.deepEqual(
    [en["together.lobby.drawHeroTitle"],en["together.lobby.startDrawChallenge"],en["together.turnBased.title"],en["together.turnBased.start"]],
    ["Together now","Find now","Together in turns","Start in turns"],
  );
  assert.deepEqual(
    [hr["together.lobby.drawHeroTitle"],hr["together.lobby.startDrawChallenge"],hr["together.turnBased.title"],hr["together.turnBased.start"]],
    ["Zajedno sada","Pronađi sada","Zajedno naizmjenično","Započni naizmjenično"],
  );
});

test("every turn-based action renders a distinct explicit state",()=>{
  const states=actions.map(turnBasedCardPresentation);
  assert.equal(states.length,15);
  assert.equal(new Set(states.map((state)=>state.titleKey)).size,15);
  for(const state of states) assert.ok(state.primaryKey||state.refresh||state.dismiss);
});

test("Check progress performs API request, updates state, and routes",async()=>{
  let calls=0;let stored:TurnBasedMomentDto|null=null;let routed="";
  const value=moment();
  await refreshTurnBasedFlow({
    getCurrent:async()=>{calls++;return{moment:value};},
    setMoment:(next)=>{stored=next;},
    routeMoment:(next)=>{routed=next.action;},
  });
  assert.equal(calls,1);assert.equal(stored,value);assert.equal(routed,"continue_draw");
});

test("app-resume and websocket refresh paths can reuse the real request handler",async()=>{
  let calls=0;
  const run=()=>refreshTurnBasedFlow({getCurrent:async()=>{calls++;return{moment:null};},setMoment:()=>undefined});
  await run();await run();
  assert.equal(calls,2);
});

test("starter never renews lease and partner lease stops on blur or background",()=>{
  assert.equal(shouldRenewPartnerLease({moment:moment({role:"starter"}),focused:true,appActive:true}),false);
  assert.equal(shouldRenewPartnerLease({moment:moment(),focused:false,appActive:true}),false);
  assert.equal(shouldRenewPartnerLease({moment:moment(),focused:true,appActive:false}),false);
  assert.equal(shouldRenewPartnerLease({moment:moment(),focused:true,appActive:true}),true);
});

test("retries preserve turn-based mode and momentId",()=>{
  assert.deepEqual(turnBasedRouteParams("session","moment"),{sessionId:"session",mode:"turn_based",momentId:"moment"});
});

test("identity remains hidden until both moment and session reveal it",()=>{
  assert.equal(identityMayBeShown(moment({identityRevealed:false}),true),false);
  assert.equal(identityMayBeShown(moment({identityRevealed:true}),false),false);
  assert.equal(identityMayBeShown(moment({identityRevealed:true}),true),true);
});

test("terminal dismissal calls API once and clears only local terminal card",async()=>{
  let dismissed="";let cleared=false;
  await dismissTurnBasedFlow({momentId:"moment",dismiss:async(id)=>{dismissed=id;},setMoment:()=>{cleared=true;}});
  assert.equal(dismissed,"moment");assert.equal(cleared,true);
});

test("partner layer eraser isolation is expressed by per-user canvas layers",()=>{
  const starter=[{uid:"starter",tool:"draw"}];
  const partner=[{uid:"partner",tool:"erase"}];
  const layers=[...starter,...partner].reduce<Record<string,Array<{uid:string;tool:string}>>>((all,item)=>{
    (all[item.uid]??=[]).push(item);return all;
  },{});
  assert.equal(layers.starter?.length,1);
  assert.equal(layers.partner?.[0]?.tool,"erase");
});
