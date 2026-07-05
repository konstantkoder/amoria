import assert from "node:assert/strict";
import test from "node:test";
import type {
  NearbyProfileVisibilityRow,
  NewNearbyProfileVisibilityRow,
  UserRow,
} from "../src/db/schema";
import type { NearbyProfileFeedRow, NearbyFeedRow } from "../src/nearby/nearby.repo";
import type { PublicUserProfile } from "../src/users/users.service";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const nearbyService = require("../src/nearby/nearby.service") as typeof import("../src/nearby/nearby.service");
const ageHelpers = require("../src/users/age") as typeof import("../src/users/age");

const now = new Date("2026-06-03T12:00:00.000Z");
const viewerId = "00000000-0000-4000-8000-000000000001";
const matchId = "00000000-0000-4000-8000-000000000002";
const offId = "00000000-0000-4000-8000-000000000003";
const expiredId = "00000000-0000-4000-8000-000000000004";
const blockedId = "00000000-0000-4000-8000-000000000005";
const ageMismatchId = "00000000-0000-4000-8000-000000000006";
const genderMismatchId = "00000000-0000-4000-8000-000000000007";
const radiusMismatchId = "00000000-0000-4000-8000-000000000008";

let restoreNearbyDeps: (() => void) | null = null;

test.after(async () => {
  restoreNearbyDeps?.();
  await closeDb();
});

test("Nearby profile visibility can be created, updated, patched, and read without coordinates", async (t) => {
  t.after(restoreDeps);
  mockNearby();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const createResponse = await app.inject({
    method: "PUT",
    url: "/nearby/me/visibility",
    headers: authHeaders(viewerId),
    payload: {
      enabled: true,
      latitude: 45.815,
      longitude: 15.9819,
      radiusKm: 25,
      nearbyStatus: "Coffee near the park",
      statusKind: "coffee",
      expiresInSec: 3600,
    },
  });

  assert.equal(createResponse.statusCode, 200);
  assert.deepEqual(createResponse.json().visibility, {
    status: "active",
    radiusKm: 25,
    nearbyStatus: "Coffee near the park",
    statusKind: "coffee",
    updatedAt: now.toISOString(),
    expiresAt: "2026-06-03T13:00:00.000Z",
  });
  assertNoPrivateNearbyFields(createResponse.json());

  const updateResponse = await app.inject({
    method: "PUT",
    url: "/nearby/me/visibility",
    headers: authHeaders(viewerId),
    payload: {
      enabled: true,
      latitude: 45.82,
      longitude: 15.99,
      radiusKm: 10,
      nearbyStatus: "Short walk",
      statusKind: "walk",
      expiresInSec: 7200,
    },
  });

  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.json().visibility.radiusKm, 10);
  assert.equal(updateResponse.json().visibility.statusKind, "walk");
  assertNoPrivateNearbyFields(updateResponse.json());

  const patchResponse = await app.inject({
    method: "PATCH",
    url: "/nearby/me/status",
    headers: authHeaders(viewerId),
    payload: {
      nearbyStatus: "Open to suggestions",
      statusKind: "open_to_suggestions",
    },
  });

  assert.equal(patchResponse.statusCode, 200);
  assert.equal(patchResponse.json().visibility.nearbyStatus, "Open to suggestions");
  assert.equal(patchResponse.json().visibility.statusKind, "open_to_suggestions");
  assertNoPrivateNearbyFields(patchResponse.json());

  const meResponse = await app.inject({
    method: "GET",
    url: "/nearby/me",
    headers: authHeaders(viewerId),
  });

  assert.equal(meResponse.statusCode, 200);
  assert.equal(meResponse.json().visibility.status, "active");
  assertNoPrivateNearbyFields(meResponse.json());
});

test("Nearby profile visibility can be turned off and then feed returns no cards", async (t) => {
  t.after(restoreDeps);
  mockNearby();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  await app.inject({
    method: "PUT",
    url: "/nearby/me/visibility",
    headers: authHeaders(viewerId),
    payload: {
      enabled: true,
      latitude: 45.815,
      longitude: 15.9819,
      radiusKm: 25,
    },
  });

  const offResponse = await app.inject({
    method: "PUT",
    url: "/nearby/me/visibility",
    headers: authHeaders(viewerId),
    payload: {
      enabled: false,
    },
  });

  assert.equal(offResponse.statusCode, 200);
  assert.deepEqual(offResponse.json().visibility, {
    status: "off",
    radiusKm: null,
    nearbyStatus: null,
    statusKind: null,
    updatedAt: now.toISOString(),
    expiresAt: null,
  });

  const feedResponse = await app.inject({
    method: "GET",
    url: "/nearby/feed",
    headers: authHeaders(viewerId),
  });

  assert.equal(feedResponse.statusCode, 200);
  assert.deepEqual(feedResponse.json(), {
    items: [],
    nextCursor: null,
  });
});

