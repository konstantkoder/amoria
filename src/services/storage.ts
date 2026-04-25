import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { firebaseConfig, storage } from "@/config/firebaseConfig";

function requireStorage() {
  const storageBucket = String(firebaseConfig.storageBucket ?? "").trim();
  if (!storage || !storageBucket) {
    throw new Error("Firebase Storage is not initialized");
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

async function uploadImageToPath(uri: string, path: string) {
  const stableUri = String(uri ?? "").trim();
  if (!stableUri) {
    throw new Error("Image uri is required");
  }

  const bucket = requireStorage();
  const response = await fetch(stableUri);
  if (!response.ok) {
    throw new Error(`Failed to read image asset: ${response.status}`);
  }

  const blob = await response.blob();
  const contentType = inferImageContentType(stableUri);
  const objectRef = ref(bucket, path);
  await uploadBytes(objectRef, blob, { contentType });
  return getDownloadURL(objectRef);
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

export async function uploadProfileAvatar(uid: string, uri: string) {
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
  return uploadImageToPath(stableUri, `users/${stableUid}/profile/avatar.${extension}`);
}

export async function deleteImage(uri: string) {
  const stableUri = String(uri ?? "").trim();
  if (!stableUri || (!stableUri.startsWith("https://") && !stableUri.startsWith("gs://"))) {
    return;
  }

  await deleteObject(ref(requireStorage(), stableUri));
}
