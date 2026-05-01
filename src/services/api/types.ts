export type ApiErrorFields = Record<string, string | string[]>;

export type ApiErrorResponse = {
  error: {
    code?: string;
    message: string;
    fields?: ApiErrorFields;
  };
};

export type AuthUserDto = {
  id: string;
  email: string;
  displayName: string;
  amoriaId: string;
  avatarUrl?: string | null;
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
  user: AuthUserDto;
};

export type CurrentUserResponse = {
  user: AuthUserDto;
};

export type MeResponse = CurrentUserResponse;

export type PatchProfileRequest = {
  displayName?: string;
};

export type AvatarUploadResponse = {
  avatarUrl?: string | null;
};

export type BackendUploadFile = {
  uri: string;
  name?: string;
  type?: string;
};
