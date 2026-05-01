import { apiRequest } from "@/services/api/apiClient";
import type {
  PatchProfileRequest,
  SelfUserProfileDto,
} from "@/services/api/types";

export function getMeFromBackend(accessToken: string): Promise<SelfUserProfileDto> {
  return apiRequest<SelfUserProfileDto>("/me", {
    accessToken,
  });
}

export function patchMeProfileOnBackend(
  accessToken: string,
  input: PatchProfileRequest
): Promise<SelfUserProfileDto> {
  return apiRequest<SelfUserProfileDto>("/me/profile", {
    method: "PATCH",
    accessToken,
    body: input,
  });
}
