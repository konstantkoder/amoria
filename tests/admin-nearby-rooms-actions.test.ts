import assert from "node:assert/strict";
import test from "node:test";
import type { AdminContextRow } from "../src/admin/admin.repo";
import type { AdminAuditInput, AdminRoleKey } from "../src/admin/admin.types";
import type {
  AdminUserRow,
  NearbyRoomTypeRow,
  UserRow,
} from "../src/db/schema";
import type {
  AdminNearbyRoomRow,
  CreateNearbyRoomInput,
} from "../src/nearby/nearby-rooms.repo";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const adminService = require("../src/admin/admin.service") as typeof import("../src/admin/admin.service");
const adminNearbyRoomsService =
  require("../src/admin/admin-nearby-rooms.service") as typeof import("../src/admin/admin-nearby-rooms.service");

type NearbyRoomsRepo = typeof import("../src/nearby/nearby-rooms.repo");

const now = new Date("2026-06-20T12:00:00.000Z");
const userId = "00000000-0000-4000-8000-000000000001";
const adminUserId = "00000000-0000-4000-8000-0000000000a1";
const roomId = "00000000-0000-4000-8000-000000000101";

let restoreAdminDeps: (() => void) | null = null;
let restoreNearbyRoomDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("POST /admin/nearby-rooms creates a real room with valid active approved type", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockNearbyRoomAdmin();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/admin/nearby-rooms",
    headers: authHeaders(userId),
    payload: {
      typeKey: "coffee_nearby",
      geoBucket: "city:zagreb:center",
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json().room, expectedRoomDto());
  assert.equal(state.createdRooms.length, 1);
  assert.equal(state.createdRooms[0]?.typeKey, "coffee_nearby");
  assert.equal(state.createdRooms[0]?.geoBucket, "city:zagreb:center");
  assert.equal(state.createdRooms[0]?.createdByAdminUserId, adminUserId);
  assert.equal(state.moderationActions.length, 0);
  assert.equal(state.auditInputs[0]?.action, "admin.nearbyRooms.create");
  assertNoPrivateNearbyFields(response.json());
});

test("POST /admin/nearby-rooms rejects invalid room type", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  const state = mockNearbyRoomAdmin();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/admin/nearby-rooms",
    headers: authHeaders(userId),
    payload: {
      typeKey: "missing_type",
      geoBucket: "city:zagreb:center",
    },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(state.createdRooms.length, 0);
});

