import { env } from "../config/env";
import * as repo from "./notifications.repo";
import { incrementMetric, observeMetric } from "../observability/metrics";
import pushCatalog from "./push-copy.catalog.json";
import { normalizeAppLocale, type AppLocale } from "../i18n/app-locales";
import type { NotificationType } from "./notifications.types";

const MAX_BATCH = 100;

type ExpoTicket = { status?: string; id?: string; details?: { error?: string } };
type Delivery = Awaited<ReturnType<typeof repo.claimDueDeliveries>>[number];

const localizedPushCatalog = pushCatalog as Record<AppLocale, Record<NotificationType, { title: string; body: string }>>;

export function pushCopy(type: NotificationType, locale: unknown = "en"): { title: string; body: string } {
  const selectedLocale = normalizeAppLocale(locale);
  return localizedPushCatalog[selectedLocale]?.[type] ?? localizedPushCatalog.en[type];
}

export function safeData(row: Delivery): Record<string, string> {
  const payload = row.notification.payload as Record<string, unknown>;
  const data: Record<string, string> = { notificationId: row.notification.id, type: row.notification.type };
  for (const key of ["threadId", "peerId", "sessionId", "momentId", "announcementId", "founderNumber", "days"]) {
    const value = payload?.[key];
    if (typeof value === "string" && value.length <= 64) data[key] = value;
  }
  return data;
}

async function expoRequest(url: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.PUSH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(env.EXPO_PUSH_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function transientStatus(status: number) { return status === 408 || status === 429 || status >= 500; }

function transientTicketError(error?: string): boolean {
  return error === "MessageRateExceeded" || error === "ExpoServerError";
}

export async function processPushDeliveries(): Promise<number> {
  const startedAt = process.hrtime.bigint();
  const rows = await repo.claimDueDeliveries(MAX_BATCH);
  if (!rows.length) return 0;
  try {
    const response = await expoRequest(env.EXPO_PUSH_SEND_URL, rows.map((row) => ({
      to: row.token,
      sound: "default",
      channelId: "amoria_updates",
      ...pushCopy(row.notification.type as NotificationType, row.tokenLocale ?? row.preferredLocale),
      data: safeData(row),
    })));
    if (!response.ok) {
      const code = transientStatus(response.status) ? `expo_http_${response.status}` : "expo_request_rejected";
      await Promise.all(rows.map((row) => transientStatus(response.status)
        ? repo.markDeliveryRetry(row.delivery.id, row.delivery.attemptCount + 1, code)
        : repo.markDeliveryFailed(row.delivery.id, code)));
      return rows.length;
    }
    const result = await response.json() as { data?: ExpoTicket[] };
    const tickets = Array.isArray(result.data) ? result.data : [];
    await Promise.all(rows.map(async (row, index) => {
      const ticket = tickets[index];
      const error = ticket?.details?.error;
      if (error === "DeviceNotRegistered") return repo.disableDeliveryToken(row.delivery.id, row.delivery.pushTokenId, error);
      if (ticket?.status === "ok" && ticket.id) return repo.markTicketAccepted(row.delivery.id, ticket.id);
      const code = error ?? "expo_ticket_error";
      return transientTicketError(error)
        ? repo.markDeliveryRetry(row.delivery.id, row.delivery.attemptCount + 1, code)
        : repo.markDeliveryFailed(row.delivery.id, code);
    }));
  } catch {
    incrementMetric("amoria_push_errors_total", { phase: "send" });
    await Promise.all(rows.map((row) => repo.markDeliveryRetry(row.delivery.id, row.delivery.attemptCount + 1, "expo_transport_error")));
  }
  incrementMetric("amoria_push_processed_total", { phase: "send" }, rows.length);
  observeMetric("amoria_push_batch_duration_seconds", Number(process.hrtime.bigint() - startedAt) / 1e9, { phase: "send" });
  return rows.length;
}

export async function processPushReceipts(): Promise<number> {
  const startedAt = process.hrtime.bigint();
  const rows = await repo.listReceiptPending(1000);
  const withIds = rows.filter((row) => Boolean(row.delivery.expoReceiptId));
  if (!withIds.length) return 0;
  try {
    const response = await expoRequest(env.EXPO_PUSH_RECEIPTS_URL, { ids: withIds.map((row) => row.delivery.expoReceiptId) });
    if (!response.ok) {
      const code = `expo_receipts_http_${response.status}`;
      await Promise.all(withIds.map((row) => transientStatus(response.status)
        ? repo.markReceiptPendingRetry(row.delivery.id, row.delivery.attemptCount + 1, code)
        : repo.markDeliveryFailed(row.delivery.id, code)));
      return withIds.length;
    }
    const result = await response.json() as { data?: Record<string, ExpoTicket> };
    await Promise.all(withIds.map(async (row) => {
      const receipt = result.data?.[row.delivery.expoReceiptId!];
      if (!receipt) return repo.markReceiptPendingRetry(row.delivery.id, row.delivery.attemptCount + 1, "expo_receipt_missing");
      const error = receipt.details?.error;
      if (error === "DeviceNotRegistered") {
        const tokenId = await repo.findTokenIdByDelivery(row.delivery.id);
        if (tokenId) await repo.disableDeliveryToken(row.delivery.id, tokenId, error);
        return;
      }
      if (transientTicketError(error)) {
        await repo.markReceiptPendingRetry(row.delivery.id, row.delivery.attemptCount + 1, error ?? "expo_receipt_transient_error");
        return;
      }
      await repo.markReceipt(row.delivery.id, receipt.status === "ok" ? "delivered" : "failed", error);
    }));
  } catch {
    incrementMetric("amoria_push_errors_total", { phase: "receipt" });
    await Promise.all(withIds.map((row) => repo.markReceiptPendingRetry(row.delivery.id, row.delivery.attemptCount + 1, "expo_receipt_transport_error")));
    return withIds.length;
  }
  incrementMetric("amoria_push_processed_total", { phase: "receipt" }, withIds.length);
  observeMetric("amoria_push_batch_duration_seconds", Number(process.hrtime.bigint() - startedAt) / 1e9, { phase: "receipt" });
  return withIds.length;
}

export async function runPushMaintenance(): Promise<void> {
  await processPushDeliveries();
  await processPushReceipts();
}
