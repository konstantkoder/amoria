import * as FileSystem from "expo-file-system/legacy";

import { uploadAvatarToBackend } from "@/services/api/mediaApi";
import {
  completeUpload,
  deleteMedia,
  prepareUpload,
} from "@/services/api/uploadsApi";
import {
  getBackendAccessToken,
  loadBackendSession,
  saveBackendSession,
} from "@/services/api/sessionStorage";
import type { MediaDto } from "@/services/api/types";
import { normalizePublicMediaUrl } from "@/services/media/mediaUrl";
import {
  PresignedPutUploadError,
  uploadFileToPresignedPut,
} from "@/services/media/uploadPut";

export type UploadedProfilePhoto = {
  mediaId: string;
  url: string;
};

export type UploadFlowStep =
  | "getInfo"
  | "prepareUpload"
  | "putUpload"
  | "completeUpload"
  | "mapMedia"
  | "uploadAvatar"
  | "session";

export class UploadFlowError extends Error {
  code: string;
  step: UploadFlowStep;
  status?: number;
  safeMetadata?: Record<string, unknown>;
  cause?: unknown;

  constructor(input: {
    code: string;
    step: UploadFlowStep;
    message?: string;
    status?: number;
    safeMetadata?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(input.message ?? input.code);
    this.name = "UploadFlowError";
    this.code = input.code;
    this.step = input.step;
    this.status = input.status;
    this.safeMetadata = input.safeMetadata;
    this.cause = input.cause;
  }
}

const SUPPORTED_SHARED_PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function inferImageContentType(uri: string) {
  const normalized = String(uri ?? "").split("?")[0].toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".heic")) return "image/heic";
  if (normalized.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

function inferImageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  return "jpg";
}

function normalizeMimeType(value: unknown, fileUri: string) {
  const mimeType = String(value ?? "").trim().toLowerCase();
  return mimeType.startsWith("image/")
    ? mimeType
    : inferImageContentType(fileUri);
}

function assertSupportedSharedProfileImage(mimeType: string) {
  if (!SUPPORTED_SHARED_PROFILE_IMAGE_TYPES.has(mimeType)) {
    throw new UploadFlowError({
      code: "photos.unsupportedImageType",
      step: "getInfo",
      message: "photos.unsupportedImageType",
      safeMetadata: { mimeType },
    });
  }
}

function mapMediaToProfilePhoto(media: MediaDto): UploadedProfilePhoto {
  const mediaId = String(media.mediaId ?? media.id ?? "").trim();
  const url = normalizePublicMediaUrl(
    media.url ?? media.publicUrl,
    "completed profile photo URL"
  );

  if (!mediaId || !url) {
    throw new UploadFlowError({
      code: "photos.completeInvalidMedia",
      step: "mapMedia",
      message: "photos.completeInvalidMedia",
      safeMetadata: {
        hasMediaId: Boolean(mediaId),
        hasUrl: Boolean(url),
      },
    });
  }

  return { mediaId, url };
}

async function uploadBackendUserAvatar(stableUid: string, stableUri: string) {
  const session = await loadBackendSession();
  if (!session || session.user.id !== stableUid) return null;

  const contentType = normalizeMimeType(undefined, stableUri);
  assertSupportedSharedProfileImage(contentType);
  const extension = inferImageExtension(contentType);
  const response = await uploadAvatarToBackend({
    uri: stableUri,
    name: `avatar.${extension}`,
    type: contentType,
  });
  const accessToken = await getBackendAccessToken();

  await saveBackendSession({
    accessToken: accessToken ?? session.accessToken,
    user: response.user,
  });

  return response.avatarUrl;
}

