import assert from "node:assert/strict";
import test from "node:test";
import type { AdminMessageDetail } from "../src/admin/admin-message-moderation.types";
import type { AdminContext, AdminRoleKey } from "../src/admin/admin.types";
import { decideAbuse } from "../src/moderation/message-abuse.guard";
import {
  fingerprintMessage,
  hammingDistance64,
  normalizeForAbuse,
} from "../src/moderation/message-fingerprint";
import { moderateMessage, __setMessageSafetyDepsForTests } from "../src/moderation/message-safety.service";
import { applyTextModerationPolicy } from "../src/moderation/text-moderation.policy";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";

const adminModeration = require("../src/admin/admin-message-moderation.service") as typeof import("../src/admin/admin-message-moderation.service");

const now = new Date("2026-08-10T10:00:00.000Z");
const secret = "unit-test-message-fingerprint-secret";
const senderId = "00000000-0000-4000-8000-000000000001";
const messageId = "00000000-0000-4000-8000-000000000101";

test("abuse fingerprint normalizes evasive digits punctuation URLs and zero-width text without exposing raw content", () => {
  const first = fingerprintMessage("HELLO\u200b1!!! https://Example.test/path", secret);
  const second = fingerprintMessage("hello2! https://example.test/other", secret);

  assert.equal(first.exactFingerprint, second.exactFingerprint);
  assert.equal(first.linkFingerprint, second.linkFingerprint);
  assert.equal(first.exactFingerprint.includes("hello"), false);
  assert.equal("normalized" in withoutNormalized(first), false);
  assert.equal(JSON.stringify(withoutNormalized(first)).includes("Example.test"), false);
  assert.equal(normalizeForAbuse("Offer 123!!!!"), "offer <n>");
});

test("bounded SimHash recognizes cheap near-duplicate variants", () => {
  const base = fingerprintMessage("Join my private channel tonight", secret);
  const variant = fingerprintMessage("Join my private channel tonight!!!", secret);

  assert.ok(hammingDistance64(base.similarityHash, variant.similarityHash) <= 6);
});

test("ordinary RU EN HR dating conversation and an occasional URL remain allowed", () => {
  const texts = [
    "Привет, как прошёл твой день?",
    "Hi, how was your day?",
    "Bok, kako ti je prošao dan?",
    "You have a lovely smile 😊",
    "Here is the cafe menu https://example.test/menu",
  ];

  for (const [index, text] of texts.entries()) {
    assert.equal(abuseDecision(text, [], { clientMessageId: `normal-${index}` }).decision, "allow");
  }
});

test("sender thread and recipient backend rate limits return explicit rate decisions", () => {
  const senderRows = Array.from({ length: 30 }, (_, index) => recentRow({
    thread_key: `thread-${index}`,
    recipient_key: `recipient-${index}`,
  }));
  assert.equal(abuseDecision("normal sender burst", senderRows).reason, "sender_rate");

  const threadRows = Array.from({ length: 20 }, () => recentRow({ thread_key: "thread-key" }));
  assert.equal(abuseDecision("normal thread burst", threadRows).reason, "thread_rate");

  const recipientRows = Array.from({ length: 15 }, () => recentRow({ recipient_key: "recipient-key" }));
  assert.equal(abuseDecision("normal recipient burst", recipientRows).reason, "recipient_rate");
});

test("repeat near-duplicate multi-recipient and link bursts are held", () => {
  const exact = fingerprintMessage("repeated invitation", secret);
  const repeats = Array.from({ length: 3 }, () => recentRow({ exact_fingerprint: exact.exactFingerprint }));
  assert.equal(abuseDecision("repeated invitation", repeats).reason, "repeated_content");

  const near = fingerprintMessage("slightly changing campaign", secret);
  const nearRows = Array.from({ length: 4 }, (_, index) => recentRow({
    exact_fingerprint: `different-${index}`,
    similarity_hash: near.similarityHash,
  }));
  assert.equal(abuseDecision("slightly changing campaign", nearRows).reason, "near_duplicate_content");

  const recipients = Array.from({ length: 5 }, (_, index) => recentRow({ recipient_key: `person-${index}` }));
  assert.equal(abuseDecision("hello there", recipients, { newAccount: true }).reason, "distinct_recipient_burst");

  const linked = fingerprintMessage("see https://example.test/join", secret);
  const linkRows = ["person-a", "person-b"].map((recipient) => recentRow({
    recipient_key: recipient,
    link_fingerprint: linked.linkFingerprint,
  }));
  assert.equal(
    abuseDecision("see https://example.test/join", linkRows, { recipientKey: "person-c" }).reason,
    "repeated_link_multi_recipient",
  );
});

