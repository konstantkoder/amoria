import { apiRequest } from "@/services/api/apiClient";
import type {
  AvatarUploadResponse,
  BackendUploadFile,
} from "@/services/api/types";

export function uploadAvatarToBackend(
  accessToken: string,
  file: BackendUploadFile
): Promise<AvatarUploadResponse> {
  const formData = new FormData();
  const uploadFile: BackendUploadFile = {
    uri: file.uri,
    ...(file.name ? { name: file.name } : {}),
    ...(file.type ? { type: file.type } : {}),
  };

  formData.append("avatar", uploadFile as unknown as Blob);

  return apiRequest<AvatarUploadResponse>("/media/avatar", {
    method: "POST",
    accessToken,
    body: formData,
  });
}
