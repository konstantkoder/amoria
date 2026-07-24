import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export type ErrorCode =
  | "validation_error"
  | "invalid_credentials"
  | "invalid_refresh"
  | "unauthorized"
  | "forbidden"
  | "media_not_owned"
  | "blocked_pair"
  | "profile_unavailable"
  | "locked_gallery_unavailable"
  | "locked_gallery_password_required"
  | "locked_gallery_rate_limited"
  | "locked_gallery_unlock_expired"
  | "min_visible_required"
  | "profile_gallery_limit_reached"
  | "locked_gallery_limit_reached"
  | "together_session_closed"
  | "together_continuation_failed"
  | "together_queue_not_waiting"
  | "together_turn_out_of_order"
  | "together_turn_invalid_transition"
  | "together_event_id_conflict"
  | "nearby_activity_preference_required"
  | "not_found"
  | "email_taken"
  | "file_too_large"
  | "unsupported_media_type"
  | "image_decode_failed"
  | "invalid_image"
  | "unsupported_image_type"
  | "image_too_large"
  | "image_too_small"
  | "corrupt_image"
  | "invalid_crop"
  | "object_not_found"
  | "storage_read_failed"
  | "storage_write_failed"
  | "internal_error";

export type ErrorDetails = Record<string, string>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: ErrorDetails) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function validationError(message: string, details?: ErrorDetails): AppError {
  return new AppError("validation_error", message, 400, details);
}

export function unauthorized(message = "Authentication is required"): AppError {
  return new AppError("unauthorized", message, 401);
}

export function forbidden(message = "Access is forbidden"): AppError {
  return new AppError("forbidden", message, 403);
}

function validationDetails(error: FastifyError): ErrorDetails | undefined {
  if (!error.validation?.length) {
    return undefined;
  }

  const details: ErrorDetails = {};
  for (const item of error.validation) {
    const params = item.params as { missingProperty?: string } | undefined;
    const fieldFromPath = item.instancePath?.replace(/^\//, "").replace(/\//g, ".");
    const field = params?.missingProperty ?? fieldFromPath ?? "body";
    details[field] = item.message ?? "invalid";
  }
  return details;
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error.validation) {
    void reply.status(400).send({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: validationDetails(error),
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
