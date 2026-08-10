import type { JsonValue } from "../db/schema";

export type ChatSourceType = "announcement" | "nearby" | "together";

export type ThreadPeerDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type LastMessageDto = {
  id: string;
  text: string;
  createdAt: string;
};

export type ThreadDto = {
  id: string;
  type: string;
  peer: ThreadPeerDto;
  lastMessage: LastMessageDto | null;
  unreadCount: number;
  source: {
    type: ChatSourceType;
    sourceId: string;
  } | null;
  contexts: ThreadContextDto[];
};

export type ThreadContextDto = {
  id: string;
  sourceType: ChatSourceType;
  sourceId: string;
  metadata: JsonValue | null;
  createdAt: string;
};

export type MessageDto = {
  id: string;
  threadId: string;
  fromUserId: string;
  text: string;
  createdAt: string;
  clientMessageId: string;
  moderationState?: "visible" | "held" | "needs_review" | "restricted" | "removed";
  automationStatus?: "completed" | "failed" | "not_configured" | "not_required";
};

export type OpenDirectThreadBody = {
  peerUserId: string;
  source?: {
    type: ChatSourceType;
    sourceId: string;
    metadata?: JsonValue | null;
  };
};

export type InboxQuery = {
  limit: number;
};

export type MessagesQuery = {
  limit: number;
};

export type SendMessageBody = {
  clientMessageId: string;
  text: string;
};

export type MarkThreadReadBody = {
  readThroughMessageId?: string;
};

export type ThreadResponse = {
  thread: ThreadDto;
};

export type InboxResponse = {
  items: ThreadDto[];
  nextCursor: null;
};

export type MessagesResponse = {
  items: MessageDto[];
};

export type SendMessageResponse = {
  message: MessageDto;
};

export type OkResponse = {
  ok: true;
};
