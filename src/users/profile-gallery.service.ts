import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { AppError, unauthorized, validationError } from "../common/errors";
import { normalizePassword } from "../common/validators";
import {
  LOCKED_GALLERY_RATE_LIMIT_BLOCK_MS,
  LOCKED_GALLERY_UNLOCK_EXPIRES_IN_SEC,
  LOCKED_GALLERY_WRONG_ATTEMPT_LIMIT,
  LOCKED_GALLERY_WRONG_ATTEMPT_WINDOW_MS,
  MAX_LOCKED_PROFILE_PHOTOS,
  MAX_PROFILE_GALLERY_PHOTOS,
  MIN_VISIBLE_PROFILE_IMAGES_FOR_LOCKED_GALLERY,
  SERVICE_NAME,
} from "../config/constants";
import type { MediaFileRow, MediaModerationReviewRow, ProfilePhoto, UserRow } from "../db/schema";
import { deleteObject, headObject } from "../media/object-storage";
import { env } from "../config/env";
import { findMediaFileById, findMediaFileByOwner, deleteMediaFileByOwner } from "../media/media.repo";
import { publicMediaUrlForMediaId } from "../media/media-url";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { isBlockedEitherWay } from "../safety/safety.repo";
import * as auditService from "../admin/admin-audit.service";
import type { AdminRequestContext } from "../admin/admin.types";
import * as usersRepo from "./users.repo";
import * as galleryRepo from "./profile-gallery.repo";

export type ProfileGalleryPhoto = {
  mediaId: string;
  url: string;
  position: number;
};

export type OwnerProfileGalleryPhoto = ProfileGalleryPhoto & {
  galleryItemId: string;
  visibility: galleryRepo.ProfileGalleryVisibility;
  mimeType: string;
  moderationStatus: MediaModerationStatus;
};

export type MediaModerationStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "restricted"
  | "needs_manual_review";

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
  maxProfileGalleryPhotos: number;
  maxLockedProfilePhotos: number;
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
  unlockToken: string;
  unlockExpiresAt: string;
};

export type OkResponse = {
  ok: true;
};

type ProfileGalleryDeps = {
  repo: typeof galleryRepo;
  usersRepo: typeof usersRepo;
  findMediaFileById: typeof findMediaFileById;
  findMediaFileByOwner: typeof findMediaFileByOwner;
  deleteMediaFileByOwner: typeof deleteMediaFileByOwner;
  headObject: typeof headObject;
  deleteObject: typeof deleteObject;
  hashPassword: typeof hashPassword;
  verifyPassword: typeof verifyPassword;
  isBlockedEitherWay: typeof isBlockedEitherWay;
  audit: Pick<typeof auditService, "writeAuditLog">;
  now: () => Date;
};

const defaultDeps: ProfileGalleryDeps = {
  repo: galleryRepo,
  usersRepo,
  findMediaFileById,
  findMediaFileByOwner,
  deleteMediaFileByOwner,
  headObject,
  deleteObject,
  hashPassword,
  verifyPassword,
  isBlockedEitherWay,
  audit: auditService,
  now: () => new Date(),
};

let deps: ProfileGalleryDeps = defaultDeps;
const wrongAttemptBuckets = new Map<string, {
  count: number;
  windowStartedAtMs: number;
  blockedUntilMs: number;
}>();

type LockedGalleryUnlockTokenPayload = {
  sub: string;
  typ: "locked_gallery_unlock";
  targetUserId: string;
  jti: string;
};

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

export function __resetLockedGalleryRuntimeStateForTests(): void {
  wrongAttemptBuckets.clear();
}

export async function getOwnerProfileGallery(
  userId: string,
): Promise<OwnerProfileGalleryResponse> {
  const user = await loadUser(userId);
  const [items, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(userId),
    deps.repo.getLockedGallerySettings(userId),
  ]);
  const latestReviewByMediaId = await deps.repo.listLatestModerationReviewsForMediaIds(
    items.map((entry) => entry.media.id),
  );

  return toOwnerGalleryResponse(user, items, Boolean(settings?.passwordHash), latestReviewByMediaId);
}

