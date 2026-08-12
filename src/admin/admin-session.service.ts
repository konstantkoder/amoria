import type { AuthResponse, AuthRequestContext, LoginBody } from "../auth/auth.types";
import * as authService from "../auth/auth.service";
import * as adminService from "./admin.service";
import { ADMIN_ROLE_KEYS } from "./admin.types";

export type AdminAccessSessionResponse = Omit<AuthResponse, "refreshToken">;

type AdminSessionServiceDeps = {
  auth: Pick<typeof authService, "login" | "refresh" | "logout">;
  admin: Pick<typeof adminService, "getAdminContextByUserId" | "assertAdminHasAnyRole">;
};

const defaultDeps: AdminSessionServiceDeps = {
  auth: authService,
  admin: adminService,
};

let deps = defaultDeps;

export function __setAdminSessionServiceDepsForTests(
  overrides: Partial<AdminSessionServiceDeps>,
): () => void {
  const previous = deps;
  deps = { ...deps, ...overrides };
  return () => {
    deps = previous;
  };
}

function accessSession(response: AuthResponse): AdminAccessSessionResponse {
  return {
    accessToken: response.accessToken,
    accessTokenExpiresAt: response.accessTokenExpiresAt,
    user: response.user,
  };
}

async function assertActiveAdminOrRevoke(response: AuthResponse): Promise<void> {
  try {
    const admin = await deps.admin.getAdminContextByUserId(response.user.id);
    deps.admin.assertAdminHasAnyRole(admin, [...ADMIN_ROLE_KEYS]);
  } catch (error) {
    await deps.auth.logout({ refreshToken: response.refreshToken });
    throw error;
  }
}

export async function loginAdminSession(
  input: LoginBody,
  context: AuthRequestContext,
): Promise<{ response: AdminAccessSessionResponse; refreshToken: string }> {
  const authenticated = await deps.auth.login(input, context);
  await assertActiveAdminOrRevoke(authenticated);
  return {
    response: accessSession(authenticated),
    refreshToken: authenticated.refreshToken,
  };
}

export async function refreshAdminSession(
  refreshToken: string,
  context: AuthRequestContext,
): Promise<{ response: AdminAccessSessionResponse; refreshToken: string }> {
  const refreshed = await deps.auth.refresh({ refreshToken }, context);
  await assertActiveAdminOrRevoke(refreshed);
  return {
    response: accessSession(refreshed),
    refreshToken: refreshed.refreshToken,
  };
}

export async function logoutAdminSession(refreshToken: string | undefined): Promise<{ ok: true }> {
  if (refreshToken) {
    await deps.auth.logout({ refreshToken });
  }
  return { ok: true };
}
