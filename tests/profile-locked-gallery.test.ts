import assert from "node:assert/strict";
import test from "node:test";
import type {
  MediaFileRow,
  ProfileGalleryItemRow,
  ProfileLockedGallerySettingsRow,
  UserRow,
} from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const galleryService = require(
  "../src/users/profile-gallery.service",
) as typeof import("../src/users/profile-gallery.service");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

type GalleryRepo = typeof import("../src/users/profile-gallery.repo");
type UsersRepo = typeof import("../src/users/users.repo");

const ownerId = "00000000-0000-4000-8000-000000000001";
const viewerId = "00000000-0000-4000-8000-000000000002";
const publicPhoto1Id = "00000000-0000-4000-8000-000000000101";
const publicPhoto2Id = "00000000-0000-4000-8000-000000000102";
const publicPhoto3Id = "00000000-0000-4000-8000-000000000103";
const lockedPhoto1Id = "00000000-0000-4000-8000-000000000201";
const lockedPhoto2Id = "00000000-0000-4000-8000-000000000202";

let restoreDeps: (() => void) | null = null;

test.after(async () => {
  restoreGalleryDeps();
  await closeDb();
});

test("public gallery summary returns public photos and hides locked photos", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery();

  const response = await galleryService.getPublicGalleryForUser(ownerId);

  assert.deepEqual(response.lockedGallery, { enabled: true, count: 2 });
  assert.deepEqual(
    response.photos.map((photo) => photo.mediaId),
    [publicPhoto1Id, publicPhoto2Id, publicPhoto3Id],
  );
  assert.equal(response.photos.some((photo) => photo.mediaId === lockedPhoto1Id), false);
  assert.equal(JSON.stringify(response).includes("passwordHash"), false);
  assert.equal(JSON.stringify(response).includes("users/owner/profile"), false);
});

test("wrong locked gallery password returns 403 without photos", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery();

  await assert.rejects(
    galleryService.unlockLockedGallery(viewerId, ownerId, { password: "wrong-password" }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number; photos?: unknown };
      assert.equal(appError.code, "forbidden");
      assert.equal(appError.statusCode, 403);
      assert.equal(appError.photos, undefined);
      return true;
    },
  );
});

test("correct locked gallery password returns locked photos only", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery();

  const response = await galleryService.unlockLockedGallery(viewerId, ownerId, {
    password: "folder-secret",
  });

  assert.deepEqual(
    response.photos.map((photo) => photo.mediaId),
    [lockedPhoto1Id, lockedPhoto2Id],
  );
  assert.equal(response.photos.some((photo) => photo.mediaId === publicPhoto1Id), false);
});

test("blocked viewer cannot unlock locked gallery", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery({ blocked: true });

  await assert.rejects(
    galleryService.unlockLockedGallery(viewerId, ownerId, { password: "folder-secret" }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "profile_unavailable");
      assert.equal(appError.statusCode, 403);
      return true;
    },
  );
});

test("owner can set and reset locked gallery password with account password", async (t) => {
  t.after(restoreGalleryDeps);
  const state = mockGallery({ passwordHash: null });

  const setResponse = await galleryService.setLockedGalleryPassword(ownerId, {
    currentAccountPassword: "account-password",
    newFolderPassword: "new-folder-password",
  });
  assert.deepEqual(setResponse, { ok: true });
  assert.equal(state.settings?.passwordHash, "hash:new-folder-password");
  assert.equal(state.settings?.passwordSetAt instanceof Date, true);

  const resetResponse = await galleryService.resetLockedGalleryPassword(ownerId, {
    currentAccountPassword: "account-password",
  });
  assert.deepEqual(resetResponse, { ok: true });
  assert.equal(state.settings?.passwordHash, null);
  assert.equal(state.items.filter((entry) => entry.item.visibility === "locked").length, 2);
});

test("owner cannot move a photo to locked when fewer than 3 visible images remain", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery({
    items: [
      galleryEntry(publicPhoto1Id, "public", 0),
      galleryEntry(publicPhoto2Id, "public", 1),
      galleryEntry(publicPhoto3Id, "public", 2),
    ],
  });

  await assert.rejects(
    galleryService.updateOwnerProfileGalleryItems(ownerId, {
      items: [
        { mediaId: publicPhoto1Id, visibility: "locked", position: 0 },
        { mediaId: publicPhoto2Id, visibility: "locked", position: 1 },
      ],
    }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number; details?: Record<string, string> };
      assert.equal(appError.code, "min_visible_required");
      assert.equal(appError.statusCode, 409);
      assert.equal(appError.details?.minVisibleImagesRequired, "3");
      return true;
    },
  );
});

test("owner can move a photo to locked when 3 visible images remain", async (t) => {
  t.after(restoreGalleryDeps);
  const state = mockGallery();

  const response = await galleryService.updateOwnerProfileGalleryItems(ownerId, {
    items: [{ mediaId: publicPhoto1Id, visibility: "locked", position: 0 }],
  });

  assert.equal(response.visibleImagesCount, 3);
  assert.deepEqual(
    state.items
      .filter((entry) => entry.item.visibility === "locked")
      .map((entry) => entry.item.mediaId)
      .sort(),
    [lockedPhoto1Id, lockedPhoto2Id, publicPhoto1Id].sort(),
  );
});

