import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { Counter, Trend } from "k6/metrics";

const httpBaseUrl = (__ENV.HTTP_BASE_URL || __ENV.BASE_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const websocketBaseUrl = (__ENV.WS_BASE_URL || __ENV.BASE_URL || httpBaseUrl).replace(/\/$/, "");
guardTarget(httpBaseUrl);
guardTarget(websocketBaseUrl);
const scenario = __ENV.SCENARIO || "http_reads";
const vus = integerEnv("VUS", 10, 1, 50_000);
const duration = __ENV.DURATION || "30s";
const users = loadUsers();
const chatSendAckMs = new Trend("chat_send_ack_ms", true);
const realtimeDeliveryMs = new Trend("realtime_delivery_ms", true);
const togetherMatchLatencyMs = new Trend("together_match_latency_ms", true);
const knownCompatibleFalseNoMatch = new Counter("known_compatible_false_no_match_total");
const sloThresholds = {
  http_req_failed: ["rate<0.005"],
  http_req_duration: ["p(95)<300", "p(99)<1000"],
};
if (scenario === "nearby") sloThresholds["http_req_duration{workload:nearby}"] = ["p(95)<500"];
if (scenario === "chat") sloThresholds["http_req_duration{workload:chat}"] = ["p(95)<300"];
if (scenario === "together") sloThresholds["http_req_duration{workload:together}"] = ["p(95)<800"];
if (scenario === "realtime_e2e") sloThresholds.realtime_delivery_ms = ["p(95)<500"];
if (scenario === "together_match") {
  sloThresholds.together_match_latency_ms = ["p(95)<800"];
  sloThresholds.known_compatible_false_no_match_total = ["count==0"];
}

const pairedCorrectnessScenario = scenario === "realtime_e2e" || scenario === "together_match";
export const options = pairedCorrectnessScenario
  ? {
      scenarios: {
        paired_correctness: { executor: "per-vu-iterations", vus, iterations: 1, maxDuration: duration },
      },
      thresholds: sloThresholds,
    }
  : { vus, duration, thresholds: sloThresholds };

export default function () {
  const user = users[exec.vu.idInTest % users.length];
  const handlers = {
    http_reads: () => httpReads(user),
    websocket: () => websocket(user, false),
    chat: () => chat(user),
    nearby: () => nearby(user),
    together: () => together(user),
    notifications: () => notifications(user),
    mixed: () => mixed(user),
    reconnect_storm: () => websocket(user, true),
    worker_recovery: () => workerRecovery(user),
    realtime_e2e: () => realtimeE2E(user),
    together_match: () => togetherMatch(user),
  };
  const handler = handlers[scenario];
  if (!handler) throw new Error(`Unknown SCENARIO ${scenario}`);
  handler();
}

function httpReads(user) {
  const responses = http.batch([
    ["GET", `${httpBaseUrl}/health/live`],
    ["GET", `${httpBaseUrl}/users/me`, null, auth(user)],
    ["GET", `${httpBaseUrl}/nearby/summary`, null, auth(user)],
    ["GET", `${httpBaseUrl}/inbox?limit=30`, null, auth(user)],
  ]);
  responses.forEach((response) => check(response, { "HTTP read accepted": (r) => r.status < 500 }));
  sleep(0.2);
}

function websocket(user, storm) {
  const url = websocketBaseUrl.replace(/^http/, "ws") + "/ws";
  const response = ws.connect(url, { headers: { Authorization: `Bearer ${user.token}` } }, (socket) => {
    socket.on("open", () => socket.send(JSON.stringify({ type: "subscribe", channel: "inbox" })));
    socket.setTimeout(() => socket.close(), storm ? 1_000 + Math.random() * 2_000 : 20_000);
  });
  check(response, { "WS upgrade accepted": (r) => r && r.status === 101 });
  if (storm) sleep(Math.random() * 2);
}

function chat(user) {
  if (!user.threadId) throw new Error("chat scenario requires threadId fixtures");
  const body = JSON.stringify({ clientMessageId: `${exec.vu.idInTest}-${exec.scenario.iterationInTest}`, text: "Scale fixture message" });
  const response = http.post(`${httpBaseUrl}/threads/${user.threadId}/messages`, body, taggedJsonAuth(user, "chat"));
  check(response, { "chat accepted": (r) => r.status === 200 });
}

function nearby(user) {
  const response = http.get(`${httpBaseUrl}/nearby/feed?limit=30`, taggedAuth(user, "nearby"));
  check(response, { "Nearby bounded read": (r) => r.status === 200 });
  sleep(0.2);
}

function together(user) {
  const response = http.post(`${httpBaseUrl}/together/queue`, JSON.stringify({
    activity: exec.vu.idInTest % 2 ? "draw" : "story_sparks",
    location: { latitude: 45.815, longitude: 15.982, radiusKm: 25 },
  }), taggedJsonAuth(user, "together"));
  check(response, { "Together enqueue accepted": (r) => r.status < 500 });
  sleep(0.2);
}

function notifications(user) {
  const response = http.get(`${httpBaseUrl}/notifications?limit=50`, auth(user));
  check(response, { "notification read accepted": (r) => r.status === 200 });
  sleep(0.5);
}

function mixed(user) {
  const choice = exec.scenario.iterationInTest % 5;
  [httpReads, nearby, notifications, chat, together][choice](user);
}

function workerRecovery(user) {
  // The operator restarts worker replicas during this bounded DB-backed workload;
  // it never sends Expo device traffic.
  notifications(user);
}

function realtimeE2E(receiver) {
  if (!receiver.threadId || !receiver.senderToken) {
    throw new Error("realtime_e2e requires each fixture to contain token, senderToken, and threadId");
  }
  if (receiver.senderToken === receiver.token) {
    throw new Error("realtime_e2e senderToken and receiver token must belong to different users");
  }
  const clientMessageId = `scale-rt-${exec.vu.idInTest}-${Date.now()}`;
  let sendStartedAt = 0;
  let expectedMessageId = "";
  let received = false;
  let sendAccepted = false;
  const url = websocketBaseUrl.replace(/^http/, "ws") + "/ws";
  const response = ws.connect(url, { headers: { Authorization: `Bearer ${receiver.token}` } }, (socket) => {
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", channel: "thread", threadId: receiver.threadId }));
      socket.setTimeout(() => {
        sendStartedAt = Date.now();
        const send = http.post(
          `${httpBaseUrl}/threads/${receiver.threadId}/messages`,
          JSON.stringify({ clientMessageId, text: "Scale realtime fixture message" }),
          taggedJsonToken(receiver.senderToken, "chat_realtime_e2e"),
        );
        chatSendAckMs.add(send.timings.duration);
        const body = safeJson(send);
        expectedMessageId = body?.message?.id || "";
        sendAccepted = check(
          { response: send, body },
          {
            "realtime fixture message committed": (value) =>
              value.response.status === 200 &&
              typeof value.body?.message?.id === "string" &&
              value.body?.message?.clientMessageId === clientMessageId,
          },
        );
        if (!sendAccepted) {
          socket.close();
        }
      }, 250);
    });
    socket.on("message", (raw) => {
      const event = safeParse(raw);
      if (
        event?.type === "thread.message" &&
        event.threadId === receiver.threadId &&
        event.message?.clientMessageId === clientMessageId &&
        Boolean(expectedMessageId) && event.message?.id === expectedMessageId
      ) {
        received = true;
        realtimeDeliveryMs.add(Date.now() - sendStartedAt);
        socket.close();
      }
    });
    socket.setTimeout(() => socket.close(), 10_000);
  });
  check(response, { "realtime receiver WS upgraded": (r) => r && r.status === 101 });
  check({ received, sendAccepted }, {
    "matching thread.message received": (value) => value.received && value.sendAccepted,
  });
}