test("POST /admin/nearby-rooms rejects disabled or unapproved room type", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  const state = mockNearbyRoomAdmin({
    roomTypes: [
      roomTypeRow({ key: "disabled_type", status: "disabled" }),
      roomTypeRow({ key: "unapproved_type", adminApproved: false }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  for (const typeKey of ["disabled_type", "unapproved_type"]) {
    const response = await app.inject({
      method: "POST",
      url: "/admin/nearby-rooms",
      headers: authHeaders(userId),
      payload: {
        typeKey,
        geoBucket: "city:zagreb:center",
      },
    });
    assert.equal(response.statusCode, 403);
  }
  assert.equal(state.createdRooms.length, 0);
});

test("POST /admin/nearby-rooms/:roomId/actions closes disables and reopens rooms", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockNearbyRoomAdmin({ rooms: [adminRoomRow()] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const close = await roomAction(app, "close");
  const disable = await roomAction(app, "disable");
  const reopen = await roomAction(app, "reopen");

  assert.equal(close.statusCode, 200);
  assert.equal(close.json().room.status, "closed");
  assert.equal(disable.statusCode, 200);
  assert.equal(disable.json().room.status, "disabled");
  assert.equal(reopen.statusCode, 200);
  assert.equal(reopen.json().room.status, "active");
  assert.deepEqual(
    state.moderationActions.map((action) => action.action),
    ["close", "disable", "reopen"],
  );
  assert.deepEqual(
    state.auditInputs.map((input) => input.action),
    [
      "admin.nearbyRooms.close",
      "admin.nearbyRooms.disable",
      "admin.nearbyRooms.reopen",
    ],
  );
  assert.equal(state.room(roomId)?.memberCount, 0);
  assert.equal(state.room(roomId)?.threadId, null);
  assertNoPrivateNearbyFields(reopen.json());
});

test("support and ops cannot create or modify nearby rooms", async (t) => {
  t.after(restoreDeps);
  const state = mockNearbyRoomAdmin({ rooms: [adminRoomRow()] });

  for (const role of ["support", "ops"] as const) {
    mockAdmin({ roles: [role] });
    const app = buildApp();
    t.after(async () => {
      await app.close();
    });

    const create = await app.inject({
      method: "POST",
      url: "/admin/nearby-rooms",
      headers: authHeaders(userId),
      payload: {
        typeKey: "coffee_nearby",
        geoBucket: "city:zagreb:center",
      },
    });
    const action = await roomAction(app, "close");

    assert.equal(create.statusCode, 403);
    assert.equal(action.statusCode, 403);
  }

  assert.equal(state.createdRooms.length, 0);
  assert.equal(state.moderationActions.length, 0);
});

function mockAdmin(input: { roles?: AdminRoleKey[] } = {}) {
  restoreAdminDeps?.();
  restoreAdminDeps = null;

  const adminContext = adminContextRow(input.roles ?? ["owner"]);
  restoreAdminDeps = adminService.__setAdminServiceDepsForTests({
    repo: {
      ensureRequiredRoles: async () => undefined,
      findAdminContextByUserId: async () => adminContext,
      findUserById: async () => userRow({ id: userId, amoriaId: "AMOWNER1" }),
      findUsersByAmoriaIds: async () => [],
      upsertActiveAdminUserForUser: async () => adminUserRow({}),
      assignRole: async () => undefined,
      searchUsers: async () => [],
      listAdminUsers: async () => [],
      listAuditLog: async () => [],
    },
  });
}

function mockNearbyRoomAdmin(input: {
  roomTypes?: NearbyRoomTypeRow[];
  rooms?: AdminNearbyRoomRow[];
} = {}) {
  restoreNearbyRoomDeps?.();
  restoreNearbyRoomDeps = null;

  const roomTypes = new Map<string, NearbyRoomTypeRow>(
    (input.roomTypes ?? [roomTypeRow()]).map((roomType) => [roomType.key, roomType]),
  );
  const rooms = new Map<string, AdminNearbyRoomRow>(
    (input.rooms ?? []).map((room) => [room.id, room]),
  );
  const state: {
    auditInputs: AdminAuditInput[];
    createdRooms: CreateNearbyRoomInput[];
    moderationActions: Array<{ roomId: string; adminUserId: string; action: string }>;
    room: (nextRoomId: string) => AdminNearbyRoomRow | undefined;
  } = {
    auditInputs: [],
    createdRooms: [],
    moderationActions: [],
    room: (nextRoomId) => rooms.get(nextRoomId),
  };

  const repo = {
    listNearbyRoomTypesForAdmin: async () => [...roomTypes.values()],
    listNearbyRoomsForAdmin: async () => [...rooms.values()],
    findNearbyRoomTypeByKey: async (typeKey: string) => roomTypes.get(typeKey),
    findNearbyRoomForAdmin: async (nextRoomId: string) => rooms.get(nextRoomId),
    createNearbyRoomForAdmin: async (createInput: CreateNearbyRoomInput) => {
      state.createdRooms.push(createInput);
      const roomType = roomTypes.get(createInput.typeKey);
      if (!roomType) {
        throw new Error("mock missing room type");
      }
      const row = adminRoomRow({
        id: roomId,
        typeKey: createInput.typeKey,
        roomType,
        geoBucket: createInput.geoBucket,
        createdByAdminUserId: createInput.createdByAdminUserId,
        createdAt: createInput.createdAt,
        updatedAt: createInput.createdAt,
      });
      rooms.set(row.id, row);
      return row;
    },
    updateNearbyRoomStatusForAdmin: async (
      nextRoomId: string,
      status: "active" | "closed" | "disabled",
      updatedAt: Date,
    ) => {
      const room = rooms.get(nextRoomId);
      if (!room) return undefined;
      const updated = {
        ...room,
        status,
        updatedAt,
      };
      rooms.set(nextRoomId, updated);
      return updated;
    },
    createRoomModerationActionForAdmin: async (actionInput) => {
      state.moderationActions.push(actionInput);
    },
  } satisfies Partial<NearbyRoomsRepo>;

  restoreNearbyRoomDeps = adminNearbyRoomsService.__setAdminNearbyRoomsServiceDepsForTests({
    now: () => now,
    repo: repo as NearbyRoomsRepo,
    audit: {
      writeAuditLog: async (input) => {
        state.auditInputs.push(input);
      },
    },
  });

  return state;
}

function restoreDeps(): void {
  restoreAdminDeps?.();
  restoreNearbyRoomDeps?.();
  restoreAdminDeps = null;
  restoreNearbyRoomDeps = null;
}

async function roomAction(
  app: ReturnType<typeof buildApp>,
  action: "close" | "disable" | "reopen",
) {
  return app.inject({
    method: "POST",
    url: `/admin/nearby-rooms/${roomId}/actions`,
    headers: authHeaders(userId),
    payload: { action },
  });
}

function expectedRoomDto(overrides: Record<string, unknown> = {}) {
  return {
    id: roomId,
    typeKey: "coffee_nearby",
    roomType: {
      key: "coffee_nearby",
      title: "Coffee nearby",
      status: "active",
      adminApproved: true,
      sortOrder: 10,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    status: "active",
    geoBucket: "city:zagreb:center",
    memberCount: 0,
    threadId: null,
    createdByAdminUserId: adminUserId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function adminRoomRow(overrides: Partial<AdminNearbyRoomRow> = {}): AdminNearbyRoomRow {
  return {
    id: roomId,
    typeKey: "coffee_nearby",
    roomType: roomTypeRow(),
    status: "active",
    geoBucket: "city:zagreb:center",
    threadId: null,
    createdByAdminUserId: adminUserId,
    memberCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function roomTypeRow(overrides: Partial<NearbyRoomTypeRow> = {}): NearbyRoomTypeRow {
  return {
    key: "coffee_nearby",
    title: "Coffee nearby",
    status: "active",
    adminApproved: true,
    sortOrder: 10,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function adminContextRow(roles: AdminRoleKey[]): AdminContextRow {
  const user = userRow({});
  return {
    adminUser: adminUserRow({ userId: user.id, email: user.email, displayName: user.displayName }),
    user: {
      id: user.id,
      amoriaId: user.amoriaId,
      displayName: user.displayName,
      email: user.email,
    },
    roles,
  };
}

function adminUserRow(
  input: Partial<AdminUserRow & { userId: string; status: "active" | "disabled" }> = {},
): AdminUserRow & { userId: string; status: "active" | "disabled" } {
  return {
    id: adminUserId,
    userId,
    email: "owner@example.test",
    displayName: "Amoria Owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function userRow(input: Partial<UserRow>): UserRow {
  return {
    id: userId,
    email: "owner@example.test",
    passwordHash: "hash",
    displayName: "Amoria Owner",
    about: null,
    amoriaId: "AMOWNER1",
    avatarUrl: null,
    photos: [],
    gender: null,
    preferredGenders: [],
    goal: null,
    mood: null,
    interests: [],
    flirtEnabled: false,
    allowAdultMode: false,
    mysteryMode: false,
    birthDate: "1995-01-01",
    preferredAgeMin: 18,
    preferredAgeMax: null,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: null,
    ...input,
  };
}

function authHeaders(id: string) {
  return {
    Authorization: `Bearer ${signAccessToken(id)}`,
  };
}

function assertNoPrivateNearbyFields(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(serialized.includes("longitude"), false);
  assert.equal(serialized.includes("birthDate"), false);
  assert.equal(serialized.includes("1995-01-01"), false);
}
