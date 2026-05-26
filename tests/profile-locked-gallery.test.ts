import assert from "node:assert/strict";
import test from "node:test";
import type {
  MediaFileRow,
  ProfileGalleryItemRow,
  ProfileLockedGallerySettingsRow,
  UserRow,
} from "../src/db/schema";
import { AppError } from "../src/common/errors";
import {
  MAX_LOCKED_PROFILE_PHOTOS,
  MAX_PROFILE_GALLERY_PHOTOS,
} from "../src/config/constants";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "https://api.example.test/media";
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
const publicMediaPath = (mediaId: string) => `/media/public/${mediaId}`;

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
  assert.deepEqual(
    response.photos.map((photo) => photo.url),
    [
      publicMediaPath(publicPhoto1Id),
      publicMediaPath(publicPhoto2Id),
      publicMediaPath(publicPhoto3Id),
    ],
  );
  assert.equal(JSON.stringify(response).includes("passwordHash"), false);
  assert.equal(JSON.stringify(response).includes("users/owner/profile"), false);
  assert.equal(JSON.stringify(response).includes("localhost"), false);
  assert.equal(JSON.stringify(response).includes("minio"), false);
});

test("public gallery summary hides public photos whose storage object is missing", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery({ missingObjectIds: [publicPhoto2Id] });

  const response = await galleryService.getPublicGalleryForUser(ownerId);

  assert.deepEqual(
    response.photos.map((photo) => photo.mediaId),
    [publicPhoto1Id, publicPhoto3Id],
  );
  assert.equal(response.photos.some((photo) => photo.mediaId === publicPhoto2Id), false);
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

test("owner can move a photo to locked when avatar keeps 3 visible images", async (t) => {
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
  assert.equal(response.maxProfileGalleryPhotos, MAX_PROFILE_GALLERY_PHOTOS);
  assert.equal(response.maxLockedProfilePhotos, MAX_LOCKED_PROFILE_PHOTOS);
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

test("delete media cannot delete another user's media", async (t) => {
  t.after(restoreGalleryDeps);
  const state = mockGallery();

  await assert.rejects(
    galleryService.deleteOwnedMediaWithGalleryGuards(viewerId, publicPhoto1Id),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "not_found");
      assert.equal(appError.statusCode, 404);
      return true;
    },
  );

  assert.deepEqual(state.deletedObjectKeys, []);
  assert.deepEqual(state.deletedMediaIds, []);
  assert.equal(state.items.some((entry) => entry.item.mediaId === publicPhoto1Id), true);
});

test("owner can delete own profile photo and public read model is synced", async (t) => {
  t.after(restoreGalleryDeps);
  const state = mockGallery();

  const response = await galleryService.deleteOwnedMediaWithGalleryGuards(ownerId, publicPhoto1Id);

  assert.deepEqual(response, { ok: true });
  assert.deepEqual(state.deletedObjectKeys, [`users/owner/profile/${publicPhoto1Id}.webp`]);
  assert.deepEqual(state.deletedMediaIds, [publicPhoto1Id]);
  assert.equal(state.items.some((entry) => entry.item.mediaId === publicPhoto1Id), false);
  assert.deepEqual(
    state.updatedPhotos.map((photo) => photo.mediaId),
    [publicPhoto2Id, publicPhoto3Id],
  );
});

test("owner can remove own profile photo row when storage object is missing", async (t) => {
  t.after(restoreGalleryDeps);
  const state = mockGallery({ missingObjectIds: [publicPhoto1Id] });

  const response = await galleryService.deleteOwnedMediaWithGalleryGuards(ownerId, publicPhoto1Id);

  assert.deepEqual(response, { ok: true });
  assert.deepEqual(state.deletedObjectKeys, []);
  assert.deepEqual(state.deletedMediaIds, [publicPhoto1Id]);
  assert.equal(state.items.some((entry) => entry.item.mediaId === publicPhoto1Id), false);
  assert.deepEqual(
    state.updatedPhotos.map((photo) => photo.mediaId),
    [publicPhoto2Id, publicPhoto3Id],
  );
});

test("owner cannot exceed locked gallery photo limit", async (t) => {
  t.after(restoreGalleryDeps);
  const lockedItems = Array.from({ length: MAX_LOCKED_PROFILE_PHOTOS }, (_, index) =>
    galleryEntry(galleryPhotoId(300 + index), "locked", index),
  );
  mockGallery({
    items: [
      ...lockedItems,
      galleryEntry(publicPhoto1Id, "public", MAX_LOCKED_PROFILE_PHOTOS),
      galleryEntry(publicPhoto2Id, "public", MAX_LOCKED_PROFILE_PHOTOS + 1),
      galleryEntry(publicPhoto3Id, "public", MAX_LOCKED_PROFILE_PHOTOS + 2),
    ],
  });

  await assert.rejects(
    galleryService.updateOwnerProfileGalleryItems(ownerId, {
      items: [{ mediaId: publicPhoto1Id, visibility: "locked" }],
    }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number; details?: Record<string, string> };
      assert.equal(appError.code, "locked_gallery_limit_reached");
      assert.equal(appError.statusCode, 409);
      assert.equal(appError.details?.maxLockedProfilePhotos, String(MAX_LOCKED_PROFILE_PHOTOS));
      return true;
    },
  );
});

