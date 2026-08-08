import { createHmac } from "node:crypto";
import { AppError } from "../common/errors";
import { env } from "../config/env";
import { pool } from "../db/client";
import type { AuthRequestContext } from "./auth.types";

export type AuthRateLimitAction =
  | "register"
  | "login"
  | "verify"
  | "resend"
  | "reset_request"
  | "reset_confirm";

type Dimension = "email" | "ip" | "device";
type Policy = { limit: number; windowSec: number; blockSec: number };
type RateRow = {
  attempt_count: number;
  window_started_at: Date;
  blocked_until: Date | null;
};

const policies: Record<AuthRateLimitAction, Record<Dimension, Policy>> = {
  register: {
    email: { limit: env.REGISTER_EMAIL_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
    ip: { limit: env.REGISTER_IP_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
    device: { limit: env.REGISTER_DEVICE_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
  },
  login: {
    email: { limit: env.LOGIN_EMAIL_FAILURE_LIMIT, windowSec: 15 * 60, blockSec: 15 * 60 },
    ip: { limit: env.LOGIN_IP_FAILURE_LIMIT, windowSec: 15 * 60, blockSec: 15 * 60 },
    device: { limit: env.LOGIN_DEVICE_FAILURE_LIMIT, windowSec: 15 * 60, blockSec: 15 * 60 },
  },
  verify: {
    email: { limit: 10, windowSec: 15 * 60, blockSec: 15 * 60 },
    ip: { limit: 30, windowSec: 15 * 60, blockSec: 15 * 60 },
    device: { limit: 20, windowSec: 15 * 60, blockSec: 15 * 60 },
  },
  resend: {
    email: { limit: env.RESEND_EMAIL_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
    ip: { limit: env.RESEND_IP_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
    device: { limit: env.RESEND_DEVICE_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
  },
  reset_request: {
    email: { limit: env.RESET_EMAIL_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
    ip: { limit: env.RESET_IP_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
    device: { limit: env.RESET_DEVICE_LIMIT, windowSec: 60 * 60, blockSec: 60 * 60 },
  },
  reset_confirm: {
    email: { limit: 10, windowSec: 15 * 60, blockSec: 15 * 60 },
    ip: { limit: 30, windowSec: 15 * 60, blockSec: 15 * 60 },
    device: { limit: 20, windowSec: 15 * 60, blockSec: 15 * 60 },
  },
};

let lastCleanupAt = 0;

export function hashRateLimitKey(scope: string, rawValue: string): string {
  return createHmac("sha256", env.AUTH_SECURITY_HMAC_SECRET)
    .update(scope, "utf8")
    .update("\0", "utf8")
    .update(rawValue, "utf8")
    .digest("hex");
}

function rateLimited(retryAfterSec: number): AppError {
  return new AppError("rate_limited", "Too many requests", 429, {
    retryAfterSec: String(Math.max(1, Math.ceil(retryAfterSec))),
  });
}

function dimensions(email: string, context: AuthRequestContext): { kind: Dimension; value: string }[] {
  return [
    { kind: "email", value: email },
    ...(context.ip ? [{ kind: "ip" as const, value: context.ip }] : []),
    ...(context.deviceId ? [{ kind: "device" as const, value: context.deviceId }] : []),
  ];
}

async function maybeCleanup(now: Date): Promise<void> {
  if (now.getTime() - lastCleanupAt < 60_000) return;
  lastCleanupAt = now.getTime();
  await pool.query("DELETE FROM auth_rate_limits WHERE expires_at <= $1", [now]);
}

async function inspectOne(scope: string, keyHash: string, now: Date): Promise<void> {
  const result = await pool.query<RateRow>(
    "SELECT attempt_count, window_started_at, blocked_until FROM auth_rate_limits WHERE scope = $1 AND key_hash = $2",
    [scope, keyHash],
  );
  const row = result.rows[0];
  if (row?.blocked_until && row.blocked_until.getTime() > now.getTime()) {
    throw rateLimited((row.blocked_until.getTime() - now.getTime()) / 1000);
  }
}

async function recordOne(
  scope: string,
  keyHash: string,
  policy: Policy,
  blockAtLimit: boolean,
  now: Date,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${scope}:${keyHash}`]);
    const result = await client.query<RateRow>(
      "SELECT attempt_count, window_started_at, blocked_until FROM auth_rate_limits WHERE scope = $1 AND key_hash = $2 FOR UPDATE",
      [scope, keyHash],
    );
    const current = result.rows[0];
    if (current?.blocked_until && current.blocked_until.getTime() > now.getTime()) {
      await client.query("ROLLBACK");
      throw rateLimited((current.blocked_until.getTime() - now.getTime()) / 1000);
    }

    const windowExpired = !current
      || current.window_started_at.getTime() + policy.windowSec * 1000 <= now.getTime();
    const attemptCount = windowExpired ? 1 : current.attempt_count + 1;
    const shouldBlock = blockAtLimit ? attemptCount >= policy.limit : attemptCount > policy.limit;
    const blockedUntil = shouldBlock ? new Date(now.getTime() + policy.blockSec * 1000) : null;
    const windowStartedAt = windowExpired ? now : current.window_started_at;
    const expiresAt = new Date(
      now.getTime() + Math.max(env.AUTH_RATE_LIMIT_RETENTION_HOURS * 3600, policy.blockSec) * 1000,
    );

    await client.query(
      `INSERT INTO auth_rate_limits
        (scope, key_hash, window_started_at, attempt_count, blocked_until, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $3)
       ON CONFLICT (scope, key_hash) DO UPDATE SET
        window_started_at = EXCLUDED.window_started_at,
        attempt_count = EXCLUDED.attempt_count,
        blocked_until = EXCLUDED.blocked_until,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at`,
      [scope, keyHash, windowStartedAt, attemptCount, blockedUntil, expiresAt],
    );
    await client.query("COMMIT");
    if (blockedUntil) throw rateLimited(policy.blockSec);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original error is more useful than a rollback-after-commit error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class RegistrationAbuseGuard {
  async check(action: AuthRateLimitAction, email: string, context: AuthRequestContext): Promise<void> {
    const now = new Date();
    await maybeCleanup(now);
    for (const dimension of dimensions(email, context)) {
      const scope = `${action}:${dimension.kind}`;
      await inspectOne(scope, hashRateLimitKey(scope, dimension.value), now);
    }
  }

  async consume(action: AuthRateLimitAction, email: string, context: AuthRequestContext): Promise<void> {
    const now = new Date();
    await maybeCleanup(now);
    for (const dimension of dimensions(email, context)) {
      const scope = `${action}:${dimension.kind}`;
      await recordOne(scope, hashRateLimitKey(scope, dimension.value), policies[action][dimension.kind], false, now);
    }
  }

  async recordFailure(action: "login" | "verify" | "reset_confirm", email: string, context: AuthRequestContext): Promise<void> {
    const now = new Date();
    for (const dimension of dimensions(email, context)) {
      const scope = `${action}:${dimension.kind}`;
      await recordOne(scope, hashRateLimitKey(scope, dimension.value), policies[action][dimension.kind], true, now);
    }
  }
}

export const registrationAbuseGuard = new RegistrationAbuseGuard();
