import { apiRequest } from "@/services/api/apiClient";
import type {
  AvatarUploadResponse,
  BackendUploadFile,
  CompleteUploadResponse,
} from "@/services/api/types";

export function uploadAvatarToBackend(file: BackendUploadFile): Promise<AvatarUploadResponse>;
export function uploadAvatarToBackend(
  accessToken: string,
  file: BackendUploadFile
): Promise<AvatarUploadResponse>;
export function uploadAvatarToBackend(
  fileOrAccessToken: BackendUploadFile | string,
  maybeFile?: BackendUploadFile
): Promise<AvatarUploadResponse> {
  const accessToken = typeof fileOrAccessToken === "string"
    ? fileOrAccessToken
    : undefined;
  const file = typeof fileOrAccessToken === "string"
    ? maybeFile
    : fileOrAccessToken;

  if (!file) {
    throw new Error("Avatar file is required");
  }

  const formData = new FormData();
  const uploadFile: BackendUploadFile = {
    uri: file.uri,
    ...(file.name ? { name: file.name } : {}),
    ...(file.type ? { type: file.type } : {}),
  };

  formData.append("avatar", uploadFile as unknown as Blob);

  return apiRequest<AvatarUploadResponse>("/media/avatar", {
    method: "POST",
    ...(accessToken ? { accessToken } : {}),
    body: formData,
  });
}

export function uploadProfilePhotoToBackend(
  file: BackendUploadFile
): Promise<CompleteUploadResponse> {
  const formData = new FormData();
  const uploadFile: BackendUploadFile = {
    uri: file.uri,
    ...(file.name ? { name: file.name } : {}),
    ...(file.type ? { type: file.type } : {}),
  };

  formData.append("file", uploadFile as unknown as Blob);

  return apiRequest<CompleteUploadResponse>("/media/profile-photo", {
    method: "POST",
    body: formData,
  });
}
