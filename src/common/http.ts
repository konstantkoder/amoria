import type { FastifySchema } from "fastify";

export const errorEnvelopeSchema = {
  type: "object",
  required: ["error"],
  additionalProperties: false,
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      additionalProperties: false,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    },
  },
} as const;

export function withErrorResponses(schema: FastifySchema): FastifySchema {
  return {
    ...schema,
    response: {
      ...(schema.response ?? {}),
      400: errorEnvelopeSchema,
      401: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
      413: errorEnvelopeSchema,
      415: errorEnvelopeSchema,
      422: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  };
}
