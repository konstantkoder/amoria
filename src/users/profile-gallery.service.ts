import { AppError, unauthorized, validationError } from "../common/errors";
import { normalizePassword } from "../common/validators";
import { MIN_VISIBLE_PROFILE_IMAGES_FOR_LOCKED_GALLERY } from "../config/constants";
import type { MediaFileRow, ProfilePhoto, UserRow } from "../db/schema";
import { deleteObject } from "../media/object-storage";
import { env } from "../config/env";
import { findMediaFileByOwner, deleteMediaFileByOwner } from "../media/media.repo";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { isBlockedEitherWay } from "../safety/safety.repo";
import * as usersRepo from "./users.repo";
import * as galleryRepo from "./profile-gallery.repo";

export type ProfileGalleryPhoto = {
  mediaId: string;
  url: string;
  position: number;
};

export type OwnerProfileGalleryPhoto = ProfileGalleryPhoto & {
  visibility: galleryRepo.ProfileGalleryVisibility;
};

export type LockedGallerySummary = {
  enabled: boolean;
  count: number;
};

export type OwnerProfileGalleryResponse = {
  publicPhotos: OwnerProfileGalleryPhoto[];
  lockedPhotos: OwnerProfileGalleryPhoto[];
  lockedFolderEnabled: boolean;
  lockedPhotosCount: number;
  visibleImagesCount: number;
  minVisibleImagesRequired: number;
};

export type UpdateGalleryItemsBody = {
  items: {
    mediaId: string;
    visibility: galleryRepo.ProfileGalleryVisibility;
    position?: number;
  }[];
};

export type SetLockedGalleryPasswordBody = {
  currentAccountPassword: string;
  newFolderPassword: string;
};

export type ResetLockedGalleryPasswordBody = {
  currentAccountPassword: string;
};

export type UnlockLockedGalleryBody = {
  password: string;
};

export type UnlockLockedGalleryResponse = {
  photos: ProfileGalleryPhoto[];
};

export type OkResponse = {
  ok: true;
};

type ProfileGalleryDeps = {
  repo: typeof galleryRepo;
  usersRepo: typeof usersRepo;
  findMediaFileByOwner: typeof findMediaFileByOwner;
  deleteMediaFileByOwner: typeof deleteMediaFileByOwner;
  deleteObject: typeof deleteObject;
  hashPassword: typeof hashPassword;
  verifyPassword: typeof verifyPassword;
  isBlockedEitherWay: typeof isBlockedEitherWay;
};

const defaultDeps: ProfileGalleryDeps = {
  repo: galleryRepo,
  usersRepo,
  findMediaFileByOwner,
  deleteMediaFileByOwner,
  deleteObject,
  hashPassword,
  verifyPassword,
  isBlockedEitherWay,
};

let deps: ProfileGalleryDeps = defaultDeps;

export function __setProfileGalleryServiceDepsForTests(
  overrides: Partial<ProfileGalleryDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function getOwnerProfileGallery(
  userId: string,
): Promise<OwnerProfileGalleryResponse> {
  const user = await loadUser(userId);
  const [items, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(userId),
    deps.repo.getLockedGallerySettings(userId),
  ]);

  return toOwnerGalleryResponse(user, items, Boolean(settings?.passwordHash));
}

export async function getPublicGalleryForUser(
  userId: string,
): Promise<{ photos: ProfileGalleryPhoto[]; lockedGallery: LockedGallerySummary }> {
  const [items, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(userId),
    deps.repo.getLockedGallerySettings(userId),
  ]);
  const publicItems = items.filter((entry) => entry.item.visibility === "public");
  const lockedItems = items.filter((entry) => entry.item.visibility === "locked");
  const enabled = Boolean(settings?.passwordHash && lockedItems.length > 0);

  return {
    photos: publicItems.map(toPublicPhoto),
    lockedGallery: {
      enabled,
      count: enabled ? lockedItems.length : 0,
    },
  };
}

