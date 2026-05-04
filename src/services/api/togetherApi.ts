import { request } from "@/services/api/apiClient";
import type {
  TogetherHistoryResponse,
  TogetherQueueResponse,
  TogetherRevealResponse,
  TogetherSessionResponse,
} from "@/services/api/types";

export type TogetherEventType = "stroke_batch" | "palette" | "system";
export type TogetherRevealDecision = "open" | "skip";

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

export function joinQueue(activity = "draw"): Promise<TogetherQueueResponse> {
  return request<TogetherQueueResponse>("POST", "/together/queue", { activity });
}

export function getQueue(id: string): Promise<TogetherQueueResponse> {
  return request<TogetherQueueResponse>(
    "GET",
    `/together/queue/${encodeURIComponent(id)}`
  );
}

export function cancelQueue(id: string): Promise<TogetherQueueResponse> {
  return request<TogetherQueueResponse>(
    "DELETE",
    `/together/queue/${encodeURIComponent(id)}`
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

export function finish(sessionId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    "POST",
    `/together/sessions/${encodeURIComponent(sessionId)}/finish`
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
