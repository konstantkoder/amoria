import type { JsonValue } from "../db/schema";

export type NotificationType = "direct_message" | "together_match" | "together_action" | "announcement";
export type NotificationPayload = {
  threadId?: string;
  sessionId?: string;
  momentId?: string;
  announcementId?: string;
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
