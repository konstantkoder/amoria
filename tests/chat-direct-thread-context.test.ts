import assert from "node:assert/strict";
import test from "node:test";
import type { JsonValue, ThreadContextRow, ThreadRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const chatService = require("../src/chat/chat.service") as typeof import("../src/chat/chat.service");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

type ChatRepo = typeof import("../src/chat/chat.repo");

const userAId = "00000000-0000-4000-8000-000000000001";
const userBId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000201";
const nearbySourceId = "00000000-0000-4000-8000-000000000301";
const togetherSourceId = "00000000-0000-4000-8000-000000000401";
const createdAt = new Date("2026-01-01T00:00:00.000Z");

let restoreDeps: (() => void) | null = null;

test.after(async () => {
  restoreChatDeps();
  await closeDb();
});

test("openDirectThread twice for same pair returns the same thread", async (t) => {
  t.after(restoreChatDeps);

  const state = mockChatRepo();

  const first = await chatService.openDirectThreadWithStatus(userAId, {
    peerUserId: userBId,
  });
  const second = await chatService.openDirectThreadWithStatus(userAId, {
    peerUserId: userBId,
  });

  assert.equal(first.thread.id, threadId);
  assert.equal(second.thread.id, threadId);
  assert.equal(first.status, "created");
  assert.equal(second.status, "existing");
  assert.equal(state.createCount, 1);
});

test("openDirectThread with source adds thread context", async (t) => {
  t.after(restoreChatDeps);

  mockChatRepo();

  const result = await chatService.openDirectThread(userAId, {
    peerUserId: userBId,
    source: {
      type: "together",
      sourceId: togetherSourceId,
      metadata: {
        activity: "draw",
        promptText: "Draw together",
      },
    },
  });

  assert.equal(result.thread.contexts.length, 1);
  assert.equal(result.thread.contexts[0]?.sourceType, "together");
  assert.equal(result.thread.contexts[0]?.sourceId, togetherSourceId);
  assert.deepEqual(result.thread.contexts[0]?.metadata, {
    activity: "draw",
    promptText: "Draw together",
  });
});

test("existing direct thread with new source adds context without replacing old source", async (t) => {
  t.after(restoreChatDeps);

  mockChatRepo();

  const first = await chatService.openDirectThread(userAId, {
    peerUserId: userBId,
    source: {
      type: "nearby",
      sourceId: nearbySourceId,
    },
  });
  const second = await chatService.openDirectThread(userAId, {
    peerUserId: userBId,
    source: {
      type: "together",
      sourceId: togetherSourceId,
    },
  });

  assert.deepEqual(first.thread.source, {
    type: "nearby",
    sourceId: nearbySourceId,
  });
  assert.deepEqual(second.thread.source, {
    type: "nearby",
    sourceId: nearbySourceId,
  });
  assert.deepEqual(
    second.thread.contexts.map((context) => context.sourceType).sort(),
    ["nearby", "together"],
  );
});

test("same source context is not duplicated", async (t) => {
  t.after(restoreChatDeps);

  const state = mockChatRepo();

  await chatService.openDirectThread(userAId, {
    peerUserId: userBId,
    source: {
      type: "together",
      sourceId: togetherSourceId,
    },
  });
  const second = await chatService.openDirectThread(userAId, {
    peerUserId: userBId,
    source: {
      type: "together",
      sourceId: togetherSourceId,
    },
  });

  assert.equal(state.contexts.length, 1);
  assert.equal(second.thread.contexts.length, 1);
});

test("inbox thread response includes contexts", async (t) => {
  t.after(restoreChatDeps);

  const state = mockChatRepo();
  await chatService.openDirectThread(userAId, {
    peerUserId: userBId,
    source: {
      type: "nearby",
      sourceId: nearbySourceId,
    },
  });

  const response = await chatService.getInbox(userAId, 30);

  assert.equal(response.items.length, 1);
  assert.deepEqual(response.items[0]?.contexts, state.contexts.map(toExpectedContext));
});

test("blocked pair still cannot open direct thread", async (t) => {
  t.after(restoreChatDeps);

  const state = mockChatRepo({ blocked: true });

  await assert.rejects(
    chatService.openDirectThread(userAId, {
      peerUserId: userBId,
      source: {
        type: "together",
        sourceId: togetherSourceId,
      },
    }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "blocked_pair");
      assert.equal(appError.statusCode, 403);
      return true;
    },
  );
  assert.equal(state.createCount, 0);
  assert.equal(state.contexts.length, 0);
});

function mockChatRepo(input: { blocked?: boolean } = {}) {
  restoreChatDeps();

  let thread: ThreadRow | null = null;
  const contexts: ThreadContextRow[] = [];
  let createCount = 0;
  const state = {
    get createCount() {
      return createCount;
    },
    contexts,
  };

  const repo = {
    findUserPeerById: async (userId: string) =>
      userId === userBId ? { id: userBId, displayName: "User B", avatarUrl: null } : undefined,
    findOrCreateDirectThreadBetween: async () => {
      if (!thread) {
        thread = threadRow();
        createCount += 1;
        return { thread, created: true };
      }

      return { thread, created: false };
    },
    addThreadContext: async (
      nextThreadId: string,
      source: { type: string; sourceId: string; metadata?: unknown },
      createdByUserId?: string,
    ) => {
      if (
        contexts.some(
          (context) =>
            context.threadId === nextThreadId &&
            context.sourceType === source.type &&
            context.sourceId === source.sourceId,
        )
      ) {
        return;
      }

      contexts.push({
        id: contextId(contexts.length + 1),
        threadId: nextThreadId,
        sourceType: source.type,
        sourceId: source.sourceId,
        metadata: (source.metadata ?? null) as JsonValue | null,
        createdByUserId: createdByUserId ?? null,
        createdAt: new Date(createdAt.getTime() + contexts.length),
      });
    },
    setThreadSourceIfEmpty: async (nextThread: ThreadRow, source: { type: string; sourceId: string }) => {
      if (nextThread.sourceType || nextThread.sourceId) {
        return nextThread;
      }

      thread = {
        ...nextThread,
        sourceType: source.type,
        sourceId: source.sourceId,
        updatedAt: createdAt,
      };
      return thread;
    },
    listThreadsForUser: async () => (thread ? [thread] : []),
    findThreadPeer: async () => ({ id: userBId, displayName: "User B", avatarUrl: null }),
    findLatestMessage: async () => undefined,
    getUnreadCount: async () => 0,
    listThreadContexts: async () => contexts,
  } satisfies Partial<ChatRepo>;

  restoreDeps = chatService.__setChatServiceDepsForTests({
    repo: repo as unknown as ChatRepo,
    isBlockedEitherWay: async () => input.blocked === true,
  });

  return state;
}

function restoreChatDeps(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function threadRow(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: threadId,
    type: "direct",
    sourceType: null,
    sourceId: null,
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: null,
    lastMessageText: null,
    ...overrides,
  };
}

function contextId(index: number): string {
  return `00000000-0000-4000-8000-${String(500 + index).padStart(12, "0")}`;
}

function toExpectedContext(context: ThreadContextRow) {
  return {
    id: context.id,
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    metadata: context.metadata,
    createdAt: context.createdAt.toISOString(),
  };
}
