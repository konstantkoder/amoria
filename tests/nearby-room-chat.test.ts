import assert from "node:assert/strict";
import test from "node:test";
import type { MessageRow, ThreadRow } from "../src/db/schema";
import type { NearbyRoomListRow } from "../src/nearby/nearby-rooms.repo";
import {
  NEARBY_ROOM_THREAD_SOURCE_TYPE,
  NEARBY_ROOM_THREAD_TYPE,
} from "../src/nearby/nearby-room-chat.types";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const nearbyRoomsService =
  require("../src/nearby/nearby-rooms.service") as typeof import("../src/nearby/nearby-rooms.service");
const nearbyRoomChatService =
  require("../src/nearby/nearby-room-chat.service") as typeof import("../src/nearby/nearby-room-chat.service");

type NearbyRoomsRepo = typeof import("../src/nearby/nearby-rooms.repo");
type NearbyRoomChatRepo = typeof import("../src/nearby/nearby-room-chat.repo");

type MembershipState = {
  status: string;
};

type RoomState = {
  id: string;
  typeKey: string;
  title: string;
  roomTypeStatus: string;
  adminApproved: boolean;
  sortOrder: number;
  status: string;
  geoBucket: string;
  threadId: string | null;
  memberships: Map<string, MembershipState>;
  createdAt: Date;
  updatedAt: Date;
};

const now = new Date("2026-06-20T11:00:00.000Z");
const createdAt = new Date("2026-06-20T10:00:00.000Z");
const activeMemberId = "00000000-0000-4000-8000-000000000001";
const otherMemberId = "00000000-0000-4000-8000-000000000002";
const nonMemberId = "00000000-0000-4000-8000-000000000003";
const roomId = "00000000-0000-4000-8000-000000000101";
const threadId = "00000000-0000-4000-8000-000000000201";
const secondThreadId = "00000000-0000-4000-8000-000000000202";
const firstMessageId = "00000000-0000-4000-8000-000000000301";
const secondMessageId = "00000000-0000-4000-8000-000000000302";

let restoreRoomsDeps: (() => void) | null = null;
let restoreRoomChatDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("POST /nearby/rooms/:roomId/open creates and links a safe room thread for active member", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRoomChat();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${roomId}/open`,
    headers: authHeaders(activeMemberId),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    roomId,
    threadId,
    title: "Coffee nearby",
  });
  assert.equal(state.room(roomId)?.threadId, threadId);
  assert.equal(state.thread(threadId)?.type, NEARBY_ROOM_THREAD_TYPE);
  assert.equal(state.thread(threadId)?.sourceType, NEARBY_ROOM_THREAD_SOURCE_TYPE);
  assert.equal(state.thread(threadId)?.sourceId, roomId);
  assert.equal(state.isThreadMember(threadId, activeMemberId), true);
});

test("POST /nearby/rooms/:roomId/open rejects non-member", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRoomChat();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${roomId}/open`,
    headers: authHeaders(nonMemberId),
  });

  assert.equal(response.statusCode, 403);
  assert.equal(state.room(roomId)?.threadId, null);
});

