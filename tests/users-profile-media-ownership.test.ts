import assert from "node:assert/strict";
import test from "node:test";
import type { MediaFileRow, MediaModerationJobRow, ProfilePhoto, UserRow } from "../src/db/schema";

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
const userAPublicMediaUrl = `/media/public/${userAMediaId}`;
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

test("PATCH /me/profile cannot adopt a pending avatar candidate", async (t) => {
  t.after(restoreServiceDeps);
  const state = mockAvatarAdoption({
    media: mediaRow({
      id: userAMediaId,
      ownerUserId: userAId,
      type: "avatar",
      moderationState: "needs_review",
      moderationOrigin: "automated",
    }),
    currentAvatarUrl: null,
    job: moderationJob({ rawResult: { containsPerson: "false" } }),
  });

  await assert.rejects(
    usersService.updateCurrentUserProfile(userAId, { avatarUrl: userAPublicMediaUrl }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "avatar_not_approved");
      assert.equal(appError.statusCode, 409);
      return true;
    },
  );
  assert.equal(state.updateCalled, false);
});

test("PATCH /me/profile rejects an approved gallery object as avatar", async (t) => {
  t.after(restoreServiceDeps);
  const state = mockAvatarAdoption({
    media: mediaRow({
      id: userAMediaId,
      ownerUserId: userAId,
      type: "profile_photo",
      moderationState: "approved",
    }),
    currentAvatarUrl: null,
  });

  await assert.rejects(
    usersService.updateCurrentUserProfile(userAId, { avatarUrl: userAPublicMediaUrl }),
    (error) => {
      assert.equal((error as { code?: string }).code, "media_not_owned");
      return true;
    },
  );
  assert.equal(state.updateCalled, false);
});

test("PATCH /me/profile allows only a current-policy person-approved avatar", async (t) => {
  t.after(restoreServiceDeps);
  const state = mockAvatarAdoption({
    media: mediaRow({
      id: userAMediaId,
      ownerUserId: userAId,
      type: "avatar",
      moderationState: "approved",
      moderationOrigin: "automated",
    }),
    currentAvatarUrl: null,
    job: moderationJob({
      policyVersion: "amoria_public_photo_v4",
      rawResult: { containsPerson: "true" },
    }),
  });

  const response = await usersService.updateCurrentUserProfile(userAId, {
    avatarUrl: userAPublicMediaUrl,
  });
  assert.equal(response.avatarUrl, userAPublicMediaUrl);
  assert.equal(state.updateCalled, true);
});

test("PATCH /me/profile preserves an already active grandfathered avatar", async (t) => {
  t.after(restoreServiceDeps);
  const state = mockAvatarAdoption({
    media: mediaRow({
      id: userAMediaId,
      ownerUserId: userAId,
      type: "avatar",
      moderationState: "approved",
      moderationOrigin: "legacy_pre_moderation",
    }),
    currentAvatarUrl: userAPublicMediaUrl,
  });

  const response = await usersService.updateCurrentUserProfile(userAId, {
    avatarUrl: userAPublicMediaUrl,
  });
  assert.equal(response.avatarUrl, userAPublicMediaUrl);
  assert.equal(state.updateCalled, true);
});

function mockAvatarAdoption(input: {
  media: MediaFileRow;
  currentAvatarUrl: string | null;
  job?: MediaModerationJobRow;
}) {
  restoreServiceDeps();
  const state = { updateCalled: false };
  restoreUsersDeps = usersService.__setUsersServiceDepsForTests({
    repo: {
      findUserById: async () => userRow({ avatarUrl: input.currentAvatarUrl }),
      findUserByAmoriaId: async () => undefined,
      updateUserProfile: async (_userId, update) => {
        state.updateCalled = true;
        return userRow({ avatarUrl: update.avatarUrl ?? null });
      },
      hasUnrevealedTurnBasedPair: async () => false,
    },
    findOwnedMediaFilesByIds: async () => [input.media],
    findOwnedMediaFileByUrl: async () => input.media,
    findLatestMediaModerationJob: async () => input.job,
    gallery: {
      getPublicGalleryForUser: async () => ({
        photos: [],
        lockedGallery: { enabled: false, count: 0 },
      }),
      replacePublicGalleryPhotosFromProfilePatch: async () => undefined,
    },
  });
  return state;
}

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
    emailVerifiedAt: now,
    passwordHash: "hash",
    displayName: "User A",
    about: null,
    amoriaId: "AM123",
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
    lastSeenAt: overrides.lastSeenAt ?? null,
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
    moderationState: "approved",
    moderationOrigin: "legacy_pre_moderation",
    automatedCheckedAt: null,
    moderationUpdatedAt: now,
    createdAt: now,
    ...overrides,
  };
}

function moderationJob(overrides: Partial<MediaModerationJobRow>): MediaModerationJobRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000201",
    mediaId: userAMediaId,
    status: "completed",
    attemptCount: 1,
    nextAttemptAt: now,
    startedAt: now,
    completedAt: now,
    providerEngine: "opennsfw_onnx_cpu",
    modelVersion: "test-model",
    policyVersion: "amoria_public_photo_v2",
    errorCode: null,
    rawResult: null,
    policyDecision: "approve",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
