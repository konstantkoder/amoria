import { request } from "@/services/api/apiClient";
import type {
  TogetherActivity,
  TogetherEventType,
  TogetherHistoryResponse,
  TogetherQueueCancelInput,
  TogetherQueueLocationInput,
  TogetherQueueResponse,
  TogetherRevealDecision,
  TogetherRevealResponse,
  TogetherSessionEventsResponse,
  TogetherSessionResponse,
} from "@/services/api/types";

export type { TogetherEventType } from "@/services/api/types";

export type TogetherEventInput = {
  clientEventId: string;
  type: TogetherEventType;
  payload: unknown;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }

  const value = query.toString();
  return value ? `?${value}` : "";
}

export function joinQueue(
  activity: TogetherActivity = "draw",
  location: TogetherQueueLocationInput
): Promise<TogetherQueueResponse> {
  return request<TogetherQueueResponse>("POST", "/together/queue", {
    activity,
    location,
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

export async function history(limit = 30): Promise<TogetherHistoryResponse> {
  const response = await request<Partial<TogetherHistoryResponse>>(
    "GET",
    `/together/history${buildQuery({ limit })}`
  );

  return {
    items: response.items ?? [],
    nextCursor: null,
  };
}
