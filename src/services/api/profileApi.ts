import { apiRequest } from "@/services/api/apiClient";
import type {
  MeResponse,
  PatchProfileRequest,
} from "@/services/api/types";

export function getMeFromBackend(accessToken: string): Promise<MeResponse> {
  return apiRequest<MeResponse>("/me", {
    accessToken,
  });
}

export function patchMeProfileOnBackend(
  accessToken: string,
  input: PatchProfileRequest
): Promise<MeResponse> {
  return apiRequest<MeResponse>("/me/profile", {
    method: "PATCH",
    accessToken,
    body: input,
  });
}
