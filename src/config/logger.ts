import type { FastifyServerOptions } from "fastify";
import { env } from "./env";

export function loggerOptions(): FastifyServerOptions["logger"] {
  if (env.isTest) {
    return false;
  }

  return {
    level: env.isProduction ? "info" : "debug",
    redact: [
      "req.headers.authorization",
      "request.headers.authorization",
      "password",
      "password_hash",
      "passwordHash",
      "accessToken",
      "refreshToken",
      "tokenHash",
    ],
  };
}