export async function updateOwnerProfileGalleryItems(
  userId: string,
  input: UpdateGalleryItemsBody,
): Promise<OwnerProfileGalleryResponse> {
  const requestedItems = normalizeGalleryItemUpdates(input);
  const user = await loadUser(userId);
  const mediaIds = requestedItems.map((item) => item.mediaId);
  const ownedMedia = await deps.repo.listOwnedProfilePhotoMedia(userId, mediaIds);
  const ownedMediaIds = new Set(ownedMedia.map((media) => media.id));

  for (const mediaId of mediaIds) {
    if (!ownedMediaIds.has(mediaId)) {
      throw new AppError("media_not_owned", "Media file is not owned by current user", 403, {
        mediaId: "media_not_owned",
      });
    }
  }

  const [currentItems, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(userId),
    deps.repo.getLockedGallerySettings(userId),
  ]);
  const passwordIsSet = Boolean(settings?.passwordHash);
  const nextByMediaId = new Map(
    currentItems.map((entry) => [
      entry.item.mediaId,
      {
        mediaId: entry.item.mediaId,
        visibility: entry.item.visibility as galleryRepo.ProfileGalleryVisibility,
        position: entry.item.position,
      },
    ]),
  );

  for (const media of ownedMedia) {
    if (!nextByMediaId.has(media.id)) {
      nextByMediaId.set(media.id, {
        mediaId: media.id,
        visibility: "public",
        position: nextByMediaId.size,
      });
    }
  }

  for (const requested of requestedItems) {
    const current = nextByMediaId.get(requested.mediaId);
    const nextVisibility = requested.visibility;
    if (nextVisibility === "locked" && current?.visibility !== "locked" && !passwordIsSet) {
      throw new AppError(
        "locked_gallery_password_required",
        "Locked gallery password must be set first",
        409,
      );
    }

    nextByMediaId.set(requested.mediaId, {
      mediaId: requested.mediaId,
      visibility: nextVisibility,
      position: requested.position ?? current?.position ?? nextByMediaId.size,
    });
  }

  const nextItems = [...nextByMediaId.values()];
  assertVisibleImageRule(user, nextItems, passwordIsSet);
  await deps.repo.updateGalleryItems(userId, nextItems);
  await syncPublicPhotosReadModel(userId);
  return getOwnerProfileGallery(userId);
}

export async function setLockedGalleryPassword(
  userId: string,
  input: SetLockedGalleryPasswordBody,
): Promise<OkResponse> {
  const user = await loadUser(userId);
  await verifyCurrentAccountPassword(user, input.currentAccountPassword);
  const newFolderPassword = normalizePassword(input.newFolderPassword);
  const items = await deps.repo.listGalleryItemsForUser(userId);

  assertVisibleImageRule(
    user,
    items.map((entry) => ({
      mediaId: entry.item.mediaId,
      visibility: entry.item.visibility as galleryRepo.ProfileGalleryVisibility,
      position: entry.item.position,
    })),
    true,
  );

  await deps.repo.upsertLockedGalleryPasswordHash(
    userId,
    await deps.hashPassword(newFolderPassword),
    new Date(),
  );
  return { ok: true };
}

export async function resetLockedGalleryPassword(
  userId: string,
  input: ResetLockedGalleryPasswordBody,
): Promise<OkResponse> {
  const user = await loadUser(userId);
  await verifyCurrentAccountPassword(user, input.currentAccountPassword);
  await deps.repo.clearLockedGalleryPasswordHash(userId, new Date());
  return { ok: true };
}

