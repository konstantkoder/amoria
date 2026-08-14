import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Counter, Trend } from "k6/metrics";

const httpBaseUrl = (__ENV.HTTP_BASE_URL || __ENV.BASE_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const websocketBaseUrl = (__ENV.WS_BASE_URL || __ENV.BASE_URL || httpBaseUrl).replace(/\/$/, "");
guardTarget(httpBaseUrl);
guardTarget(websocketBaseUrl);
const scenario = __ENV.SCENARIO || "http_reads";
const duration = __ENV.DURATION || (scenario === "websocket_steady" ? "5m" : "30s");
const websocketRampDuration = __ENV.WS_RAMP_DURATION || "30s";
const vus = integerEnv("VUS", 10, 1, 50_000);
const concurrentClients = integerEnv("CONCURRENT_CLIENTS", vus, 1, 50_000);
const loadProfile = (__ENV.LOAD_PROFILE || "realistic").toLowerCase();
if (!["realistic", "stress"].includes(loadProfile)) throw new Error("LOAD_PROFILE must be realistic or stress");
const users = loadUsers();
const chatSendAckMs = new Trend("chat_send_ack_ms", true);
const realtimeDeliveryMs = new Trend("realtime_delivery_ms", true);
const togetherMatchLatencyMs = new Trend("together_match_latency_ms", true);
const turnBasedMatchLatencyMs = new Trend("turn_based_match_latency_ms", true);
const knownCompatibleFalseNoMatch = new Counter("known_compatible_false_no_match_total");
const subscriptionAckFailures = new Counter("subscription_ack_failures_total");
const sloThresholds = {
  checks: ["rate==1"],
  http_req_failed: ["rate<0.005"],
  http_req_duration: ["p(95)<300", "p(99)<1000"],
};
if (scenario === "nearby") sloThresholds["http_req_duration{workload:nearby}"] = ["p(95)<500"];
if (scenario === "chat") sloThresholds["http_req_duration{workload:chat}"] = ["p(95)<300"];
if (scenario === "together") sloThresholds["http_req_duration{workload:together}"] = ["p(95)<800"];
if (scenario === "mixed") {
  sloThresholds["http_req_duration{workload:nearby}"] = ["p(95)<500"];
  sloThresholds["http_req_duration{workload:chat}"] = ["p(95)<300"];
  sloThresholds["http_req_duration{workload:together}"] = ["p(95)<800"];
}
if (scenario === "realtime_e2e") sloThresholds.realtime_delivery_ms = ["p(95)<500"];
if (scenario === "realtime_e2e") sloThresholds.subscription_ack_failures_total = ["count==0"];
if (scenario === "websocket_steady") sloThresholds.subscription_ack_failures_total = ["count==0"];
if (scenario === "together_match") {
  sloThresholds.together_match_latency_ms = ["p(95)<800"];
  sloThresholds.known_compatible_false_no_match_total = ["count==0"];
}
if (scenario === "turn_based") {
  sloThresholds.turn_based_match_latency_ms = ["p(95)<1000"];
  sloThresholds.known_compatible_false_no_match_total = ["count==0"];
}

const pairedCorrectnessScenario = scenario === "realtime_e2e" || scenario === "together_match" || scenario === "turn_based";
const reconnectScenario = scenario === "reconnect_storm";
export const options = pairedCorrectnessScenario ? {
      scenarios: {
        paired_correctness: { executor: "per-vu-iterations", vus, iterations: 1, maxDuration: duration },
      },
      thresholds: sloThresholds,
      tags: { load_profile: loadProfile, generator_instance: __ENV.GENERATOR_INSTANCE || "local-0" },
    } : scenario === "websocket_steady" ? {
      scenarios: {
        websocket_steady: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: websocketRampDuration, target: concurrentClients },
            { duration, target: concurrentClients },
          ],
          gracefulRampDown: __ENV.GRACEFUL_STOP || "2m",
          gracefulStop: __ENV.GRACEFUL_STOP || "2m",
        },
      },
      thresholds: sloThresholds,
      tags: { load_profile: loadProfile, generator_instance: __ENV.GENERATOR_INSTANCE || "local-0" },
    } : reconnectScenario ? {
      scenarios: {
        reconnect_storm: { executor: "constant-vus", vus: concurrentClients, duration },
      },
      thresholds: sloThresholds,
      tags: { load_profile: loadProfile, generator_instance: __ENV.GENERATOR_INSTANCE || "local-0" },
    } : {
      scenarios: {
        [scenario]: {
          executor: "constant-arrival-rate",
          rate: targetIterationsPerSecond(scenario),
          timeUnit: "1s",
          duration,
          preAllocatedVUs: integerEnv("PRE_ALLOCATED_VUS", Math.min(1_000, Math.max(20, targetIterationsPerSecond(scenario))), 1, 50_000),
          maxVUs: integerEnv("MAX_VUS", Math.min(50_000, Math.max(100, targetIterationsPerSecond(scenario) * 4)), 1, 50_000),
        },
      },
      thresholds: { ...sloThresholds, dropped_iterations: ["count==0"] },
      tags: { load_profile: loadProfile, generator_instance: __ENV.GENERATOR_INSTANCE || "local-0" },
    };

