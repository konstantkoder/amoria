import { apiRequest } from "@/services/api/apiClient";

export type NotificationType = "direct_message" | "together_match" | "together_action" | "announcement";
export type NotificationDto = {
  id: string;
  type: NotificationType;
  titleKey: string;
  payload: Record<string, string>;
  readAt: string | null;
  createdAt: string;
};

export function listNotifications(limit = 50): Promise<{ items: NotificationDto[] }> {
  return apiRequest(`/notifications?limit=${Math.max(1, Math.min(limit, 100))}`);
}

export function markNotificationRead(id: string): Promise<{ ok: true }> {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function registerPushToken(input: { token: string; platform: "android" | "ios"; deviceId: string }): Promise<{ ok: true }> {
  return apiRequest("/push/token", { method: "PUT", body: input });
}

export function unregisterPushToken(): Promise<{ ok: true }> {
  return apiRequest("/push/token", { method: "DELETE" });
}
