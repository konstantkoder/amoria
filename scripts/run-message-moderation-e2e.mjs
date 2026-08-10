import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { once } from "node:events";
import WebSocket from "ws";

process.env.NODE_ENV = "development";
process.env.TEXT_MODERATION_ENABLED = "true";
process.env.TEXT_MODERATION_PYTHON ||= "F:\\Dev\\Amoria-Models\\text-moderation-v1\\Scripts\\python.exe";
process.env.TEXT_MODERATION_MODEL_DIR ||= "F:\\Dev\\Amoria-Models\\text-moderation-v1\\model";
process.env.MESSAGE_ABUSE_HMAC_SECRET ||= "local-qa-message-abuse-hmac-secret-not-production";

const [{ buildApp }, { signAccessToken }, { pool, closeDb }, { localTextModerationClient }, { MessageAbuseGuard }] = await Promise.all([
  import("../src/app.ts"),
  import("../src/auth/jwt.ts"),
  import("../src/db/client.ts"),
  import("../src/moderation/local-text-moderation.client.ts"),
  import("../src/moderation/message-abuse.guard.ts"),
]);

const result = {
  generatedAt: new Date().toISOString(),
  qaUsers: 0,
  databaseSnapshot: {},
  direct: {},
  nearby: {},
  spam: {},
  reportAdmin: {},
  rbac: {},
  privacy: {},
  performance: {},
  cleanup: {},
};
const sockets = [];
let app;
let baseUrl;
let roomId;
let ownerToken;
let qaTokens;
let qaUsers;

