import type { JsonValue } from "../db/schema";
import * as adminAuditService from "../admin/admin-audit.service";
import type { AdminContext, AdminRequestContext } from "../admin/admin.types";
import * as clientErrorsRepo from "./client-errors.repo";
import type {
  ClientErrorReportBody,
  ClientErrorReportContext,
  ClientErrorReportListQuery,
  ClientErrorReportListResponse,
  ClientErrorReportResponse,
} from "./client-errors.types";
import { toClientErrorReportItem } from "./client-errors.types";

const blockedMetadataKeyPattern =
  /password|token|secret|authorization|cookie|jwt|refresh|accessToken|refreshToken|s3|database|connection|privateKey|lockedGalleryPassword|folderPassword|accountPassword|headers?|\.env|uploadUrl$|signedUrl$/i;
const maxObjectKeys = 50;
const maxArrayItems = 25;
const maxStringLength = 600;
const maxDepth = 5;
const maxMetadataJsonLength = 24000;
const maxMessageLength = 2000;
const maxStackLength = 8000;

type ClientErrorsServiceDeps = {
  repo: Pick<
    typeof clientErrorsRepo,
    "createClientErrorReport" | "findUserSnapshotById" | "listClientErrorReports"
  >;
  audit: Pick<typeof adminAuditService, "writeAuditLog">;
};

const defaultDeps: ClientErrorsServiceDeps = {
  repo: clientErrorsRepo,
  audit: adminAuditService,
};

let deps: ClientErrorsServiceDeps = defaultDeps;

export function __setClientErrorsServiceDepsForTests(
  overrides: Partial<ClientErrorsServiceDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function createClientErrorReport(
  input: ClientErrorReportBody,
  context: ClientErrorReportContext,
): Promise<ClientErrorReportResponse> {
  const user = context.userId
    ? await deps.repo.findUserSnapshotById(context.userId)
    : undefined;
  const created = await deps.repo.createClientErrorReport({
    userId: user?.id ?? null,
    amoriaId: user?.amoriaId ?? null,
    displayName: user?.displayName ?? null,
    email: user?.email ?? null,
    screen: cleanRequired(input.screen, 120),
    action: cleanRequired(input.action, 120),
    step: cleanOptional(input.step, 120),
    code: cleanOptional(input.code, 120),
    message: truncateString(cleanRequired(input.message, maxMessageLength * 4), maxMessageLength),
    stack: cleanOptional(input.stack, maxStackLength * 2, maxStackLength),
    metadata: sanitizeClientErrorMetadata(input.metadata),
    platform: cleanOptional(input.platform, 60),
    appVersion: cleanOptional(input.appVersion, 60),
    buildNumber: cleanOptional(input.buildNumber, 60),
    deviceModel: cleanOptional(input.deviceModel, 120),
    osVersion: cleanOptional(input.osVersion, 120),
    requestId: cleanOptional(input.requestId, 120),
    backendUrl: cleanOptional(input.backendUrl, 500),
  });

  return {
    ok: true,
    id: created.id,
  };
}

export async function listClientErrorReportsForAdmin(
  admin: AdminContext,
  query: ClientErrorReportListQuery,
  requestContext: AdminRequestContext,
): Promise<ClientErrorReportListResponse> {
  const rows = await deps.repo.listClientErrorReports(query);

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.clientErrors.read",
    targetType: "client_error_reports",
    metadata: {
      filters: {
        screen: query.screen ?? null,
        action: query.action ?? null,
        code: query.code ?? null,
        amoriaId: query.amoriaId ?? null,
        userId: query.userId ?? null,
      },
      limit: query.limit,
      resultCount: rows.length,
    },
    ...requestContext,
  });

  return {
    items: rows.map(toClientErrorReportItem),
    nextCursor: null,
  };
}

export function sanitizeClientErrorMetadata(input: unknown): JsonValue | null {
  if (input === undefined || input === null) {
    return null;
  }

  const sanitized = sanitizeValue(input, 0);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= maxMetadataJsonLength) {
    return sanitized;
  }

  return {
    __truncated: true,
    reason: "metadata_too_large",
  };
}

function cleanRequired(value: string, maxLength: number): string {
  return truncateString(value.trim(), maxLength);
}

function cleanOptional(
  value: string | undefined,
  maxLength: number,
  truncateTo = maxLength,
): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? truncateString(normalized, truncateTo) : null;
}

function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

function sanitizeValue(input: unknown, depth: number): JsonValue {
  if (depth > maxDepth) {
    return "[truncated]";
  }

  if (input === null || typeof input === "boolean" || typeof input === "number") {
    return input;
  }

  if (typeof input === "string") {
    return truncateString(input, maxStringLength);
  }

  if (Array.isArray(input)) {
    return input.slice(0, maxArrayItems).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof input === "object") {
    const output: Record<string, JsonValue> = {};
    let count = 0;

    for (const [key, value] of Object.entries(input)) {
      if (count >= maxObjectKeys) {
        output.__truncated = true;
        break;
      }

      const safeKey = truncateString(key, 80);
      output[safeKey] = blockedMetadataKeyPattern.test(key)
        ? "[redacted]"
        : sanitizeValue(value, depth + 1);
      count += 1;
    }

    return output;
  }

  return truncateString(String(input), maxStringLength);
}
