import { Platform } from "react-native";
import * as Device from "expo-device";

import { getApiBaseUrl } from "@/config/apiConfig";
import { getReleaseMetadata, type ReleaseMetadata } from "@/config/releaseMetadata";
import { ApiError, request } from "@/services/api/apiClient";

export type ClientErrorReportInput = {
  screen: string;
  action: string;
  step?: string;
  code?: string;
  message: string;
  stack?: string;
  metadata?: unknown;
};

const blockedMetadataKeyPattern =
  /^(lat|lng|latitude|longitude)$|password|token|secret|authorization|cookie|jwt|refresh|accessToken|refreshToken|s3|database|connection|privateKey|lockedGalleryPassword|folderPassword|accountPassword|birthDate|birth_date|dateOfBirth|dob|about|bio|shortAbout|profileText|rawProfileText|rawPrivateProfileText|headers?|\.env|uploadUrl$|signedUrl$/i;
const maxObjectKeys = 40;
const maxArrayItems = 20;
const maxStringLength = 500;
const maxDepth = 4;

export function reportClientError(input: ClientErrorReportInput): void {
  void request<{ ok: boolean; id: string }>(
    "POST",
    "/client/error-reports",
    buildClientErrorPayload(input),
    { retryOnUnauthorized: false }
  )
    .catch((error) => {
      if (__DEV__) {
        console.warn("Client error report failed", getErrorMessage(error));
      }
    });
}

export function sanitizeErrorForReport(error: unknown) {
  return {
    code: getErrorCode(error),
    message: getErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

export function sanitizeMetadataForReport(metadata: unknown): unknown {
  if (metadata === undefined || metadata === null) {
    return undefined;
  }

  return sanitizeValue(metadata, 0);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Unknown client error";
}

export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiError && error.code) {
    return error.code;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "").trim();
    return code || undefined;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.split(":")[0]?.trim() || undefined;
  }

  return undefined;
}

function buildClientErrorPayload(input: ClientErrorReportInput) {
  const releaseMetadata = getReleaseMetadata();
  const metadata = withReleaseMetadata(input.metadata, releaseMetadata);

  return {
    screen: input.screen,
    action: input.action,
    ...(input.step ? { step: input.step } : {}),
    ...(input.code ? { code: input.code } : {}),
    message: input.message,
    ...(input.stack ? { stack: truncate(input.stack, 8000) } : {}),
    ...(metadata !== undefined ? { metadata: sanitizeMetadataForReport(metadata) } : {}),
    platform: Platform.OS,
    ...(releaseMetadata.appVersion ? { appVersion: releaseMetadata.appVersion } : {}),
    ...(releaseMetadata.buildNumber ? { buildNumber: releaseMetadata.buildNumber } : {}),
    ...(Device.modelName ? { deviceModel: Device.modelName } : {}),
    ...(Device.osVersion ? { osVersion: Device.osVersion } : {}),
    backendUrl: getSafeBackendUrl(),
  };
}

function getSafeBackendUrl(): string | undefined {
  try {
    return getApiBaseUrl();
  } catch {
    return undefined;
  }
}

function withReleaseMetadata(
  metadata: unknown,
  releaseMetadata: ReleaseMetadata,
): unknown {
  if (Object.keys(releaseMetadata).length === 0) {
    return metadata;
  }

  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
  ) {
    return {
      ...metadata,
      build: releaseMetadata,
    };
  }

  if (metadata === undefined) {
    return {
      build: releaseMetadata,
    };
  }

  return {
    details: metadata,
    build: releaseMetadata,
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > maxDepth) {
    return "[truncated]";
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return truncate(value, maxStringLength);
  }

  if (Array.isArray(value)) {
    return value.slice(0, maxArrayItems).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    let count = 0;

    for (const [key, item] of Object.entries(value)) {
      if (count >= maxObjectKeys) {
        output.__truncated = true;
        break;
      }

      const safeKey = truncate(key, 80);
      output[safeKey] = blockedMetadataKeyPattern.test(key)
        ? "[redacted]"
        : sanitizeValue(item, depth + 1);
      count += 1;
    }

    return output;
  }

  return truncate(String(value), maxStringLength);
}
