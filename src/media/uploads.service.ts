import { randomUUID } from "node:crypto";
import { AppError } from "../common/errors";
import { MAX_MEDIA_UPLOAD_BYTES, MEDIA_UPLOAD_EXPIRES_IN_SEC } from "../config/constants";
import { env } from "../config/env";
import type { MediaFileRow, MediaUploadRow, NewMediaFileRow } from "../db/schema";
import {
  completeMediaUploadWithFile,
  createMediaUpload,
  findMediaUploadById,
} from "./media.repo";
import {
  createPutPresignedUrl,
  deleteObject,
  getObjectBuffer,
  headObject,
  putObjectBuffer,
} from "./object-storage";
import type { CompleteUploadBody, PrepareUploadBody } from "./uploads.schemas";
import {
  addCompletedProfilePhotoToGallery,
  assertCanAddProfilePhotoToGallery,
  deleteOwnedMediaWithGalleryGuards,
} from "../users/profile-gallery.service";
import { checksumSha256 } from "./file-guards";
import { processProfilePhotoImage } from "./image-processing";

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
  createMediaUpload: typeof createMediaUpload;
  findMediaUploadById: typeof findMediaUploadById;
  createPutPresignedUrl: typeof createPutPresignedUrl;
  headObject: typeof headObject;
  getObjectBuffer: typeof getObjectBuffer;
  putObjectBuffer: typeof putObjectBuffer;
  deleteObject: typeof deleteObject;
  addCompletedProfilePhotoToGallery: typeof addCompletedProfilePhotoToGallery;
  assertCanAddProfilePhotoToGallery: typeof assertCanAddProfilePhotoToGallery;
  processProfilePhotoImage: typeof processProfilePhotoImage;
};

const defaultDeps: UploadsServiceDeps = {
  completeMediaUploadWithFile,
  createMediaUpload,
  findMediaUploadById,
  createPutPresignedUrl,
  headObject,
  getObjectBuffer,
  putObjectBuffer,
  deleteObject,
  addCompletedProfilePhotoToGallery,
  assertCanAddProfilePhotoToGallery,
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

  await deps.addCompletedProfilePhotoToGallery(ownerUserId, media.media);

  return {
    media: toMediaUploadResponse(media.media),
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
    return toCompletedProfilePhotoMediaInput(ownerUserId, upload);
  }

  return {
    ownerUserId,
    type: upload.purpose,
    path: upload.objectKey,
    url: publicMediaUrl(upload.objectKey),
    mimeType: upload.mimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256 ?? upload.checksumSha256,
  };
}

async function toCompletedProfilePhotoMediaInput(
  ownerUserId: string,
  upload: MediaUploadRow,
): Promise<NewMediaFileRow> {
  const rawBuffer = await getUploadedObjectBuffer(upload);
  const processed = await deps.processProfilePhotoImage(rawBuffer);
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
    ownerUserId,
    type: upload.purpose,
    path: sanitizedObjectKey,
    url: publicMediaUrl(sanitizedObjectKey),
    mimeType: processed.mimeType,
    sizeBytes: processed.buffer.length,
    width: processed.width,
    height: processed.height,
    checksumSha256: checksumSha256(processed.buffer),
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

function toMediaUploadResponse(media: MediaFileRow): MediaUploadResponse {
  return {
    id: media.id,
    url: media.url,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    purpose: media.type,
  };
}

function publicMediaUrl(objectKey: string): string {
  return `${env.S3_PUBLIC_BASE_URL}/${objectKey}`;
}

function normalizeMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function sameChecksum(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