export async function getPublicGalleryForUser(
  userId: string,
): Promise<{ photos: ProfileGalleryPhoto[]; lockedGallery: LockedGallerySummary }> {
  const [items, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(userId),
    deps.repo.getLockedGallerySettings(userId),
  ]);
  const publicItems = await filterLoadablePublicGalleryItems(
    items.filter((entry) => entry.item.visibility === "public"),
  );
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
  assertGalleryCountLimits(nextItems);
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

  const nextItems = items.map((entry) => ({
    mediaId: entry.item.mediaId,
    visibility: entry.item.visibility as galleryRepo.ProfileGalleryVisibility,
    position: entry.item.position,
  }));
  assertGalleryCountLimits(nextItems);
  assertVisibleImageRule(user, nextItems, true);

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
  requestContext: AdminRequestContext = {},
): Promise<UnlockLockedGalleryResponse> {
  const target = await deps.usersRepo.findUserById(targetUserId);
  if (!target) {
    throw new AppError("not_found", "User not found", 404);
  }

  if (viewerUserId !== target.id && await deps.isBlockedEitherWay(viewerUserId, target.id)) {
    await writeLockedGalleryAudit({
      viewerUserId,
      targetUserId: target.id,
      success: false,
      reasonCode: "blocked_pair",
      requestContext,
    });
    throw new AppError("profile_unavailable", "Profile is unavailable", 403);
  }

  const [items, settings] = await Promise.all([
    deps.repo.listGalleryItemsForUser(target.id),
    deps.repo.getLockedGallerySettings(target.id),
  ]);
  const lockedItems = items.filter((entry) => entry.item.visibility === "locked");
  if (lockedItems.length === 0 || !settings?.passwordHash) {
    await writeLockedGalleryAudit({
      viewerUserId,
      targetUserId: target.id,
      success: false,
      reasonCode: "locked_gallery_unavailable",
      requestContext,
    });
    throw new AppError("locked_gallery_unavailable", "Locked gallery is unavailable", 404);
  }

  if (unlockAttemptIsRateLimited(viewerUserId, target.id)) {
    await writeLockedGalleryAudit({
      viewerUserId,
      targetUserId: target.id,
      success: false,
      reasonCode: "rate_limited",
      requestContext,
    });
    throw new AppError(
      "locked_gallery_rate_limited",
      "Too many locked gallery unlock attempts",
      429,
    );
  }
  const password = requireString(input.password, "password");
  const passwordMatches = await deps.verifyPassword(password, settings.passwordHash);
  if (!passwordMatches) {
    const rateLimited = recordWrongUnlockAttempt(viewerUserId, target.id);
    await writeLockedGalleryAudit({
      viewerUserId,
      targetUserId: target.id,
      success: false,
      reasonCode: rateLimited ? "rate_limited" : "wrong_password",
      requestContext,
    });
    if (rateLimited) {
      throw new AppError(
        "locked_gallery_rate_limited",
        "Too many locked gallery unlock attempts",
        429,
      );
    }
    throw new AppError("forbidden", "Access is forbidden", 403);
  }

  clearWrongUnlockAttempts(viewerUserId, target.id);
  const unlock = signLockedGalleryUnlockToken(viewerUserId, target.id);
  await writeLockedGalleryAudit({
    viewerUserId,
    targetUserId: target.id,
    success: true,
    reasonCode: "unlocked",
    requestContext,
  });

  return {
    photos: lockedItems.map(toLockedGalleryPhoto),
    unlockToken: unlock.token,
    unlockExpiresAt: unlock.expiresAt,
  };
}

export function verifyLockedGalleryUnlockToken(
  token: string,
  viewerUserId: string,
  targetUserId: string,
): void {
  const normalized = String(token ?? "").trim();
  if (!normalized) {
    throw new AppError("locked_gallery_unlock_expired", "Locked gallery unlock has expired", 401);
  }

  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(normalized, env.JWT_SECRET, {
      audience: "amoria-mobile",
      issuer: SERVICE_NAME,
    });
  } catch {
    throw new AppError("locked_gallery_unlock_expired", "Locked gallery unlock has expired", 401);
  }

  if (
    typeof decoded !== "object" ||
    decoded.typ !== "locked_gallery_unlock" ||
    decoded.sub !== viewerUserId ||
    decoded.targetUserId !== targetUserId
  ) {
    throw new AppError("forbidden", "Access is forbidden", 403);
  }
}

export async function addCompletedProfilePhotoToGallery(
  ownerUserId: string,
  media: MediaFileRow,
): Promise<void> {
  if (media.type !== "profile_photo" || media.ownerUserId !== ownerUserId) {
    return;
  }

  await assertCanAddProfilePhotoToGallery(ownerUserId);
  await deps.repo.upsertPublicGalleryItemForMedia(ownerUserId, media.id);
  await syncPublicPhotosReadModel(ownerUserId);
}

