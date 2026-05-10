import { AppError, validationError } from "../common/errors";
import type { MessageRow, ThreadContextRow, ThreadRow } from "../db/schema";
import { isBlockedEitherWay } from "../safety/safety.repo";
import * as chatRepo from "./chat.repo";
import type {
  ChatSourceType,
  InboxResponse,
  MarkThreadReadBody,
  MessageDto,
  MessagesQuery,
  MessagesResponse,
  OpenDirectThreadBody,
  SendMessageBody,
  ThreadContextDto,
  ThreadDto,
  ThreadResponse,
} from "./chat.types";

export type SendMessageResult = {
  response: {
    message: MessageDto;
  };
  threadId: string;
  participantUserIds: string[];
  created: boolean;
};

export type OpenDirectThreadResult = {
  thread: ThreadDto;
  status: "created" | "existing";
};

type ChatServiceDeps = {
  repo: typeof chatRepo;
  isBlockedEitherWay: typeof isBlockedEitherWay;
};

const defaultDeps: ChatServiceDeps = {
  repo: chatRepo,
  isBlockedEitherWay,
};

let deps: ChatServiceDeps = defaultDeps;

export function __setChatServiceDepsForTests(
  overrides: Partial<ChatServiceDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function openDirectThread(
  userId: string,
  input: OpenDirectThreadBody,
): Promise<ThreadResponse> {
  const result = await openDirectThreadWithStatus(userId, input);
  return {
    thread: result.thread,
  };
}

export async function openDirectThreadWithStatus(
  userId: string,
  input: OpenDirectThreadBody,
): Promise<OpenDirectThreadResult> {
  if (input.peerUserId === userId) {
    throw validationError("Cannot open a direct thread with yourself", {
      peerUserId: "self",
    });
  }

  const peer = await deps.repo.findUserPeerById(input.peerUserId);
  if (!peer) {
    throw new AppError("not_found", "Peer user not found", 404);
  }

  await assertNotBlockedPair(userId, input.peerUserId);

  const result = await deps.repo.findOrCreateDirectThreadBetween(userId, input.peerUserId);
  let thread = result.thread;
  if (input.source) {
    await deps.repo.addThreadContext(thread.id, input.source, userId);
    thread = await deps.repo.setThreadSourceIfEmpty(thread, input.source);
  }

  return {
    thread: await toThreadDto(thread, userId),
    status: result.created ? "created" : "existing",
  };
}

export async function getInbox(userId: string, limit: number): Promise<InboxResponse> {
  const threads = await deps.repo.listThreadsForUser(userId, limit);

  return {
    items: await Promise.all(threads.map((thread) => toThreadDto(thread, userId))),
    nextCursor: null,
  };
}

export async function getThreadMessages(
  userId: string,
  threadId: string,
  query: MessagesQuery,
): Promise<MessagesResponse> {
  await requireThreadMembership(userId, threadId);

  const messages = await deps.repo.listMessagesForThread(threadId, query.limit);
  return {
    items: messages.map(toMessageDto),
  };
}

export async function sendMessage(
  userId: string,
  threadId: string,
  input: SendMessageBody,
): Promise<SendMessageResult> {
  const thread = await requireThreadMembership(userId, threadId);
  const peer = await deps.repo.findThreadPeer(thread.id, userId);
  if (!peer) {
    throw new AppError("not_found", "Thread peer not found", 404);
  }

  await assertNotBlockedPair(userId, peer.id);

  const result = await deps.repo.createMessageIdempotent({
    threadId,
    fromUserId: userId,
    text: input.text,
    clientMessageId: input.clientMessageId,
  });
  const participantUserIds = await deps.repo.listThreadMemberUserIds(threadId);

  return {
    response: {
      message: toMessageDto(result.message),
    },
    threadId,
    participantUserIds,
    created: result.created,
  };
}

export async function markThreadRead(
  userId: string,
  threadId: string,
  input: MarkThreadReadBody,
): Promise<{ ok: true }> {
  await requireThreadMembership(userId, threadId);

  if (input.readThroughMessageId) {
    const message = await deps.repo.findMessageInThread(threadId, input.readThroughMessageId);
    if (!message) {
      throw new AppError("not_found", "Read-through message not found", 404);
    }
  }

  await deps.repo.upsertThreadRead(threadId, userId, input.readThroughMessageId);
  return { ok: true };
}

export async function canAccessThread(userId: string, threadId: string): Promise<boolean> {
  return deps.repo.isThreadMember(threadId, userId);
}

export async function findDirectThreadIdBySource(
  source: { type: ChatSourceType; sourceId: string },
): Promise<string | null> {
  const thread = await deps.repo.findDirectThreadBySource(source);
  return thread?.id ?? null;
}

export async function findDirectThreadIdBetween(
  userId: string,
  peerUserId: string,
): Promise<string | null> {
  const thread = await deps.repo.findDirectThreadBetween(userId, peerUserId);
  return thread?.id ?? null;
}

async function assertNotBlockedPair(userId: string, peerUserId: string): Promise<void> {
  if (await deps.isBlockedEitherWay(userId, peerUserId)) {
    throw new AppError("blocked_pair", "Blocked users cannot interact", 403, {
      peerUserId: "blocked_pair",
    });
  }
}

async function requireThreadMembership(userId: string, threadId: string): Promise<ThreadRow> {
  const thread = await deps.repo.findThreadForMember(threadId, userId);
  if (!thread) {
    throw new AppError("not_found", "Thread not found", 404);
  }

  return thread;
}

async function toThreadDto(thread: ThreadRow, userId: string): Promise<ThreadDto> {
  const peer = await deps.repo.findThreadPeer(thread.id, userId);
  if (!peer) {
    throw new AppError("not_found", "Thread peer not found", 404);
  }

  const [lastMessage, unreadCount, contexts] = await Promise.all([
    deps.repo.findLatestMessage(thread.id),
    deps.repo.getUnreadCount(thread.id, userId),
    deps.repo.listThreadContexts(thread.id),
  ]);

  return {
    id: thread.id,
    type: thread.type,
    peer,
    lastMessage: lastMessage ? toLastMessageDto(lastMessage) : null,
    unreadCount,
    source:
      thread.sourceType && thread.sourceId
        ? {
            type: thread.sourceType as ChatSourceType,
            sourceId: thread.sourceId,
          }
        : null,
    contexts: contexts.map(toThreadContextDto),
  };
}

function toLastMessageDto(message: MessageRow): ThreadDto["lastMessage"] {
  return {
    id: message.id,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
  };
}

function toMessageDto(message: MessageRow): MessageDto {
  return {
    id: message.id,
    threadId: message.threadId,
    fromUserId: message.fromUserId,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    clientMessageId: message.clientMessageId,
  };
}

function toThreadContextDto(context: ThreadContextRow): ThreadContextDto {
  return {
    id: context.id,
    sourceType: context.sourceType as ChatSourceType,
    sourceId: context.sourceId,
    metadata: context.metadata ?? null,
    createdAt: context.createdAt.toISOString(),
  };
}
