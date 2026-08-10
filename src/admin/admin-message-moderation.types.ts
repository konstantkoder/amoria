import type { JsonValue } from "../db/schema";
import type { MessageAutomationStatus, MessageModerationState, MessageSource } from "../moderation/message-moderation.types";

export const ADMIN_MESSAGE_QUEUE_FILTERS = [
  "all",
  "reported",
  "held",
  "needs_review",
  "restricted",
  "removed",
] as const;
export type AdminMessageQueueFilter = (typeof ADMIN_MESSAGE_QUEUE_FILTERS)[number];

export const ADMIN_MESSAGE_DECISIONS = [
  "approve",
  "restore",
  "restrict",
  "remove",
  "escalate",
] as const;
export type AdminMessageDecision = (typeof ADMIN_MESSAGE_DECISIONS)[number];

export type AdminMessageQueueQuery = {
  status: AdminMessageQueueFilter;
  source?: MessageSource;
  limit: number;
};
export type AdminMessageQueueItem = {
  id: string;
  threadId: string;
  source: MessageSource;
  state: MessageModerationState;
  automationStatus: MessageAutomationStatus;
  sender: { id: string; amoriaId: string; displayName: string };
  reportCount: number;
  latestReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminMessageReviewItem = {
  id: string;
  source: string;
  action: string;
  reason: string | null;
  metadata: JsonValue | null;
  adminUserId: string | null;
  createdAt: string;
};

export type AdminMessageReportItem = {
  id: string;
  reporterUserId: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
};

export type AdminMessageDetail = AdminMessageQueueItem & {
  text: string;
  clientMessageId: string;
  reviews: AdminMessageReviewItem[];
  reports: AdminMessageReportItem[];
  privacyNote: string;
};

export type AdminMessageDecisionBody = {
  action: AdminMessageDecision;
  reason?: string;
};
