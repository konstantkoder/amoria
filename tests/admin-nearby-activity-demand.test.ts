import assert from "node:assert/strict";
import test from "node:test";
import type { AdminContextRow } from "../src/admin/admin.repo";
import type { AdminAuditInput, AdminRoleKey } from "../src/admin/admin.types";
import type { AdminUserRow, UserRow } from "../src/db/schema";
import type {
  NearbyActivityDemandPreferenceRow,
  NearbyActivityDemandRoomRow,
} from "../src/nearby/nearby-activity-demand.repo";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { NEARBY_ACTIVITY_DEFINITIONS } =
  require("../src/config/constants") as typeof import("../src/config/constants");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const adminService = require("../src/admin/admin.service") as typeof import("../src/admin/admin.service");
const adminActivityDemandService =
  require("../src/admin/admin-activity-demand.service") as typeof import("../src/admin/admin-activity-demand.service");

const now = new Date("2026-06-22T12:00:00.000Z");
const oldUpdate = new Date("2026-06-10T12:00:00.000Z");
const userId = "00000000-0000-4000-8000-000000000001";
const adminUserId = "00000000-0000-4000-8000-0000000000a1";

let restoreAdminDeps: (() => void) | null = null;
let restoreDemandDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("GET /admin/nearby-activity-demand returns zero demand when preferences are empty", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  const state = mockActivityDemand();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/nearby-activity-demand",
    headers: authHeaders(userId),
  });
  const body = response.json();
  const coffee = demandFor(body, "coffee_nearby");

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, NEARBY_ACTIVITY_DEFINITIONS.length);
  assert.deepEqual(
    {
      interestedUsersCount: coffee.interestedUsersCount,
      activeNearbyUsersCount: coffee.activeNearbyUsersCount,
      recentlyUpdatedUsersCount: coffee.recentlyUpdatedUsersCount,
      geoBuckets: coffee.geoBuckets,
      existingActiveRoomCount: coffee.existingActiveRoomCount,
      lastUpdatedAt: coffee.lastUpdatedAt,
    },
    {
      interestedUsersCount: 0,
      activeNearbyUsersCount: 0,
      recentlyUpdatedUsersCount: 0,
      geoBuckets: [],
      existingActiveRoomCount: 0,
      lastUpdatedAt: null,
    },
  );
  assert.equal(body.nextCursor, null);
  assert.equal(state.auditInputs[0]?.action, "admin.nearbyActivityDemand.read");
  assertNoPrivateDemandFields(response.body);
});

test("GET /admin/nearby-activity-demand allows all demand-reader admin roles", async (t) => {
  t.after(restoreDeps);
  mockActivityDemand();

  for (const role of ["owner", "moderator", "support", "ops"] as const) {
    mockAdmin({ roles: [role] });
    const app = buildApp();
    t.after(async () => {
      await app.close();
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/nearby-activity-demand",
      headers: authHeaders(userId),
    });

    assert.equal(response.statusCode, 200);
  }
});

