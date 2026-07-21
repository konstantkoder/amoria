import type { AuthUserDto } from "@/services/api/types";

export function mergeAuthUserWithStoredProfile(
  storedUser: AuthUserDto | null | undefined,
  refreshedAuthUser: AuthUserDto
): AuthUserDto {
  if (!storedUser || storedUser.id !== refreshedAuthUser.id) {
    return refreshedAuthUser;
  }

  return {
    ...storedUser,
    ...refreshedAuthUser,
  };
}
