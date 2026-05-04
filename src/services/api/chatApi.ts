import { request } from "@/services/api/apiClient";
import type {
  InboxResponse,
  MessageDto,
  MessagesResponse,
  ThreadDto,
} from "@/services/api/types";

export type ThreadSourceInput = {
  type: string;
  sourceId: string;
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

export function openDirectThread(
  peerUserId: string,
  source?: ThreadSourceInput
): Promise<ThreadDto> {
  return request<ThreadDto>("POST", "/threads/direct", {
    peerUserId,
    ...(source ? { source } : {}),
  });
}

export function listInbox(
  limit = 30,
  cursor?: string
): Promise<InboxResponse> {
  return request<InboxResponse>(
    "GET",
    `/inbox${buildQuery({ limit, cursor })}`
  );
}

export function listMessages(
  threadId: string,
  limit = 50
): Promise<MessagesResponse> {
  return request<MessagesResponse>(
    "GET",
    `/threads/${encodeURIComponent(threadId)}/messages${buildQuery({ limit })}`
  );
}

export function sendMessage(
  threadId: string,
  clientMessageId: string,
  text: string
): Promise<MessageDto> {
  return request<MessageDto>(
    "POST",
    `/threads/${encodeURIComponent(threadId)}/messages`,
    {
      clientMessageId,
      text,
    }
  );
}

export async function markRead(
  threadId: string,
  readThroughMessageId?: string
): Promise<{ ok: true }> {
  await request<{ ok?: boolean } | undefined>(
    "POST",
    `/threads/${encodeURIComponent(threadId)}/read`,
    readThroughMessageId ? { readThroughMessageId } : {}
  );

  return { ok: true };
}