test("text policy allows mild flirt and centralizes hold/restrict thresholds", () => {
  assert.equal(applyTextModerationPolicy(signals({ toxicity: 0.08, insult: 0.03 })).outcome, "allow");
  assert.equal(applyTextModerationPolicy(signals({ toxicity: 0.95 })).outcome, "hold");
  assert.equal(applyTextModerationPolicy(signals({ threat: 0.98 })).outcome, "restrict");
});

test("local model failure is truthful: low risk fails soft and high risk needs review", async (t) => {
  let highRisk = false;
  const restore = __setMessageSafetyDepsForTests({
    modelConfigured: () => true,
    classify: async () => {
      throw new Error("worker_unavailable");
    },
    evaluateAbuse: async () => ({
      decision: "allow",
      reason: null,
      signals: highRisk ? { urlCount: 2, newAccount: true } : { urlCount: 0, newAccount: false },
      fingerprints: {
        exactFingerprint: "hash",
        similarityHash: "0000000000000000",
        linkFingerprint: null,
        urlCount: highRisk ? 2 : 0,
      },
    }),
  });
  t.after(restore);

  const low = await moderateMessage(messageInput("Hello, how are you?"));
  assert.deepEqual({ state: low.state, status: low.automationStatus }, { state: "visible", status: "failed" });
  assert.equal(low.evidence.at(-1)?.reason, "model_failed");

  highRisk = true;
  const risky = await moderateMessage(messageInput("Visit these two test links"));
  assert.deepEqual(
    { state: risky.state, status: risky.automationStatus },
    { state: "needs_review", status: "failed" },
  );
});

test("all admin roles can read queue metadata but only owner/moderator can read message body", async (t) => {
  const state = moderationServiceMock();
  t.after(state.restore);

  for (const role of ["owner", "moderator", "support", "ops"] as AdminRoleKey[]) {
    const queue = await adminModeration.listMessageQueue(admin(role), { status: "all", limit: 50 }, {});
    assert.equal(queue.items.length, 1);
  }

  for (const role of ["owner", "moderator"] as AdminRoleKey[]) {
    const detail = await adminModeration.getMessageDetail(admin(role), messageId, "Review reported message", {});
    assert.equal(detail.message.text, "Synthetic harmless QA text");
  }

  for (const role of ["support", "ops"] as AdminRoleKey[]) {
    await assert.rejects(
      adminModeration.getMessageDetail(admin(role), messageId, "Review", {}),
      (error: unknown) => statusCode(error) === 403,
    );
  }
  assert.equal(state.detailReads, 2);
  assert.equal(state.audits.filter((entry) => entry.action.endsWith("privateMessage.read")).length, 2);
  assert.equal(JSON.stringify(state.audits).includes("Synthetic harmless QA text"), false);
});

test("owner/moderator decisions are audited and support/ops cannot approve restrict or remove", async (t) => {
  const state = moderationServiceMock();
  t.after(state.restore);

  for (const role of ["owner", "moderator"] as AdminRoleKey[]) {
    for (const action of ["approve", "restore", "restrict", "remove", "escalate"] as const) {
      const result = await adminModeration.decideMessage(
        admin(role),
        messageId,
        { action, reason: `QA ${action}` },
        {},
      );
      assert.equal(result.ok, true);
    }
  }

  for (const role of ["support", "ops"] as AdminRoleKey[]) {
    for (const action of ["approve", "restrict", "remove"] as const) {
      await assert.rejects(
        adminModeration.decideMessage(admin(role), messageId, { action, reason: "Not authorized" }, {}),
        (error: unknown) => statusCode(error) === 403,
      );
    }
  }
  assert.equal(state.decisions.length, 10);
  assert.equal(state.audits.filter((entry) => entry.action.endsWith("decision")).length, 10);
});

test("manual override requires a reason before any repository write", async (t) => {
  const state = moderationServiceMock();
  t.after(state.restore);

  await assert.rejects(
    adminModeration.decideMessage(admin("owner"), messageId, { action: "remove" }, {}),
    (error: unknown) => statusCode(error) === 400,
  );
  assert.equal(state.decisions.length, 0);
});