test("GET /admin/nearby-activity-demand counts active preferences as interested users", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["support"] });
  mockActivityDemand({
    preferences: [
      preferenceRow({
        userId: demandUserId(1),
        activityKey: "coffee_nearby",
        hasActiveNearbyVisibility: true,
      }),
      preferenceRow({
        userId: demandUserId(2),
        activityKey: "coffee_nearby",
        updatedAt: oldUpdate,
      }),
      preferenceRow({
        userId: demandUserId(1),
        activityKey: "coffee_nearby",
        geoBucket: "city:zagreb:center",
      }),
      preferenceRow({
        userId: demandUserId(3),
        activityKey: "walk_nearby",
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/nearby-activity-demand",
    headers: authHeaders(userId),
  });
  const coffee = demandFor(response.json(), "coffee_nearby");
  const walk = demandFor(response.json(), "walk_nearby");

  assert.equal(response.statusCode, 200);
  assert.equal(coffee.interestedUsersCount, 2);
  assert.equal(coffee.activeNearbyUsersCount, 1);
  assert.equal(coffee.recentlyUpdatedUsersCount, 1);
  assert.equal(coffee.lastUpdatedAt, now.toISOString());
  assert.equal(walk.interestedUsersCount, 1);
});

test("GET /admin/nearby-activity-demand aggregates release catalog keys", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["support"] });
  mockActivityDemand({
    preferences: [
      preferenceRow({
        userId: demandUserId(1),
        activityKey: "volleyball_nearby",
        geoBucket: "city:zagreb:sports",
        hasActiveNearbyVisibility: true,
      }),
      preferenceRow({
        userId: demandUserId(2),
        activityKey: "museum_exhibition_nearby",
      }),
    ],
    rooms: [
      roomRow({ typeKey: "volleyball_nearby", status: "active" }),
      roomRow({ typeKey: "museum_exhibition_nearby", status: "active" }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/nearby-activity-demand",
    headers: authHeaders(userId),
  });
  const volleyball = demandFor(response.json(), "volleyball_nearby");
  const museum = demandFor(response.json(), "museum_exhibition_nearby");

  assert.equal(response.statusCode, 200);
  assert.equal(volleyball.interestedUsersCount, 1);
  assert.equal(volleyball.activeNearbyUsersCount, 1);
  assert.equal(volleyball.existingActiveRoomCount, 1);
  assert.equal(museum.interestedUsersCount, 1);
  assert.equal(museum.existingActiveRoomCount, 1);
  assertNoPrivateDemandFields(response.body);
});

