import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { firebaseConfig, storage } from "@/config/firebaseConfig";
import { uploadAvatarToBackend } from "@/services/api/mediaApi";
import {
  getBackendAccessToken,
  loadBackendSession,
  saveBackendSession,
} from "@/services/api/sessionStorage";

function requireStorage(errorCode = "photos.uploadUnavailable") {
  const storageBucket = String(firebaseConfig.storageBucket ?? "").trim();
  if (!storage || !storageBucket) {
    throw new Error(errorCode);
  }

  return storage;
}

function inferImageContentType(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function inferImageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function uploadImageToPath(uri: string, path: string, errorPrefix = "photos") {
  const stableUri = String(uri ?? "").trim();
  if (!stableUri) {
    throw new Error(`${errorPrefix}.uriRequired`);
  }

  const bucket = requireStorage(`${errorPrefix}.uploadUnavailable`);
  let response;
  try {
    response = await fetch(stableUri);
  } catch {
    throw new Error(`${errorPrefix}.readFailed`);
  }

  if (!response.ok) {
    throw new Error(`${errorPrefix}.readFailed`);
  }

  let blob;
  try {
    blob = await response.blob();
  } catch {
    throw new Error(`${errorPrefix}.readFailed`);
  }

  const contentType = inferImageContentType(stableUri);
  const objectRef = ref(bucket, path);
  try {
    await uploadBytes(objectRef, blob, { contentType });
  } catch {
    throw new Error(`${errorPrefix}.uploadFailed`);
  }

  try {
    return await getDownloadURL(objectRef);
  } catch {
    throw new Error(`${errorPrefix}.downloadUrlFailed`);
  }
}

async function uploadBackendUserAvatar(stableUid: string, stableUri: string) {
  const session = await loadBackendSession();
  if (!session || session.user.id !== stableUid) return null;

  const contentType = inferImageContentType(stableUri);
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

export async function uploadImage(uid: string, uri: string) {
  const stableUid = String(uid ?? "").trim();
  const stableUri = String(uri ?? "").trim();
  if (!stableUid) {
    throw new Error("User id is required");
  }
  if (!stableUri) {
    throw new Error("Image uri is required");
  }

  const contentType = inferImageContentType(stableUri);
  const extension = inferImageExtension(contentType);
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  return uploadImageToPath(stableUri, `users/${stableUid}/photos/${id}.${extension}`);
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

export async function uploadAnnouncementPhoto(
  authorUid: string,
  announcementId: string,
  localUri: string
) {
  const stableUid = String(authorUid ?? "").trim();
  const stableAnnouncementId = String(announcementId ?? "").trim();
  const stableUri = String(localUri ?? "").trim();
  if (!stableUid) {
    throw new Error("announcements.photoUserRequired");
  }
  if (!stableAnnouncementId) {
    throw new Error("announcements.photoAnnouncementRequired");
  }
  if (!stableUri) {
    throw new Error("announcements.photoUriRequired");
  }

  return uploadImageToPath(
    stableUri,
    `announcements/${stableUid}/${stableAnnouncementId}/cover.jpg`,
    "announcements.photo"
  );
}

export async function deleteImage(uri: string) {
  const stableUri = String(uri ?? "").trim();
  if (!stableUri || (!stableUri.startsWith("https://") && !stableUri.startsWith("gs://"))) {
    return;
  }

  await deleteObject(ref(requireStorage(), stableUri));
}
