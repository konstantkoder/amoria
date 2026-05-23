import type { JsonValue } from "../db/schema";
import type {
  StorySparksArtifactDto,
  StorySparksPackDto,
} from "./story-sparks";

export type TogetherActivity = "draw" | "story_sparks";
export type TogetherQueueStatus = "waiting" | "matched" | "cancelled" | "expired";
export type TogetherSessionStatus = "active" | "finished" | "abandoned" | "cancelled";
export type TogetherEventType = "stroke_batch" | "story_choice" | "system";
export type TogetherRevealDecision = "open" | "skip" | "continue_story";
export type TogetherRevealOutcome =
  | "pending"
  | "open_open"
  | "open_skip"
  | "skip_skip"
  | "continue_story"
  | "mixed_intent"
  | "blocked";

export type TogetherQueueLocationBody = {
  latitude?: number | null;
  longitude?: number | null;
  radiusKm: 5 | 25 | 100 | 250 | null;
};

export type TogetherQueueBody = {
  activity: TogetherActivity;
  location?: TogetherQueueLocationBody;
};

export type TogetherQueueEntryDto = {
  id: string;
  status: TogetherQueueStatus;
  sessionId?: string;
  expiresAt: string;
};

export type TogetherQueueResponse = {
  entry: TogetherQueueEntryDto;
};

export type TogetherParticipantDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TogetherSessionDto = {
  id: string;
  activity: TogetherActivity;
  status: TogetherSessionStatus;
  promptText: string;
  promptKey: string | null;
  createdAt: string;
  endedAt: string | null;
  endedReason: string | null;
  deadlineAt: string | null;
  sourceSessionId: string | null;
  storyPack?: StorySparksPackDto;
};

export type TogetherSessionResponse = {
  session: TogetherSessionDto;
  participants: TogetherParticipantDto[];
  stateVersion: number;
  revealState: TogetherRevealStateDto;
};

export type TogetherEventBody = {
  clientEventId: string;
  type: TogetherEventType;
  payload: JsonValue;
};

export type TogetherEventDto = {
  id: string;
  sessionId: string;
  fromUserId: string;
  clientEventId: string;
  type: TogetherEventType;
  payload: JsonValue;
  createdAt: string;
};

export type TogetherEventResponse = {
  ok: true;
  created: boolean;
};

export type TogetherSessionEventsResponse = {
  items: TogetherEventDto[];
  nextCursor: null;
};

export type TogetherSessionUpdateReason =
  | "completed"
  | "participant_left"
  | "partner_disconnected";

export type TogetherSessionUpdateResult = {
  response: TogetherSessionResponse;
  changed: boolean;
  reason?: TogetherSessionUpdateReason;
  actorUserId?: string;
};

export type TogetherRevealBody = {
  decision: TogetherRevealDecision;
};

export type TogetherRevealStateDto = {
  myDecision: TogetherRevealDecision | null;
  outcome: TogetherRevealOutcome;
  threadId: string | null;
  canOpenChat: boolean;
  peerDecisionKnown: boolean;
  nextSessionId: string | null;
  nextActivity: TogetherActivity | null;
};

export type TogetherRevealResponse = {
  outcome: TogetherRevealOutcome;
  threadId?: string;
  nextSessionId?: string;
  nextActivity?: TogetherActivity;
  revealState: TogetherRevealStateDto;
};

export type TogetherRevealBroadcastState = {
  userId: string;
  revealState: TogetherRevealStateDto;
};

export type TogetherRevealResult = {
  response: TogetherRevealResponse;
  broadcasts: TogetherRevealBroadcastState[];
};

export type TogetherHistoryQuery = {
  limit: number;
};

export type TogetherHistoryItemDto = {
  sessionId: string;
  activity: TogetherActivity;
  status: TogetherSessionStatus;
  promptText: string;
  promptKey: string | null;
  peer: TogetherParticipantDto;
  outcome: TogetherRevealOutcome;
  myDecision: TogetherRevealDecision | null;
  threadId: string | null;
  canOpenChat: boolean;
  peerDecisionKnown: boolean;
  nextSessionId: string | null;
  nextActivity: TogetherActivity | null;
  createdAt: string;
  endedAt: string | null;
  endedReason: string | null;
  storyArtifact?: StorySparksArtifactDto;
};

export type TogetherHistoryResponse = {
  items: TogetherHistoryItemDto[];
};

export type OkResponse = {
  ok: true;
};