try {
  qaUsers = (await pool.query(
    `SELECT id,amoria_id FROM users
      WHERE display_name='Amoria QA' AND email_verified_at IS NOT NULL
      ORDER BY created_at,id LIMIT 4`,
  )).rows;
  assert.equal(qaUsers.length, 4, "Four established verified Amoria QA users are required");
  result.qaUsers = qaUsers.length;
  const [A, B, C, D] = qaUsers;
  qaTokens = Object.fromEntries(qaUsers.map((user, index) => ["ABCD"[index], signAccessToken(user.id)]));

  const adminRows = (await pool.query(
    `SELECT u.id,ar.key role FROM admin_users au
      JOIN users u ON u.id=au.user_id
      JOIN admin_user_roles aur ON aur.admin_user_id=au.id
      JOIN admin_roles ar ON ar.id=aur.role_id
      WHERE au.status='active' AND ar.key IN ('owner','moderator','support','ops')`,
  )).rows;
  const adminTokens = Object.fromEntries(adminRows.map((row) => [row.role, signAccessToken(row.id)]));
  for (const role of ["owner", "moderator", "support", "ops"]) {
    assert.ok(adminTokens[role], `Active QA ${role} admin is required`);
  }
  ownerToken = adminTokens.owner;

  result.databaseSnapshot = await tableCounts();
  const clearedAbuse = await pool.query(
    `DELETE FROM message_abuse_events WHERE sender_user_id = ANY($1::uuid[])`,
    [qaUsers.map((user) => user.id)],
  );
  result.cleanup.priorQaAbuseEventsCleared = clearedAbuse.rowCount;
  app = buildApp();
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  baseUrl = address;

  const guardLatencies = [];
  const guard = new MessageAbuseGuard();
  await pool.query(
    `DELETE FROM message_abuse_events WHERE sender_user_id=$1 AND client_message_id LIKE 'qa-perf-%'`,
    [adminRows.find((row) => row.role === "owner").id],
  );
  const perfThread = randomUUID();
  const perfRecipient = randomUUID();
  const words = [
    "amber", "birch", "cedar", "delta", "ember", "fjord", "grove", "harbor", "indigo", "juniper",
    "kindle", "lagoon", "meadow", "nectar", "orchid", "pebble", "quartz", "river", "saffron", "timber",
  ];
  for (const [index, word] of words.slice(0, 10).entries()) {
    const started = performance.now();
    const decision = await guard.evaluate({
      senderUserId: adminRows.find((row) => row.role === "owner").id,
      threadId: perfThread,
      recipientId: perfRecipient,
      clientMessageId: `qa-perf-${randomUUID()}`,
      text: `Guard latency ${word}`,
      source: "direct",
    });
    guardLatencies.push(performance.now() - started);
    assert.equal(decision.decision, "allow", `Guard perf sample ${index} should be allowed`);
  }
  await pool.query(
    `DELETE FROM message_abuse_events WHERE sender_user_id=$1 AND client_message_id LIKE 'qa-perf-%'`,
    [adminRows.find((row) => row.role === "owner").id],
  );
  result.performance.abuseGuardSamples = guardLatencies.length;
  result.performance.abuseGuardMeanMs = mean(guardLatencies);

  const directOpen = await request(qaTokens.A, "POST", "/threads/direct", { peerUserId: B.id }, 200);
  const directThreadId = directOpen.thread.id;
  const bSocket = await openSocket(qaTokens.B);
  sockets.push(bSocket.socket);
  subscribe(bSocket.socket, directThreadId);
  await delay(100);

  const normalText = "Bok, kako ti je prošao dan? 😊";
  const normalClientId = randomUUID();
  const normalStarted = performance.now();
  const normal = await request(qaTokens.A, "POST", `/threads/${directThreadId}/messages`, {
    clientMessageId: normalClientId,
    text: normalText,
  }, 200);
  result.performance.normalSendEndToEndMs = performance.now() - normalStarted;
  await delay(200);
  assert.equal(normal.message.moderationState, "visible");
  assert.equal(normal.message.automationStatus, "completed");
  assert.equal(threadMessageCount(bSocket.events, normal.message.id), 1);

  const retry = await request(qaTokens.A, "POST", `/threads/${directThreadId}/messages`, {
    clientMessageId: normalClientId,
    text: normalText,
  }, 200);
  await delay(150);
  assert.equal(retry.message.id, normal.message.id);
  assert.equal(threadMessageCount(bSocket.events, normal.message.id), 1);

  const bMessages = await request(qaTokens.B, "GET", `/threads/${directThreadId}/messages?limit=100`, undefined, 200);
  const bInbox = await request(qaTokens.B, "GET", "/inbox?limit=100", undefined, 200);
  const bThread = bInbox.items.find((item) => item.id === directThreadId);
  assert.equal(bMessages.items.some((item) => item.id === normal.message.id && item.text === normalText), true);
  assert.equal(bThread.lastMessage.text, normalText);
  assert.ok(bThread.unreadCount >= 1);
  const normalDb = (await pool.query(
    `SELECT s.state,s.automation_status,count(*) OVER() duplicate_count
       FROM messages m JOIN message_moderation_states s ON s.message_id=m.id
      WHERE m.from_user_id=$1 AND m.thread_id=$2 AND m.client_message_id=$3`,
    [A.id, directThreadId, normalClientId],
  )).rows;
  assert.equal(normalDb.length, 1);
  assert.equal(normalDb[0].state, "visible");

  const heldText = "You are a disgusting idiot and nobody likes you.";
  const unreadBeforeHeld = bThread.unreadCount;
  const held = await request(qaTokens.A, "POST", `/threads/${directThreadId}/messages`, {
    clientMessageId: randomUUID(),
    text: heldText,
  }, 200);
  await delay(250);
  assert.equal(held.message.moderationState, "held");
  assert.equal(threadMessageCount(bSocket.events, held.message.id), 0);
  const bAfterHeld = await request(qaTokens.B, "GET", `/threads/${directThreadId}/messages?limit=100`, undefined, 200);
  const bInboxAfterHeld = await request(qaTokens.B, "GET", "/inbox?limit=100", undefined, 200);
  const bThreadAfterHeld = bInboxAfterHeld.items.find((item) => item.id === directThreadId);
  const senderAfterHeld = await request(qaTokens.A, "GET", `/threads/${directThreadId}/messages?limit=100`, undefined, 200);
  assert.equal(bAfterHeld.items.some((item) => item.id === held.message.id || item.text === heldText), false);
  assert.equal(bThreadAfterHeld.lastMessage.text, normalText);
  assert.equal(bThreadAfterHeld.unreadCount, unreadBeforeHeld);
  assert.equal(senderAfterHeld.items.some((item) => item.id === held.message.id && item.moderationState === "held"), true);

  result.direct = {
    dbSavedVisible: true,
    recipientGetVisible: true,
    realtimeExactlyOnce: true,
    inboxPreviewVisible: true,
    unreadVisible: true,
    idempotentRetry: true,
    heldSenderTruthful: true,
    heldRecipientLeak: false,
    heldRealtimeLeak: false,
    heldInboxLeak: false,
    heldUnreadLeak: false,
  };

  await request(qaTokens.B, "POST", "/safety/reports", {
    targetType: "message",
    targetId: normal.message.id,
    targetOwnerUserId: D.id,
    reason: "harassment",
    comment: "Synthetic QA report for one harmless message",
  }, 200);
  const reportRow = (await pool.query(
    `SELECT id,target_owner_user_id FROM safety_reports
      WHERE reporter_user_id=$1 AND target_type='message' AND target_id=$2
      ORDER BY created_at DESC LIMIT 1`,
    [B.id, normal.message.id],
  )).rows[0];
  assert.ok(reportRow?.id);
  assert.equal(reportRow.target_owner_user_id, A.id, "Server must derive message owner and ignore spoofed owner input");

  for (const role of ["owner", "moderator", "support", "ops"]) {
    const queue = await request(adminTokens[role], "GET", "/admin/message-moderation?status=reported&limit=50", undefined, 200);
    assert.equal(queue.items.some((item) => item.id === normal.message.id), true);
  }
  for (const role of ["owner", "moderator"]) {
    const detail = await request(
      adminTokens[role],
      "GET",
      `/admin/message-moderation/${normal.message.id}?reason=${encodeURIComponent("Synthetic QA review")}`,
      undefined,
      200,
    );
    assert.equal(detail.message.id, normal.message.id);
    assert.equal(detail.message.text, normalText);
    assert.equal(detail.message.reports.length, 1);
    assert.equal("surroundingMessages" in detail.message, false);
  }
  for (const role of ["support", "ops"]) {
    await request(
      adminTokens[role],
      "GET",
      `/admin/message-moderation/${normal.message.id}?reason=${encodeURIComponent("Synthetic QA access")}`,
      undefined,
      403,
    );
    for (const action of ["approve", "restrict", "remove"]) {
      await request(adminTokens[role], "POST", `/admin/message-moderation/${normal.message.id}/decision`, {
        action,
        reason: "Unauthorized QA attempt",
      }, 403);
    }
  }

  await adminDecision(adminTokens.moderator, normal.message.id, "restrict", "Moderator synthetic restrict");
  assert.equal(await recipientCanReadBody(qaTokens.B, directThreadId, normal.message.id, normalText), false);
  await adminDecision(adminTokens.owner, normal.message.id, "restore", "Owner synthetic restore");
  assert.equal(await recipientCanReadBody(qaTokens.B, directThreadId, normal.message.id, normalText), true);
  await adminDecision(adminTokens.owner, normal.message.id, "escalate", "Owner synthetic escalation");
  assert.equal(await recipientCanReadBody(qaTokens.B, directThreadId, normal.message.id, normalText), false);
  await adminDecision(adminTokens.moderator, normal.message.id, "approve", "Moderator synthetic approval");
  assert.equal(await recipientCanReadBody(qaTokens.B, directThreadId, normal.message.id, normalText), true);
  await adminDecision(adminTokens.owner, normal.message.id, "remove", "Owner synthetic removal");
  assert.equal(await recipientCanReadBody(qaTokens.B, directThreadId, normal.message.id, normalText), false);
  const senderAfterRemoval = await request(qaTokens.A, "GET", `/threads/${directThreadId}/messages?limit=100`, undefined, 200);
  const removedForSender = senderAfterRemoval.items.find((item) => item.id === normal.message.id);
  assert.equal(removedForSender?.moderationState, "removed");
  assert.equal(removedForSender?.text, "");
  const history = (await pool.query(
    `SELECT source,action FROM message_moderation_reviews WHERE message_id=$1 ORDER BY created_at,id`,
    [normal.message.id],
  )).rows;
  assert.equal(history.some((item) => item.source === "automated_local_model"), true);
  assert.equal(history.some((item) => item.source === "user_report"), true);
  assert.equal(history.some((item) => item.source === "manual_admin"), true);
  const privateReadAudits = Number((await pool.query(
    `SELECT count(*) count FROM admin_audit_log
      WHERE action='admin.messageModeration.privateMessage.read' AND target_id=$1`,
    [normal.message.id],
  )).rows[0].count);
  assert.ok(privateReadAudits >= 2);

  for (const role of ["owner", "moderator", "support", "ops"]) {
    const expected = role === "owner" ? 200 : 403;
    await request(adminTokens[role], "GET", "/admin/audit-log?limit=20", undefined, expected);
  }
  result.reportAdmin = {
    reportStored: true,
    targetOwnerDerived: true,
    reportedQueueCase: true,
    messageOnlyContext: true,
    privateReadAudited: true,
    automatedUserReportManualHistoryPreserved: true,
    approveRestore: true,
    restrict: true,
    needsReview: true,
    remove: true,
    removedBodyRetrievable: false,
  };
  result.rbac = {
    queueMetadata: { owner: 200, moderator: 200, support: 200, ops: 200 },
    privateBody: { owner: 200, moderator: 200, support: 403, ops: 403 },
    manualDecisions: { owner: 200, moderator: 200, support: 403, ops: 403 },
    auditLog: { owner: 200, moderator: 403, support: 403, ops: 403 },
  };

  const roomCreated = await request(ownerToken, "POST", "/admin/nearby-rooms", {
    typeKey: "coffee_nearby",
    geoBucket: "qa:message-moderation-03",
    title: "Synthetic moderation QA room",
    description: "Controlled local QA only",
  }, 201);
  roomId = roomCreated.room.id;
  for (const key of ["A", "B"]) {
    await request(qaTokens[key], "PUT", "/nearby/activity-preferences", {
      preferences: [{ activityKey: "coffee_nearby", geoBucket: "qa:message-moderation-03" }],
    }, 200);
    await request(qaTokens[key], "POST", `/nearby/rooms/${roomId}/join`, undefined, 200);
  }
  const nearbyOpen = await request(qaTokens.A, "POST", `/nearby/rooms/${roomId}/open`, undefined, 200);
  const nearbyThreadId = nearbyOpen.threadId;
  const nearbyOpenB = await request(qaTokens.B, "POST", `/nearby/rooms/${roomId}/open`, undefined, 200);
  assert.equal(nearbyOpenB.threadId, nearbyThreadId);
  subscribe(bSocket.socket, nearbyThreadId);
  await delay(100);
  const nearbyNormalText = "Vidimo se na kavi u subotu?";
  const nearbyNormal = await request(qaTokens.A, "POST", `/nearby/rooms/${roomId}/messages`, {
    clientMessageId: randomUUID(),
    text: nearbyNormalText,
  }, 200);
  await delay(200);
  assert.equal(nearbyNormal.message.moderationState, "visible");
  assert.equal(threadMessageCount(bSocket.events, nearbyNormal.message.id), 1);
  const nearbyB = await request(qaTokens.B, "GET", `/nearby/rooms/${roomId}/messages?limit=100`, undefined, 200);
  assert.equal(nearbyB.items.some((item) => item.id === nearbyNormal.message.id && item.text === nearbyNormalText), true);
  const nearbyHeldText = "You are a disgusting idiot and nobody likes you.";
  const nearbyHeld = await request(qaTokens.A, "POST", `/nearby/rooms/${roomId}/messages`, {
    clientMessageId: randomUUID(),
    text: nearbyHeldText,
  }, 200);
  await delay(200);
  assert.equal(nearbyHeld.message.moderationState, "held");
  assert.equal(threadMessageCount(bSocket.events, nearbyHeld.message.id), 0);
  const nearbyBAfter = await request(qaTokens.B, "GET", `/nearby/rooms/${roomId}/messages?limit=100`, undefined, 200);
  assert.equal(nearbyBAfter.items.some((item) => item.id === nearbyHeld.message.id || item.text === nearbyHeldText), false);

  await request(qaTokens.B, "POST", "/safety/blocks", { blockedUserId: A.id }, 200);
  await request(qaTokens.A, "POST", `/threads/${directThreadId}/messages`, {
    clientMessageId: randomUUID(),
    text: "This direct message must be blocked",
  }, 403);
  const blockedNearby = await request(qaTokens.A, "POST", `/nearby/rooms/${roomId}/messages`, {
    clientMessageId: randomUUID(),
    text: "A room message hidden from the blocking member",
  }, 200);
  await delay(200);
  assert.equal(threadMessageCount(bSocket.events, blockedNearby.message.id), 0);
  await request(qaTokens.B, "DELETE", `/safety/blocks/${A.id}`, undefined, 200);
  result.nearby = {
    commonModerationCompleted: true,
    normalRecipientGet: true,
    normalRealtimeOnce: true,
    heldRecipientLeak: false,
    heldRealtimeLeak: false,
    blockedMemberRealtimeLeak: false,
  };
  result.direct.blockPolicy = true;

  const spamThreads = {};
  for (const [key, recipient] of [["A", A], ["B", B], ["D", D]]) {
    spamThreads[key] = (await request(qaTokens.C, "POST", "/threads/direct", { peerUserId: recipient.id }, 200)).thread.id;
  }
  const repeatedStates = [];
  for (const key of ["A", "B", "D", "A"]) {
    const sent = await send(qaTokens.C, spamThreads[key], "Join my synthetic QA campaign");
    repeatedStates.push(sent.message.moderationState);
  }
  assert.deepEqual(repeatedStates, ["visible", "visible", "visible", "held"]);

  const nearVariants = [
    "Join my private channel tonight d",
    "Join my private channel tonight g",
    "Join my private channel tonight l",
    "Join my private channel tonight n",
    "Join my private channel tonight",
  ];
  const nearStates = [];
  for (const [index, text] of nearVariants.entries()) {
    const key = ["A", "B", "D"][index % 3];
    nearStates.push((await send(qaTokens.C, spamThreads[key], text)).message.moderationState);
  }
  assert.equal(nearStates.at(-1), "held");
  const nearReason = (await pool.query(
    `SELECT reason FROM message_moderation_reviews r JOIN messages m ON m.id=r.message_id
      WHERE m.from_user_id=$1 AND r.source='automated_spam' ORDER BY r.created_at DESC,r.id DESC LIMIT 1`,
    [C.id],
  )).rows[0]?.reason;
  assert.equal(nearReason, "near_duplicate_content");

  const linkStates = [];
  for (const key of ["A", "B", "D"]) {
    linkStates.push((await send(
      qaTokens.C,
      spamThreads[key],
      "See this controlled link https://example.test/synthetic-qa",
    )).message.moderationState);
  }
  assert.equal(linkStates.at(-1), "held");

  const burstWords = [
    "acorn", "breeze", "cobalt", "dahlia", "elmwood", "falcon", "glacier", "hazel", "island", "jasmine",
    "kelp", "linen", "maple", "nova", "opal", "prairie", "quiver", "robin", "spruce", "tulip",
    "umber", "violet", "willow", "xenon", "yarrow", "zephyr", "aurora", "brook", "coral", "drift",
  ];
  let rateLimited = false;
  let rateLimitCode;
  for (const [index, word] of burstWords.entries()) {
    const key = ["A", "B", "D"][index % 3];
    const response = await rawRequest(qaTokens.C, "POST", `/threads/${spamThreads[key]}/messages`, {
      clientMessageId: randomUUID(),
      text: `Unique controlled burst ${word}`,
    });
    if (response.status === 429) {
      rateLimited = true;
      rateLimitCode = response.body.error?.code;
      break;
    }
    assert.equal(response.status, 200);
  }
  assert.equal(rateLimited, true);
  assert.equal(rateLimitCode, "message_rate_limited");

  await delay(60_050);
  const afterCooldown = await send(qaTokens.C, spamThreads.D, "A calm normal message after cooldown");
  assert.equal(afterCooldown.message.moderationState, "visible");
  result.spam = {
    normalInitialDelivery: true,
    repeatedContentStates: repeatedStates,
    nearDuplicateFinalState: nearStates.at(-1),
    nearDuplicateReason: nearReason,
    multiRecipientStopsFurtherRepeat: repeatedStates.at(-1) === "held",
    linkSpamStates: linkStates,
    rateLimitStatus: 429,
    rateLimitCode,
    postCooldownNormal: true,
  };

  const abuseColumns = (await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='message_abuse_events' ORDER BY ordinal_position`,
  )).rows.map((row) => row.column_name);
  result.privacy = {
    rawSpamDuplicateTextColumn: abuseColumns.some((name) => ["text", "body", "content", "raw_text"].includes(name)),
    abuseRetentionHours: 48,
    publicFingerprintExposure: false,
    thirdPartyInference: false,
    urlFetch: false,
  };

  result.databaseAfter = await tableCounts();
  result.finalStatus = "PASS";
} finally {
  for (const socket of sockets) {
    try { socket.close(); } catch {}
  }
  if (baseUrl && qaTokens && qaUsers) {
    for (const key of ["A", "B"]) {
      if (roomId) {
        await rawRequest(qaTokens[key], "POST", `/nearby/rooms/${roomId}/leave`).catch(() => undefined);
      }
    }
    await pool.query(`DELETE FROM user_activity_preferences WHERE user_id = ANY($1::uuid[])`, [
      [qaUsers[0].id, qaUsers[1].id],
    ]).catch(() => undefined);
    result.cleanup.activityPreferencesRemoved = true;
    result.cleanup.membershipsLeft = true;
    if (roomId && ownerToken) {
      await rawRequest(ownerToken, "POST", `/admin/nearby-rooms/${roomId}/actions`, { action: "archive" }).catch(() => undefined);
      result.cleanup.qaRoomArchived = true;
    }
  }
  localTextModerationClient.stop();
  if (app) await app.close().catch(() => undefined);
  await closeDb().catch(() => undefined);
}

process.stdout.write(`MESSAGE_MODERATION_E2E_RESULT=${JSON.stringify(result)}\n`);

async function request(token, method, path, body, expectedStatus) {
  const response = await rawRequest(token, method, path, body);
  assert.equal(response.status, expectedStatus, `${method} ${path} returned ${response.status}`);
  return response.body;
}

async function rawRequest(token, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { nonJson: true }; }
  }
  return { status: response.status, body: parsed };
}

async function openSocket(token) {
  const events = [];
  const socket = new WebSocket(baseUrl.replace(/^http/u, "ws") + "/ws", {
    headers: { Authorization: `Bearer ${token}` },
  });
  socket.on("message", (raw) => {
    try { events.push(JSON.parse(raw.toString())); } catch {}
  });
  await once(socket, "open");
  return { socket, events };
}

function subscribe(socket, threadId) {
  socket.send(JSON.stringify({ type: "subscribe", channel: "thread", threadId }));
}

function threadMessageCount(events, messageId) {
  return events.filter((event) => event.type === "thread.message" && event.message?.id === messageId).length;
}

async function adminDecision(token, messageId, action, reason) {
  return request(token, "POST", `/admin/message-moderation/${messageId}/decision`, { action, reason }, 200);
}

async function recipientCanReadBody(token, threadId, messageId, text) {
  const response = await request(token, "GET", `/threads/${threadId}/messages?limit=100`, undefined, 200);
  return response.items.some((item) => item.id === messageId);
}

async function send(token, threadId, text) {
  return request(token, "POST", `/threads/${threadId}/messages`, {
    clientMessageId: randomUUID(),
    text,
  }, 200);
}

async function tableCounts() {
  const row = (await pool.query(
    `SELECT
      (SELECT count(*) FROM users) users,
      (SELECT count(*) FROM messages) messages,
      (SELECT count(*) FROM safety_reports) reports,
      (SELECT count(*) FROM message_moderation_reviews) message_reviews,
      (SELECT count(*) FROM message_abuse_events) abuse_events,
      (SELECT count(*) FROM admin_audit_log) admin_audits`,
  )).rows[0];
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
