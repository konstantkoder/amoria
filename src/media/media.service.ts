import type { MultipartFile } from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { AppError, unauthorized, validationError } from "../common/errors";
import { MAX_AVATAR_INPUT_BYTES, MAX_MEDIA_UPLOAD_BYTES } from "../config/constants";
import { env } from "../config/env";
import type { MediaFileRow } from "../db/schema";
import { findUserById, updateUserAvatar } from "../users/users.repo";
import { toSelfUserProfile, type SelfUserProfile } from "../users/users.service";
import { assertAvatarInput, checksumSha256, isMultipartFileTooLarge } from "./file-guards";
import {
  normalizeMediaCrop,
  processAvatarImage,
} from "./image-processing";
import {
  createMediaFile,
  deleteMediaFileByOwner,
  findMediaFileById,
  findOwnedMediaFileByUrl,
} from "./media.repo";
import { queueInitialMediaModeration } from "./media-moderation.service";
import { publicMediaUrlForMediaId } from "./media-url";
import { deleteObject, getObjectBuffer, putObjectBuffer } from "./object-storage";
import { findGalleryItemForMedia } from "../users/profile-gallery.repo";

export type AvatarUploadResponse = {
  avatarUrl: string;
  user: SelfUserProfile;
};

export type PublicMediaResponse = {
  body: Buffer;
  contentType: string;
};

type MediaServiceDeps = {
  findUserById: typeof findUserById;
  updateUserAvatar: typeof updateUserAvatar;
  createMediaFile: typeof createMediaFile;
  findMediaFileById: typeof findMediaFileById;
  findOwnedMediaFileByUrl: typeof findOwnedMediaFileByUrl;
  deleteMediaFileByOwner: typeof deleteMediaFileByOwner;
  findGalleryItemForMedia: typeof findGalleryItemForMedia;
  queueInitialMediaModeration: typeof queueInitialMediaModeration;
  putObjectBuffer: typeof putObjectBuffer;
  getObjectBuffer: typeof getObjectBuffer;
  deleteObject: typeof deleteObject;
  processAvatarImage: typeof processAvatarImage;
};

const defaultDeps: MediaServiceDeps = {
  findUserById,
  updateUserAvatar,
  createMediaFile,
  findMediaFileById,
  findOwnedMediaFileByUrl,
  deleteMediaFileByOwner,
  findGalleryItemForMedia,
  queueInitialMediaModeration,
  putObjectBuffer,
  getObjectBuffer,
  deleteObject,
  processAvatarImage,
};

let deps: MediaServiceDeps = defaultDeps;