test("avatar does not count toward profile gallery photo limit", async (t) => {
  t.after(restoreGalleryDeps);
  const state = mockGallery({
    items: Array.from({ length: MAX_PROFILE_GALLERY_PHOTOS - 1 }, (_, index) =>
      galleryEntry(galleryPhotoId(400 + index), "public", index),
    ),
  });
  const newMediaId = galleryPhotoId(999);

  await galleryService.addCompletedProfilePhotoToGallery(ownerId, mediaRow(newMediaId));

  assert.equal(state.items.length, MAX_PROFILE_GALLERY_PHOTOS);
  assert.equal(state.items.some((entry) => entry.item.mediaId === newMediaId), true);
});

test("profile gallery photo limit rejects additional completed profile photo", async (t) => {
  t.after(restoreGalleryDeps);
  mockGallery({
    items: Array.from({ length: MAX_PROFILE_GALLERY_PHOTOS }, (_, index) =>
      galleryEntry(galleryPhotoId(500 + index), "public", index),
    ),
  });

  await assert.rejects(
    galleryService.addCompletedProfilePhotoToGallery(ownerId, mediaRow(galleryPhotoId(999))),
    (error) => {
      const appError = error as { code?: string; statusCode?: number; details?: Record<string, string> };
      assert.equal(appError.code, "profile_gallery_limit_reached");
      assert.equal(appError.statusCode, 409);
      assert.equal(appError.details?.maxProfileGalleryPhotos, String(MAX_PROFILE_GALLERY_PHOTOS));
      return true;
    },
  );
});

function mockGallery(input: {
  blocked?: boolean;
  passwordHash?: string | null;
  items?: ReturnType<typeof galleryEntry>[];
  missingObjectIds?: string[];
} = {}) {
  restoreGalleryDeps();
  const missingObjectIds = new Set(input.missingObjectIds ?? []);

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
    deletedMediaIds: [] as string[],
    deletedObjectKeys: [] as string[],
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
    upsertPublicGalleryItemForMedia: async (_userId: string, mediaId: string) => {
      const existing = state.items.find((entry) => entry.item.mediaId === mediaId);
      if (existing) {
        existing.item.visibility = "public";
        existing.item.position = state.items.length - 1;
        existing.item.updatedAt = new Date();
        return;
      }
      state.items.push(galleryEntry(mediaId, "public", state.items.length));
    },
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
    findMediaFileByOwner: async (userId, mediaId) => {
      if (userId !== ownerId) return undefined;
      return state.items.find((entry) => entry.media.id === mediaId)?.media;
    },
    deleteMediaFileByOwner: async (mediaId, userId) => {
      if (userId !== ownerId) return undefined;
      const index = state.items.findIndex((entry) => entry.media.id === mediaId);
      if (index < 0) return undefined;
      const [entry] = state.items.splice(index, 1);
      state.deletedMediaIds.push(mediaId);
      return entry?.media;
    },
    deleteObject: async (input) => {
      state.deletedObjectKeys.push(input.key);
    },
    headObject: async (input) => {
      const mediaId = String(input.key).split("/").pop()?.replace(".webp", "") ?? "";
      if (missingObjectIds.has(mediaId)) {
        throw new AppError("not_found", "Object was not found in storage", 404);
      }
      return { sizeBytes: 1234, contentType: "image/webp" };
    },
  });

  return state;
}

function galleryPhotoId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
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
