import assert from "node:assert/strict";
import test from "node:test";
import type { NearbyRoomListRow } from "../src/nearby/nearby-rooms.repo";

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

type NearbyRoomsRepo = typeof import("../src/nearby/nearby-rooms.repo");

type MembershipState = {
  status: string;
  joinedAt: Date;
  leftAt: Date | null;
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

const now = new Date("2026-06-20T10:00:00.000Z");
const earlier = new Date("2026-06-19T10:00:00.000Z");
const viewerId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000002";
const activeRoomId = "00000000-0000-4000-8000-000000000101";
const activeMemberRoomId = "00000000-0000-4000-8000-000000000102";
const leftRoomId = "00000000-0000-4000-8000-000000000103";
const removedRoomId = "00000000-0000-4000-8000-000000000104";
const bannedRoomId = "00000000-0000-4000-8000-000000000105";
const disabledRoomId = "00000000-0000-4000-8000-000000000106";
const disabledTypeRoomId = "00000000-0000-4000-8000-000000000107";
const unapprovedTypeRoomId = "00000000-0000-4000-8000-000000000108";
const threadId = "00000000-0000-4000-8000-000000000201";

let restoreRoomsDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("POST /nearby/rooms/:roomId/join joins an active existing room with real memberCount", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRooms({
    rooms: [
      roomState({
        memberships: new Map([[otherUserId, membership("active")]]),
        threadId,
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${activeRoomId}/join`,
    headers: authHeaders(viewerId),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(state.membership(activeRoomId, viewerId)?.status, "active");
  assert.deepEqual(response.json().room, {
    id: activeRoomId,
    typeKey: "coffee_nearby",
    title: "Coffee nearby",
    geoBucket: "city:zagrzeb:center",
    memberCount: 2,
    status: "active",
    canJoin: false,
    canOpen: false,
    threadId: null,
  });
  assertNoPrivateNearbyFields(response.json());
});

test("POST /nearby/rooms/:roomId/join rejects disabled room or type", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRooms({
    rooms: [
      roomState({ id: disabledRoomId, status: "disabled" }),
      roomState({ id: disabledTypeRoomId, roomTypeStatus: "disabled" }),
      roomState({ id: unapprovedTypeRoomId, adminApproved: false }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  for (const roomId of [disabledRoomId, disabledTypeRoomId, unapprovedTypeRoomId]) {
    const response = await app.inject({
      method: "POST",
      url: `/nearby/rooms/${roomId}/join`,
      headers: authHeaders(viewerId),
    });
    assert.equal(response.statusCode, 403);
    assert.equal(state.membership(roomId, viewerId), undefined);
  }
});

test("POST /nearby/rooms/:roomId/join is idempotent and reactivates left membership", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRooms({
    rooms: [
      roomState({
        id: activeMemberRoomId,
        memberships: new Map([
          [viewerId, membership("active", { joinedAt: earlier })],
          [otherUserId, membership("active")],
        ]),
      }),
      roomState({
        id: leftRoomId,
        memberships: new Map([[viewerId, membership("left", { leftAt: earlier })]]),
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const first = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${activeMemberRoomId}/join`,
    headers: authHeaders(viewerId),
  });
  const second = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${activeMemberRoomId}/join`,
    headers: authHeaders(viewerId),
  });
  const rejoin = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${leftRoomId}/join`,
    headers: authHeaders(viewerId),
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().room.memberCount, 2);
  assert.equal(second.json().room.memberCount, 2);
  assert.equal(state.membership(activeMemberRoomId, viewerId)?.joinedAt, earlier);
  assert.equal(rejoin.statusCode, 200);
  assert.equal(rejoin.json().room.memberCount, 1);
  assert.equal(state.membership(leftRoomId, viewerId)?.status, "active");
  assert.equal(state.membership(leftRoomId, viewerId)?.joinedAt, now);
  assert.equal(state.membership(leftRoomId, viewerId)?.leftAt, null);
});

test("POST /nearby/rooms/:roomId/join rejects removed or banned memberships", async (t) => {
  t.after(restoreDeps);
  mockNearbyRooms({
    rooms: [
      roomState({
        id: removedRoomId,
        memberships: new Map([[viewerId, membership("removed")]]),
      }),
      roomState({
        id: bannedRoomId,
        memberships: new Map([[viewerId, membership("banned")]]),
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  for (const roomId of [removedRoomId, bannedRoomId]) {
    const response = await app.inject({
      method: "POST",
      url: `/nearby/rooms/${roomId}/join`,
      headers: authHeaders(viewerId),
    });
    assert.equal(response.statusCode, 403);
  }
});

test("POST /nearby/rooms/:roomId/leave is idempotent and keeps room history", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRooms({
    rooms: [
      roomState({
        memberships: new Map([
          [viewerId, membership("active", { joinedAt: earlier })],
          [otherUserId, membership("active")],
        ]),
        threadId,
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const first = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${activeRoomId}/leave`,
    headers: authHeaders(viewerId),
  });
  const second = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${activeRoomId}/leave`,
    headers: authHeaders(viewerId),
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json().room.memberCount, 1);
  assert.equal(second.json().room.memberCount, 1);
  assert.equal(state.membership(activeRoomId, viewerId)?.status, "left");
  assert.equal(state.membership(activeRoomId, viewerId)?.leftAt, now);
  assert.equal(state.room(activeRoomId)?.threadId, threadId);
});

test("GET /nearby/rooms returns safe join/open flags and real active member counts", async (t) => {
  t.after(restoreDeps);
  mockNearbyRooms({
    rooms: [
      roomState({
        memberships: new Map([
          [otherUserId, membership("active")],
          ["00000000-0000-4000-8000-000000000003", membership("left")],
        ]),
      }),
      roomState({
        id: activeMemberRoomId,
        memberships: new Map([[viewerId, membership("active")]]),
        threadId,
      }),
      roomState({
        id: leftRoomId,
        memberships: new Map([[viewerId, membership("left", { leftAt: earlier })]]),
        threadId,
      }),
      roomState({
        id: removedRoomId,
        memberships: new Map([[viewerId, membership("removed")]]),
      }),
      roomState({ id: disabledRoomId, status: "disabled" }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/nearby/rooms",
    headers: authHeaders(viewerId),
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    body.items.map((room: { id: string; memberCount: number; canJoin: boolean; canOpen: boolean; threadId: string | null }) => ({
      id: room.id,
      memberCount: room.memberCount,
      canJoin: room.canJoin,
      canOpen: room.canOpen,
      threadId: room.threadId,
    })),
    [
      {
        id: activeRoomId,
        memberCount: 1,
        canJoin: true,
        canOpen: false,
        threadId: null,
      },
      {
        id: activeMemberRoomId,
        memberCount: 1,
        canJoin: false,
        canOpen: false,
        threadId: null,
      },
      {
        id: leftRoomId,
        memberCount: 0,
        canJoin: true,
        canOpen: false,
        threadId: null,
      },
      {
        id: removedRoomId,
        memberCount: 0,
        canJoin: false,
        canOpen: false,
        threadId: null,
      },
    ],
  );
  assert.equal(body.items.some((room: { id: string }) => room.id === disabledRoomId), false);
  assertNoPrivateNearbyFields(body);
});

test("nearby room join and leave require authentication", async (t) => {
  t.after(restoreDeps);
  mockNearbyRooms();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const join = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${activeRoomId}/join`,
  });
  const leave = await app.inject({
    method: "POST",
    url: `/nearby/rooms/${activeRoomId}/leave`,
  });

  assert.equal(join.statusCode, 401);
  assert.equal(leave.statusCode, 401);
});

function mockNearbyRooms(input: { rooms?: RoomState[] } = {}) {
  restoreDeps();
  const rooms = new Map<string, RoomState>(
    (input.rooms ?? [roomState()]).map((room) => [room.id, room]),
  );

  const repo = {
    listPublicNearbyRoomsForUser: async (viewerUserId: string) =>
      [...rooms.values()]
        .filter(
          (room) =>
            room.status === "active" &&
            room.roomTypeStatus === "active" &&
            room.adminApproved,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.typeKey.localeCompare(b.typeKey))
        .map((room) => toRow(room, viewerUserId)),
    findNearbyRoomForUser: async (roomId: string, viewerUserId: string) => {
      const room = rooms.get(roomId);
      return room ? toRow(room, viewerUserId) : undefined;
    },
    createNearbyRoomMembership: async (roomId: string, userId: string, joinedAt: Date) => {
      const room = rooms.get(roomId);
      if (!room || room.memberships.has(userId)) return;
      room.memberships.set(userId, { status: "active", joinedAt, leftAt: null });
    },
    reactivateNearbyRoomMembership: async (roomId: string, userId: string, joinedAt: Date) => {
      const membershipState = rooms.get(roomId)?.memberships.get(userId);
      if (membershipState?.status !== "left") return;
      membershipState.status = "active";
      membershipState.joinedAt = joinedAt;
      membershipState.leftAt = null;
    },
    markNearbyRoomMembershipLeft: async (roomId: string, userId: string, leftAt: Date) => {
      const membershipState = rooms.get(roomId)?.memberships.get(userId);
      if (membershipState?.status !== "active") return;
      membershipState.status = "left";
      membershipState.leftAt = leftAt;
    },
  } satisfies Partial<NearbyRoomsRepo>;

  restoreRoomsDeps = nearbyRoomsService.__setNearbyRoomsServiceDepsForTests({
    now: () => now,
    repo: repo as NearbyRoomsRepo,
  });

  return {
    room: (roomId: string) => rooms.get(roomId),
    membership: (roomId: string, userId: string) => rooms.get(roomId)?.memberships.get(userId),
  };
}

function restoreDeps(): void {
  restoreRoomsDeps?.();
  restoreRoomsDeps = null;
}

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    id: activeRoomId,
    typeKey: "coffee_nearby",
    title: "Coffee nearby",
    roomTypeStatus: "active",
    adminApproved: true,
    sortOrder: 10,
    status: "active",
    geoBucket: "city:zagrzeb:center",
    threadId: null,
    memberships: new Map(),
    createdAt: earlier,
    updatedAt: earlier,
    ...overrides,
  };
}

function membership(
  status: string,
  overrides: Partial<MembershipState> = {},
): MembershipState {
  return {
    status,
    joinedAt: earlier,
    leftAt: null,
    ...overrides,
  };
}

function toRow(room: RoomState, viewerUserId: string): NearbyRoomListRow {
  return {
    id: room.id,
    typeKey: room.typeKey,
    title: room.title,
    roomTypeStatus: room.roomTypeStatus,
    adminApproved: room.adminApproved,
    sortOrder: room.sortOrder,
    status: room.status,
    geoBucket: room.geoBucket,
    threadId: room.threadId,
    memberCount: [...room.memberships.values()].filter(
      (membershipState) => membershipState.status === "active",
    ).length,
    viewerMembershipStatus: room.memberships.get(viewerUserId)?.status ?? null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
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
  assert.equal(serialized.includes(threadId), false);
}
