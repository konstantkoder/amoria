import type { StorySparksPackDto } from "./story-sparks";

export const TURN_BASED_ACTIVE_STATUSES = [
  "starter_turn",
  "waiting_for_partner",
  "partner_turn",
  "awaiting_draw_reveal",
  "story_turn",
  "awaiting_story_reveal",
] as const;
export const TURN_BASED_PROBLEM_CODES = [
  "waiting_too_long",
  "claim_expired",
  "claim_stuck",
  "claim_conflict",
  "missing_moment",
  "missing_draw_session",
  "missing_story_session",
  "missing_participant",
  "duplicate_active_user",
  "turn_out_of_order",
  "turn_submission_failed",
  "story_continuation_missing",
  "story_round_stalled",
  "reveal_stalled",
  "state_mismatch",
  "blocked_pair",
  "reported_pair",
  "cleanup_failed",
  "orphan_event",
  "client_error_linked",
] as const;
export type TurnBasedProblemCode = (typeof TURN_BASED_PROBLEM_CODES)[number];

export type TurnBasedStatus =
  | (typeof TURN_BASED_ACTIVE_STATUSES)[number]
  | "completed"
  | "expired"
  | "cancelled"
  | "blocked"
  | "reported";
export type TurnBasedStage = "draw" | "story" | "done";
export type TurnBasedAction =
  | "start_draw"
  | "resume_draw"
  | "waiting_for_partner"
  | "continue_draw"
  | "review_draw"
  | "waiting_for_draw_decision"
  | "continue_story"
  | "waiting_for_story_turn"
  | "review_story"
  | "waiting_for_story_decision"
  | "completed"
  | "expired"
  | "cancelled"
  | "blocked"
  | "reported";

export type TurnBasedStartBody = {
  location: { latitude: number; longitude: number; radiusKm: 5 | 25 | 100 | 250 | null };
  preferredAgeRange?: { min: number; max: number | null };
  clientRequestId: string;
};
export type TurnBasedActionBody = { clientActionId: string; reason?: string };

export type TurnBasedMomentDto = {
  id: string;
  mode: "turn_based";
  status: TurnBasedStatus;
  stage: TurnBasedStage;
  role: "starter" | "partner";
  action: TurnBasedAction;
  drawSessionId: string;
  storySessionId: string | null;
  currentTurnUserId: string | null;
  isMyTurn: boolean;
  currentRoundId: "place" | "detail" | "twist" | "ending" | null;
  currentRoundIndex: number | null;
  currentRoundChoiceIndex: number | null;
  partnerPresent: boolean;
  claimExpiresAt: string | null;
  waitingExpiresAt: string | null;
  turnExpiresAt: string | null;
  decisionExpiresAt: string | null;
  artifactPurged: boolean;
  createdAt: string;
  updatedAt: string;
  storyPack?: StorySparksPackDto;
};
export type TurnBasedMomentResponse = { moment: TurnBasedMomentDto | null };