test("owner gallery endpoint returns public and locked photos to owner", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery();

  const response = await galleryService.getOwnerProfileGallery(ownerId);

  assert.equal(response.lockedFolderEnabled, true);
  assert.equal(response.lockedPhotosCount, 2);
  assert.equal(response.visibleImagesCount, 4);
  assert.equal(response.minVisibleImagesRequired, 3);
  assert.deepEqual(
    response.publicPhotos.map((photo) => photo.mediaId),
    [publicPhoto1Id, publicPhoto2Id, publicPhoto3Id],
  );
  assert.deepEqual(
    response.lockedPhotos.map((photo) => photo.mediaId),
    [lockedPhoto1Id, lockedPhoto2Id],
  );
  assert.equal(JSON.stringify(response).includes("passwordHash"), false);
  assert.equal(JSON.stringify(response).includes("users/owner/profile"), false);
});

function mockGallery(input: {
  blocked?: boolean;
  passwordHash?: string | null;
  items?: ReturnType<typeof galleryEntry>[];
} = {}) {
  restoreGalleryDeps();

  const state = {
    users: new Map<string, UserRow>([
      [ownerId, userRow(ownerId)],
      [viewerId, userRow(viewerId, { avatarUrl: null })],
    ]),
    items: input.items ?? [
      galleryEntry(publicPhoto1Id, "public", 0),
      galleryEntry(publicPhoto2Id, "public", 1),
      galleryEntry(publicPhoto3Id, "public", 2),
      galleryEntry(lockedPhoto1Id, "locked", 3),
      galleryEntry(lockedPhoto2Id, "locked", 4),
    ],
    settings:
      input.passwordHash === undefined
        ? settingsRow("hash:folder-secret")
        : settingsRow(input.passwordHash),
    updatedPhotos: [] as { mediaId: string; url: string }[],
  };

  const repo = {
    listGalleryItemsForUser: async (userId: string) =>
      userId === ownerId ? state.items.sort((a, b) => a.item.position - b.item.position) : [],
    getLockedGallerySettings: async (userId: string) =>
      userId === ownerId ? state.settings ?? undefined : undefined,
    upsertLockedGalleryPasswordHash: async (
      userId: string,
      passwordHash: string,
      now: Date,
    ) => {
      if (userId === ownerId) {
        state.settings = {
          userId,
          passwordHash,
          passwordSetAt: now,
          updatedAt: now,
        };
      }
    },
    clearLockedGalleryPasswordHash: async (userId: string, now: Date) => {
      if (userId === ownerId) {
        state.settings = {
          userId,
          passwordHash: null,
          passwordSetAt: null,
          updatedAt: now,
        };
      }
    },
    updateGalleryItems: async (_userId: string, updates: { mediaId: string; visibility: string; position: number }[]) => {
      for (const update of updates) {
        const existing = state.items.find((entry) => entry.item.mediaId === update.mediaId);
        if (existing) {
          existing.item.visibility = update.visibility;
          existing.item.position = update.position;
          existing.item.updatedAt = new Date();
        }
      }
    },
    listOwnedProfilePhotoMedia: async (_userId: string, mediaIds: string[]) =>
      state.items
        .map((entry) => entry.media)
        .filter((media) => mediaIds.includes(media.id)),
    replacePublicGalleryItems: async () => undefined,
    upsertPublicGalleryItemForMedia: async () => undefined,
    findGalleryItemForMedia: async () => undefined,
  } satisfies Partial<GalleryRepo>;

  const usersRepo = {
    findUserById: async (userId: string) => state.users.get(userId),
    findUserByAmoriaId: async () => undefined,
    updateUserProfile: async (_userId: string, input: { photos?: { mediaId: string; url: string }[] }) => {
      state.updatedPhotos = input.photos ?? [];
      return state.users.get(ownerId);
    },
    updateUserAvatar: async () => undefined,
  } satisfies Partial<UsersRepo>;

  restoreDeps = galleryService.__setProfileGalleryServiceDepsForTests({
    repo: repo as GalleryRepo,
    usersRepo: usersRepo as UsersRepo,
    hashPassword: async (password: string) => `hash:${password}`,
    verifyPassword: async (password: string, passwordHash: string) => passwordHash === `hash:${password}`,
    isBlockedEitherWay: async () => input.blocked === true,
  });

  return state;
}

function restoreGalleryDeps(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function galleryEntry(
  mediaId: string,
  visibility: "public" | "locked",
  position: number,
): { item: ProfileGalleryItemRow; media: MediaFileRow } {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    item: {
      id: `10000000-0000-4000-8000-${mediaId.slice(-12)}`,
      userId: ownerId,
      mediaId,
      visibility,
      position,
      createdAt: now,
      updatedAt: now,
    },
    media: mediaRow(mediaId),
  };
}

function mediaRow(mediaId: string): MediaFileRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: mediaId,
    ownerUserId: ownerId,
    type: "profile_photo",
    path: `users/owner/profile/${mediaId}.webp`,
    url: `https://cdn.example.test/${mediaId}.webp`,
    mimeType: "image/webp",
    sizeBytes: 1234,
    width: 512,
    height: 512,
    checksumSha256: null,
    createdAt: now,
  };
}

function settingsRow(passwordHash: string | null): ProfileLockedGallerySettingsRow | null {
  if (passwordHash === undefined) return null;
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    userId: ownerId,
    passwordHash,
    passwordSetAt: passwordHash ? now : null,
    updatedAt: now,
  };
}

function userRow(userId: string, overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: userId,
    email: `${userId}@example.test`,
    passwordHash: "hash:account-password",
    displayName: userId === ownerId ? "Owner" : "Viewer",
    about: null,
    amoriaId: userId === ownerId ? "AM23456" : "AM34567",
    avatarUrl: "https://cdn.example.test/avatar.webp",
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
