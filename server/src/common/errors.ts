import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export type ErrorCode =
  | "validation_error"
  | "invalid_credentials"
  | "unauthorized"
  | "email_taken"
  | "file_too_large"
  | "unsupported_media_type"
  | "image_decode_failed"
  | "storage_write_failed"
  | "internal_error";

export type ErrorFields = Record<string, string>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly fields?: ErrorFields;

  constructor(code: ErrorCode, message: string, statusCode: number, fields?: ErrorFields) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

export function validationError(message: string, fields?: ErrorFields): AppError {
  return new AppError("validation_error", message, 400, fields);
}

export function unauthorized(message = "Authentication is required"): AppError {
  return new AppError("unauthorized", message, 401);
}

function validationFields(error: FastifyError): ErrorFields | undefined {
  if (!error.validation?.length) {
    return undefined;
  }

  const fields: ErrorFields = {};
  for (const item of error.validation) {
    const params = item.params as { missingProperty?: string } | undefined;
    const fieldFromPath = item.instancePath?.replace(/^\//, "").replace(/\//g, ".");
    const field = params?.missingProperty ?? fieldFromPath ?? "body";
    fields[field] = item.message ?? "invalid";
  }
  return fields;
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
    return;
  }

  if (error.validation) {
    void reply.status(400).send({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        fields: validationFields(error),
      },
    });
    return;
  }

  request.log.error({ err: error }, "Unhandled request error");
  void reply.status(500).send({
    error: {
      code: "internal_error",
      message: "Internal server error",
    },
  });
}
