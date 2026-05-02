import { apiRequest } from "@/services/api/apiClient";
import type {
  PatchProfileRequest,
  SelfUserProfileDto,
} from "@/services/api/types";

export function getMeFromBackend(accessToken?: string): Promise<SelfUserProfileDto> {
  return apiRequest<SelfUserProfileDto>("/me", {
    ...(accessToken ? { accessToken } : {}),
  });
}

export function patchMeProfileOnBackend(
  input: PatchProfileRequest,
  accessToken?: string
): Promise<SelfUserProfileDto> {
  return apiRequest<SelfUserProfileDto>("/me/profile", {
    method: "PATCH",
    ...(accessToken ? { accessToken } : {}),
    body: input,
  });
}