test("Nearby summary returns safe aggregate counters only", async (t) => {
  t.after(restoreDeps);
  mockNearby({
    visibilities: [
      visibilityRow(viewerId),
      visibilityRow(matchId, { updatedAt: new Date("2026-06-03T10:00:00.000Z") }),
      visibilityRow(offId, {
        status: "off",
        latitude: null,
        longitude: null,
        radiusKm: null,
        updatedAt: new Date("2026-06-03T09:00:00.000Z"),
        expiresAt: null,
      }),
      visibilityRow(expiredId, {
        updatedAt: new Date("2026-06-03T08:00:00.000Z"),
        expiresAt: new Date("2026-06-03T11:59:00.000Z"),
      }),
      visibilityRow(blockedId, { updatedAt: new Date("2026-05-31T12:00:00.000Z") }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/nearby/summary",
    headers: authHeaders(viewerId),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    totalUsersCount: 1,
    onlineNowCount: 1,
    activeNearbyCount: 3,
    checkedAt: now.toISOString(),
  });
  assertNoPrivateNearbyFields(response.json());
});

test("Nearby profile feed returns only real compatible opted-in profiles with safe card fields", async (t) => {
  t.after(restoreDeps);
  mockNearby({
    blocks: new Set([`${viewerId}:${blockedId}`]),
    visibilities: [
      visibilityRow(viewerId, { latitude: 45.815, longitude: 15.982, radiusKm: 25 }),
      visibilityRow(matchId, {
        latitude: 45.83,
        longitude: 16.01,
        radiusKm: 25,
        nearbyStatus: "Coffee?",
        statusKind: "coffee",
      }),
      visibilityRow(offId, { status: "off", latitude: null, longitude: null, radiusKm: null }),
      visibilityRow(expiredId, {
        latitude: 45.83,
        longitude: 16.01,
        radiusKm: 25,
        expiresAt: new Date("2026-06-03T11:59:00.000Z"),
      }),
      visibilityRow(blockedId, { latitude: 45.83, longitude: 16.01, radiusKm: 25 }),
      visibilityRow(ageMismatchId, { latitude: 45.83, longitude: 16.01, radiusKm: 25 }),
      visibilityRow(genderMismatchId, { latitude: 45.83, longitude: 16.01, radiusKm: 25 }),
      visibilityRow(radiusMismatchId, { latitude: 45.95, longitude: 16.2, radiusKm: 1 }),
    ],
    users: [
      userRow(viewerId, {
        birthDate: "1995-01-01",
        gender: "man",
        preferredGenders: ["woman"],
        preferredAgeMin: 25,
        preferredAgeMax: 45,
      }),
      userRow(matchId, {
        displayName: "Real Match",
        birthDate: "1986-02-02",
        gender: "woman",
        preferredGenders: ["man"],
        goal: "dating",
        mood: "curious",
        interests: ["coffee", "walks"],
      }),
      userRow(offId, { gender: "woman", preferredGenders: ["man"] }),
      userRow(expiredId, { gender: "woman", preferredGenders: ["man"] }),
      userRow(blockedId, { gender: "woman", preferredGenders: ["man"] }),
      userRow(ageMismatchId, {
        birthDate: "1970-01-01",
        gender: "woman",
        preferredGenders: ["man"],
      }),
      userRow(genderMismatchId, { gender: "man", preferredGenders: ["woman"] }),
      userRow(radiusMismatchId, { gender: "woman", preferredGenders: ["man"] }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/nearby/feed?limit=20",
    headers: authHeaders(viewerId),
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.items.length, 1);
  assert.deepEqual(body.items[0], {
    userId: matchId,
    displayName: "Real Match",
    avatarUrl: `/media/public/avatar-${matchId}`,
    age: 40,
    ageGroup: "35-44",
    distanceBucket: "1_5km",
    goal: "dating",
    mood: "curious",
    interests: ["coffee", "walks"],
    publicPhotos: [
      { mediaId: `${matchId.slice(0, 35)}1`, url: `/media/public/photo-${matchId}-1` },
      { mediaId: `${matchId.slice(0, 35)}2`, url: `/media/public/photo-${matchId}-2` },
      { mediaId: `${matchId.slice(0, 35)}3`, url: `/media/public/photo-${matchId}-3` },
    ],
    nearbyStatus: "Coffee?",
    statusKind: "coffee",
    canMessage: true,
  });
  assertNoPrivateNearbyFields(body);
  assert.equal(JSON.stringify(body).includes("locked"), false);
});

test("Nearby profile feed mapper returns null age when birthDate is missing", async (t) => {
  t.after(restoreDeps);
  mockNearby();
  const user = userRow(matchId, { birthDate: null });
  const item = nearbyService.__toNearbyProfileFeedItemForTests(
    {
      visibility: visibilityRow(matchId),
      user,
      distanceKm: 2,
    },
    publicProfileForUser(user),
  );

  assert.equal(item.age, null);
  assert.equal(item.ageGroup, null);
  assertNoPrivateNearbyFields(item);
});

test("Nearby people feed does not require activity questionnaire", async (t) => {
  t.after(restoreDeps);
  mockNearby({
    visibilities: [
      visibilityRow(viewerId, { latitude: 45.815, longitude: 15.982, radiusKm: 25 }),
      visibilityRow(matchId, { latitude: 45.83, longitude: 16.01, radiusKm: 25 }),
    ],
    users: [
      userRow(viewerId, {
        birthDate: "1995-01-01",
        gender: "man",
        preferredGenders: ["woman"],
        preferredAgeMin: 25,
        preferredAgeMax: 35,
      }),
      userRow(matchId, {
        displayName: "Feed Match",
        birthDate: "1996-02-02",
        gender: "woman",
        preferredGenders: ["man"],
      }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/nearby/feed",
    headers: authHeaders(viewerId),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items.length, 1);
  assert.equal(response.json().items[0].userId, matchId);
  assertNoPrivateNearbyFields(response.json());
});

function mockNearby(input: {
  blocks?: Set<string>;
  users?: UserRow[];
  visibilities?: NearbyProfileVisibilityRow[];
} = {}) {
  restoreNearbyDeps?.();
  restoreNearbyDeps = null;

  const users = new Map<string, UserRow>(
    (input.users ?? [userRow(viewerId)]).map((user) => [user.id, user]),
  );
  const visibilities = new Map<string, NearbyProfileVisibilityRow>(
    (input.visibilities ?? []).map((visibility) => [visibility.userId, visibility]),
  );
  const blocks = input.blocks ?? new Set<string>();

  restoreNearbyDeps = nearbyService.__setNearbyServiceDepsForTests({
    now: () => new Date(now),
    usersRepo: {
      findUserById: async (userId) => users.get(userId),
    },
    toPublicUserProfile: async (user) => publicProfileForUser(user),
    repo: {
      createNearbyStatus: async () => {
        throw new Error("legacy status create is not used in these tests");
      },
      deleteOwnedNearbyStatus: async () => false,
      findNearbyProfileVisibility: async (userId) => visibilities.get(userId),
      getNearbySummaryCounts: async (checkedAt = now) => {
        const onlineSince = new Date(checkedAt.getTime() - 5 * 60 * 1000);
        let activeNearbyCount = 0;
        let onlineNowCount = 0;
        for (const user of users.values()) {
          if (user.lastSeenAt && user.lastSeenAt > onlineSince) {
            onlineNowCount += 1;
          }
        }
        for (const visibility of visibilities.values()) {
          if (
            visibility.status === "active" &&
            visibility.expiresAt &&
            visibility.expiresAt > checkedAt
          ) {
            activeNearbyCount += 1;
          }
        }
        return { totalUsersCount: users.size, onlineNowCount, activeNearbyCount };
      },
      listNearbyFeedRows: async () => [] as NearbyFeedRow[],
      upsertNearbyProfileVisibility: async (visibilityInput: NewNearbyProfileVisibilityRow) => {
        const row = visibilityRow(visibilityInput.userId, {
          status: visibilityInput.status ?? "off",
          latitude: visibilityInput.latitude ?? null,
          longitude: visibilityInput.longitude ?? null,
          radiusKm: visibilityInput.radiusKm ?? null,
          nearbyStatus: visibilityInput.nearbyStatus ?? null,
          statusKind: visibilityInput.statusKind ?? null,
          updatedAt: visibilityInput.updatedAt ?? now,
          expiresAt: visibilityInput.expiresAt ?? null,
        });
        visibilities.set(row.userId, row);
        return row;
      },
      listNearbyProfileFeedRows: async (
        viewerUserId,
        viewerLatitude,
        viewerLongitude,
        viewerRadiusKm,
        limit,
      ) => {
        const rows: NearbyProfileFeedRow[] = [];
        for (const visibility of visibilities.values()) {
          const user = users.get(visibility.userId);
          if (!user || visibility.userId === viewerUserId) continue;
          if (visibility.status !== "active" || !visibility.expiresAt || visibility.expiresAt <= now) {
            continue;
          }
          if (
            visibility.latitude === null ||
            visibility.longitude === null ||
            visibility.radiusKm === null
          ) {
            continue;
          }
          if (
            blocks.has(`${viewerUserId}:${visibility.userId}`) ||
            blocks.has(`${visibility.userId}:${viewerUserId}`)
          ) {
            continue;
          }
          const distanceKm = approximateDistanceKm(
            viewerLatitude,
            viewerLongitude,
            visibility.latitude,
            visibility.longitude,
          );
          if (distanceKm > viewerRadiusKm || distanceKm > visibility.radiusKm) {
            continue;
          }
          rows.push({ visibility, user, distanceKm });
        }
        rows.sort((a, b) => a.distanceKm - b.distanceKm);
        return rows.slice(0, limit);
      },
    },
  });
}

function restoreDeps() {
  restoreNearbyDeps?.();
  restoreNearbyDeps = null;
}

function authHeaders(userId: string) {
  return {
    Authorization: `Bearer ${signAccessToken(userId)}`,
  };
}

function userRow(userId: string, overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: userId,
    email: `${userId}@example.test`,
    passwordHash: "hash",
    displayName: "Nearby User",
    about: null,
    amoriaId: `AM${userId.slice(-5)}`,
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
    ...overrides,
    lastSeenAt: overrides.lastSeenAt ?? now,
  };
}

function visibilityRow(
  userId: string,
  overrides: Partial<NearbyProfileVisibilityRow> = {},
): NearbyProfileVisibilityRow {
  return {
    userId,
    status: "active",
    latitude: 45.815,
    longitude: 15.982,
    radiusKm: 25,
    nearbyStatus: null,
    statusKind: "open_to_suggestions",
    updatedAt: now,
    expiresAt: new Date("2026-06-03T13:00:00.000Z"),
    ...overrides,
  };
}

function publicProfileForUser(user: UserRow): PublicUserProfile {
  const age = ageHelpers.calculateAge(user.birthDate, now);
  return {
    id: user.id,
    displayName: user.displayName,
    amoriaId: user.amoriaId,
    about: user.about,
    avatarUrl: `/media/public/avatar-${user.id}`,
    photos: [1, 2, 3, 4].map((index) => ({
      mediaId: `${user.id.slice(0, 35)}${index}`,
      url: `/media/public/photo-${user.id}-${index}`,
      position: index - 1,
    })),
    goal: user.goal as PublicUserProfile["goal"],
    mood: user.mood as PublicUserProfile["mood"],
    interests: user.interests,
    ageGroup: ageHelpers.getAgeGroup(age),
    lockedGallery: {
      enabled: true,
      count: 2,
    },
  };
}

function approximateDistanceKm(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  return Math.sqrt((latA - latB) ** 2 + (lngA - lngB) ** 2) * 111;
}

function assertNoPrivateNearbyFields(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(serialized.includes("longitude"), false);
  assert.equal(serialized.includes("birthDate"), false);
  assert.equal(serialized.includes("preferredAgeMin"), false);
  assert.equal(serialized.includes("preferredAgeMax"), false);
  assert.equal(serialized.includes("distanceKm"), false);
  assert.equal(serialized.includes("distanceMeters"), false);
  assert.equal(serialized.includes("objectKey"), false);
  assert.equal(serialized.includes("signedUrl"), false);
  assert.equal(serialized.includes("X-Amz"), false);
}
