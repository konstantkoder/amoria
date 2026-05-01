import { getApiBaseUrl } from "@/config/apiConfig";
import type { ApiErrorFields, ApiErrorResponse } from "@/services/api/types";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ApiRequestOptions = {
  method?: HttpMethod;
  accessToken?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: ApiErrorFields;

  constructor(input: {
    status: number;
    message: string;
    code?: string;
    fields?: ApiErrorFields;
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
  const fields =
    errorPayload?.fields && typeof errorPayload.fields === "object"
      ? errorPayload.fields
      : undefined;

  return new ApiError({
    status: response.status,
    message,
    ...(code ? { code } : {}),
    ...(fields ? { fields } : {}),
  });
}

export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  let body: BodyInit | undefined;
  if (options.body != null) {
    if (isFormData(options.body)) {
      body = options.body;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    headers,
    ...(body != null ? { body } : {}),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw buildError(response, data);
  }

  return data as TResponse;
}
