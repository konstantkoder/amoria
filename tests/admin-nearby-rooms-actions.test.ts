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
  ListNearbyRoomsForAdminOptions,
  NearbyRoomListRow,
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
const {
  parseAdminCreateNearbyRoomTypeBody,
  parseAdminNearbyRoomActionBody,
  parseAdminNearbyRoomsQuery,
} = require("../src/admin/admin-nearby-rooms.schemas") as typeof import("../src/admin/admin-nearby-rooms.schemas");
const adminNearbyRoomsService =
  require("../src/admin/admin-nearby-rooms.service") as typeof import("../src/admin/admin-nearby-rooms.service");
const nearbyRoomsService =
  require("../src/nearby/nearby-rooms.service") as typeof import("../src/nearby/nearby-rooms.service");

type NearbyRoomsRepo = typeof import("../src/nearby/nearby-rooms.repo");

const now = new Date("2026-06-20T12:00:00.000Z");
const userId = "00000000-0000-4000-8000-000000000001";
const adminUserId = "00000000-0000-4000-8000-0000000000a1";
const roomId = "00000000-0000-4000-8000-000000000101";
const archivedRoomId = "00000000-0000-4000-8000-000000000102";
const deletedRoomId = "00000000-0000-4000-8000-000000000103";

let restoreAdminDeps: (() => void) | null = null;
let restoreNearbyRoomDeps: (() => void) | null = null;
let restorePublicRoomsDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("parseAdminNearbyRoomActionBody accepts archive/delete and rejects remove", () => {
  assert.deepEqual(parseAdminNearbyRoomActionBody({ action: "archive" }), {
    action: "archive",
  });
  assert.deepEqual(parseAdminNearbyRoomActionBody({ action: "delete" }), {
    action: "delete",
  });
  assert.throws(() => parseAdminNearbyRoomActionBody({ action: "remove" }));
});

test("parseAdminCreateNearbyRoomTypeBody accepts slug keys and trims values", () => {
  assert.deepEqual(
    parseAdminCreateNearbyRoomTypeBody({ key: "  sunset_picnic  ", title: "  Sunset picnic  " }),
    { key: "sunset_picnic", title: "Sunset picnic" },
  );
  assert.throws(() =>
    parseAdminCreateNearbyRoomTypeBody({ key: "Sunset picnic", title: "Sunset picnic" }),
  );
});

test("POST /admin/nearby-room-types creates an active approved custom activity", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockNearbyRoomAdmin();
  const app = buildApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/admin/nearby-room-types",
    headers: authHeaders(userId),
    payload: { key: "sunset_picnic", title: "Sunset picnic" },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json().roomType, {
    key: "sunset_picnic",
    title: "Sunset picnic",
    status: "active",
    adminApproved: true,
    sortOrder: 20,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  assert.equal(state.createdRoomTypes.length, 1);
  assert.equal(state.auditInputs[0]?.action, "admin.nearbyRoomTypes.create");
});

test("POST /admin/nearby-room-types rejects duplicate keys", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  const state = mockNearbyRoomAdmin();
  const app = buildApp();
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/admin/nearby-room-types",
    headers: authHeaders(userId),
    payload: { key: "coffee_nearby", title: "Another coffee" },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "validation_error");
  assert.equal(state.createdRoomTypes.length, 0);
});

