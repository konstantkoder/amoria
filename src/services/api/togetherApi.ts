import { request } from "@/services/api/apiClient";
import type {
  TogetherActivity,
  TogetherEventType,
  TogetherPreferredAgeRangeInput,
  TogetherQueueCancelInput,
  TogetherQueueLocationInput,
  TogetherQueueResponse,
  TogetherRevealDecision,
  TogetherRevealResponse,
  TogetherSessionEventsResponse,
  TogetherSessionResponse,
  TurnBasedMomentResponse,
} from "@/services/api/types";

export type { TogetherEventType } from "@/services/api/types";

export type TogetherEventInput = {
  clientEventId: string;
  type: TogetherEventType;
  payload: unknown;
};

export function joinQueue(
  activity: TogetherActivity = "draw",
  location: TogetherQueueLocationInput,
  preferredAgeRange?: TogetherPreferredAgeRangeInput
): Promise<TogetherQueueResponse> {
  return request<TogetherQueueResponse>("POST", "/together/queue", {
    activity,
    location,
    ...(preferredAgeRange ? { preferredAgeRange } : {}),
  });
}

export function getQueue(id: string): Promise<TogetherQueueResponse> {
  return request<TogetherQueueResponse>(
    "GET",
    `/together/queue/${encodeURIComponent(id)}`
  );
}

export function cancelQueue(
  id: string,
  input: TogetherQueueCancelInput
): Promise<TogetherQueueResponse> {
  return request<TogetherQueueResponse>(
    "DELETE",
    `/together/queue/${encodeURIComponent(id)}`,
    input
  );
}

export function getSession(id: string): Promise<TogetherSessionResponse> {
  return request<TogetherSessionResponse>(
    "GET",
    `/together/sessions/${encodeURIComponent(id)}`
  );
}

export function sendEvent(
  sessionId: string,
  payload: TogetherEventInput
): Promise<{ ok: true; created: boolean }> {
  return request<{ ok: true; created: boolean }>(
    "POST",
    `/together/sessions/${encodeURIComponent(sessionId)}/events`,
    payload
  );
}

export async function getSessionEvents(
  sessionId: string
): Promise<TogetherSessionEventsResponse> {
  const response = await request<Partial<TogetherSessionEventsResponse>>(
    "GET",
    `/together/sessions/${encodeURIComponent(sessionId)}/events`
  );

  return {
    items: response.items ?? [],
    nextCursor: null,
  };
}

export function finish(sessionId: string): Promise<TogetherSessionResponse> {
  return request<TogetherSessionResponse>(
    "POST",
    `/together/sessions/${encodeURIComponent(sessionId)}/finish`
  );
}

export function leave(sessionId: string): Promise<TogetherSessionResponse> {
  return request<TogetherSessionResponse>(
    "POST",
    `/together/sessions/${encodeURIComponent(sessionId)}/leave`
  );
}

export function heartbeat(sessionId: string): Promise<TogetherSessionResponse> {
  return request<TogetherSessionResponse>(
    "POST",
    `/together/sessions/${encodeURIComponent(sessionId)}/heartbeat`
  );
}

export function reveal(
  sessionId: string,
  decision: TogetherRevealDecision
): Promise<TogetherRevealResponse> {
  return request<TogetherRevealResponse>(
    "POST",
    `/together/sessions/${encodeURIComponent(sessionId)}/reveal`,
    { decision }
  );
}

export function startTurnBased(
  location: TogetherQueueLocationInput,
  preferredAgeRange: TogetherPreferredAgeRangeInput,
  clientRequestId: string
): Promise<TurnBasedMomentResponse> {
  return request<TurnBasedMomentResponse>("POST", "/together/turn-based/start", {
    location, preferredAgeRange, clientRequestId,
  });
}
export function getCurrentTurnBased(): Promise<TurnBasedMomentResponse> {
  return request<TurnBasedMomentResponse>("GET", "/together/turn-based/current");
}
export function getTurnBasedMoment(id: string): Promise<TurnBasedMomentResponse> {
  return request<TurnBasedMomentResponse>("GET", `/together/turn-based/moments/${encodeURIComponent(id)}`);
}
export function submitTurnBasedDraw(id: string, clientActionId: string): Promise<TurnBasedMomentResponse> {
  return request<TurnBasedMomentResponse>("POST", `/together/turn-based/moments/${encodeURIComponent(id)}/submit-draw`, { clientActionId });
}
export function renewTurnBasedLease(id: string): Promise<TurnBasedMomentResponse> {
  return request<TurnBasedMomentResponse>("POST", `/together/turn-based/moments/${encodeURIComponent(id)}/lease`);
}
export function cancelTurnBased(id: string, clientActionId: string, reason?: string): Promise<TurnBasedMomentResponse> {
  return request<TurnBasedMomentResponse>("POST", `/together/turn-based/moments/${encodeURIComponent(id)}/cancel`, {
    clientActionId, ...(reason ? { reason } : {}),
  });
}
export function dismissTurnBased(id: string): Promise<TurnBasedMomentResponse> {
  return request<TurnBasedMomentResponse>("POST", `/together/turn-based/moments/${encodeURIComponent(id)}/dismiss`);
}
