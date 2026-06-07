import { getApiBaseUrl } from "@/config/apiConfig";
import {
  emitAuthSignedOut,
  emitAuthUpdated,
} from "@/services/session/authEvents";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/services/session/tokenStore";
import type { AuthResponse } from "@/services/api/types";
import type { ApiErrorDetails, ApiErrorResponse } from "@/services/api/types";
import {
  markStartupEvent,
  recordStartupApiRequest,
} from "@/services/startupDiagnostics";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ApiRequestOptions = {
  method?: HttpMethod;
  accessToken?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

type RequestOptions = Omit<ApiRequestOptions, "method" | "body">;

let refreshSessionPromise: Promise<AuthResponse> | null = null;

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: ApiErrorDetails;

  constructor(input: {
    status: number;
    message: string;
    code?: string;
    fields?: ApiErrorDetails;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.fields = input.fields;
  }
}

function buildUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

function getBackendOriginForDiagnostics(): string | null {
  let apiBaseUrl: string;
  try {
    apiBaseUrl = getApiBaseUrl();
  } catch {
    return null;
  }

  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    const originMatch = apiBaseUrl.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i);
    return originMatch?.[0] ?? "invalid_api_url";
  }
}

function getApiNetworkErrorKind(error: unknown): string | undefined {
  if (error instanceof ApiError) return undefined;

  const errorName = typeof (error as { name?: unknown })?.name === "string"
    ? String((error as { name: string }).name)
    : "";
  const message = typeof (error as { message?: unknown })?.message === "string"
    ? String((error as { message: string }).message)
    : "";
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("expo_public_api_url")) {
    return "api_url_missing";
  }
  if (normalizedMessage.includes("network request failed")) {
    return "network_request_failed";
  }
  if (normalizedMessage.includes("failed to fetch")) {
    return "failed_to_fetch";
  }
  if (normalizedMessage.includes("timeout") || normalizedMessage.includes("timed out")) {
    return "timeout";
  }
  if (errorName === "AbortError") {
    return "aborted";
  }
  if (error instanceof TypeError) {
    return "type_error";
  }
  if (error instanceof Error) {
    return "request_error";
  }

  return undefined;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      return {
        error: {
          message: text,
        },
      } satisfies ApiErrorResponse;
    }
    throw new ApiError({
      status: response.status,
      message: "Backend returned an invalid JSON response.",
    });
  }
}

function getErrorPayload(data: unknown): ApiErrorResponse["error"] | undefined {
  if (!data || typeof data !== "object") return undefined;
  const maybeError = (data as Partial<ApiErrorResponse>).error;
  if (!maybeError || typeof maybeError !== "object") return undefined;
  return maybeError;
}

function buildError(response: Response, data: unknown) {
  const errorPayload = getErrorPayload(data);
  const fallbackMessage = `Backend request failed with HTTP ${response.status}.`;
  const message =
    typeof errorPayload?.message === "string" && errorPayload.message.trim()
      ? errorPayload.message
      : fallbackMessage;
  const code =
    typeof errorPayload?.code === "string" && errorPayload.code.trim()
      ? errorPayload.code
      : undefined;
  const details =
    (errorPayload as any)?.details ?? (errorPayload as any)?.fields;
  const fields =
    details && typeof details === "object"
      ? (details as ApiErrorDetails)
      : undefined;

  return new ApiError({
    status: response.status,
    message,
    ...(code ? { code } : {}),
    ...(fields ? { fields } : {}),
  });
}

function isAuthResponse(data: unknown): data is AuthResponse {
  if (!data || typeof data !== "object") return false;
  const value = data as Partial<AuthResponse>;
  const expiresAt = value.accessTokenExpiresAt ?? value.expiresAt;
  return (
    typeof value.accessToken === "string" &&
    value.accessToken.trim().length > 0 &&
    typeof value.refreshToken === "string" &&
    value.refreshToken.trim().length > 0 &&
    typeof expiresAt === "string" &&
    expiresAt.trim().length > 0 &&
    Boolean(value.user)
  );
}

async function rawRequest<TResponse>(
  method: HttpMethod,
  path: string,
  bodyValue?: unknown,
  options: RequestOptions = {}
): Promise<TResponse> {
  const startedAtMs = Date.now();
  const backendOrigin = getBackendOriginForDiagnostics();
  let networkErrorKind: string | undefined;
  let status: number | undefined;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  const token = options.auth === false
    ? null
    : options.accessToken ?? getAccessToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;
  if (bodyValue != null) {
    if (isFormData(bodyValue)) {
      body = bodyValue;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(bodyValue);
    }
  }

  try {
    const response = await fetch(buildUrl(path), {
      method,
      headers,
      ...(body != null ? { body } : {}),
    });
    status = response.status;

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw buildError(response, data);
    }

    return data as TResponse;
  } catch (error) {
    networkErrorKind = getApiNetworkErrorKind(error);
    throw error;
  } finally {
    recordStartupApiRequest({
      method,
      path,
      backendOrigin,
      status,
      networkErrorKind,
      durationMs: Date.now() - startedAtMs,
    });
  }
}

async function clearTokensAfterRefreshFailure() {
  setAccessToken(null);
  try {
    await setRefreshToken(null);
  } finally {
    emitAuthSignedOut();
  }
}

async function refreshSessionOnce(): Promise<AuthResponse> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new ApiError({
      status: 401,
      message: "Refresh token is missing.",
      code: "missing_refresh_token",
    });
  }

  const response = await rawRequest<AuthResponse>(
    "POST",
    "/auth/refresh",
    { refreshToken },
    { auth: false, retryOnUnauthorized: false }
  );

  if (!isAuthResponse(response)) {
    throw new ApiError({
      status: 500,
      message: "Backend returned an invalid auth response.",
      code: "invalid_auth_response",
    });
  }

  setAccessToken(response.accessToken);
  await setRefreshToken(response.refreshToken);
  emitAuthUpdated(response);
  return response;
}

export function refreshSession(): Promise<AuthResponse> {
  if (!refreshSessionPromise) {
    refreshSessionPromise = refreshSessionOnce()
      .catch(async (error) => {
        await clearTokensAfterRefreshFailure();
        throw error;
      })
      .finally(() => {
        refreshSessionPromise = null;
      });
  } else {
    markStartupEvent("auth.refresh_reused_in_flight");
  }

  return refreshSessionPromise;
}

export async function request<TResponse>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<TResponse> {
  try {
    return await rawRequest<TResponse>(method, path, body, options);
  } catch (error) {
    const shouldRefresh =
      options.auth !== false &&
      options.retryOnUnauthorized !== false &&
      error instanceof ApiError &&
      error.status === 401;

    if (!shouldRefresh) throw error;

    await refreshSession();
    return rawRequest<TResponse>(method, path, body, {
      ...options,
      accessToken: getAccessToken(),
      retryOnUnauthorized: false,
    });
  }
}

export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  return request<TResponse>(
    options.method ?? "GET",
    path,
    options.body,
    options
  );
}
