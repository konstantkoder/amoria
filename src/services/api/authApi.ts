import { request } from "@/services/api/apiClient";
import { AUTH_REFRESH_TIMEOUT_MS } from "@/services/api/boundedFetch";
import type {
  AuthResponse,
  LoginRequest,
  OkResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterRequest,
  ResendVerificationRequest,
  ResendVerificationResponse,
  VerificationRequiredResponse,
  VerifyEmailRequest,
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
): Promise<VerificationRequiredResponse>;
export function register(input: RegisterRequest): Promise<VerificationRequiredResponse>;
export function register(
  inputOrEmail: RegisterRequest | string,
  password?: string,
  displayName?: string
): Promise<VerificationRequiredResponse> {
  return request<VerificationRequiredResponse>(
    "POST",
    "/auth/register",
    buildRegisterBody(inputOrEmail, password, displayName),
    { auth: false, retryOnUnauthorized: false }
  );
}

export function verifyEmail(input: VerifyEmailRequest): Promise<AuthResponse> {
  return request<AuthResponse>("POST", "/auth/verify-email", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
}

export function resendVerification(input: ResendVerificationRequest): Promise<ResendVerificationResponse> {
  return request<ResendVerificationResponse>("POST", "/auth/resend-verification", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
}

export function requestPasswordReset(input: PasswordResetRequest): Promise<OkResponse> {
  return request<OkResponse>("POST", "/auth/password-reset/request", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
}

export function confirmPasswordReset(input: PasswordResetConfirmRequest): Promise<OkResponse> {
  return request<OkResponse>("POST", "/auth/password-reset/confirm", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
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

export function registerWithBackend(input: RegisterRequest): Promise<VerificationRequiredResponse> {
  return register(input);
}

export function loginWithBackend(input: LoginRequest): Promise<AuthResponse> {
  return login(input);
}