test("GET /admin/nearby-activity-demand excludes disabled preferences", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  mockActivityDemand({
    preferences: [
      preferenceRow({
        userId: demandUserId(1),
        activityKey: "coffee_nearby",
        updatedAt: oldUpdate,
      }),
      preferenceRow({
        userId: demandUserId(2),
        activityKey: "coffee_nearby",
        status: "disabled",
        hasActiveNearbyVisibility: true,
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/nearby-activity-demand",
    headers: authHeaders(userId),
  });
  const coffee = demandFor(response.json(), "coffee_nearby");

  assert.equal(response.statusCode, 200);
  assert.equal(coffee.interestedUsersCount, 1);
  assert.equal(coffee.activeNearbyUsersCount, 0);
  assert.equal(coffee.recentlyUpdatedUsersCount, 0);
  assert.equal(coffee.lastUpdatedAt, oldUpdate.toISOString());
});

test("GET /admin/nearby-activity-demand keeps interested users separate from room members", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["moderator"] });
  mockActivityDemand({
    preferences: [
      preferenceRow({ userId: demandUserId(1), activityKey: "coffee_nearby" }),
      preferenceRow({ userId: demandUserId(2), activityKey: "coffee_nearby" }),
      preferenceRow({ userId: demandUserId(3), activityKey: "coffee_nearby" }),
      preferenceRow({ userId: demandUserId(4), activityKey: "coffee_nearby" }),
    ],
    rooms: [
      roomRow({ typeKey: "coffee_nearby", status: "active" }),
      roomRow({ typeKey: "coffee_nearby", status: "active" }),
      roomRow({ typeKey: "coffee_nearby", status: "closed" }),
      roomRow({ typeKey: "walk_nearby", status: "active" }),
      roomRow({ typeKey: "legacy_room_type", status: "active" }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/nearby-activity-demand",
    headers: authHeaders(userId),
  });
  const body = response.json();
  const coffee = demandFor(body, "coffee_nearby");
  const walk = demandFor(body, "walk_nearby");

  assert.equal(response.statusCode, 200);
  assert.equal(coffee.interestedUsersCount, 4);
  assert.equal(coffee.existingActiveRoomCount, 2);
  assert.notEqual(coffee.existingActiveRoomCount, coffee.interestedUsersCount);
  assert.equal(walk.existingActiveRoomCount, 1);
  assert.equal(response.body.includes("memberCount"), false);
});

test("GET /admin/nearby-activity-demand hides small geo buckets", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["ops"] });
  mockActivityDemand({
    preferences: [
      preferenceRow({
        userId: demandUserId(1),
        activityKey: "coffee_nearby",
        geoBucket: "city:small",
      }),
      preferenceRow({
        userId: demandUserId(2),
        activityKey: "coffee_nearby",
        geoBucket: "city:small",
      }),
      preferenceRow({
        userId: demandUserId(3),
        activityKey: "coffee_nearby",
        geoBucket: "city:large",
      }),
      preferenceRow({
        userId: demandUserId(4),
        activityKey: "coffee_nearby",
        geoBucket: "city:large",
      }),
      preferenceRow({
        userId: demandUserId(5),
        activityKey: "coffee_nearby",
        geoBucket: "city:large",
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/nearby-activity-demand",
    headers: authHeaders(userId),
  });
  const coffee = demandFor(response.json(), "coffee_nearby");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(coffee.geoBuckets, [
    { geoBucket: "city:large", interestedUsersCount: 3 },
    { geoBucket: "small_bucket_hidden", interestedUsersCount: 2 },
  ]);
  assert.equal(response.body.includes("city:small"), false);
});

test("GET /admin/nearby-activity-demand exposes no user-level or location profile data", async (t) => {
  t.after(restoreDeps);
  mockAdmin({ roles: ["owner"] });
  const firstDemandUserId = demandUserId(1);
  mockActivityDemand({
    preferences: [
      preferenceRow({
        userId: firstDemandUserId,
        activityKey: "coffee_nearby",
        geoBucket: "city:zagreb:center",
        hasActiveNearbyVisibility: true,
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/admin/nearby-activity-demand",
    headers: authHeaders(userId),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes(firstDemandUserId), false);
  assertNoPrivateDemandFields(response.body);
});

function mockActivityDemand(input: {
  preferences?: NearbyActivityDemandPreferenceRow[];
  rooms?: NearbyActivityDemandRoomRow[];
} = {}) {
  restoreDemandDeps?.();
  restoreDemandDeps = null;

  const state: {
    auditInputs: AdminAuditInput[];
  } = {
    auditInputs: [],
  };

  restoreDemandDeps =
    adminActivityDemandService.__setAdminActivityDemandServiceDepsForTests({
      now: () => now,
      repo: {
        listNearbyActivityDemandSourceRows: async () => ({
          preferences: input.preferences ?? [],
          rooms: input.rooms ?? [],
        }),
      },
      audit: {
        writeAuditLog: async (auditInput) => {
          state.auditInputs.push(auditInput);
        },
      },
    });

  return state;
}

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

function restoreDeps(): void {
  restoreAdminDeps?.();
  restoreDemandDeps?.();
  restoreAdminDeps = null;
  restoreDemandDeps = null;
}

function demandFor(
  body: { items: Array<Record<string, any>> },
  activityKey: string,
): Record<string, any> {
  const item = body.items.find((candidate) => candidate.activityKey === activityKey);
  assert.ok(item, `Missing demand row for ${activityKey}`);
  return item;
}

function preferenceRow(
  overrides: Partial<NearbyActivityDemandPreferenceRow> = {},
): NearbyActivityDemandPreferenceRow {
  return {
    userId: demandUserId(1),
    activityKey: "coffee_nearby",
    status: "active",
    geoBucket: null,
    source: "nearby_questionnaire",
    updatedAt: now,
    hasActiveNearbyVisibility: false,
    ...overrides,
  };
}

function roomRow(
  overrides: Partial<NearbyActivityDemandRoomRow> = {},
): NearbyActivityDemandRoomRow {
  return {
    typeKey: "coffee_nearby",
    status: "active",
    ...overrides,
  };
}

function demandUserId(index: number): string {
  return `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`;
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

function assertNoPrivateDemandFields(bodyText: string): void {
  assert.equal(bodyText.includes("userId"), false);
  assert.equal(bodyText.includes("latitude"), false);
  assert.equal(bodyText.includes("longitude"), false);
  assert.equal(bodyText.includes('"birthDate":"'), false);
  assert.equal(bodyText.includes('"birth_date":"'), false);
  assert.equal(bodyText.includes("1995-01-01"), false);
  assert.equal(bodyText.includes("memberCount"), false);
}
