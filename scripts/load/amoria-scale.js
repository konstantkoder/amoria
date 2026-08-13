import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import exec from "k6/execution";

const baseUrl = (__ENV.BASE_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
guardTarget(baseUrl);
const scenario = __ENV.SCENARIO || "http_reads";
const vus = integerEnv("VUS", 10, 1, 50_000);
const duration = __ENV.DURATION || "30s";
const users = loadUsers();
const sloThresholds = {
  http_req_failed: ["rate<0.005"],
  http_req_duration: ["p(95)<300", "p(99)<1000"],
};
if (scenario === "nearby") sloThresholds["http_req_duration{workload:nearby}"] = ["p(95)<500"];
if (scenario === "chat") sloThresholds["http_req_duration{workload:chat}"] = ["p(95)<300"];
if (scenario === "together") sloThresholds["http_req_duration{workload:together}"] = ["p(95)<800"];

export const options = {
  vus,
  duration,
  thresholds: sloThresholds,
};

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
  };
  const handler = handlers[scenario];
  if (!handler) throw new Error(`Unknown SCENARIO ${scenario}`);
  handler();
}

function httpReads(user) {
  const responses = http.batch([
    ["GET", `${baseUrl}/health/live`],
    ["GET", `${baseUrl}/users/me`, null, auth(user)],
    ["GET", `${baseUrl}/nearby/summary`, null, auth(user)],
    ["GET", `${baseUrl}/inbox?limit=30`, null, auth(user)],
  ]);
  responses.forEach((response) => check(response, { "HTTP read accepted": (r) => r.status < 500 }));
  sleep(0.2);
}

function websocket(user, storm) {
  const url = baseUrl.replace(/^http/, "ws") + "/ws";
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
  const response = http.post(`${baseUrl}/threads/${user.threadId}/messages`, body, taggedJsonAuth(user, "chat"));
  check(response, { "chat accepted": (r) => r.status === 200 });
}

function nearby(user) {
  const response = http.get(`${baseUrl}/nearby/feed?limit=30`, taggedAuth(user, "nearby"));
  check(response, { "Nearby bounded read": (r) => r.status === 200 });
  sleep(0.2);
}

function together(user) {
  const response = http.post(`${baseUrl}/together/queue`, JSON.stringify({
    activity: exec.vu.idInTest % 2 ? "draw" : "story_sparks",
    location: { latitude: 45.815, longitude: 15.982, radiusKm: 25 },
  }), taggedJsonAuth(user, "together"));
  check(response, { "Together enqueue accepted": (r) => r.status < 500 });
  sleep(0.2);
}

function notifications(user) {
  const response = http.get(`${baseUrl}/notifications?limit=50`, auth(user));
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

function auth(user) { return { headers: { Authorization: `Bearer ${user.token}` } }; }
function jsonAuth(user) { return { headers: { ...auth(user).headers, "Content-Type": "application/json" } }; }
function taggedAuth(user, workload) { return { ...auth(user), tags: { workload } }; }
function taggedJsonAuth(user, workload) { return { ...jsonAuth(user), tags: { workload } }; }

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