export async function unlockLockedGallery(
  viewerUserId: string,
  targetUserId: string,
  input: UnlockLockedGalleryBody,
): Promise<UnlockLockedGalleryResponse> {
  const target = await deps.usersRepo.findUserById(targetUserId);
  if (!target) {
    throw new AppError("not_found", "User not found", 404);
  }

  if (viewerUserId !== target.id && await deps.isBlockedEitherWay(viewerUserId, target.id)) {
    throw new AppError("profile_unavailable", "Profile is unavailable", 403);
  }

  const [items, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(target.id),
    deps.repo.getLockedGallerySettings(target.id),
  ]);
  const lockedItems = items.filter((entry) => entry.item.visibility === "locked");
  if (lockedItems.length === 0 || !settings?.passwordHash) {
    throw new AppError("locked_gallery_unavailable", "Locked gallery is unavailable", 404);
  }

  const password = requireString(input.password, "password");
  const passwordMatches = await deps.verifyPassword(password, settings.passwordHash);
  if (!passwordMatches) {
    throw new AppError("forbidden", "Access is forbidden", 403);
  }

  return {
    photos: lockedItems.map(toPublicPhoto),
  };
}

export async function addCompletedProfilePhotoToGallery(
  ownerUserId: string,
  media: MediaFileRow,
): Promise<void> {
  if (media.type !== "profile_photo" || media.ownerUserId !== ownerUserId) {
    return;
  }

  await deps.repo.upsertPublicGalleryItemForMedia(ownerUserId, media.id);
  await syncPublicPhotosReadModel(ownerUserId);
}

export async function replacePublicGalleryPhotosFromProfilePatch(
  userId: string,
  photos: ProfilePhoto[],
): Promise<void> {
  const user = await loadUser(userId);
  const mediaIds = photos.map((photo) => photo.mediaId);
  const currentItems = await deps.repo.listGalleryItemsForUser(userId);
  const settings = await deps.repo.getLockedGallerySettings(userId);
  const nextByMediaId = new Map(
    currentItems
      .filter((entry) => entry.item.visibility === "locked")
      .map((entry) => [
        entry.item.mediaId,
        {
          mediaId: entry.item.mediaId,
          visibility: "locked" as galleryRepo.ProfileGalleryVisibility,
          position: entry.item.position,
        },
      ]),
  );

  for (const [position, mediaId] of mediaIds.entries()) {
    nextByMediaId.set(mediaId, {
      mediaId,
      visibility: "public",
      position,
    });
  }

  assertVisibleImageRule(user, [...nextByMediaId.values()], Boolean(settings?.passwordHash));
  await deps.repo.replacePublicGalleryItems(userId, mediaIds);
}

export async function deleteOwnedMediaWithGalleryGuards(
  ownerUserId: string,
  mediaId: string,
): Promise<{ ok: true }> {
  const media = await deps.findMediaFileByOwner(ownerUserId, mediaId);
  if (!media) {
    throw new AppError("not_found", "Media file not found", 404);
  }

  if (media.type === "profile_photo") {
    await assertProfilePhotoCanBeDeleted(ownerUserId, mediaId);
  }

  await deps.deleteObject({
    bucket: env.S3_BUCKET,
    key: media.path,
  });

  await deps.deleteMediaFileByOwner(mediaId, ownerUserId);
  if (media.type === "profile_photo") {
    await syncPublicPhotosReadModel(ownerUserId);
  }

  return { ok: true };
}

async function assertProfilePhotoCanBeDeleted(userId: string, mediaId: string): Promise<void> {
  const user = await loadUser(userId);
  const [items, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(userId),
    deps.repo.getLockedGallerySettings(userId),
  ]);
  const nextItems = items
    .filter((entry) => entry.item.mediaId !== mediaId)
    .map((entry) => ({
      mediaId: entry.item.mediaId,
      visibility: entry.item.visibility as galleryRepo.ProfileGalleryVisibility,
      position: entry.item.position,
    }));

  assertVisibleImageRule(user, nextItems, Boolean(settings?.passwordHash));
}

async function syncPublicPhotosReadModel(userId: string): Promise<void> {
  const items = await deps.repo.listGalleryItemsForUser(userId);
  const photos = items
    .filter((entry) => entry.item.visibility === "public")
    .map((entry) => ({
      mediaId: entry.item.mediaId,
      url: entry.media.url,
    }));

  await deps.usersRepo.updateUserProfile(userId, { photos });
}

