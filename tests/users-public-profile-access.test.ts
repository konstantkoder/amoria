import assert from "node:assert/strict";
import test from "node:test";
import type { MediaFileRow, UserRow } from "../src/db/schema";
import { AppError } from "../src/common/errors";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "https://api.example.test/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const usersService = require("../src/users/users.service") as typeof import("../src/users/users.service");

type UsersRepo = typeof import("../src/users/users.repo");

const userAId = "00000000-0000-4000-8000-000000000001";
const userBId = "00000000-0000-4000-8000-000000000002";
const missingUserId = "00000000-0000-4000-8000-000000000099";
const userBAvatarMediaId = "00000000-0000-4000-8000-000000000101";
const userBPhotoId = "00000000-0000-4000-8000-000000000102";
const userBStoredAvatarUrl = "https://stale.trycloudflare.com/users/user-b/avatar.webp";
const publicMediaBaseUrl = "/media";
const userBAvatarUrl = `${publicMediaBaseUrl}/public/${userBAvatarMediaId}`;
const userBPhotoUrl = `${publicMediaBaseUrl}/public/${userBPhotoId}`;

let restoreDeps: (() => void) | null = null;

test.after(async () => {
  restoreUsersDeps();
  await closeDb();
});

test("GET /users/:id/public requires authentication", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/users/${userBId}/public`,
  });

  assert.equal(response.statusCode, 401);
});

test("GET /users/by-amoria-id/:amoriaId requires authentication", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/users/by-amoria-id/AM23456",
  });

  assert.equal(response.statusCode, 401);
});

test("authenticated user can load peer public profile without internal fields", async (t) => {
  t.after(restoreUsersDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let blockCheck: [string, string] | undefined;
  mockUsers({
    isBlockedEitherWay: async (currentUserId, targetUserId) => {
      blockCheck = [currentUserId, targetUserId];
      return false;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: `/users/${userBId}/public`,
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(blockCheck, [userAId, userBId]);
  assert.deepEqual(Object.keys(body).sort(), [
    "about",
    "ageGroup",
    "amoriaId",
    "avatarUrl",
    "displayName",
    "goal",
    "id",
    "interests",
    "lockedGallery",
    "mood",
    "photos",
  ]);
  assert.equal(body.id, userBId);
  assert.equal(body.email, undefined);
  assert.equal(body.birthDate, undefined);
  assert.equal(body.age, undefined);
  assert.equal(body.ageGroup, "25-34");
  assert.equal(body.goal, "dating");
  assert.equal(body.mood, "curious");
  assert.deepEqual(body.interests, ["coffee"]);
  assert.equal(body.passwordHash, undefined);
  assert.equal(body.createdAt, undefined);
  assert.equal(body.updatedAt, undefined);
  assert.equal(body.allowAdultMode, undefined);
  assert.equal(body.avatarUrl, userBAvatarUrl);
  assert.equal(JSON.stringify(body).includes("trycloudflare"), false);
  assert.equal(JSON.stringify(body).includes("localhost"), false);
  assert.equal(JSON.stringify(body).includes("minio:9000"), false);
  assert.deepEqual(body.lockedGallery, { enabled: true, count: 2 });
  assert.deepEqual(body.photos, [{ mediaId: userBPhotoId, url: userBPhotoUrl, position: 0 }]);
});

test("own public profile can be loaded without block check", async (t) => {
  t.after(restoreUsersDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let blockChecked = false;
  mockUsers({
    isBlockedEitherWay: async () => {
      blockChecked = true;
      return false;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: "/users/by-amoria-id/AM23456",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().id, userAId);
  assert.equal(blockChecked, false);
});

test("blocked public profile request returns 403 without profile data", async (t) => {
  t.after(restoreUsersDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockUsers({
    isBlockedEitherWay: async () => true,
  });

  const response = await app.inject({
    method: "GET",
    url: `/users/${userBId}/public`,
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 403);
  assert.equal(body.error.code, "profile_unavailable");
  assert.equal(body.about, undefined);
  assert.equal(body.photos, undefined);
  assert.equal(body.avatarUrl, undefined);
});

test("missing public profile returns 404", async (t) => {
  t.after(restoreUsersDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockUsers();

  const response = await app.inject({
    method: "GET",
    url: `/users/${missingUserId}/public`,
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "not_found");
});

test("legacy local avatarUrl is hidden without profile failure", async (t) => {
  t.after(restoreUsersDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const legacyAvatarUrl = "http://localhost:4000/media/users/user-b/avatar.webp";
  mockUsers({
    userBOverrides: {
      avatarUrl: legacyAvatarUrl,
    },
  });

  const response = await app.inject({
    method: "GET",
    url: `/users/${userBId}/public`,
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().avatarUrl, null);
});

test("public profile hides avatarUrl when avatar media object is missing", async (t) => {
  t.after(restoreUsersDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockUsers({ missingAvatarObject: true });

  const response = await app.inject({
    method: "GET",
    url: `/users/${userBId}/public`,
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().avatarUrl, null);
});

test("PATCH /me/profile normalizes backend profile tags", async (t) => {
  t.after(restoreUsersDeps);
  mockUsers({
    onUpdateProfile: async (_userId, input) => userRow({
      id: userAId,
      amoriaId: "AM23456",
      interests: input.interests ?? [],
    }),
  });

  const response = await usersService.updateCurrentUserProfile(userAId, {
    interests: [" Coffee ", "#Travel", "coffee", "  live music  "],
  });

  assert.deepEqual(response.interests, ["coffee", "travel", "live music"]);
});

test("PATCH /me/profile rejects unsafe profile tags", async (t) => {
  t.after(restoreUsersDeps);
  mockUsers();

  await assert.rejects(
    async () =>
      usersService.updateCurrentUserProfile(userAId, {
        interests: ["45.815, 15.9819"],
      }),
    (error) => {
      const appError = error as { code?: string; details?: Record<string, string> };
      assert.equal(appError.code, "validation_error");
      assert.deepEqual(appError.details, { "interests.0": "unsafe" });
      return true;
    },
  );
});

function mockUsers(input: {
  isBlockedEitherWay?: (currentUserId: string, targetUserId: string) => Promise<boolean>;
  userBOverrides?: Partial<UserRow>;
  missingAvatarObject?: boolean;
  onUpdateProfile?: (
    userId: string,
    input: Parameters<UsersRepo["updateUserProfile"]>[1],
  ) => Promise<UserRow | undefined>;
} = {}): void {
  restoreUsersDeps();

  const repo = {
    findUserById: async (userId: string) => {
      if (userId === userAId) return userRow({ id: userAId, amoriaId: "AM23456" });
      if (userId === userBId) {
        return userRow({ id: userBId, amoriaId: "AM34567", ...input.userBOverrides });
      }
      return undefined;
    },
    findUserByAmoriaId: async (amoriaId: string) => {
      if (amoriaId === "AM23456") return userRow({ id: userAId, amoriaId });
      if (amoriaId === "AM34567") return userRow({ id: userBId, amoriaId });
      return undefined;
    },
    updateUserProfile: input.onUpdateProfile ?? (async () => undefined),
    updateUserAvatar: async () => undefined,
  } satisfies Partial<UsersRepo>;

  restoreDeps = usersService.__setUsersServiceDepsForTests({
    repo,
    findOwnedMediaFileByUrl: async (userId, avatarUrl) => {
      if (userId === userBId && avatarUrl === userBStoredAvatarUrl) {
        return mediaRow({
          id: userBAvatarMediaId,
          ownerUserId: userBId,
          type: "avatar",
          path: `users/${userBId}/avatar/${userBAvatarMediaId}.webp`,
          url: avatarUrl,
        });
      }
      return undefined;
    },
    headObject: async () => {
      if (input.missingAvatarObject) {
        throw new AppError("not_found", "Object was not found in storage", 404);
      }
      return { sizeBytes: 1234, contentType: "image/webp" };
    },
    isBlockedEitherWay: input.isBlockedEitherWay ?? (async () => false),
    gallery: {
      getPublicGalleryForUser: async (userId: string) => ({
        photos: userId === userBId
          ? [{ mediaId: userBPhotoId, url: userBPhotoUrl, position: 0 }]
          : [],
        lockedGallery: userId === userBId
          ? { enabled: true, count: 2 }
          : { enabled: false, count: 0 },
      }),
      replacePublicGalleryPhotosFromProfilePatch: async () => undefined,
    },
  });
}

function restoreUsersDeps(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function userRow(overrides: Partial<UserRow>): UserRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: userBId,
    email: "user-b@example.test",
    passwordHash: "hash",
    displayName: "User B",
    about: "Public about",
    amoriaId: "AM34567",
    avatarUrl: userBStoredAvatarUrl,
    photos: [{ mediaId: userBPhotoId, url: userBPhotoUrl }],
    gender: null,
    preferredGenders: [],
    goal: "dating",
    mood: "curious",
    interests: ["coffee"],
    flirtEnabled: true,
    allowAdultMode: true,
    mysteryMode: true,
    birthDate: "1995-01-01",
    preferredAgeMin: 18,
    preferredAgeMax: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    lastSeenAt: overrides.lastSeenAt ?? null,
  };
}

function mediaRow(overrides: Partial<MediaFileRow>): MediaFileRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: String(overrides.id ?? userBAvatarMediaId),
    ownerUserId: String(overrides.ownerUserId ?? userBId),
    type: String(overrides.type ?? "avatar"),
    path: String(overrides.path ?? `users/${userBId}/avatar/${userBAvatarMediaId}.webp`),
    url: String(overrides.url ?? userBStoredAvatarUrl),
    mimeType: String(overrides.mimeType ?? "image/webp"),
    sizeBytes: Number(overrides.sizeBytes ?? 1234),
    width: Number(overrides.width ?? 512),
    height: Number(overrides.height ?? 512),
    checksumSha256: overrides.checksumSha256 ?? null,
    createdAt: now,
  };
}
