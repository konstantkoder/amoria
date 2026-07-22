import { request } from "@/services/api/apiClient";
import { AUTH_REFRESH_TIMEOUT_MS } from "@/services/api/boundedFetch";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@/services/api/types";

function buildLoginBody(inputOrEmail: LoginRequest | string, password?: string): LoginRequest {
  if (typeof inputOrEmail === "string") {
    return {
      email: inputOrEmail,
      password: String(password ?? ""),
    };
  }

  return inputOrEmail;
}

function buildRegisterBody(
  inputOrEmail: RegisterRequest | string,
  password?: string,
  displayName?: string
): RegisterRequest | { email: string; password: string } {
  if (typeof inputOrEmail === "string") {
    return {
      email: inputOrEmail,
      password: String(password ?? ""),
      ...(displayName ? { displayName } : {}),
    };
  }

  return inputOrEmail;
}

export function login(email: string, password: string): Promise<AuthResponse>;
export function login(input: LoginRequest): Promise<AuthResponse>;
export function login(
  inputOrEmail: LoginRequest | string,
  password?: string
): Promise<AuthResponse> {
  return request<AuthResponse>(
    "POST",
    "/auth/login",
    buildLoginBody(inputOrEmail, password),
    { auth: false, retryOnUnauthorized: false }
  );
}

export function register(
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResponse>;
export function register(input: RegisterRequest): Promise<AuthResponse>;
export function register(
  inputOrEmail: RegisterRequest | string,
  password?: string,
  displayName?: string
): Promise<AuthResponse> {
  return request<AuthResponse>(
    "POST",
    "/auth/register",
    buildRegisterBody(inputOrEmail, password, displayName),
    { auth: false, retryOnUnauthorized: false }
  );
}

export function refresh(refreshToken: string): Promise<AuthResponse> {
  return request<AuthResponse>(
    "POST",
    "/auth/refresh",
    { refreshToken },
    {
      auth: false,
      retryOnUnauthorized: false,
      timeoutMs: AUTH_REFRESH_TIMEOUT_MS,
    }
  );
}

export function logout(refreshToken: string): Promise<void> {
  return request<void>(
    "POST",
    "/auth/logout",
    { refreshToken },
    { auth: false, retryOnUnauthorized: false }
  );
}

export function logoutAll(): Promise<void> {
  return request<void>("POST", "/auth/logout-all");
}

export function registerWithBackend(input: RegisterRequest): Promise<AuthResponse> {
  return register(input);
}

export function loginWithBackend(input: LoginRequest): Promise<AuthResponse> {
  return login(input);
}
