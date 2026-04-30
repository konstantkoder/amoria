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

export type AuthUserProfile = {
  id: string;
  email: string;
  displayName: string;
  amoriaId: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUserProfile;
};

export function toAuthUserProfile(user: UserRow): AuthUserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    amoriaId: user.amoriaId,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthenticatedUser;
  }
}