test("parseAdminNearbyRoomsQuery accepts boolean-like includeArchived values", () => {
  assert.deepEqual(parseAdminNearbyRoomsQuery({}), { includeArchived: false });
  assert.deepEqual(parseAdminNearbyRoomsQuery({ includeArchived: true }), {
    includeArchived: true,
  });
  assert.deepEqual(parseAdminNearbyRoomsQuery({ includeArchived: "true" }), {
    includeArchived: true,
  });
  assert.deepEqual(parseAdminNearbyRoomsQuery({ includeArchived: "1" }), {
    includeArchived: true,
  });
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

test("POST /admin/nearby-rooms stores optional scheduled fields", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  const state = mockNearbyRoomAdmin();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const startsAt = "2026-06-23T14:00:00.000Z";
  const response = await app.inject({
    method: "POST",
    url: "/admin/nearby-rooms",
    headers: authHeaders(userId),
    payload: {
      typeKey: "coffee_nearby",
      geoBucket: "city:zagreb:center",
      title: "Tuesday 14:00 coffee nearby",
      description: "Casual coffee meetup",
      locationLabel: "Main square",
      startsAt,
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json().room, expectedRoomDto({
    title: "Tuesday 14:00 coffee nearby",
    description: "Casual coffee meetup",
    locationLabel: "Main square",
    startsAt,
  }));
  assert.equal(state.createdRooms.length, 1);
  assert.equal(state.createdRooms[0]?.title, "Tuesday 14:00 coffee nearby");
  assert.equal(state.createdRooms[0]?.description, "Casual coffee meetup");
  assert.equal(state.createdRooms[0]?.locationLabel, "Main square");
  assert.equal(state.createdRooms[0]?.startsAt?.toISOString(), startsAt);
  assert.equal(state.createdRooms[0]?.createdFromDemandSnapshot, null);
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

test("POST /admin/nearby-rooms/:roomId/actions closes disables archives and reopens rooms", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockNearbyRoomAdmin({ rooms: [adminRoomRow()] });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const close = await roomAction(app, "close");
  const disable = await roomAction(app, "disable");
  const archive = await roomAction(app, "archive");
  const reopen = await roomAction(app, "reopen");

  assert.equal(close.statusCode, 200);
  assert.equal(close.json().room.status, "closed");
  assert.equal(disable.statusCode, 200);
  assert.equal(disable.json().room.status, "disabled");
  assert.equal(archive.statusCode, 200);
  assert.equal(archive.json().room.status, "archived");
  assert.equal(reopen.statusCode, 200);
  assert.equal(reopen.json().room.status, "active");
  assert.deepEqual(
    state.moderationActions.map((action) => action.action),
    ["close", "disable", "archive", "reopen"],
  );
  assert.deepEqual(
    state.auditInputs.map((input) => input.action),
    [
      "admin.nearbyRooms.close",
      "admin.nearbyRooms.disable",
      "admin.nearbyRooms.archive",
      "admin.nearbyRooms.reopen",
    ],
  );
  assert.equal(state.room(roomId)?.memberCount, 0);
  assert.equal(state.room(roomId)?.threadId, null);
  assertNoPrivateNearbyFields(reopen.json());
});

test("POST /admin/nearby-rooms/:roomId/actions tombstones only archived rooms", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockNearbyRoomAdmin({ rooms: [adminRoomRow({ status: "archived" })] });
  const app = buildApp();
  t.after(async () => app.close());

  const response = await roomAction(app, "delete");

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().room.status, "deleted");
  assert.equal(state.room(roomId)?.status, "deleted");
  assert.equal(state.moderationActions[0]?.action, "delete");
  assert.equal(state.auditInputs[0]?.action, "admin.nearbyRooms.delete");
  assert.deepEqual(state.auditInputs[0]?.metadata, {
    typeKey: "coffee_nearby",
    previousStatus: "archived",
    nextStatus: "deleted",
    softDelete: true,
    deletedFromArchive: true,
  });
});

test("delete requires archived status and deleted rooms cannot be modified", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  const state = mockNearbyRoomAdmin({ rooms: [adminRoomRow()] });
  const app = buildApp();
  t.after(async () => app.close());

  for (const status of ["active", "closed", "disabled"] as const) {
    const room = state.room(roomId);
    if (room) room.status = status;
    assert.equal((await roomAction(app, "delete")).statusCode, 400);
  }
  const room = state.room(roomId);
  if (room) room.status = "deleted";
  assert.equal((await roomAction(app, "reopen")).statusCode, 400);
  assert.equal(state.moderationActions.length, 0);
});

test("GET /admin/nearby-rooms hides archived by default and includes archived on query", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["support"] });
  const state = mockNearbyRoomAdmin({
    rooms: [
      adminRoomRow(),
      adminRoomRow({
        id: archivedRoomId,
        status: "archived",
        updatedAt: new Date("2026-06-20T12:05:00.000Z"),
      }),
      adminRoomRow({ id: deletedRoomId, status: "deleted" }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const defaultList = await app.inject({
    method: "GET",
    url: "/admin/nearby-rooms",
    headers: authHeaders(userId),
  });
  const archivedList = await app.inject({
    method: "GET",
    url: "/admin/nearby-rooms?includeArchived=true",
    headers: authHeaders(userId),
  });

  assert.equal(defaultList.statusCode, 200);
  assert.deepEqual(
    defaultList.json().items.map((item: { id: string }) => item.id),
    [roomId],
  );
  assert.equal(archivedList.statusCode, 200);
  assert.deepEqual(
    archivedList.json().items.map((item: { id: string }) => item.id),
    [roomId, archivedRoomId],
  );
  assert.deepEqual(state.listOptions, [
    { includeArchived: false },
    { includeArchived: true },
  ]);
  assert.deepEqual(
    state.auditInputs.map((input) => input.metadata),
    [
      { includeArchived: false, resultCount: 1 },
      { includeArchived: true, resultCount: 2 },
    ],
  );
});

test("public nearby rooms list returns active rooms and not archived rooms", async (t) => {
  t.after(restoreDeps);
  const activeRoom = nearbyRoomListRow();
  const archivedRoom = nearbyRoomListRow({
    id: archivedRoomId,
    status: "archived",
  });
  const deletedRoom = nearbyRoomListRow({ id: deletedRoomId, status: "deleted" });
  restorePublicRoomsDeps = nearbyRoomsService.__setNearbyRoomsServiceDepsForTests({
    repo: {
      listPublicNearbyRoomsForUser: async () =>
        [activeRoom, archivedRoom, deletedRoom].filter((room) => room.status === "active"),
      findNearbyRoomForUser: async () => undefined,
      createNearbyRoomMembership: async () => undefined,
      reactivateNearbyRoomMembership: async () => undefined,
      markNearbyRoomMembershipLeft: async () => undefined,
    },
    activityPreferencesRepo: {
      hasActiveUserActivityPreferenceForActivity: async () => false,
    },
  });

  const response = await nearbyRoomsService.listNearbyRooms(userId);

  assert.deepEqual(response.items.map((item) => item.id), [roomId]);
  assert.deepEqual(new Set(response.items.map((item) => item.status)), new Set(["active"]));
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
    createdRoomTypes: NearbyRoomTypeRow[];
    listOptions: Required<ListNearbyRoomsForAdminOptions>[];
    moderationActions: Array<{ roomId: string; adminUserId: string; action: string }>;
    room: (nextRoomId: string) => AdminNearbyRoomRow | undefined;
  } = {
    auditInputs: [],
    createdRooms: [],
    createdRoomTypes: [],
    listOptions: [],
    moderationActions: [],
    room: (nextRoomId) => rooms.get(nextRoomId),
  };

  const repo = {
    listNearbyRoomTypesForAdmin: async () => [...roomTypes.values()],
    listNearbyRoomsForAdmin: async (options: ListNearbyRoomsForAdminOptions = {}) => {
      const includeArchived = Boolean(options.includeArchived);
      state.listOptions.push({ includeArchived });
      return [...rooms.values()].filter(
        (room) => room.status !== "deleted" && (includeArchived || room.status !== "archived"),
      );
    },
    findNearbyRoomTypeByKey: async (typeKey: string) => roomTypes.get(typeKey),
    createNearbyRoomTypeForAdmin: async (createInput: {
      key: string;
      title: string;
      sortOrder: number;
      createdAt: Date;
    }) => {
      const row = roomTypeRow({
        key: createInput.key,
        title: createInput.title,
        sortOrder: createInput.sortOrder,
        createdAt: createInput.createdAt,
        updatedAt: createInput.createdAt,
      });
      roomTypes.set(row.key, row);
      state.createdRoomTypes.push(row);
      return row;
    },
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
        title: createInput.title ?? null,
        description: createInput.description ?? null,
        locationLabel: createInput.locationLabel ?? null,
        startsAt: createInput.startsAt ?? null,
        endsAt: createInput.endsAt ?? null,
        expiresAt: createInput.expiresAt ?? null,
        createdFromDemandSnapshot: createInput.createdFromDemandSnapshot ?? null,
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
      status: "active" | "closed" | "disabled" | "archived" | "deleted",
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
  restorePublicRoomsDeps?.();
  restoreAdminDeps = null;
  restoreNearbyRoomDeps = null;
  restorePublicRoomsDeps = null;
}

async function roomAction(
  app: ReturnType<typeof buildApp>,
  action: "close" | "disable" | "reopen" | "archive" | "delete",
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
    title: null,
    description: null,
    locationLabel: null,
    startsAt: null,
    endsAt: null,
    expiresAt: null,
    createdFromDemandSnapshot: null,
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
    title: null,
    description: null,
    locationLabel: null,
    startsAt: null,
    endsAt: null,
    expiresAt: null,
    createdFromDemandSnapshot: null,
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

function nearbyRoomListRow(overrides: Partial<NearbyRoomListRow> = {}): NearbyRoomListRow {
  return {
    id: roomId,
    typeKey: "coffee_nearby",
    title: "Coffee nearby",
    geoBucket: "city:zagreb:center",
    locationLabel: null,
    startsAt: null,
    roomTypeStatus: "active",
    adminApproved: true,
    sortOrder: 10,
    status: "active",
    threadId: null,
    memberCount: 0,
    viewerMembershipStatus: null,
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
