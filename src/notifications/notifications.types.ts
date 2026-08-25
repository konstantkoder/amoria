import type { JsonValue } from "../db/schema";

export type NotificationType =
  | "direct_message"
  | "together_match"
  | "together_action"
  | "announcement"
  | "founder_activated"
  | "founder_premium_started"
  | "founder_premium_expiring"
  | "founder_premium_expired"
  | "premium_activated"
  | "premium_restored"
  | "premium_billing_issue"
  | "community_activity";
export type NotificationPayload = {
  threadId?: string;
  peerId?: string;
  sessionId?: string;
  momentId?: string;
  announcementId?: string;
  founderNumber?: string;
  days?: string;
};

export type NotificationDto = {
  id: string;
  type: NotificationType;
  titleKey: string;
  payload: JsonValue;
  readAt: string | null;
  createdAt: string;
};

export type RegisterPushTokenBody = {
  token: string;
  platform: "android" | "ios";
  deviceId: string;
};
