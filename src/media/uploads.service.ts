import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";
import { AppError, validationError } from "../common/errors";
import { MAX_MEDIA_UPLOAD_BYTES, MEDIA_UPLOAD_EXPIRES_IN_SEC } from "../config/constants";
import { env } from "../config/env";
import type { MediaFileRow, MediaUploadRow, NewMediaFileRow } from "../db/schema";
import {
  completeMediaUploadWithFile,
  createMediaFile,
  createMediaUpload,
  deleteMediaFileByOwner,
  findMediaUploadById,
} from "./media.repo";
import {
  createPutPresignedUrl,
  deleteObject,
  getObjectBuffer,
  headObject,
  putObjectBuffer,
} from "./object-storage";
import { publicMediaUrlForMediaId } from "./media-url";
import { queueInitialMediaModeration } from "./media-moderation.service";
import type {
  CompleteUploadBody,
  PrepareUploadBody,
  ProfilePhotoUploadVisibility,
} from "./uploads.schemas";
import {
  addCompletedProfilePhotoToGallery,
  assertCanAddProfilePhotoToGallery,
  deleteOwnedMediaWithGalleryGuards,
} from "../users/profile-gallery.service";
import { checksumSha256, isMultipartFileTooLarge } from "./file-guards";
import {
  normalizeMediaCrop,
  processProfilePhotoImage,
} from "./image-processing";

export type PrepareUploadResponse = {
  uploadId: string;
  method: "PUT";
  uploadUrl: string;
  headers: {
    "content-type": string;
  };
  expiresAt: string;
};

export type CompleteUploadResponse = {
  media: MediaUploadResponse;
};

export type MediaUploadResponse = {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  purpose: string;
};

export type DeleteMediaResponse = {
  ok: true;
};

type UploadsServiceDeps = {
  completeMediaUploadWithFile: typeof completeMediaUploadWithFile;
  createMediaFile: typeof createMediaFile;
  createMediaUpload: typeof createMediaUpload;
  deleteMediaFileByOwner: typeof deleteMediaFileByOwner;
  findMediaUploadById: typeof findMediaUploadById;
  createPutPresignedUrl: typeof createPutPresignedUrl;
  headObject: typeof headObject;
  getObjectBuffer: typeof getObjectBuffer;
  putObjectBuffer: typeof putObjectBuffer;
  deleteObject: typeof deleteObject;
  addCompletedProfilePhotoToGallery: typeof addCompletedProfilePhotoToGallery;
  assertCanAddProfilePhotoToGallery: typeof assertCanAddProfilePhotoToGallery;
  queueInitialMediaModeration: typeof queueInitialMediaModeration;
  processProfilePhotoImage: typeof processProfilePhotoImage;
};

const defaultDeps: UploadsServiceDeps = {
  completeMediaUploadWithFile,
  createMediaFile,
  createMediaUpload,
  deleteMediaFileByOwner,
  findMediaUploadById,
  createPutPresignedUrl,
  headObject,
  getObjectBuffer,
  putObjectBuffer,
  deleteObject,
  addCompletedProfilePhotoToGallery,
  assertCanAddProfilePhotoToGallery,
  queueInitialMediaModeration,
  processProfilePhotoImage,
};

let deps: UploadsServiceDeps = defaultDeps;

