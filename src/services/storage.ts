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
import { uploadFileToPresignedPut } from "@/services/media/uploadPut";

export type UploadedProfilePhoto = {
  mediaId: string;
  url: string;
};

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
    throw new Error("photos.unsupportedImageType");
  }
}

function mapMediaToProfilePhoto(media: MediaDto): UploadedProfilePhoto {
  const mediaId = String(media.mediaId ?? media.id ?? "").trim();
  const url = normalizePublicMediaUrl(
    media.url ?? media.publicUrl,
    "completed profile photo URL"
  );

  if (!mediaId || !url) {
    throw new Error("photos.completeInvalidMedia");
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
    throw new Error("photos.uriRequired");
  }

  const fileInfo = await FileSystem.getInfoAsync(stableUri);
  if (!fileInfo.exists) {
    throw new Error("photos.readFailed");
  }

  const sizeBytes = Number(fileInfo.size ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("photos.sizeRequired");
  }

  const mimeType = normalizeMimeType(options.mimeType, stableUri);
  assertSupportedSharedProfileImage(mimeType);
  const upload = await prepareUpload({
    purpose: "profile_photo",
    mimeType,
    sizeBytes,
    ...(options.checksumSha256
      ? { checksumSha256: options.checksumSha256 }
      : {}),
  });

  await uploadFileToPresignedPut(upload.uploadUrl, stableUri, upload.headers);

  const completed = await completeUpload(upload.uploadId, {
    sizeBytes,
    ...(options.checksumSha256
      ? { checksumSha256: options.checksumSha256 }
      : {}),
  });

  return mapMediaToProfilePhoto(completed.media);
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
    throw new Error("photos.userRequired");
  }
  if (!stableUri) {
    throw new Error("photos.uriRequired");
  }

  const backendAvatarUrl = await uploadBackendUserAvatar(stableUid, stableUri);
  if (backendAvatarUrl !== null) return backendAvatarUrl;

  throw new Error("auth.sessionRequired");
}

export async function uploadProfileAvatar(uid: string, uri: string) {
  return uploadUserAvatar(uid, uri);
}