async function loadUser(userId: string): Promise<UserRow> {
  const user = await deps.usersRepo.findUserById(userId);
  if (!user) {
    throw unauthorized("User no longer exists");
  }
  return user;
}

async function verifyCurrentAccountPassword(user: UserRow, password: unknown): Promise<void> {
  const currentAccountPassword = requireString(password, "currentAccountPassword");
  if (!await deps.verifyPassword(currentAccountPassword, user.passwordHash)) {
    throw new AppError("invalid_credentials", "Invalid email or password", 401);
  }
}

function toOwnerGalleryResponse(
  user: UserRow,
  items: galleryRepo.ProfileGalleryItemWithMedia[],
  passwordIsSet: boolean,
): OwnerProfileGalleryResponse {
  const photos = items.map((entry) => ({
    ...toPublicPhoto(entry),
    visibility: entry.item.visibility as galleryRepo.ProfileGalleryVisibility,
  }));
  const publicPhotos = photos.filter((photo) => photo.visibility === "public");
  const lockedPhotos = photos.filter((photo) => photo.visibility === "locked");

  return {
    publicPhotos,
    lockedPhotos,
    lockedFolderEnabled: passwordIsSet,
    lockedPhotosCount: lockedPhotos.length,
    visibleImagesCount: visibleImagesCount(user, photos),
    minVisibleImagesRequired: MIN_VISIBLE_PROFILE_IMAGES_FOR_LOCKED_GALLERY,
  };
}

function toPublicPhoto(entry: galleryRepo.ProfileGalleryItemWithMedia): ProfileGalleryPhoto {
  return {
    mediaId: entry.item.mediaId,
    url: entry.media.url,
    position: entry.item.position,
  };
}

function assertVisibleImageRule(
  user: UserRow,
  items: { visibility: galleryRepo.ProfileGalleryVisibility }[],
  lockedFolderEnabled: boolean,
): void {
  const lockedPhotosCount = items.filter((item) => item.visibility === "locked").length;
  const visible = visibleImagesCount(user, items);
  if (
    (lockedFolderEnabled || lockedPhotosCount > 0) &&
    visible < MIN_VISIBLE_PROFILE_IMAGES_FOR_LOCKED_GALLERY
  ) {
    throw new AppError(
      "min_visible_required",
      "At least 3 visible profile images are required for locked gallery",
      409,
      {
        visibleImagesCount: String(visible),
        minVisibleImagesRequired: String(MIN_VISIBLE_PROFILE_IMAGES_FOR_LOCKED_GALLERY),
      },
    );
  }
}

function visibleImagesCount(
  user: Pick<UserRow, "avatarUrl">,
  items: { visibility: galleryRepo.ProfileGalleryVisibility }[],
): number {
  const avatarCount = user.avatarUrl ? 1 : 0;
  const publicPhotoCount = items.filter((item) => item.visibility === "public").length;
  return avatarCount + publicPhotoCount;
}

function normalizeGalleryItemUpdates(input: UpdateGalleryItemsBody): UpdateGalleryItemsBody["items"] {
  if (!input || typeof input !== "object" || !Array.isArray(input.items)) {
    throw validationError("Gallery items are required", { items: "required" });
  }

  return input.items.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw validationError("Gallery item must be an object", { [`items.${index}`]: "invalid" });
    }
    const mediaId = requireString(item.mediaId, `items.${index}.mediaId`).trim();
    const visibility = item.visibility;
    if (visibility !== "public" && visibility !== "locked") {
      throw validationError("Gallery item visibility is invalid", {
        [`items.${index}.visibility`]: "invalid",
      });
    }
    const position = item.position;
    if (position !== undefined && (!Number.isInteger(position) || position < 0)) {
      throw validationError("Gallery item position is invalid", {
        [`items.${index}.position`]: "invalid",
      });
    }

    return {
      mediaId,
      visibility,
      ...(position !== undefined ? { position } : {}),
    };
  });
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw validationError(`${field} is required`, { [field]: "required" });
  }
  return value;
}