function togetherMatch(userA) {
  if (!userA.partnerToken) {
    throw new Error("together_match requires a unique partnerToken for each fixture");
  }
  if (userA.partnerToken === userA.token) {
    throw new Error("together_match token and partnerToken must belong to different users");
  }
  const activity = userA.togetherActivity || "draw";
  const location = userA.togetherLocation || { latitude: 45.815, longitude: 15.982, radiusKm: 5 };
  const body = JSON.stringify({ activity, location, preferredAgeRange: userA.preferredAgeRange });
  const startedAt = Date.now();
  const first = http.post(
    `${httpBaseUrl}/together/queue`,
    body,
    taggedJsonAuth(userA, "together_match"),
  );
  const second = http.post(
    `${httpBaseUrl}/together/queue`,
    body,
    taggedJsonToken(userA.partnerToken, "together_match"),
  );
  const firstBody = safeJson(first);
  const secondBody = safeJson(second);
  let firstEntry = firstBody?.entry;
  const secondEntry = secondBody?.entry;
  if (firstEntry?.status === "waiting" && firstEntry.id) {
    const refreshed = http.get(`${httpBaseUrl}/together/queue/${firstEntry.id}`, auth(userA));
    if (refreshed.status === 200) firstEntry = safeJson(refreshed)?.entry;
  }
  const matched = first.status === 200 && second.status === 200 &&
    firstEntry?.status === "matched" && secondEntry?.status === "matched" &&
    Boolean(firstEntry.sessionId) && firstEntry.sessionId === secondEntry.sessionId;
  if (matched) togetherMatchLatencyMs.add(Date.now() - startedAt);
  else knownCompatibleFalseNoMatch.add(1);
  check({ matched }, { "known-compatible pair shares one matched session": (value) => value.matched });

  if (!matched) {
    safeCancelQueue(userA.token, firstEntry);
    safeCancelQueue(userA.partnerToken, secondEntry);
  }
}

