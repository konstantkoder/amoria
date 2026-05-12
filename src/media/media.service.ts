import type { MultipartFile } from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { AppError, unauthorized, validationError } from "../common/errors";
import { MAX_AVATAR_INPUT_BYTES } from "../config/constants";
import { env } from "../config/env";
import type { MediaFileRow } from "../db/schema";
import { findUserById, updateUserAvatar } from "../users/users.repo";
import { toSelfUserProfile, type SelfUserProfile } from "../users/users.service";
import { assertAvatarInput, checksumSha256, isMultipartFileTooLarge } from "./file-guards";
import { processAvatarImage } from "./image-processing";
import { createMediaFile, deleteMediaFileByOwner, findOwnedMediaFileByUrl } from "./media.repo";
import { deleteObject, putObjectBuffer } from "./object-storage";

export type AvatarUploadResponse = {
  avatarUrl: string;
  user: SelfUserProfile;
};

type MediaServiceDeps = {
  findUserById: typeof findUserById;
  updateUserAvatar: typeof updateUserAvatar;
  createMediaFile: typeof createMediaFile;
  findOwnedMediaFileByUrl: typeof findOwnedMediaFileByUrl;
  deleteMediaFileByOwner: typeof deleteMediaFileByOwner;
  putObjectBuffer: typeof putObjectBuffer;
  deleteObject: typeof deleteObject;
  processAvatarImage: typeof processAvatarImage;
};

const defaultDeps: MediaServiceDeps = {
  findUserById,
  updateUserAvatar,
  createMediaFile,
  findOwnedMediaFileByUrl,
  deleteMediaFileByOwner,
  putObjectBuffer,
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

  const processed = await deps.processAvatarImage(inputBuffer);
  const checksum = checksumSha256(processed.buffer);
  const mediaId = randomUUID();
  const objectKey = avatarObjectKey(userId, mediaId);
  const avatarUrl = publicMediaUrl(objectKey);

  await deps.putObjectBuffer({
    bucket: env.S3_BUCKET,
    key: objectKey,
    body: processed.buffer,
    contentType: processed.mimeType,
  });

  let createdMedia: MediaFileRow;
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
  } catch (error) {
    await deleteObjectIfPossible(objectKey);
    throw error;
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

function avatarObjectKey(userId: string, mediaId: string): string {
  return `users/${userId}/avatar/${mediaId}.webp`;
}

function publicMediaUrl(objectKey: string): string {
  return `${env.S3_PUBLIC_BASE_URL}/${objectKey}`;
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
