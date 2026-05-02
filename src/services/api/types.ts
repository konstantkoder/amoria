export type ApiErrorFields = Record<string, string | string[]>;

export type ApiErrorResponse = {
  error: {
    code?: string;
    message: string;
    fields?: ApiErrorFields;
  };
};

export type SelfUserProfileDto = {
  id: string;
  email: string;
  displayName: string;
  about: string | null;
  amoriaId: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserDto = {
  id: string;
  email: string;
  displayName: string;
  amoriaId: string;
  avatarUrl: string | null;
  about?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  displayName: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  expiresAt?: string;
  user: AuthUserDto;
};

export type CurrentUserResponse = SelfUserProfileDto;

export type MeResponse = SelfUserProfileDto;

export type PatchProfileRequest = {
  displayName?: string;
  about?: string | null;
};

export type AvatarUploadResponse = {
  avatarUrl: string;
  user: SelfUserProfileDto;
};

export type BackendUploadFile = {
  uri: string;
  name?: string;
  type?: string;
};
