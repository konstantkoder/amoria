import { AppError } from "../common/errors";
import { pool } from "../db/client";
import type { AuthRequestContext } from "../auth/auth.types";
import { hashRateLimitKey } from "../auth/registration-abuse.guard";

export type AdminSecurityRateAction =
  | "password"
  | "totp"
  | "recovery"
  | "enrollment"
  | "step_up";

type RateRow = {
  attempt_count: number;
  window_started_at: Date;
  blocked_until: Date | null;
};

const policies: Record<AdminSecurityRateAction, { identityLimit: number; ipLimit: number; windowSec: number; blockSec: number }> = {
  password: { identityLimit: 5, ipLimit: 20, windowSec: 15 * 60, blockSec: 10 * 60 },
  totp: { identityLimit: 8, ipLimit: 30, windowSec: 10 * 60, blockSec: 10 * 60 },
  recovery: { identityLimit: 6, ipLimit: 20, windowSec: 10 * 60, blockSec: 10 * 60 },
  enrollment: { identityLimit: 8, ipLimit: 30, windowSec: 10 * 60, blockSec: 10 * 60 },
  step_up: { identityLimit: 8, ipLimit: 30, windowSec: 10 * 60, blockSec: 10 * 60 },
};

function rateLimited(retryAfterSec: number): AppError {
  return new AppError("rate_limited", "Too many requests", 429, {
    retryAfterSec: String(Math.max(1, Math.ceil(retryAfterSec))),
  });
}

function dimensions(identity: string, context: AuthRequestContext): Array<{ kind: "identity" | "ip"; value: string }> {
  return [
    { kind: "identity", value: identity },
    ...(context.ip ? [{ kind: "ip" as const, value: context.ip }] : []),
  ];
}

async function inspect(scope: string, keyHash: string, now: Date): Promise<void> {
  const result = await pool.query<RateRow>(
    "SELECT attempt_count, window_started_at, blocked_until FROM auth_rate_limits WHERE scope=$1 AND key_hash=$2",
    [scope, keyHash],
  );
  const blockedUntil = result.rows[0]?.blocked_until;
  if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
    throw rateLimited((blockedUntil.getTime() - now.getTime()) / 1000);
  }
}

async function recordFailure(
  scope: string,
  keyHash: string,
  limit: number,
  windowSec: number,
  blockSec: number,
  now: Date,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${scope}:${keyHash}`]);
    const result = await client.query<RateRow>(
      "SELECT attempt_count, window_started_at, blocked_until FROM auth_rate_limits WHERE scope=$1 AND key_hash=$2 FOR UPDATE",
      [scope, keyHash],
    );
    const current = result.rows[0];
    if (current?.blocked_until && current.blocked_until.getTime() > now.getTime()) {
      throw rateLimited((current.blocked_until.getTime() - now.getTime()) / 1000);
    }
    const windowExpired = !current || current.window_started_at.getTime() + windowSec * 1000 <= now.getTime();
    const attemptCount = windowExpired ? 1 : current.attempt_count + 1;
    const blockedUntil = attemptCount >= limit ? new Date(now.getTime() + blockSec * 1000) : null;
    const windowStartedAt = windowExpired ? now : current.window_started_at;
    const expiresAt = new Date(now.getTime() + Math.max(7 * 24 * 60 * 60, blockSec) * 1000);
    await client.query(
      `INSERT INTO auth_rate_limits
        (scope,key_hash,window_started_at,attempt_count,blocked_until,expires_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$3)
       ON CONFLICT (scope,key_hash) DO UPDATE SET
        window_started_at=EXCLUDED.window_started_at,attempt_count=EXCLUDED.attempt_count,
        blocked_until=EXCLUDED.blocked_until,expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at`,
      [scope, keyHash, windowStartedAt, attemptCount, blockedUntil, expiresAt],
    );
    await client.query("COMMIT");
    if (blockedUntil) throw rateLimited(blockSec);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export class AdminMfaRateLimit {
  async check(action: AdminSecurityRateAction, identity: string, context: AuthRequestContext): Promise<void> {
    const now = new Date();
    for (const dimension of dimensions(identity, context)) {
      const scope = `admin_${action}:${dimension.kind}`;
      await inspect(scope, hashRateLimitKey(scope, dimension.value), now);
    }
  }

  async recordFailure(action: AdminSecurityRateAction, identity: string, context: AuthRequestContext): Promise<void> {
    const now = new Date();
    const policy = policies[action];
    for (const dimension of dimensions(identity, context)) {
      const scope = `admin_${action}:${dimension.kind}`;
      const limit = dimension.kind === "identity" ? policy.identityLimit : policy.ipLimit;
      await recordFailure(scope, hashRateLimitKey(scope, dimension.value), limit, policy.windowSec, policy.blockSec, now);
    }
  }
}

export const adminMfaRateLimit = new AdminMfaRateLimit();
