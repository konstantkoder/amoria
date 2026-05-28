import { apiRequest } from "@/services/api/apiClient";
import type {
  AvatarUploadResponse,
  BackendUploadFile,
  CompleteUploadResponse,
  MediaCropDto,
} from "@/services/api/types";

export function uploadAvatarToBackend(
  file: BackendUploadFile,
  crop?: MediaCropDto
): Promise<AvatarUploadResponse>;
export function uploadAvatarToBackend(
  accessToken: string,
  file: BackendUploadFile,
  crop?: MediaCropDto
): Promise<AvatarUploadResponse>;
export function uploadAvatarToBackend(
  fileOrAccessToken: BackendUploadFile | string,
  maybeFileOrCrop?: BackendUploadFile | MediaCropDto,
  maybeCrop?: MediaCropDto
): Promise<AvatarUploadResponse> {
  const accessToken = typeof fileOrAccessToken === "string"
    ? fileOrAccessToken
    : undefined;
  const file = typeof fileOrAccessToken === "string"
    ? maybeFileOrCrop as BackendUploadFile | undefined
    : fileOrAccessToken;
  const crop = typeof fileOrAccessToken === "string"
    ? maybeCrop
    : maybeFileOrCrop as MediaCropDto | undefined;

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
  appendCrop(formData, crop);

  return apiRequest<AvatarUploadResponse>("/media/avatar", {
    method: "POST",
    ...(accessToken ? { accessToken } : {}),
    body: formData,
  });
}

export function uploadProfilePhotoToBackend(
  file: BackendUploadFile,
  crop?: MediaCropDto
): Promise<CompleteUploadResponse> {
  const formData = new FormData();
  const uploadFile: BackendUploadFile = {
    uri: file.uri,
    ...(file.name ? { name: file.name } : {}),
    ...(file.type ? { type: file.type } : {}),
  };

  formData.append("file", uploadFile as unknown as Blob);
  appendCrop(formData, crop);

  return apiRequest<CompleteUploadResponse>("/media/profile-photo", {
    method: "POST",
    body: formData,
  });
}

function appendCrop(formData: FormData, crop?: MediaCropDto) {
  if (!crop) return;
  formData.append("crop", JSON.stringify(crop));
}
