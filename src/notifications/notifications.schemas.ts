import { z } from "zod";

const notificationSchema = {
  type: "object",
  required: ["id", "type", "titleKey", "payload", "readAt", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    type: { type: "string", enum: [
      "direct_message", "together_match", "together_action", "announcement",
      "founder_activated", "founder_premium_started", "founder_premium_expiring",
      "founder_premium_expired", "premium_activated", "premium_restored",
      "premium_billing_issue", "community_activity",
    ] },
    titleKey: { type: "string" },
    payload: { type: "object", additionalProperties: { type: "string" } },
    readAt: { type: ["string", "null"], format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

export const listNotificationsRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: { limit: { type: "integer", minimum: 1, maximum: 100 } },
  },
  response: { 200: { type: "object", required: ["items"], additionalProperties: false, properties: { items: { type: "array", items: notificationSchema } } } },
} as const;

export const markNotificationReadRouteSchema = {
  params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
  response: { 200: { type: "object", required: ["ok"], additionalProperties: false, properties: { ok: { type: "boolean" } } } },
} as const;

export const registerPushTokenRouteSchema = {
  body: {
    type: "object",
    required: ["token", "platform", "deviceId"],
    additionalProperties: false,
    properties: {
      token: { type: "string", minLength: 20, maxLength: 256 },
      platform: { type: "string", enum: ["android", "ios"] },
      deviceId: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
  response: { 200: { type: "object", required: ["ok"], additionalProperties: false, properties: { ok: { type: "boolean" } } } },
} as const;

const pushTokenBody = z.object({
  token: z.string().trim().min(20).max(256).refine((value) => /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(value), "invalid Expo push token"),
  platform: z.enum(["android", "ios"]),
  deviceId: z.string().trim().min(8).max(128),
}).strict();

export function parsePushTokenBody(body: unknown) {
  return pushTokenBody.parse(body);
}
