import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { storage } from "@/config/firebaseConfig";

function requireStorage() {
  if (!storage) {
    throw new Error("Firebase Storage is not initialized");
  }

  return storage;
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

  const bucket = requireStorage();
  const response = await fetch(stableUri);
  if (!response.ok) {
    throw new Error(`Failed to read image asset: ${response.status}`);
  }

  const blob = await response.blob();
  const id = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const objectRef = ref(bucket, `users/${stableUid}/${id}.jpg`);
  await uploadBytes(objectRef, blob);
  return getDownloadURL(objectRef);
}

export async function deleteImage(uri: string) {
  const stableUri = String(uri ?? "").trim();
  if (!stableUri || (!stableUri.startsWith("https://") && !stableUri.startsWith("gs://"))) {
    return;
  }

  await deleteObject(ref(requireStorage(), stableUri));
}
