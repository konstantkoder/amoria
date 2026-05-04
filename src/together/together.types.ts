import type { JsonValue } from "../db/schema";

export type TogetherActivity = "draw";
export type TogetherQueueStatus = "waiting" | "matched" | "cancelled" | "expired";
export type TogetherSessionStatus = "active" | "finished";
export type TogetherEventType = "stroke_batch" | "palette" | "system";
export type TogetherRevealDecision = "open" | "skip";
export type TogetherRevealOutcome = "pending" | "open_open" | "open_skip" | "skip_skip";

export type TogetherQueueBody = {
  activity: TogetherActivity;
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
  createdAt: string;
};

export type TogetherSessionResponse = {
  session: TogetherSessionDto;
  participants: TogetherParticipantDto[];
  stateVersion: number;
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

export type TogetherRevealBody = {
  decision: TogetherRevealDecision;
};

export type TogetherRevealResponse = {
  outcome: TogetherRevealOutcome;
  threadId?: string;
};

export type TogetherHistoryQuery = {
  limit: number;
};

export type TogetherHistoryItemDto = {
  sessionId: string;
  activity: TogetherActivity;
  promptText: string;
  peer: TogetherParticipantDto;
  outcome: TogetherRevealOutcome;
  createdAt: string;
};

export type TogetherHistoryResponse = {
  items: TogetherHistoryItemDto[];
};

export type OkResponse = {
  ok: true;
};