export async function assertCanAddProfilePhotoToGallery(ownerUserId: string): Promise<void> {
  const items = await deps.repo.listGalleryItemsForUser(ownerUserId);
  if (items.length >= MAX_PROFILE_GALLERY_PHOTOS) {
    throw new AppError(
      "profile_gallery_limit_reached",
      "Profile gallery photo limit has been reached",
      409,
      {
        maxProfileGalleryPhotos: String(MAX_PROFILE_GALLERY_PHOTOS),
      },
    );
  }
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

  const nextItems = [...nextByMediaId.values()];
  assertGalleryCountLimits(nextItems);
  assertVisibleImageRule(user, nextItems, Boolean(settings?.passwordHash));
  await deps.repo.replacePublicGalleryItems(userId, mediaIds);
}

export async function deleteOwnedMediaWithGalleryGuards(
  ownerUserId: string,
  mediaId: string,
): Promise<{ ok: true }> {
  const media = await deps.findMediaFileById(mediaId);
  if (!media) {
    await syncPublicPhotosReadModel(ownerUserId);
    return { ok: true };
  }

  if (media.ownerUserId !== ownerUserId) {
    throw new AppError("not_found", "Media file not found", 404);
  }

  const objectMissing = await mediaObjectIsMissing(media);
  if (!objectMissing) {
    await deleteMediaObjectIfPossible(media);
  }

  await deps.deleteMediaFileByOwner(mediaId, ownerUserId);
  if (media.type === "profile_photo") {
    await syncPublicPhotosReadModel(ownerUserId);
  }

  return { ok: true };
}

