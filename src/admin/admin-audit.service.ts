import type { JsonValue } from "../db/schema";
import * as adminRepo from "./admin.repo";
import type { AdminAuditInput } from "./admin.types";

const blockedMetadataKeyPattern = /password|token|secret|authorization|cookie|jwt|totp|otp[_-]?code|recovery[_-]?codes?|pre[_-]?auth|step[_-]?up|access[_-]?key|private[_-]?key|locked[_-]?gallery/i;
const maxObjectKeys = 40;
const maxArrayItems = 20;
const maxStringLength = 500;
const maxDepth = 4;

export async function writeAuditLog(input: AdminAuditInput): Promise<void> {
  await adminRepo.createAuditLog({
    adminUserId: input.adminUserId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    reason: input.reason ?? null,
    metadata: sanitizeAuditMetadata(input.metadata),
    requestId: input.requestId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export function sanitizeAuditMetadata(input: unknown): JsonValue | null {
  if (input === undefined || input === null) {
    return null;
  }

  return sanitizeValue(input, 0);
}

function sanitizeValue(input: unknown, depth: number): JsonValue {
  if (depth > maxDepth) {
    return "[truncated]";
  }

  if (input === null || typeof input === "boolean" || typeof input === "number") {
    return input;
  }

  if (typeof input === "string") {
    return input.length > maxStringLength
      ? `${input.slice(0, maxStringLength)}...[truncated]`
      : input;
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

      const safeKey = key.slice(0, 80);
      output[safeKey] = blockedMetadataKeyPattern.test(key)
        ? "[redacted]"
        : sanitizeValue(value, depth + 1);
      count += 1;
    }

    return output;
  }

  return String(input);
}
