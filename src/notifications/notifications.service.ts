import { AppError } from "../common/errors";
import type { JsonValue } from "../db/schema";
import * as repo from "./notifications.repo";
import type { NotificationDto, NotificationPayload, NotificationType, RegisterPushTokenBody } from "./notifications.types";

export async function notifyUser(input: { userId: string; type: NotificationType; titleKey: string; payload: NotificationPayload; eventKey: string }) {
  return repo.createNotification({ ...input, payload: input.payload as JsonValue });
}

export async function listForUser(userId: string, limit = 50): Promise<{ items: NotificationDto[] }> {
  const rows = await repo.listNotifications(userId, Math.max(1, Math.min(limit, 100)));
  return { items: rows.map((row) => ({ id: row.id, type: row.type as NotificationType, titleKey: row.titleKey, payload: row.payload, readAt: row.readAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })) };
}

export async function markRead(userId: string, id: string): Promise<{ ok: true }> {
  if (!await repo.markRead(userId, id)) throw new AppError("not_found", "Notification not found", 404);
  return { ok: true };
}

export async function registerToken(userId: string, body: RegisterPushTokenBody) {
  await repo.registerPushToken(userId, body);
  return { ok: true } as const;
}

export async function unregisterDevice(userId: string, deviceId: string) {
  if (deviceId.trim()) await repo.unregisterDevice(userId, deviceId.trim());
  return { ok: true } as const;
}