async function syncPublicPhotosReadModel(userId: string): Promise<void> {
  const items = await deps.repo.listGalleryItemsForUser(userId);
  const publicItems = await filterLoadablePublicGalleryItems(
    items.filter((entry) => entry.item.visibility === "public"),
  );
  const photos = publicItems.map((entry) => ({
    mediaId: entry.item.mediaId,
    url: publicMediaUrlForMediaId(entry.media.id),
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
  latestReviewByMediaId: Record<string, Pick<MediaModerationReviewRow, "action"> | undefined>,
): OwnerProfileGalleryResponse {
  const photos = items.map((entry) => ({
    ...toPublicPhoto(entry),
    galleryItemId: entry.item.id,
    visibility: entry.item.visibility as galleryRepo.ProfileGalleryVisibility,
    mimeType: entry.media.mimeType,
    moderationStatus: moderationStatusForReview(latestReviewByMediaId[entry.media.id]),
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
    maxProfileGalleryPhotos: MAX_PROFILE_GALLERY_PHOTOS,
    maxLockedProfilePhotos: MAX_LOCKED_PROFILE_PHOTOS,
  };
}

function moderationStatusForReview(
  review: Pick<MediaModerationReviewRow, "action"> | undefined,
): MediaModerationStatus {
  if (!review) {
    return "pending_review";
  }

  switch (review.action) {
    case "approve":
      return "approved";
    case "restrict":
      return "restricted";
    case "remove":
      return "rejected";
    case "mark_under_review":
      return "needs_manual_review";
    default:
      return "pending_review";
  }
}

function toPublicPhoto(entry: galleryRepo.ProfileGalleryItemWithMedia): ProfileGalleryPhoto {
  return {
    mediaId: entry.item.mediaId,
    url: publicMediaUrlForMediaId(entry.media.id),
    position: entry.item.position,
  };
}

function toLockedGalleryPhoto(entry: galleryRepo.ProfileGalleryItemWithMedia): ProfileGalleryPhoto {
  return {
    mediaId: entry.item.mediaId,
    url: `/media/locked/${encodeURIComponent(entry.media.id)}`,
    position: entry.item.position,
  };
}

function unlockAttemptKey(viewerUserId: string, targetUserId: string): string {
  return `${viewerUserId}:${targetUserId}`;
}

function currentTimeMs(): number {
  return deps.now().getTime();
}

function unlockAttemptIsRateLimited(viewerUserId: string, targetUserId: string): boolean {
  const key = unlockAttemptKey(viewerUserId, targetUserId);
  const bucket = wrongAttemptBuckets.get(key);
  if (!bucket) {
    return false;
  }

  const nowMs = currentTimeMs();
  if (bucket.blockedUntilMs > nowMs) {
    return true;
  }

  if (nowMs - bucket.windowStartedAtMs > LOCKED_GALLERY_WRONG_ATTEMPT_WINDOW_MS) {
    wrongAttemptBuckets.delete(key);
  }

  return false;
}

function recordWrongUnlockAttempt(viewerUserId: string, targetUserId: string): boolean {
  const key = unlockAttemptKey(viewerUserId, targetUserId);
  const nowMs = currentTimeMs();
  const current = wrongAttemptBuckets.get(key);
  const bucket = !current || nowMs - current.windowStartedAtMs > LOCKED_GALLERY_WRONG_ATTEMPT_WINDOW_MS
    ? { count: 0, windowStartedAtMs: nowMs, blockedUntilMs: 0 }
    : current;

  bucket.count += 1;
  if (bucket.count >= LOCKED_GALLERY_WRONG_ATTEMPT_LIMIT) {
    bucket.blockedUntilMs = nowMs + LOCKED_GALLERY_RATE_LIMIT_BLOCK_MS;
  }

  wrongAttemptBuckets.set(key, bucket);
  return bucket.blockedUntilMs > nowMs;
}

function clearWrongUnlockAttempts(viewerUserId: string, targetUserId: string): void {
  wrongAttemptBuckets.delete(unlockAttemptKey(viewerUserId, targetUserId));
}

function signLockedGalleryUnlockToken(
  viewerUserId: string,
  targetUserId: string,
): { token: string; expiresAt: string } {
  const token = jwt.sign(
    {
      sub: viewerUserId,
      typ: "locked_gallery_unlock",
      targetUserId,
      jti: randomUUID(),
    } satisfies LockedGalleryUnlockTokenPayload,
    env.JWT_SECRET,
    {
      audience: "amoria-mobile",
      expiresIn: LOCKED_GALLERY_UNLOCK_EXPIRES_IN_SEC,
      issuer: SERVICE_NAME,
    },
  );
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object" || typeof decoded.exp !== "number") {
    throw new Error("Signed locked gallery unlock token is missing an expiry");
  }

  return {
    token,
    expiresAt: new Date(decoded.exp * 1000).toISOString(),
  };
}

async function writeLockedGalleryAudit(input: {
  viewerUserId: string;
  targetUserId: string;
  success: boolean;
  reasonCode: string;
  requestContext: AdminRequestContext;
}): Promise<void> {
  await deps.audit.writeAuditLog({
    adminUserId: null,
    action: "locked_gallery.unlock",
    targetType: "user_profile_locked_gallery",
    targetId: input.targetUserId,
    metadata: {
      viewerUserId: input.viewerUserId,
      targetUserId: input.targetUserId,
      success: input.success,
      reasonCode: input.reasonCode,
      timestamp: deps.now().toISOString(),
    },
    ...input.requestContext,
  });
}

async function filterLoadablePublicGalleryItems(
  items: galleryRepo.ProfileGalleryItemWithMedia[],
): Promise<galleryRepo.ProfileGalleryItemWithMedia[]> {
  const loadable: galleryRepo.ProfileGalleryItemWithMedia[] = [];
  for (const entry of items) {
    if (entry.media.type !== "profile_photo") {
      continue;
    }
    if (await mediaObjectExists(entry.media)) {
      loadable.push(entry);
    }
  }
  return loadable;
}

async function mediaObjectExists(media: Pick<MediaFileRow, "path">): Promise<boolean> {
  try {
    await deps.headObject({
      bucket: env.S3_BUCKET,
      key: media.path,
    });
    return true;
  } catch (error) {
    if (error instanceof AppError && (
      error.code === "not_found" ||
      error.code === "internal_error" ||
      error.code === "storage_read_failed"
    )) {
      return false;
    }

    throw error;
  }
}

async function mediaObjectIsMissing(media: Pick<MediaFileRow, "path">): Promise<boolean> {
  try {
    await deps.headObject({
      bucket: env.S3_BUCKET,
      key: media.path,
    });
    return false;
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      return true;
    }

    throw error;
  }
}

async function deleteMediaObjectIfPossible(media: Pick<MediaFileRow, "path">): Promise<void> {
  try {
    await deps.deleteObject({
      bucket: env.S3_BUCKET,
      key: media.path,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      return;
    }

    throw error;
  }
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

function assertGalleryCountLimits(
  items: { visibility: galleryRepo.ProfileGalleryVisibility }[],
): void {
  if (items.length > MAX_PROFILE_GALLERY_PHOTOS) {
    throw new AppError(
      "profile_gallery_limit_reached",
      "Profile gallery photo limit has been reached",
      409,
      {
        maxProfileGalleryPhotos: String(MAX_PROFILE_GALLERY_PHOTOS),
      },
    );
  }

  const lockedPhotosCount = items.filter((item) => item.visibility === "locked").length;
  if (lockedPhotosCount > MAX_LOCKED_PROFILE_PHOTOS) {
    throw new AppError(
      "locked_gallery_limit_reached",
      "Locked gallery photo limit has been reached",
      409,
      {
        maxLockedProfilePhotos: String(MAX_LOCKED_PROFILE_PHOTOS),
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
