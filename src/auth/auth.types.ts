import type { UserRow } from "../db/schema";

export type AuthenticatedUser = {
  userId: string;
};

export type RegisterBody = {
  email: string;
  password: string;
  displayName: string;
  locale?: string;
};

export type LoginBody = {
  email: string;
  password: string;
  locale?: string;
};

export type EmailCodeBody = {
  email: string;
  code: string;
};

export type ResendVerificationBody = {
  email: string;
  locale?: string;
};

export type PasswordResetRequestBody = ResendVerificationBody;

export type PasswordResetConfirmBody = EmailCodeBody & {
  newPassword: string;
};

export type RefreshBody = {
  refreshToken: string;
};

export type LogoutBody = RefreshBody;

export type AuthRequestContext = {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
};

export type AuthUserProfile = {
  id: string;
  email: string;
  displayName: string;
  amoriaId: string;
  avatarUrl: string | null;
  preferredLocale: string;
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

export type VerificationRequiredResponse = {
  ok: true;
  verificationRequired: true;
  email: string;
  resendAfterSec: number;
};

export type ResendVerificationResponse = OkResponse & {
  resendAfterSec: number;
};

export function toAuthUserProfile(user: UserRow): AuthUserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    amoriaId: user.amoriaId,
    avatarUrl: user.avatarUrl,
    preferredLocale: user.preferredLocale ?? "en",
  };
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthenticatedUser;
  }
}
