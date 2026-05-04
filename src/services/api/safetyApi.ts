import { request } from "@/services/api/apiClient";
import type { BlocksResponse } from "@/services/api/types";

export type SafetyReportTargetType =
  | "announcement"
  | "user"
  | "dmThread"
  | "message"
  | "nearbyPost";

export type SafetyReportReason =
  | "spam"
  | "harassment"
  | "sexual_services"
  | "scam"
  | "other";

export type CreateSafetyReportPayload = {
  targetType: SafetyReportTargetType;
  targetId: string;
  targetOwnerUid?: string;
  reason: SafetyReportReason;
  details?: string;
};

export function listBlocks(): Promise<BlocksResponse> {
  return request<BlocksResponse>("GET", "/safety/blocks");
}

export async function listBlockedUserIds(): Promise<string[]> {
  const response = await listBlocks();
  return (response.items ?? [])
    .map((item) => String(item.blockedUserId ?? "").trim())
    .filter(Boolean);
}

export function blockUser(blockedUserId: string): Promise<unknown> {
  return request("POST", "/safety/blocks", { blockedUserId });
}

export function unblockUser(blockedUserId: string): Promise<unknown> {
  return request(
    "DELETE",
    `/safety/blocks/${encodeURIComponent(blockedUserId)}`
  );
}

export function report(payload: CreateSafetyReportPayload): Promise<unknown> {
  return request("POST", "/safety/reports", payload);
}
