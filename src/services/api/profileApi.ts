import { apiRequest } from "@/services/api/apiClient";
import type {
  OwnerProfileGalleryResponse,
  PatchProfileRequest,
  ResetLockedGalleryPasswordRequest,
  SelfUserProfileDto,
  SetLockedGalleryPasswordRequest,
  UpdateProfileGalleryItemsRequest,
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

export function getMyProfileGallery(): Promise<OwnerProfileGalleryResponse> {
  return apiRequest<OwnerProfileGalleryResponse>("/me/profile/gallery");
}

export function updateMyProfileGalleryItems(
  input: UpdateProfileGalleryItemsRequest
): Promise<OwnerProfileGalleryResponse> {
  return apiRequest<OwnerProfileGalleryResponse>("/me/profile/gallery/items", {
    method: "PATCH",
    body: input,
  });
}

export function setLockedGalleryPassword(
  input: SetLockedGalleryPasswordRequest
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/me/profile/locked-gallery/password", {
    method: "PUT",
    body: input,
  });
}

export function resetLockedGalleryPassword(
  input: ResetLockedGalleryPasswordRequest
): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/me/profile/locked-gallery/password", {
    method: "DELETE",
    body: input,
  });
}