export function __setUploadsServiceDepsForTests(
  overrides: Partial<UploadsServiceDeps>,
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

export async function prepareUpload(
  ownerUserId: string,
  input: PrepareUploadBody,
): Promise<PrepareUploadResponse> {
  const uploadId = randomUUID();
  const objectKey = `users/${ownerUserId}/${input.purpose}/${uploadId}`;
  const expiresAt = new Date(Date.now() + MEDIA_UPLOAD_EXPIRES_IN_SEC * 1000);

  const upload = await deps.createMediaUpload({
    id: uploadId,
    ownerUserId,
    purpose: input.purpose,
    objectKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    status: "prepared",
    expiresAt,
  });

  const uploadUrl = await deps.createPutPresignedUrl({
    bucket: env.S3_BUCKET,
    key: upload.objectKey,
    contentType: upload.mimeType,
    expiresInSec: MEDIA_UPLOAD_EXPIRES_IN_SEC,
  });

  return {
    uploadId: upload.id,
    method: "PUT",
    uploadUrl,
    headers: {
      "content-type": upload.mimeType,
    },
    expiresAt: upload.expiresAt.toISOString(),
  };
}

export async function completeUpload(
  ownerUserId: string,
  uploadId: string,
  input: CompleteUploadBody,
): Promise<CompleteUploadResponse> {
  const upload = await loadOwnedPreparedUpload(ownerUserId, uploadId);

  if (upload.sizeBytes !== input.sizeBytes) {
    throw new AppError("validation_error", "Upload size does not match prepared size", 400, {
      sizeBytes: "mismatch",
    });
  }

  if (upload.checksumSha256) {
    if (!input.checksumSha256) {
      throw new AppError("validation_error", "Upload checksum is required", 400, {
        checksumSha256: "required",
      });
    }

    if (!sameChecksum(upload.checksumSha256, input.checksumSha256)) {
      throw new AppError("validation_error", "Upload checksum does not match prepared checksum", 400, {
        checksumSha256: "mismatch",
      });
    }
  }

  const object = await getUploadedObject(upload);
  if (object.sizeBytes !== input.sizeBytes) {
    throw new AppError("validation_error", "Stored object size does not match upload size", 400, {
      sizeBytes: "mismatch",
    });
  }

  if (normalizeMimeType(object.contentType) !== normalizeMimeType(upload.mimeType)) {
    throw new AppError("validation_error", "Stored object content type does not match upload", 400, {
      mimeType: "mismatch",
    });
  }

  if (upload.purpose === "profile_photo") {
    await assertCanCompleteProfilePhotoUpload(ownerUserId, upload);
  }

  const mediaInput = await toCompletedMediaInput(ownerUserId, upload, input);
  const media = await deps.completeMediaUploadWithFile(
    upload.id,
    mediaInput,
    new Date(),
  );

  if (!media) {
    throw new AppError("validation_error", "Upload is no longer prepared", 409, {
      uploadId: "invalid_state",
    });
  }

  try {
    await deps.addCompletedProfilePhotoToGallery(
      ownerUserId,
      media.media,
      input.visibility ?? "public",
    );
  } catch (error) {
    await deleteObjectIfPossible(media.media.path);
    await deps.deleteMediaFileByOwner(media.media.id, ownerUserId).catch(() => undefined);
    throw error;
  }

  return {
    media: toMediaUploadResponse(media.media),
  };
}

export async function uploadProfilePhoto(
  ownerUserId: string,
  file: MultipartFile | undefined,
  cropInput?: unknown,
  visibility: ProfilePhotoUploadVisibility = "public",
): Promise<CompleteUploadResponse> {
  if (!file) {
    throw validationError("Profile photo file is required", { file: "required" });
  }

  const declaredMimeType = normalizeMimeType(file.mimetype);
  if (declaredMimeType && !isSupportedProfilePhotoMimeType(declaredMimeType)) {
    throw new AppError(
      "unsupported_media_type",
      "Only JPEG, PNG, or WebP profile photos are supported",
      415,
      { file: "unsupported_media_type" },
    );
  }

  let inputBuffer: Buffer;
  try {
    inputBuffer = await file.toBuffer();
  } catch (error) {
    if (isMultipartFileTooLarge(error)) {
      throw profilePhotoTooLarge();
    }
    throw error;
  }

  if ((file.file as { truncated?: boolean }).truncated || inputBuffer.length > MAX_MEDIA_UPLOAD_BYTES) {
    throw profilePhotoTooLarge();
  }

  await deps.assertCanAddProfilePhotoToGallery(ownerUserId);

  const crop = normalizeMediaCrop(cropInput);
  const processed = await deps.processProfilePhotoImage(inputBuffer, {}, crop);
  const mediaId = randomUUID();
  const objectKey = backendProfilePhotoObjectKey(ownerUserId, mediaId);
  const mediaUrl = publicMediaUrlForMediaId(mediaId);

  await deps.putObjectBuffer({
    bucket: env.S3_BUCKET,
    key: objectKey,
    body: processed.buffer,
    contentType: processed.mimeType,
  });

  let media: MediaFileRow;
  try {
    media = await deps.createMediaFile({
      id: mediaId,
      ownerUserId,
      type: "profile_photo",
      path: objectKey,
      url: mediaUrl,
      mimeType: processed.mimeType,
      sizeBytes: processed.buffer.length,
      width: processed.width,
      height: processed.height,
      checksumSha256: checksumSha256(processed.buffer),
      moderationState: visibility === "public" ? "pending" : "needs_review",
      moderationOrigin: visibility === "public" ? "awaiting_automatic" : "awaiting_manual_locked",
    });
  } catch (error) {
    await deleteObjectIfPossible(objectKey);
    throw error;
  }

  try {
    await deps.addCompletedProfilePhotoToGallery(ownerUserId, media, visibility);
  } catch (error) {
    await deleteObjectIfPossible(objectKey);
    await deps.deleteMediaFileByOwner(media.id, ownerUserId).catch(() => undefined);
    throw error;
  }

  return {
    media: toMediaUploadResponse(media),
  };
}

async function assertCanCompleteProfilePhotoUpload(
  ownerUserId: string,
  upload: MediaUploadRow,
): Promise<void> {
  try {
    await deps.assertCanAddProfilePhotoToGallery(ownerUserId);
  } catch (error) {
    await deps.deleteObject({
      bucket: env.S3_BUCKET,
      key: upload.objectKey,
    }).catch(() => undefined);
    throw error;
  }
}

export async function deleteMedia(ownerUserId: string, mediaId: string): Promise<DeleteMediaResponse> {
  return deleteOwnedMediaWithGalleryGuards(ownerUserId, mediaId);
}

async function loadOwnedPreparedUpload(
  ownerUserId: string,
  uploadId: string,
): Promise<MediaUploadRow> {
  const upload = await deps.findMediaUploadById(uploadId);

  if (!upload || upload.ownerUserId !== ownerUserId) {
    throw new AppError("not_found", "Upload session not found", 404);
  }

  if (upload.status !== "prepared") {
    throw new AppError("validation_error", "Upload is not prepared", 409, {
      uploadId: "invalid_state",
    });
  }

  if (upload.expiresAt.getTime() <= Date.now()) {
    throw new AppError("validation_error", "Upload session has expired", 409, {
      uploadId: "expired",
    });
  }

  return upload;
}

async function getUploadedObject(upload: MediaUploadRow): Promise<{
  sizeBytes: number;
  contentType: string;
}> {
  try {
    return await deps.headObject({
      bucket: env.S3_BUCKET,
      key: upload.objectKey,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      throw new AppError("validation_error", "Uploaded object was not found", 400, {
        uploadId: "object_not_found",
      });
    }

    throw error;
  }
}

async function toCompletedMediaInput(
  ownerUserId: string,
  upload: MediaUploadRow,
  input: CompleteUploadBody,
): Promise<NewMediaFileRow> {
  if (upload.purpose === "profile_photo") {
    return toCompletedProfilePhotoMediaInput(ownerUserId, upload, input);
  }

  return {
    id: upload.id,
    ownerUserId,
    type: upload.purpose,
    path: upload.objectKey,
    url: publicMediaUrlForMediaId(upload.id),
    mimeType: upload.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256 ?? upload.checksumSha256,
  };
}

async function toCompletedProfilePhotoMediaInput(
  ownerUserId: string,
  upload: MediaUploadRow,
  input: CompleteUploadBody,
): Promise<NewMediaFileRow> {
  const rawBuffer = await getUploadedObjectBuffer(upload);
  const crop = normalizeMediaCrop(input.crop);
  const processed = await deps.processProfilePhotoImage(rawBuffer, {}, crop);
  const sanitizedObjectKey = sanitizedProfilePhotoObjectKey(upload.objectKey);

  await deps.putObjectBuffer({
    bucket: env.S3_BUCKET,
    key: sanitizedObjectKey,
    body: processed.buffer,
    contentType: processed.mimeType,
  });

  await deps.deleteObject({
    bucket: env.S3_BUCKET,
    key: upload.objectKey,
  });

  return {
    id: upload.id,
    ownerUserId,
    type: upload.purpose,
    path: sanitizedObjectKey,
    url: publicMediaUrlForMediaId(upload.id),
    mimeType: processed.mimeType,
    sizeBytes: processed.buffer.length,
    width: processed.width,
    height: processed.height,
    checksumSha256: checksumSha256(processed.buffer),
    moderationState: (input.visibility ?? "public") === "public" ? "pending" : "needs_review",
    moderationOrigin: (input.visibility ?? "public") === "public"
      ? "awaiting_automatic"
      : "awaiting_manual_locked",
  };
}

async function getUploadedObjectBuffer(upload: MediaUploadRow): Promise<Buffer> {
  try {
    return await deps.getObjectBuffer({
      bucket: env.S3_BUCKET,
      key: upload.objectKey,
      maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") {
      throw new AppError("validation_error", "Uploaded object was not found", 400, {
        uploadId: "object_not_found",
      });
    }

    if (error instanceof AppError && error.code === "file_too_large") {
      throw new AppError("image_too_large", "Uploaded profile photo is too large", 413, {
        file: "too_large",
      });
    }

    throw error;
  }
}

function sanitizedProfilePhotoObjectKey(objectKey: string): string {
  return `${objectKey}.webp`;
}

function backendProfilePhotoObjectKey(ownerUserId: string, mediaId: string): string {
  return `users/${ownerUserId}/profile_photo/${mediaId}.webp`;
}

function toMediaUploadResponse(media: MediaFileRow): MediaUploadResponse {
  return {
    id: media.id,
    url: media.url,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    purpose: media.type,
  };
}

function normalizeMimeType(value: unknown): string {
  return String(value ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isSupportedProfilePhotoMimeType(value: string): boolean {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function profilePhotoTooLarge(): AppError {
  return new AppError("file_too_large", "Profile photo file must be 10 MB or smaller", 413, {
    file: "too_large",
  });
}

async function deleteObjectIfPossible(objectKey: string): Promise<void> {
  await deps.deleteObject({
    bucket: env.S3_BUCKET,
    key: objectKey,
  }).catch(() => undefined);
}

function sameChecksum(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
