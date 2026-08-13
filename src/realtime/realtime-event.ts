import { randomUUID } from "node:crypto";
import type { MessageDto } from "../chat/chat.types";
import type {
  TogetherEventDto,
  TogetherRevealBroadcastState,
  TogetherSessionResponse,
  TogetherSessionUpdateReason,
} from "../together/together.types";
import type { TurnBasedMomentDto } from "../together/together-turn-based.types";

export type RealtimeEventPayload =
  | { type: "thread.message"; threadId: string; message: MessageDto; allowedUserIds?: string[] }
  | { type: "inbox.updated"; userIds: string[] }
  | { type: "together.event"; sessionId: string; event: TogetherEventDto }
  | {
      type: "together.session.updated";
      sessionId: string;
      session: TogetherSessionResponse;
      reason: TogetherSessionUpdateReason;
      actorUserId: string;
    }
  | {
      type: "together.reveal.updated";
      sessionId: string;
      revealStates: TogetherRevealBroadcastState[];
      actorUserId: string;
    }
  | { type: "together.turn_based.updated"; userIds: string[]; moment: TurnBasedMomentDto }
  | { type: "user.access_revoked"; userId: string; reason: string };

export type RealtimeEvent = RealtimeEventPayload & {
  v: 1;
  eventId: string;
  occurredAt: string;
};

const allowedTypes = new Set<RealtimeEventPayload["type"]>([
  "thread.message",
  "inbox.updated",
  "together.event",
  "together.session.updated",
  "together.reveal.updated",
  "together.turn_based.updated",
  "user.access_revoked",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export function createRealtimeEvent(payload: RealtimeEventPayload): RealtimeEvent {
  return { ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString() };
}

export function parseRealtimeEvent(raw: string, maxBytes: number): RealtimeEvent | undefined {
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return undefined;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const event = value as Partial<RealtimeEvent>;
  if (
    event.v !== 1 ||
    typeof event.eventId !== "string" ||
    !uuid.test(event.eventId) ||
    typeof event.occurredAt !== "string" ||
    typeof event.type !== "string" ||
    !allowedTypes.has(event.type as RealtimeEventPayload["type"])
  ) return undefined;
  if (!validPayload(event as Record<string, unknown>)) return undefined;
  return event as RealtimeEvent;
}

function validPayload(event: Record<string, unknown>): boolean {
  switch (event.type) {
    case "thread.message": {
      const message = objectValue(event.message);
      return boundedUuid(event.threadId) && Boolean(message) &&
        boundedUuid(message?.id) && boundedUuid(message?.threadId) && boundedUuid(message?.fromUserId) &&
        boundedText(message?.text, 8_000) && boundedText(message?.clientMessageId, 128) &&
        boundedText(message?.createdAt, 64) &&
        (event.allowedUserIds === undefined || boundedUuidArray(event.allowedUserIds, 1_000));
    }
    case "inbox.updated":
      return boundedUuidArray(event.userIds, 1_000);
    case "together.event":
      return boundedUuid(event.sessionId) && Boolean(objectValue(event.event));
    case "together.session.updated":
      return boundedUuid(event.sessionId) && boundedUuid(event.actorUserId) &&
        boundedText(event.reason, 64) && Boolean(objectValue(event.session));
    case "together.reveal.updated":
      return boundedUuid(event.sessionId) && boundedUuid(event.actorUserId) &&
        Array.isArray(event.revealStates) && event.revealStates.length <= 10 &&
        event.revealStates.every((state) => {
          const item = objectValue(state);
          return Boolean(item) && boundedUuid(item?.userId) && Boolean(objectValue(item?.revealState));
        });
    case "together.turn_based.updated":
      return boundedUuidArray(event.userIds, 10) && Boolean(objectValue(event.moment));
    case "user.access_revoked":
      return boundedUuid(event.userId) && boundedText(event.reason, 123);
    default:
      return false;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function boundedUuid(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

function boundedUuidArray(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= max && value.every(boundedUuid);
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}