export default function () {
  const user = users[exec.vu.idInTest % users.length];
  const handlers = {
    http_reads: () => httpReads(user),
    websocket_steady: () => websocket(user, false),
    chat: () => chat(user),
    nearby: () => nearby(user),
    together: () => together(user),
    notifications: () => notifications(user),
    mixed: () => mixed(user),
    reconnect_storm: () => websocket(user, true),
    worker_recovery: () => workerRecovery(user),
    realtime_e2e: () => realtimeE2E(user),
    together_match: () => togetherMatch(user),
    turn_based: () => turnBased(user),
  };
  const handler = handlers[scenario];
  if (!handler) throw new Error(`Unknown SCENARIO ${scenario}`);
  handler();
}

function httpReads(user) {
  const urls = ["/me", "/nearby/summary", "/inbox?limit=30"];
  const response = http.get(`${httpBaseUrl}${urls[exec.scenario.iterationInTest % urls.length]}`, auth(user));
  check(response, { "HTTP read accepted": (r) => r.status === 200 });
}

function websocket(user, storm) {
  const url = websocketBaseUrl.replace(/^http/, "ws") + "/ws";
  let subscribed = false;
  const response = ws.connect(url, { headers: { Authorization: `Bearer ${user.token}` } }, (socket) => {
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", channel: "inbox" }));
      if (!storm) socket.setTimeout(() => {
        if (subscribed) return;
        subscriptionAckFailures.add(1);
        socket.close();
      }, integerEnv("SUBSCRIPTION_ACK_TIMEOUT_MS", 10_000, 100, 30_000));
    });
    socket.on("message", (raw) => {
      const event = safeParse(raw);
      if (event?.type === "subscribed" && event.channel === "inbox") subscribed = true;
    });
    socket.setTimeout(
      () => socket.close(),
      storm ? 1_000 + Math.random() * 2_000 : integerEnv("WS_HOLD_DURATION_MS", durationToMs(duration) + 60_000, 60_000, 86_400_000),
    );
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
}

function together(user) {
  const response = http.post(`${httpBaseUrl}/together/queue`, JSON.stringify({
    activity: exec.vu.idInTest % 2 ? "draw" : "story_sparks",
    location: { latitude: 45.815, longitude: 15.982, radiusKm: 25 },
  }), taggedJsonAuth(user, "together"));
  check(response, { "Together enqueue accepted": (r) => r.status < 500 });
}

function notifications(user) {
  const response = http.get(`${httpBaseUrl}/notifications?limit=50`, auth(user));
  check(response, { "notification read accepted": (r) => r.status === 200 });
}

