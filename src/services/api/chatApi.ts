import { request } from "@/services/api/apiClient";
import type {
  InboxResponse,
  MessageDto,
  MessageResponse,
  MessagesResponse,
  ThreadDto,
  ThreadResponse,
  ThreadSourceType,
} from "@/services/api/types";

export type ThreadSourceInput = {
  type: ThreadSourceType;
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

export async function openDirectThread(
  peerUserId: string,
  source?: ThreadSourceInput
): Promise<ThreadDto> {
  const response = await request<ThreadResponse>("POST", "/threads/direct", {
    peerUserId,
    ...(source ? { source } : {}),
  });

  if (!response?.thread) {
    throw new Error("Invalid /threads/direct response: missing thread");
  }

  return response.thread;
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

export async function sendMessage(
  threadId: string,
  clientMessageId: string,
  text: string
): Promise<MessageDto> {
  const response = await request<MessageResponse>(
    "POST",
    `/threads/${encodeURIComponent(threadId)}/messages`,
    {
      clientMessageId,
      text,
    }
  );

  if (!response?.message) {
    throw new Error("Invalid /threads/:id/messages response: missing message");
  }

  return response.message;
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
