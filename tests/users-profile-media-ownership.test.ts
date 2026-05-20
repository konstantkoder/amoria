import assert from "node:assert/strict";
import test from "node:test";
import type { MediaFileRow, ProfilePhoto, UserRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "https://api.example.test/media";
process.env.UPLOADS_DIR = "./uploads-test";

const dbClient = require("../src/db/client") as typeof import("../src/db/client");
const usersService = require("../src/users/users.service") as typeof import("../src/users/users.service");

type MutableDb = {
  select: unknown;
  update: unknown;
};

const mutableDb = dbClient.db as unknown as MutableDb;
const originalSelect = mutableDb.select;
const originalUpdate = mutableDb.update;

const userAId = "00000000-0000-4000-8000-000000000001";
const userBId = "00000000-0000-4000-8000-000000000002";
const userAMediaId = "00000000-0000-4000-8000-000000000101";
const userBMediaId = "00000000-0000-4000-8000-000000000102";
const userAMediaUrl = "http://localhost:4000/media/users/user-a/profile/photo.webp";
const userAPublicMediaUrl = `https://api.example.test/media/public/${userAMediaId}`;
let restoreUsersDeps: (() => void) | null = null;

test.after(async () => {
  restoreServiceDeps();
  await dbClient.closeDb();
});

test("PATCH /me/profile rejects photos media owned by another user", async (t) => {
  t.after(() => {
    restoreDb();
    restoreServiceDeps();
  });

  let updateCalled = false;
  let mediaLookupCalled = false;

  mockDb({
    ownedMediaRows: [],
    onMediaLookup: () => {
      mediaLookupCalled = true;
    },
    onUpdate: () => {
      updateCalled = true;
      return userRow({ id: userAId });
    },
  });
  mockUsersServiceDeps();

  await assert.rejects(
    async () =>
      usersService.updateCurrentUserProfile(userAId, {
        photos: [{ mediaId: userBMediaId }],
      }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number; details?: Record<string, string> };
      assert.equal(appError.code, "media_not_owned");
      assert.equal(appError.statusCode, 403);
      assert.deepEqual(appError.details, { photos: "media_not_owned" });
      return true;
    },
  );

  assert.equal(mediaLookupCalled, true);
  assert.equal(updateCalled, false);
});

test("PATCH /me/profile stores owned photos with current public media URLs", async (t) => {
  t.after(() => {
    restoreDb();
    restoreServiceDeps();
  });

  let mediaLookupCalled = false;
  let updateInput: Partial<Pick<UserRow, "photos" | "updatedAt">> | undefined;

  mockDb({
    ownedMediaRows: [
      mediaRow({
        id: userAMediaId,
        ownerUserId: userAId,
        url: userAMediaUrl,
      }),
    ],
    onMediaLookup: () => {
      mediaLookupCalled = true;
    },
    onUpdate: (input) => {
      updateInput = input;
      return userRow({
        id: userAId,
        photos: input.photos ?? [],
      });
    },
  });
  mockUsersServiceDeps();

  const response = await usersService.updateCurrentUserProfile(userAId, {
    photos: [
      {
        mediaId: userAMediaId,
        url: "https://attacker.example/ignored.webp",
      },
    ],
  } as unknown as import("../src/users/users.service").UpdateProfileBody);
  const expectedPhotos: ProfilePhoto[] = [{ mediaId: userAMediaId, url: userAPublicMediaUrl }];

  assert.equal(mediaLookupCalled, true);
  assert.deepEqual(updateInput?.photos, expectedPhotos);
  assert.deepEqual(response.photos, expectedPhotos);
  assert.equal(JSON.stringify(response).includes("localhost"), false);
});

function mockDb(input: {
  ownedMediaRows: MediaFileRow[];
  onMediaLookup?: () => void;
  onUpdate?: (input: Partial<Pick<UserRow, "photos" | "updatedAt">>) => UserRow | undefined;
}): void {
  mutableDb.select = () => ({
    from: () => ({
      where: () => {
        input.onMediaLookup?.();
        return Promise.resolve(input.ownedMediaRows);
      },
    }),
  });
  mutableDb.update = () => ({
    set: (updateInput: Partial<Pick<UserRow, "photos" | "updatedAt">>) => ({
      where: () => ({
        returning: () => Promise.resolve([input.onUpdate?.(updateInput)].filter(Boolean)),
      }),
    }),
  });
}

function restoreDb(): void {
  mutableDb.select = originalSelect;
  mutableDb.update = originalUpdate;
}

function mockUsersServiceDeps(): void {
  restoreServiceDeps();
  restoreUsersDeps = usersService.__setUsersServiceDepsForTests({
    gallery: {
      getPublicGalleryForUser: async () => ({
        photos: [],
        lockedGallery: { enabled: false, count: 0 },
      }),
      replacePublicGalleryPhotosFromProfilePatch: async () => undefined,
    },
  });
}

function restoreServiceDeps(): void {
  if (restoreUsersDeps) {
    restoreUsersDeps();
    restoreUsersDeps = null;
  }
}

function userRow(overrides: Partial<UserRow>): UserRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: userAId,
    email: "user-a@example.test",
    passwordHash: "hash",
    displayName: "User A",
    about: null,
    amoriaId: "AM123",
    avatarUrl: null,
    photos: [],
    goal: null,
    mood: null,
    interests: [],
    flirtEnabled: false,
    allowAdultMode: false,
    mysteryMode: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mediaRow(overrides: Partial<MediaFileRow>): MediaFileRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: userAMediaId,
    ownerUserId: userBId,
    type: "profile_photo",
    path: "users/user-a/profile/photo.webp",
    url: "http://localhost:4000/media/users/user-a/profile/photo.webp",
    mimeType: "image/webp",
    sizeBytes: 1234,
    width: 512,
    height: 512,
    checksumSha256: null,
    createdAt: now,
    ...overrides,
  };
}