export async function uploadProfilePhoto(
  fileUri: string,
  options: { mimeType?: string; checksumSha256?: string } = {}
): Promise<UploadedProfilePhoto> {
  const stableUri = String(fileUri ?? "").trim();
  if (!stableUri) {
    throw new UploadFlowError({
      code: "photos.uriRequired",
      step: "getInfo",
      message: "photos.uriRequired",
    });
  }

  let fileInfo: FileSystem.FileInfo;
  try {
    fileInfo = await FileSystem.getInfoAsync(stableUri);
  } catch (error) {
    throw buildUploadFlowError(error, "getInfo", {
      uriScheme: getUriScheme(stableUri),
    });
  }

  if (!fileInfo.exists) {
    throw new UploadFlowError({
      code: "photos.readFailed",
      step: "getInfo",
      message: "photos.readFailed",
      safeMetadata: { uriScheme: getUriScheme(stableUri) },
    });
  }

  const sizeBytes = Number(fileInfo.size ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UploadFlowError({
      code: "photos.sizeRequired",
      step: "getInfo",
      message: "photos.sizeRequired",
      safeMetadata: { uriScheme: getUriScheme(stableUri), fileSize: sizeBytes },
    });
  }

  const mimeType = normalizeMimeType(options.mimeType, stableUri);
  assertSupportedSharedProfileImage(mimeType);
  const baseMetadata = {
    uriScheme: getUriScheme(stableUri),
    fileSize: sizeBytes,
    mimeType,
  };

  let upload: Awaited<ReturnType<typeof prepareUpload>>;
  try {
    upload = await prepareUpload({
      purpose: "profile_photo",
      mimeType,
      sizeBytes,
      ...(options.checksumSha256
        ? { checksumSha256: options.checksumSha256 }
        : {}),
    });
  } catch (error) {
    throw buildUploadFlowError(error, "prepareUpload", baseMetadata);
  }

  try {
    await uploadFileToPresignedPut(upload.uploadUrl, stableUri, upload.headers);
  } catch (error) {
    throw buildUploadFlowError(error, "putUpload", {
      ...baseMetadata,
      uploadUrlHost: getUrlHost(upload.uploadUrl),
    });
  }

  let completed: Awaited<ReturnType<typeof completeUpload>>;
  try {
    completed = await completeUpload(upload.uploadId, {
      sizeBytes,
      ...(options.checksumSha256
        ? { checksumSha256: options.checksumSha256 }
        : {}),
    });
  } catch (error) {
    throw buildUploadFlowError(error, "completeUpload", baseMetadata);
  }

  try {
    return mapMediaToProfilePhoto(completed.media);
  } catch (error) {
    throw buildUploadFlowError(error, "mapMedia", baseMetadata);
  }
}

export async function deleteProfilePhoto(mediaId: string): Promise<void> {
  const stableMediaId = String(mediaId ?? "").trim();
  if (!stableMediaId) return;

  await deleteMedia(stableMediaId);
}

export async function uploadUserAvatar(uid: string, localUri: string) {
  const stableUid = String(uid ?? "").trim();
  const stableUri = String(localUri ?? "").trim();
  if (!stableUid) {
    throw new UploadFlowError({
      code: "photos.userRequired",
      step: "session",
      message: "photos.userRequired",
    });
  }
  if (!stableUri) {
    throw new UploadFlowError({
      code: "photos.uriRequired",
      step: "getInfo",
      message: "photos.uriRequired",
    });
  }

  let backendAvatarUrl: string | null;
  try {
    backendAvatarUrl = await uploadBackendUserAvatar(stableUid, stableUri);
  } catch (error) {
    throw buildUploadFlowError(error, "uploadAvatar", {
      uriScheme: getUriScheme(stableUri),
    });
  }
  if (backendAvatarUrl !== null) return backendAvatarUrl;

  throw new UploadFlowError({
    code: "auth.sessionRequired",
    step: "session",
    message: "auth.sessionRequired",
  });
}

export async function uploadProfileAvatar(uid: string, uri: string) {
  return uploadUserAvatar(uid, uri);
}

function buildUploadFlowError(
  error: unknown,
  step: UploadFlowStep,
  safeMetadata: Record<string, unknown> = {}
): UploadFlowError {
  if (error instanceof UploadFlowError) {
    return error;
  }

  if (error instanceof PresignedPutUploadError) {
    return new UploadFlowError({
      code: error.code,
      step,
      message: error.message,
      status: error.status,
      safeMetadata: {
        ...safeMetadata,
        ...(error.uploadUrlHost ? { uploadUrlHost: error.uploadUrlHost } : {}),
        ...(error.status ? { status: error.status } : {}),
      },
      cause: error,
    });
  }

  const maybeError = error as { code?: unknown; status?: unknown; message?: unknown };
  const message = error instanceof Error
    ? error.message
    : String(maybeError?.message ?? "upload.failed");
  const code = String(maybeError?.code ?? message.split(":")[0] ?? "upload.failed");
  const status = Number(maybeError?.status);

  return new UploadFlowError({
    code,
    step,
    message,
    ...(Number.isFinite(status) ? { status } : {}),
    safeMetadata: {
      ...safeMetadata,
      ...(Number.isFinite(status) ? { status } : {}),
    },
    cause: error,
  });
}

export function getUriScheme(uri: string): string | undefined {
  const scheme = String(uri ?? "").split(":", 1)[0]?.trim();
  return scheme || undefined;
}

function getUrlHost(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.host;
  } catch {
    return undefined;
  }
}
