import type { UserRow } from "../db/schema";

export type AuthenticatedUser = {
  userId: string;
};

export type RegisterBody = {
  email: string;
  password: string;
  displayName: string;
};

export type LoginBody = {
  email: string;
  password: string;
};

export type RefreshBody = {
  refreshToken: string;
};

export type LogoutBody = RefreshBody;

export type AuthRequestContext = {
  deviceId?: string;
  userAgent?: string;
};

export type AuthUserProfile = {
  id: string;
  email: string;
  displayName: string;
  amoriaId: string;
  avatarUrl: string | null;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  user: AuthUserProfile;
};

export type OkResponse = {
  ok: true;
};

export function toAuthUserProfile(user: UserRow): AuthUserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    amoriaId: user.amoriaId,
    avatarUrl: user.avatarUrl,
  };
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthenticatedUser;
  }
}
