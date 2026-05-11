import assert from "node:assert/strict";
import test from "node:test";
import type { UserRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const usersService = require("../src/users/users.service") as typeof import("../src/users/users.service");

type UsersRepo = typeof import("../src/users/users.repo");

const userAId = "00000000-0000-4000-8000-000000000001";
const userBId = "00000000-0000-4000-8000-000000000002";
const missingUserId = "00000000-0000-4000-8000-000000000099";
const userBPhotoId = "00000000-0000-4000-8000-000000000102";
const userBPhotoUrl = "https://cdn.example.test/users/user-b/profile/photo.webp";

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
    "amoriaId",
    "avatarUrl",
    "displayName",
    "id",
    "photos",
  ]);
  assert.equal(body.id, userBId);
  assert.equal(body.email, undefined);
  assert.equal(body.passwordHash, undefined);
  assert.equal(body.createdAt, undefined);
  assert.equal(body.updatedAt, undefined);
  assert.equal(body.allowAdultMode, undefined);
  assert.deepEqual(body.photos, [{ mediaId: userBPhotoId, url: userBPhotoUrl }]);
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

function mockUsers(input: {
  isBlockedEitherWay?: (currentUserId: string, targetUserId: string) => Promise<boolean>;
} = {}): void {
  restoreUsersDeps();

  const repo = {
    findUserById: async (userId: string) => {
      if (userId === userAId) return userRow({ id: userAId, amoriaId: "AM23456" });
      if (userId === userBId) return userRow({ id: userBId, amoriaId: "AM34567" });
      return undefined;
    },
    findUserByAmoriaId: async (amoriaId: string) => {
      if (amoriaId === "AM23456") return userRow({ id: userAId, amoriaId });
      if (amoriaId === "AM34567") return userRow({ id: userBId, amoriaId });
      return undefined;
    },
    updateUserProfile: async () => undefined,
    updateUserAvatar: async () => undefined,
  } satisfies Partial<UsersRepo>;

  restoreDeps = usersService.__setUsersServiceDepsForTests({
    repo: repo as UsersRepo,
    isBlockedEitherWay: input.isBlockedEitherWay ?? (async () => false),
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
    avatarUrl: "https://cdn.example.test/users/user-b/avatar.webp",
    photos: [{ mediaId: userBPhotoId, url: userBPhotoUrl }],
    goal: "dating",
    mood: "curious",
    interests: ["coffee"],
    flirtEnabled: true,
    allowAdultMode: true,
    mysteryMode: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