test("GET /nearby/rooms/:roomId/messages returns linked room thread messages for active member", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRoomChat({
    room: roomState({ threadId }),
    threads: [threadRow()],
    messages: [
      messageRow({ id: firstMessageId, text: "First", createdAt }),
      messageRow({
        id: secondMessageId,
        text: "Second",
        createdAt: new Date(createdAt.getTime() + 1000),
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/nearby/rooms/${roomId}/messages?limit=20`,
    headers: authHeaders(activeMemberId),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    items: [
      {
        id: secondMessageId,
        roomId,
        threadId,
        fromUserId: otherMemberId,
        text: "Second",
        createdAt: "2026-06-20T10:00:01.000Z",
        clientMessageId: "client-1",
      },
      {
        id: firstMessageId,
        roomId,
        threadId,
        fromUserId: otherMemberId,
        text: "First",
        createdAt: createdAt.toISOString(),
        clientMessageId: "client-1",
      },
    ],
  });
  assert.equal(state.isThreadMember(threadId, activeMemberId), true);
  assertNoPrivateNearbyFields(response.json());
});

test("GET /nearby/rooms/:roomId/messages rejects non-member", async (t) => {
  t.after(restoreDeps);
  mockNearbyRoomChat({
    room: roomState({ threadId }),
    threads: [threadRow()],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/nearby/rooms/${roomId}/messages`,
    headers: authHeaders(nonMemberId),
  });

  assert.equal(response.statusCode, 403);
});

test("POST /nearby/rooms/:roomId/messages sends a real room message", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRoomChat({ nextThreadId: secondThreadId });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${roomId}/messages`,
    headers: authHeaders(activeMemberId),
    payload: {
      clientMessageId: "room-message-1",
      text: "Hello room",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    message: {
      id: firstMessageId,
      roomId,
      threadId: secondThreadId,
      fromUserId: activeMemberId,
      text: "Hello room",
      createdAt: now.toISOString(),
      clientMessageId: "room-message-1",
    },
  });
  assert.equal(state.room(roomId)?.threadId, secondThreadId);
  assert.equal(state.messages(secondThreadId).length, 1);
  assert.equal(state.thread(secondThreadId)?.lastMessageText, "Hello room");
});

test("POST /nearby/rooms/:roomId/messages rejects non-member", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRoomChat();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${roomId}/messages`,
    headers: authHeaders(nonMemberId),
    payload: {
      clientMessageId: "room-message-2",
      text: "No access",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(state.room(roomId)?.threadId, null);
});

test("GET /nearby/rooms exposes threadId only when active member can open safe room thread", async (t) => {
  t.after(restoreDeps);
  mockNearbyRoomChat({
    room: roomState({ threadId }),
    threads: [threadRow()],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const memberResponse = await app.inject({
    method: "GET",
    url: "/nearby/rooms",
    headers: authHeaders(activeMemberId),
  });
  const nonMemberResponse = await app.inject({
    method: "GET",
    url: "/nearby/rooms",
    headers: authHeaders(nonMemberId),
  });

  assert.equal(memberResponse.statusCode, 200);
  assert.equal(memberResponse.json().items[0]?.canOpen, true);
  assert.equal(memberResponse.json().items[0]?.threadId, threadId);
  assert.equal(nonMemberResponse.statusCode, 200);
  assert.equal(nonMemberResponse.json().items[0]?.canOpen, false);
  assert.equal(nonMemberResponse.json().items[0]?.threadId, null);
});

function mockNearbyRoomChat(input: {
  room?: RoomState;
  threads?: ThreadRow[];
  messages?: MessageRow[];
  nextThreadId?: string;
} = {}) {
  restoreDeps();

  const rooms = new Map<string, RoomState>([
    [input.room?.id ?? roomId, input.room ?? roomState()],
  ]);
  const threads = new Map<string, ThreadRow>(
    (input.threads ?? []).map((thread) => [thread.id, thread]),
  );
  const threadMembers = new Map<string, Set<string>>();
  for (const thread of threads.values()) {
    threadMembers.set(thread.id, new Set([otherMemberId]));
  }
  const messages = new Map<string, MessageRow[]>();
  for (const message of input.messages ?? []) {
    const threadMessages = messages.get(message.threadId) ?? [];
    threadMessages.push(message);
    messages.set(message.threadId, threadMessages);
  }
  let nextMessageIndex = 0;

  const roomRepo = {
    listPublicNearbyRoomsForUser: async (viewerUserId: string) =>
      [...rooms.values()]
        .filter(
          (room) =>
            room.status === "active" &&
            room.roomTypeStatus === "active" &&
            room.adminApproved,
        )
        .map((room) => toRow(room, viewerUserId, threads)),
    findNearbyRoomForUser: async (nextRoomId: string, viewerUserId: string) => {
      const room = rooms.get(nextRoomId);
      return room ? toRow(room, viewerUserId, threads) : undefined;
    },
  } satisfies Partial<NearbyRoomsRepo>;

  const chatRepo = {
    findOrCreateNearbyRoomThread: async (nextRoomId: string, userId: string, created: Date) => {
      const room = rooms.get(nextRoomId);
      if (!room) return undefined;
      if (room.threadId) {
        const thread = threads.get(room.threadId);
        if (!thread || !isSafeThread(thread, nextRoomId)) return undefined;
        addThreadMember(thread.id, userId);
        return thread;
      }

      const thread = threadRow({
        id: input.nextThreadId ?? threadId,
        sourceId: nextRoomId,
        createdAt: created,
        updatedAt: created,
      });
      threads.set(thread.id, thread);
      room.threadId = thread.id;
      room.updatedAt = created;
      addThreadMember(thread.id, userId);
      return thread;
    },
    findSafeNearbyRoomThread: async (nextRoomId: string, nextThreadId: string) => {
      const thread = threads.get(nextThreadId);
      return thread && isSafeThread(thread, nextRoomId) ? thread : undefined;
    },
    addNearbyRoomThreadMember: async (nextThreadId: string, userId: string) => {
      addThreadMember(nextThreadId, userId);
    },
    listNearbyRoomMessages: async (nextThreadId: string, limit: number) =>
      [...(messages.get(nextThreadId) ?? [])]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    createNearbyRoomMessageIdempotent: async (inputMessage) => {
      const threadMessages = messages.get(inputMessage.threadId) ?? [];
      const existing = threadMessages.find(
        (message) =>
          message.fromUserId === inputMessage.fromUserId &&
          message.clientMessageId === inputMessage.clientMessageId,
      );
      if (existing) {
        return { message: existing, created: false };
      }

      const message = messageRow({
        id: messageId(++nextMessageIndex),
        threadId: inputMessage.threadId,
        fromUserId: inputMessage.fromUserId,
        text: inputMessage.text,
        clientMessageId: inputMessage.clientMessageId,
        createdAt: now,
      });
      threadMessages.push(message);
      messages.set(inputMessage.threadId, threadMessages);
      const thread = threads.get(inputMessage.threadId);
      if (thread) {
        thread.lastMessageAt = message.createdAt;
        thread.lastMessageText = message.text;
        thread.updatedAt = message.createdAt;
      }
      return { message, created: true };
    },
  } satisfies Partial<NearbyRoomChatRepo>;

  restoreRoomsDeps = nearbyRoomsService.__setNearbyRoomsServiceDepsForTests({
    now: () => now,
    repo: roomRepo as NearbyRoomsRepo,
  });
  restoreRoomChatDeps = nearbyRoomChatService.__setNearbyRoomChatServiceDepsForTests({
    now: () => now,
    roomRepo: roomRepo as Pick<NearbyRoomsRepo, "findNearbyRoomForUser">,
    chatRepo: chatRepo as NearbyRoomChatRepo,
  });

  function addThreadMember(nextThreadId: string, userId: string) {
    const members = threadMembers.get(nextThreadId) ?? new Set<string>();
    members.add(userId);
    threadMembers.set(nextThreadId, members);
  }

  return {
    room: (nextRoomId: string) => rooms.get(nextRoomId),
    thread: (nextThreadId: string) => threads.get(nextThreadId),
    messages: (nextThreadId: string) => messages.get(nextThreadId) ?? [],
    isThreadMember: (nextThreadId: string, userId: string) =>
      threadMembers.get(nextThreadId)?.has(userId) ?? false,
  };
}

function restoreDeps(): void {
  restoreRoomsDeps?.();
  restoreRoomChatDeps?.();
  restoreRoomsDeps = null;
  restoreRoomChatDeps = null;
}

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    id: roomId,
    typeKey: "coffee_nearby",
    title: "Coffee nearby",
    roomTypeStatus: "active",
    adminApproved: true,
    sortOrder: 10,
    status: "active",
    geoBucket: "city:zagreb:center",
    threadId: null,
    memberships: new Map([[activeMemberId, { status: "active" }]]),
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function threadRow(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: threadId,
    type: NEARBY_ROOM_THREAD_TYPE,
    sourceType: NEARBY_ROOM_THREAD_SOURCE_TYPE,
    sourceId: roomId,
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: null,
    lastMessageText: null,
    ...overrides,
  };
}

function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: firstMessageId,
    threadId,
    fromUserId: otherMemberId,
    text: "Room message",
    clientMessageId: "client-1",
    createdAt,
    ...overrides,
  };
}

function toRow(
  room: RoomState,
  viewerUserId: string,
  threads: Map<string, ThreadRow>,
): NearbyRoomListRow {
  return {
    id: room.id,
    typeKey: room.typeKey,
    title: room.title,
    roomTypeStatus: room.roomTypeStatus,
    adminApproved: room.adminApproved,
    sortOrder: room.sortOrder,
    status: room.status,
    geoBucket: room.geoBucket,
    threadId:
      room.threadId && isSafeThread(threads.get(room.threadId), room.id)
        ? room.threadId
        : null,
    memberCount: [...room.memberships.values()].filter(
      (membership) => membership.status === "active",
    ).length,
    viewerMembershipStatus: room.memberships.get(viewerUserId)?.status ?? null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function isSafeThread(thread: ThreadRow | undefined, nextRoomId: string): boolean {
  return (
    thread?.type === NEARBY_ROOM_THREAD_TYPE &&
    thread.sourceType === NEARBY_ROOM_THREAD_SOURCE_TYPE &&
    thread.sourceId === nextRoomId
  );
}

function messageId(index: number): string {
  return `00000000-0000-4000-8000-${String(300 + index).padStart(12, "0")}`;
}

function authHeaders(userId: string) {
  return {
    Authorization: `Bearer ${signAccessToken(userId)}`,
  };
}

function assertNoPrivateNearbyFields(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(serialized.includes("longitude"), false);
  assert.equal(serialized.includes("birthDate"), false);
  assert.equal(serialized.includes("email"), false);
  assert.equal(serialized.includes("passwordHash"), false);
}