function abuseDecision(
  text: string,
  recent: ReturnType<typeof recentRow>[],
  options: { newAccount?: boolean; recipientKey?: string; clientMessageId?: string } = {},
) {
  const fingerprints = fingerprintMessage(text, secret);
  return decideAbuse({
    now,
    input: {
      senderUserId: senderId,
      threadId: "thread-id",
      recipientId: "recipient-id",
      clientMessageId: options.clientMessageId ?? "client-id",
      text,
      source: "direct",
    },
    fingerprints,
    recipientKey: options.recipientKey ?? "recipient-key",
    threadKey: "thread-key",
    account: {
      created_at: new Date(now.getTime() - (options.newAccount ? 2 : 72) * 3_600_000),
      email_verified_at: now,
      recent_restrictions: 0,
      recent_reports: 0,
    },
    recent,
  });
}

function recentRow(overrides: Partial<{
  thread_key: string;
  recipient_key: string | null;
  exact_fingerprint: string;
  similarity_hash: string;
  link_fingerprint: string | null;
  created_at: Date;
  decision: "allow" | "hold" | "rate_limit";
  reason: string | null;
}> = {}) {
  return {
    thread_key: "other-thread",
    recipient_key: "other-recipient",
    exact_fingerprint: "other-fingerprint",
    similarity_hash: "ffffffffffffffff",
    link_fingerprint: null,
    created_at: new Date(now.getTime() - 5_000),
    decision: "allow" as const,
    reason: null,
    ...overrides,
  };
}

function withoutNormalized(value: ReturnType<typeof fingerprintMessage>) {
  const { normalized: _normalized, ...rest } = value;
  return rest;
}

function signals(overrides: Partial<{
  toxicity: number;
  severeToxicity: number;
  identityAttack: number;
  insult: number;
  threat: number;
}> = {}) {
  return {
    toxicity: 0.01,
    severeToxicity: 0.01,
    identityAttack: 0.01,
    insult: 0.01,
    threat: 0.01,
    ...overrides,
  };
}

function messageInput(text: string) {
  return {
    messageIdHint: messageId,
    senderUserId: senderId,
    threadId: "00000000-0000-4000-8000-000000000201",
    recipientId: "00000000-0000-4000-8000-000000000002",
    clientMessageId: "00000000-0000-4000-8000-000000000301",
    text,
    source: "direct" as const,
  };
}

function admin(role: AdminRoleKey): AdminContext {
  return {
    adminUser: {
      id: `admin-${role}`,
      userId: `user-${role}`,
      status: "active",
      roles: [role],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    user: {
      id: `user-${role}`,
      amoriaId: `AM${role.toUpperCase()}`,
      displayName: role,
      email: `${role}@example.test`,
    },
  };
}

function moderationServiceMock() {
  const audits: Array<{ action: string; metadata?: unknown }> = [];
  const decisions: string[] = [];
  let detailReads = 0;
  const detail: AdminMessageDetail = {
    id: messageId,
    threadId: "00000000-0000-4000-8000-000000000201",
    source: "direct",
    state: "held",
    automationStatus: "completed",
    sender: { id: senderId, amoriaId: "AMSENDER", displayName: "Sender" },
    reportCount: 1,
    latestReason: "reported",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    text: "Synthetic harmless QA text",
    clientMessageId: "client-id",
    reviews: [],
    reports: [],
    privacyNote: "Single-message review only",
  };
  const restore = adminModeration.__setAdminMessageModerationDepsForTests({
    repo: {
      listMessageQueue: async () => [{
        id: detail.id,
        threadId: detail.threadId,
        source: detail.source,
        state: detail.state,
        automationStatus: detail.automationStatus,
        sender: detail.sender,
        reportCount: detail.reportCount,
        latestReason: detail.latestReason,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      }],
      findMessageDetail: async () => {
        detailReads += 1;
        return detail;
      },
      applyMessageDecision: async (input) => {
        decisions.push(input.action);
        return { previousState: "held", nextState: input.action === "remove" ? "removed" : "visible" };
      },
    },
    audit: {
      writeAuditLog: async (input) => {
        audits.push({ action: input.action, metadata: input.metadata });
      },
    },
  });
  return {
    audits,
    decisions,
    get detailReads() {
      return detailReads;
    },
    restore,
  };
}

function statusCode(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "statusCode" in error
    ? Number((error as { statusCode: unknown }).statusCode)
    : undefined;
}
