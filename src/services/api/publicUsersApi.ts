import { request } from "@/services/api/apiClient";
import type {
  PublicUserProfileDto,
  UnlockLockedGalleryResponse,
} from "@/services/api/types";

export function getPublicUserById(id: string): Promise<PublicUserProfileDto> {
  return request<PublicUserProfileDto>(
    "GET",
    `/users/${encodeURIComponent(id)}/public`
  );
}

export function getPublicUserByAmoriaId(
  amoriaId: string
): Promise<PublicUserProfileDto> {
  return request<PublicUserProfileDto>(
    "GET",
    `/users/by-amoria-id/${encodeURIComponent(amoriaId)}`
  );
}

export function unlockUserLockedGallery(
  userId: string,
  password: string
): Promise<UnlockLockedGalleryResponse> {
  return request<UnlockLockedGalleryResponse>(
    "POST",
    `/users/${encodeURIComponent(userId)}/locked-gallery/unlock`,
    { password }
  );
}
