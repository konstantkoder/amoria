import type { FastifySchema } from "fastify";

export const adminOpsHealthRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["ok", "service", "time", "admin", "nodeEnv", "database", "objectStorage"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        service: { type: "string", const: "amoria-admin-ops" },
        time: { type: "string", format: "date-time" },
        admin: {
          type: "object",
          required: ["id", "userId", "roles"],
          additionalProperties: false,
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            roles: { type: "array", items: { type: "string" } },
          },
        },
        nodeEnv: { type: "string" },
        database: {
          type: "object",
          required: ["ok"],
          additionalProperties: false,
          properties: {
            ok: { type: "boolean" },
          },
        },
        objectStorage: {
          type: "object",
          required: ["status", "reason"],
          additionalProperties: false,
          properties: {
            status: { type: "string", const: "not_checked" },
            reason: { type: "string" },
          },
        },
      },
    },
  },
} as const satisfies FastifySchema;