export function __setMediaServiceDepsForTests(
  overrides: Partial<MediaServiceDeps>,
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

export async function uploadAvatar(
  userId: string,
  file: MultipartFile | undefined,
  cropInput?: unknown,
): Promise<AvatarUploadResponse> {
  if (!file) {
    throw validationError("Avatar file is required", { file: "required" });
  }

  let inputBuffer: Buffer;
  try {
    inputBuffer = await file.toBuffer();
  } catch (error) {
    if (isMultipartFileTooLarge(error)) {
      throw new AppError("file_too_large", "Avatar file must be 8 MB or smaller", 413, {
        file: "too_large",
      });
    }
    throw error;
  }

  if ((file.file as { truncated?: boolean }).truncated || inputBuffer.length > MAX_AVATAR_INPUT_BYTES) {
    throw new AppError("file_too_large", "Avatar file must be 8 MB or smaller", 413, {
      file: "too_large",
    });
  }

  assertAvatarInput(inputBuffer);
  const currentUser = await deps.findUserById(userId);
  if (!currentUser) {
    throw unauthorized("User no longer exists");
  }

  const crop = normalizeMediaCrop(cropInput);
  const processed = await deps.processAvatarImage(inputBuffer, crop);
  const checksum = checksumSha256(processed.buffer);
  const mediaId = randomUUID();
  const objectKey = avatarObjectKey(userId, mediaId);
  const avatarUrl = publicMediaUrlForMediaId(mediaId);

  await deps.putObjectBuffer({
    bucket: env.S3_BUCKET,
    key: objectKey,
    body: processed.buffer,
    contentType: processed.mimeType,
  });

  let createdMedia: MediaFileRow | undefined;
  try {
    createdMedia = await deps.createMediaFile({
      id: mediaId,
      ownerUserId: userId,
      type: "avatar",
      path: objectKey,
      url: avatarUrl,
      mimeType: processed.mimeType,
      sizeBytes: processed.buffer.length,
      width: processed.width,
      height: processed.height,
      checksumSha256: checksum,
    });
    await deps.queueInitialMediaModeration(createdMedia);
  } catch (error) {
    await deleteObjectIfPossible(objectKey);
    if (createdMedia) {
      await deps.deleteMediaFileByOwner(createdMedia.id, userId).catch(() => undefined);
    }
    throw error;
  }

  if (!createdMedia) {
    throw new Error("Failed to create avatar media");
  }

  const user = await deps.updateUserAvatar(userId, createdMedia.url);
  if (!user) {
    await deleteObjectIfPossible(objectKey);
    await deps.deleteMediaFileByOwner(createdMedia.id, userId).catch(() => undefined);
    throw unauthorized("User no longer exists");
  }

  await cleanupPreviousObjectAvatarIfSafe(userId, currentUser.avatarUrl, createdMedia.id);

  return {
    avatarUrl: createdMedia.url,
    user: toSelfUserProfile(user),
  };
}

export async function getPublicMedia(mediaId: string): Promise<PublicMediaResponse> {
  const media = await deps.findMediaFileById(String(mediaId ?? "").trim());
  if (!media) {
    throw new AppError("not_found", "Media file not found", 404);
  }

  if (media.type !== "avatar" && media.type !== "profile_avatar" && media.type !== "profile_photo") {
    throw new AppError("not_found", "Media file not found", 404);
  }

  if (media.type === "profile_photo") {
    const galleryItem = await deps.findGalleryItemForMedia(media.ownerUserId, media.id);
    if (!galleryItem || galleryItem.item.visibility !== "public") {
      throw new AppError("not_found", "Media file not found", 404);
    }
  }

  const body = await readPublicMediaObject(media);

  return {
    body,
    contentType: media.mimeType,
  };
}

async function readPublicMediaObject(media: MediaFileRow): Promise<Buffer> {
  try {
    return await deps.getObjectBuffer({
      bucket: env.S3_BUCKET,
      key: media.path,
      maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      throw new AppError("object_not_found", "Media object was not found in storage", 404, {
        mediaId: media.id,
        type: media.type,
      });
    }

    if (error instanceof AppError && error.code === "internal_error") {
      throw new AppError("storage_read_failed", "Media object storage read failed", 500, {
        mediaId: media.id,
        type: media.type,
      });
    }

    throw error;
  }
}

function avatarObjectKey(userId: string, mediaId: string): string {
  return `users/${userId}/avatar/${mediaId}.webp`;
}

async function cleanupPreviousObjectAvatarIfSafe(
  userId: string,
  previousAvatarUrl: string | null,
  newMediaId: string,
): Promise<void> {
  if (!previousAvatarUrl) {
    return;
  }

  const previousMedia = await deps
    .findOwnedMediaFileByUrl(userId, previousAvatarUrl)
    .catch(() => undefined);
  if (
    !previousMedia ||
    previousMedia.id === newMediaId ||
    previousMedia.type !== "avatar" ||
    !isObjectStoredAvatarPath(userId, previousMedia.path)
  ) {
    return;
  }

  await deps
    .deleteObject({
      bucket: env.S3_BUCKET,
      key: previousMedia.path,
    })
    .catch(() => undefined);
  await deps.deleteMediaFileByOwner(previousMedia.id, userId).catch(() => undefined);
}

function isObjectStoredAvatarPath(userId: string, path: string): boolean {
  return path.startsWith(`users/${userId}/avatar/`) && path.endsWith(".webp");
}

async function deleteObjectIfPossible(objectKey: string): Promise<void> {
  await deps.deleteObject({
    bucket: env.S3_BUCKET,
    key: objectKey,
  }).catch(() => undefined);
}
