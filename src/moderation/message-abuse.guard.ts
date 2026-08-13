import { createHmac } from "node:crypto";
import { AppError } from "../common/errors";
import { env } from "../config/env";
import { pool } from "../db/client";
import { containsPunycodeHost } from "./text-validation";
import {
  fingerprintMessage,
  hammingDistance64,
  type MessageFingerprints,
} from "./message-fingerprint";
import type { MessageSource } from "./message-moderation.types";
import { consumeSharedMessageAttempt } from "../realtime/realtime-bus";

const SENDER_WINDOW_MS = 60_000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;
const DISTINCT_RECIPIENT_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_RETRY_SECONDS = 60;

export type AbuseDecisionKind = "allow" | "hold" | "rate_limit";

export type AbuseDecision = {
  decision: AbuseDecisionKind;
  reason: string | null;
  retryAfterSec?: number;
  signals: Record<string, string | number | boolean>;
  fingerprints: Omit<MessageFingerprints, "normalized">;
};

export type AbuseGuardInput = {
  senderUserId: string;
  threadId: string;
  recipientId?: string;
  clientMessageId: string;
  text: string;
  source: MessageSource;
};

type RecentEvent = {
  thread_key: string;
  recipient_key: string | null;
  exact_fingerprint: string;
  similarity_hash: string;
  link_fingerprint: string | null;
  created_at: Date;
  decision: AbuseDecisionKind;
  reason: string | null;
};

type AccountSignals = {
  created_at: Date;
  email_verified_at: Date | null;
  recent_restrictions: string | number;
  recent_reports: string | number;
};

