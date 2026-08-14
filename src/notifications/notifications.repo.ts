import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { notifications, pushDeliveries, pushTokens } from "../db/schema";
import type { JsonValue } from "../db/schema";
import type { NotificationType, RegisterPushTokenBody } from "./notifications.types";

export async function createNotification(input: { userId: string; type: NotificationType; titleKey: string; payload: JsonValue; eventKey: string }) {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(notifications).values(input).onConflictDoNothing({ target: [notifications.userId, notifications.eventKey] }).returning();
    if (!created) return null;
    const tokens = await tx.select({ id: pushTokens.id }).from(pushTokens).where(and(eq(pushTokens.userId, input.userId), isNull(pushTokens.disabledAt)));
    if (tokens.length) await tx.insert(pushDeliveries).values(tokens.map((token) => ({ notificationId: created.id, pushTokenId: token.id }))).onConflictDoNothing();
    return created;
  });
}

export function listNotifications(userId: string, limit: number) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit);
}

export async function markRead(userId: string, id: string): Promise<boolean> {
  const rows = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt))).returning({ id: notifications.id });
  if (rows.length) return true;
  const existing = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId))).limit(1);
  return Boolean(existing[0]);
}

export async function registerPushToken(userId: string, input: RegisterPushTokenBody): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(pushTokens).where(or(eq(pushTokens.token, input.token), and(eq(pushTokens.userId, userId), eq(pushTokens.deviceId, input.deviceId))));
    await tx.insert(pushTokens).values({ userId, ...input });
  });
}

export async function unregisterDevice(userId: string, deviceId: string): Promise<void> {
  await db.delete(pushTokens).where(and(eq(pushTokens.userId, userId), eq(pushTokens.deviceId, deviceId)));
}

export async function claimDueDeliveries(limit: number) {
  return db.transaction(async (tx) => {
    const staleSendingAt = new Date(Date.now() - 5 * 60_000);
    const dueIds = await tx.select({ id: pushDeliveries.id })
      .from(pushDeliveries)
      .where(and(or(
        and(inArray(pushDeliveries.status, ["pending", "retry"]), lte(pushDeliveries.nextAttemptAt, new Date())),
        and(eq(pushDeliveries.status, "sending"), lte(pushDeliveries.updatedAt, staleSendingAt)),
      ), sql`exists (
        select 1 from ${pushTokens} active_token
        where active_token.id = ${pushDeliveries.pushTokenId} and active_token.disabled_at is null
      )`))
      .orderBy(asc(pushDeliveries.nextAttemptAt)).limit(limit).for("update", { skipLocked: true });
    if (!dueIds.length) return [];
    const ids = dueIds.map((row) => row.id);
    const due = await tx.select({ delivery: pushDeliveries, token: pushTokens.token, notification: notifications })
      .from(pushDeliveries)
      .innerJoin(pushTokens, eq(pushTokens.id, pushDeliveries.pushTokenId))
      .innerJoin(notifications, eq(notifications.id, pushDeliveries.notificationId))
      .where(inArray(pushDeliveries.id, ids));
    await tx.update(pushDeliveries).set({ status: "sending", updatedAt: new Date() }).where(inArray(pushDeliveries.id, ids));
    return due;
  });
}

export async function markTicketAccepted(id: string, receiptId: string) {
  await db.update(pushDeliveries).set({ status: "receipt_pending", expoReceiptId: receiptId, attemptCount: 1, updatedAt: new Date(), nextAttemptAt: new Date(Date.now() + 15 * 60_000) }).where(eq(pushDeliveries.id, id));
}

export async function markDeliveryRetry(id: string, attemptCount: number, errorCode: string) {
  const terminal = attemptCount >= 3;
  await db.update(pushDeliveries).set({ status: terminal ? "failed" : "retry", attemptCount, lastError: errorCode, nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** attemptCount)), updatedAt: new Date() }).where(eq(pushDeliveries.id, id));
}

export async function markDeliveryFailed(id: string, errorCode: string) {
  await db.update(pushDeliveries).set({ status: "failed", lastError: errorCode, updatedAt: new Date() }).where(eq(pushDeliveries.id, id));
}

export async function disableDeliveryToken(deliveryId: string, tokenId: string, errorCode: string) {
  await db.transaction(async (tx) => {
    await tx.update(pushTokens).set({ disabledAt: new Date(), lastError: errorCode, updatedAt: new Date() }).where(eq(pushTokens.id, tokenId));
    await tx.update(pushDeliveries).set({ status: "failed", lastError: errorCode, updatedAt: new Date() }).where(eq(pushDeliveries.id, deliveryId));
  });
}

export async function findTokenIdByDelivery(deliveryId: string): Promise<string | null> {
  const rows = await db.select({ tokenId: pushDeliveries.pushTokenId }).from(pushDeliveries).where(eq(pushDeliveries.id, deliveryId)).limit(1);
  return rows[0]?.tokenId ?? null;
}

export function listReceiptPending(limit: number) {
  return db.select({ delivery: pushDeliveries }).from(pushDeliveries).where(and(eq(pushDeliveries.status, "receipt_pending"), lte(pushDeliveries.nextAttemptAt, new Date()))).limit(limit);
}

export async function markReceipt(id: string, status: "delivered" | "failed" | "retry", errorCode?: string) {
  await db.update(pushDeliveries).set({ status, lastError: errorCode ?? null, nextAttemptAt: new Date(Date.now() + 15 * 60_000), updatedAt: new Date() }).where(eq(pushDeliveries.id, id));
}

export async function markReceiptPendingRetry(id: string, attemptCount: number, errorCode: string) {
  const terminal = attemptCount >= 4;
  await db.update(pushDeliveries).set({
    status: terminal ? "failed" : "receipt_pending",
    attemptCount,
    lastError: errorCode,
    nextAttemptAt: new Date(Date.now() + 15 * 60_000),
    updatedAt: new Date(),
  }).where(eq(pushDeliveries.id, id));
}