function safeCancelQueue(token, entry) {
  if (entry?.status !== "waiting" || !entry.id) return;
  http.del(
    `${httpBaseUrl}/together/queue/${entry.id}`,
    JSON.stringify({ cancelSource: "user_stop", cancelReason: "scale_harness_cleanup" }),
    jsonToken(token),
  );
}

function auth(user) { return { headers: { Authorization: `Bearer ${user.token}` } }; }
function jsonAuth(user) { return { headers: { ...auth(user).headers, "Content-Type": "application/json" } }; }
function taggedAuth(user, workload) { return { ...auth(user), tags: { workload } }; }
function taggedJsonAuth(user, workload) { return { ...jsonAuth(user), tags: { workload } }; }
function jsonToken(token) { return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }; }
function taggedJsonToken(token, workload) { return { ...jsonToken(token), tags: { workload } }; }

function safeJson(response) {
  try { return response.json(); } catch { return null; }
}

function safeParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function loadUsers() {
  const path = __ENV.USERS_FILE;
  if (!path) throw new Error("USERS_FILE is required (JSON array with test access tokens; no credentials in source)");
  const parsed = JSON.parse(open(path));
  if (!Array.isArray(parsed) || !parsed.length || parsed.some((item) => typeof item.token !== "string")) {
    throw new Error("USERS_FILE must be a non-empty array of token fixtures");
  }
  return parsed;
}

function integerEnv(name, fallback, min, max) {
  const value = Number.parseInt(__ENV[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be ${min}..${max}`);
  return value;
}

function guardTarget(value) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.hostname.endsWith(".test");
  if (!local && __ENV.CONFIRM_NON_PRODUCTION_TARGET !== "I_CONFIRM_THIS_IS_NOT_PRODUCTION") {
    throw new Error("Refusing non-local target without CONFIRM_NON_PRODUCTION_TARGET=I_CONFIRM_THIS_IS_NOT_PRODUCTION");
  }
  if (/prod|production/i.test(url.hostname)) throw new Error("Production-looking targets are always refused");
}