export class MessageAbuseGuard {
  async evaluate(input: AbuseGuardInput): Promise<AbuseDecision> {
    const sharedAllowed = await consumeSharedMessageAttempt(input.senderUserId);
    if (sharedAllowed === false) {
      throw new AppError("message_rate_limited", "Message rate limit reached. Try again shortly.", 429, {
        retryAfterSec: String(RATE_LIMIT_RETRY_SECONDS),
        reason: "shared_sender_rate",
      });
    }
    const now = new Date();
    const fingerprints = fingerprintMessage(input.text, env.MESSAGE_ABUSE_HMAC_SECRET);
    const threadKey = privacyKey("thread", input.threadId);
    const recipientKey = input.recipientId ? privacyKey("recipient", input.recipientId) : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.senderUserId]);

      const existingResult = await client.query<RecentEvent>(
        `SELECT thread_key,recipient_key,exact_fingerprint,similarity_hash,link_fingerprint,created_at,decision,reason
           FROM message_abuse_events
          WHERE sender_user_id=$1 AND thread_key=$2 AND client_message_id=$3
          LIMIT 1`,
        [input.senderUserId, threadKey, input.clientMessageId],
      );
      const existing = existingResult.rows[0];
      if (existing && !(existing.decision === "rate_limit" && now.getTime() - existing.created_at.getTime() >= SENDER_WINDOW_MS)) {
        await client.query("COMMIT");
        return {
          decision: existing.decision,
          reason: existing.reason,
          ...(existing.decision === "rate_limit" ? { retryAfterSec: RATE_LIMIT_RETRY_SECONDS } : {}),
          signals: { idempotentReplay: true },
          fingerprints: withoutNormalized(fingerprints),
        };
      }
      if (existing) {
        await client.query("DELETE FROM message_abuse_events WHERE sender_user_id=$1 AND thread_key=$2 AND client_message_id=$3", [
          input.senderUserId,
          threadKey,
          input.clientMessageId,
        ]);
      }

      const [accountResult, recentResult] = await Promise.all([
        client.query<AccountSignals>(
          `SELECT u.created_at,u.email_verified_at,
             (SELECT count(*) FROM message_moderation_reviews r
                JOIN messages m ON m.id=r.message_id
               WHERE m.from_user_id=u.id AND r.created_at >= $2
                 AND r.action IN ('hold','restrict','remove')) AS recent_restrictions,
             (SELECT count(*) FROM safety_reports sr
               WHERE sr.target_owner_user_id=u.id AND sr.target_type='message'
                 AND sr.created_at >= $2) AS recent_reports
             FROM users u WHERE u.id=$1 LIMIT 1`,
          [input.senderUserId, new Date(now.getTime() - 7 * 86_400_000)],
        ),
        client.query<RecentEvent>(
          `SELECT thread_key,recipient_key,exact_fingerprint,similarity_hash,link_fingerprint,created_at,decision,reason
             FROM message_abuse_events
            WHERE sender_user_id=$1 AND created_at >= $2 AND expires_at > $3
            ORDER BY created_at DESC LIMIT 100`,
          [input.senderUserId, new Date(now.getTime() - DUPLICATE_WINDOW_MS), now],
        ),
      ]);

      const account = accountResult.rows[0];
      if (!account) {
        throw new AppError("not_found", "Sender account not found", 404);
      }
      const decision = decideAbuse({
        now,
        input,
        fingerprints,
        recipientKey,
        threadKey,
        account,
        recent: recentResult.rows,
      });

      await client.query(
        `INSERT INTO message_abuse_events
          (sender_user_id,thread_key,recipient_key,client_message_id,exact_fingerprint,
           similarity_hash,link_fingerprint,url_count,decision,reason,created_at,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          input.senderUserId,
          threadKey,
          recipientKey,
          input.clientMessageId,
          fingerprints.exactFingerprint,
          fingerprints.similarityHash,
          fingerprints.linkFingerprint,
          fingerprints.urlCount,
          decision.decision,
          decision.reason,
          now,
          new Date(now.getTime() + env.MESSAGE_ABUSE_RETENTION_HOURS * 3_600_000),
        ],
      );
      await client.query("COMMIT");
      return decision;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function assertNotRateLimited(decision: AbuseDecision): void {
  if (decision.decision !== "rate_limit") return;
  throw new AppError(
    "message_rate_limited",
    "Message rate limit reached. Try again shortly.",
    429,
    {
      retryAfterSec: String(decision.retryAfterSec ?? RATE_LIMIT_RETRY_SECONDS),
      reason: decision.reason ?? "message_rate_limit",
    },
  );
}

export function decideAbuse(context: {
  now: Date;
  input: AbuseGuardInput;
  fingerprints: MessageFingerprints;
  recipientKey: string | null;
  threadKey: string;
  account: AccountSignals;
  recent: RecentEvent[];
}): AbuseDecision {
  const { now, input, fingerprints, recipientKey, threadKey, account, recent } = context;
  const senderRecent = recent.filter((row) => now.getTime() - row.created_at.getTime() <= SENDER_WINDOW_MS);
  const threadRecent = senderRecent.filter((row) => row.thread_key === threadKey);
  const recipientRecent = recipientKey
    ? senderRecent.filter((row) => row.recipient_key === recipientKey)
    : threadRecent;
  const recipientBurstRows = recent.filter(
    (row) => now.getTime() - row.created_at.getTime() <= DISTINCT_RECIPIENT_WINDOW_MS,
  );
  const distinctRecipients = new Set(
    recipientBurstRows.map((row) => row.recipient_key).filter((value): value is string => Boolean(value)),
  );
  if (recipientKey) distinctRecipients.add(recipientKey);

  const exactRepeats = recent.filter((row) => row.exact_fingerprint === fingerprints.exactFingerprint).length;
  const nearRepeats = recent
    .slice(0, 24)
    .filter((row) => hammingDistance64(row.similarity_hash, fingerprints.similarityHash) <= 6).length;
  const sameLinkRows = fingerprints.linkFingerprint
    ? recent.filter((row) => row.link_fingerprint === fingerprints.linkFingerprint)
    : [];
  const sameLinkRecipients = new Set(
    sameLinkRows.map((row) => row.recipient_key).filter((value): value is string => Boolean(value)),
  );
  if (fingerprints.linkFingerprint && recipientKey) sameLinkRecipients.add(recipientKey);

  const accountAgeHours = Math.max(0, (now.getTime() - account.created_at.getTime()) / 3_600_000);
  const newAccount = accountAgeHours < 24;
  const verifiedEmail = Boolean(account.email_verified_at);
  const recentRestrictions = Number(account.recent_restrictions ?? 0);
  const recentReports = Number(account.recent_reports ?? 0);
  const signals = {
    senderRate60s: senderRecent.length + 1,
    threadRate60s: threadRecent.length + 1,
    recipientRate60s: recipientRecent.length + 1,
    distinctRecipients5m: distinctRecipients.size,
    exactRepeats10m: exactRepeats + 1,
    nearRepeats10m: nearRepeats + 1,
    sameLinkRecipients10m: sameLinkRecipients.size,
    urlCount: fingerprints.urlCount,
    punycodeHost: containsPunycodeHost(input.text),
    newAccount,
    verifiedEmail,
    recentRestrictions,
    recentReports,
    source: input.source,
  };

  if (senderRecent.length >= 30) return result("rate_limit", "sender_rate", signals, fingerprints);
  if (threadRecent.length >= 20) return result("rate_limit", "thread_rate", signals, fingerprints);
  if (recipientRecent.length >= 15) return result("rate_limit", "recipient_rate", signals, fingerprints);

  const distinctLimit = newAccount || !verifiedEmail || recentRestrictions > 0 || recentReports >= 2 ? 5 : 8;
  if (distinctRecipients.size > distinctLimit) {
    return result("hold", "distinct_recipient_burst", signals, fingerprints);
  }
  if (exactRepeats >= 3) return result("hold", "repeated_content", signals, fingerprints);
  if (nearRepeats >= 4) return result("hold", "near_duplicate_content", signals, fingerprints);
  if (sameLinkRecipients.size >= 3) return result("hold", "repeated_link_multi_recipient", signals, fingerprints);
  if (fingerprints.urlCount >= 4) return result("hold", "excessive_links", signals, fingerprints);
  if (signals.punycodeHost && (newAccount || exactRepeats > 0 || distinctRecipients.size >= 3)) {
    return result("hold", "suspicious_link_pattern", signals, fingerprints);
  }
  return result("allow", null, signals, fingerprints);

  function result(
    decision: AbuseDecisionKind,
    reason: string | null,
    nextSignals: AbuseDecision["signals"],
    nextFingerprints: MessageFingerprints,
  ): AbuseDecision {
    return {
      decision,
      reason,
      ...(decision === "rate_limit" ? { retryAfterSec: RATE_LIMIT_RETRY_SECONDS } : {}),
      signals: nextSignals,
      fingerprints: withoutNormalized(nextFingerprints),
    };
  }
}

function privacyKey(scope: string, value: string): string {
  return createHmac("sha256", env.MESSAGE_ABUSE_HMAC_SECRET)
    .update(scope, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function withoutNormalized(value: MessageFingerprints): Omit<MessageFingerprints, "normalized"> {
  return {
    exactFingerprint: value.exactFingerprint,
    similarityHash: value.similarityHash,
    linkFingerprint: value.linkFingerprint,
    urlCount: value.urlCount,
  };
}