function mixed(user) {
  // Preserve the independently measured steady-load proportions:
  // 300 reads, 100 Nearby, 100 notifications, 50 chat, 25 Together per 575.
  const choice = exec.scenario.iterationInTest % 23;
  if (choice < 12) return httpReads(user);
  if (choice < 16) return nearby(user);
  if (choice < 20) return notifications(user);
  if (choice < 22) return chat(user);
  return together(user);
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
  let subscribed = false;
  let sendIssued = false;
  const url = websocketBaseUrl.replace(/^http/, "ws") + "/ws";
  const response = ws.connect(url, { headers: { Authorization: `Bearer ${receiver.token}` } }, (socket) => {
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", channel: "thread", threadId: receiver.threadId }));
      socket.setTimeout(() => {
        if (subscribed) return;
        subscriptionAckFailures.add(1);
        socket.close();
      }, integerEnv("SUBSCRIPTION_ACK_TIMEOUT_MS", 5_000, 100, 30_000));
    });
    socket.on("message", (raw) => {
      const event = safeParse(raw);
      if (
        !sendIssued &&
        event?.type === "subscribed" &&
        event.channel === "thread" &&
        event.threadId === receiver.threadId
      ) {
        subscribed = true;
        sendIssued = true;
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
        return;
      }
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
    "matching thread.message received after subscription ack": (value) => subscribed && value.received && value.sendAccepted,
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

function turnBased(userA) {
  if (!userA.partnerToken || userA.partnerToken === userA.token) {
    throw new Error("turn_based requires distinct token and partnerToken fixtures");
  }
  const location = userA.togetherLocation || { latitude: 45.815, longitude: 15.982, radiusKm: 5 };
  const requestPrefix = `scale-turn-${exec.vu.idInTest}-${Date.now()}`;
  const startedAt = Date.now();
  const starter = http.post(
    `${httpBaseUrl}/together/turn-based/start`,
    JSON.stringify({ location, clientRequestId: `${requestPrefix}-starter` }),
    taggedJsonAuth(userA, "turn_based"),
  );
  const starterMoment = safeJson(starter)?.moment;
  if (starter.status !== 200 || !starterMoment?.id || !starterMoment?.drawSessionId) {
    knownCompatibleFalseNoMatch.add(1);
    check(starter, { "Turn-Based starter created": (r) => r.status === 200 });
    return;
  }
  const stroke = http.post(
    `${httpBaseUrl}/together/sessions/${starterMoment.drawSessionId}/events`,
    JSON.stringify({
      clientEventId: `${requestPrefix}-stroke`,
      type: "stroke_batch",
      payload: {
        uid: userA.userId,
        strokes: [{ id: `${requestPrefix}-s`, tool: "draw", color: "#ffffff", width: 3,
          points: [{ x: 0.1, y: 0.1, t: 0 }, { x: 0.2, y: 0.2, t: 1 }] }],
      },
    }),
    taggedJsonAuth(userA, "turn_based"),
  );
  const submitted = http.post(
    `${httpBaseUrl}/together/turn-based/moments/${starterMoment.id}/submit-draw`,
    JSON.stringify({ clientActionId: `${requestPrefix}-submit` }),
    taggedJsonAuth(userA, "turn_based"),
  );
  const partner = http.post(
    `${httpBaseUrl}/together/turn-based/start`,
    JSON.stringify({ location, clientRequestId: `${requestPrefix}-partner` }),
    taggedJsonToken(userA.partnerToken, "turn_based"),
  );
  const partnerMoment = safeJson(partner)?.moment;
  const matched = stroke.status === 200 && submitted.status === 200 && partner.status === 200 &&
    partnerMoment?.id === starterMoment.id && partnerMoment?.role === "partner";
  if (matched) {
    turnBasedMatchLatencyMs.add(Date.now() - startedAt);
    const lease = http.post(
      `${httpBaseUrl}/together/turn-based/moments/${starterMoment.id}/lease`,
      "{}",
      taggedJsonToken(userA.partnerToken, "turn_based"),
    );
    check(lease, { "Turn-Based partner lease renewed": (r) => r.status === 200 });
  } else {
    knownCompatibleFalseNoMatch.add(1);
  }
  check({ matched }, { "known-compatible Turn-Based pair shares one moment": (value) => value.matched });
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
  return new SharedArray(`scale-users:${path}`, () => {
    const parsed = JSON.parse(open(path));
    if (!Array.isArray(parsed) || !parsed.length || parsed.some((item) => typeof item.token !== "string")) {
      throw new Error("USERS_FILE must be a non-empty array of token fixtures");
    }
    return parsed;
  });
}

function integerEnv(name, fallback, min, max) {
  const value = Number.parseInt(__ENV[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be ${min}..${max}`);
  return value;
}

function targetIterationsPerSecond(selectedScenario) {
  const defaults = {
    http_reads: ["HTTP_TARGET_RPS", 300],
    chat: ["CHAT_MESSAGES_PER_SECOND", 50],
    nearby: ["NEARBY_REQUESTS_PER_SECOND", 100],
    together: ["TOGETHER_ENQUEUE_PER_SECOND", 25],
    notifications: ["HTTP_TARGET_RPS", 100],
    mixed: ["HTTP_TARGET_RPS", 750],
    worker_recovery: ["HTTP_TARGET_RPS", 100],
  };
  const setting = defaults[selectedScenario];
  if (!setting) return integerEnv("HTTP_TARGET_RPS", 100, 1, 1_000_000);
  const base = integerEnv(setting[0], setting[1], 1, 1_000_000);
  const multiplier = loadProfile === "stress"
    ? integerEnv("STRESS_MULTIPLIER", 4, 2, 100)
    : 1;
  return base * multiplier;
}

function durationToMs(value) {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value);
  if (!match) throw new Error("DURATION must use ms, s, m, or h units");
  const factors = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };
  return Number(match[1]) * factors[match[2]];
}

function guardTarget(value) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:]+)(?::\d+)?(?:\/|$)/i.exec(value);
  if (!match) throw new Error("Load target must be an absolute URL");
  const hostname = match[1].replace(/^\[|\]$/g, "").toLowerCase();
  const local = ["localhost", "127.0.0.1", "::1"].includes(hostname) || hostname.endsWith(".test");
  if (!local && __ENV.CONFIRM_NON_PRODUCTION_TARGET !== "I_CONFIRM_THIS_IS_NOT_PRODUCTION") {
    throw new Error("Refusing non-local target without CONFIRM_NON_PRODUCTION_TARGET=I_CONFIRM_THIS_IS_NOT_PRODUCTION");
  }
  if (/prod|production/i.test(hostname)) throw new Error("Production-looking targets are always refused");
}
