import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import WebSocket from "ws";

const baseUrl = process.env.QA_API_URL ?? "http://127.0.0.1:4000";
const password = process.env.QA_LOGIN_PASSWORD;
if (!password) throw new Error("QA_LOGIN_PASSWORD is required");

const fixtures = {
  A: { id: "05000000-0000-4000-8000-000000000001", email: "amoria.audit05.restore.a@gmail.com" },
  B: { id: "05000000-0000-4000-8000-000000000002", email: "amoria.audit05.restore.b@gmail.com" },
  C: { id: "05000000-0000-4000-8000-000000000003", email: "amoria.audit05.restore.c@gmail.com" },
  D: { id: "05000000-0000-4000-8000-000000000004", email: "amoria.audit05.restore.d@gmail.com" },
  thread: "05000000-0000-4000-8000-000000000101",
  publicMedia: "05000000-0000-4000-8000-000000000501",
};

const latencies = [];
const errors = [];
let httpRequests = 0;
let websocketEvents = 0;

async function measured(label, path, options = {}) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, options);
    await response.arrayBuffer();
  } catch (error) {
    errors.push(`${label}:network_error`);
    return undefined;
  } finally {
    latencies.push(performance.now() - started);
    httpRequests += 1;
  }
  if (!response.ok) errors.push(`${label}:http_${response.status}`);
  return response;
}

async function login(fixture, index) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": `audit05-load-${index}` },
    body: JSON.stringify({ email: fixture.email, password }),
  });
  if (!response.ok) throw new Error(`load login failed with ${response.status}`);
  return (await response.json()).accessToken;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function openSocket(token) {
  const url = baseUrl.replace(/^http/u, "ws") + "/ws";
  const socket = new WebSocket(url, { headers: bearer(token) });
  socket.on("message", (raw) => {
    try {
      if (JSON.parse(raw.toString()).type === "thread.message") websocketEvents += 1;
    } catch {
      // Invalid server frames are counted by the HTTP/error assertions elsewhere.
    }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket open timeout")), 5_000);
    socket.once("open", () => { clearTimeout(timer); resolve(); });
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "subscribe", channel: "thread", threadId: fixtures.thread }));
  return socket;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

const tokens = Object.fromEntries(await Promise.all(
  Object.entries(fixtures)
    .filter(([, value]) => typeof value === "object")
    .map(async ([key, fixture], index) => [key, await login(fixture, index)]),
));
const socket = await openSocket(tokens.B);
const started = performance.now();

try {
  for (let round = 0; round < 20; round += 1) {
    const batch = [
      measured("profile", "/me", { headers: bearer(tokens.A) }),
      measured("peer_profile", `/users/${fixtures.A.id}/public`, { headers: bearer(tokens.B) }),
      measured("inbox", "/inbox?limit=30", { headers: bearer(tokens.A) }),
      measured("nearby", "/nearby/feed", { headers: bearer(tokens.C) }),
      measured("admin", "/admin/me", { headers: bearer(tokens.A) }),
      measured("public_media", `/media/public/${fixtures.publicMedia}`),
    ];
    if (round < 4) {
      batch.push(measured("message", `/threads/${fixtures.thread}/messages`, {
        method: "POST",
        headers: { ...bearer(tokens.A), "content-type": "application/json" },
        body: JSON.stringify({
          clientMessageId: randomUUID(),
          text: `Bounded release QA message ${round} ${randomUUID().slice(0, 8)}`,
        }),
      }));
    }
    await Promise.all(batch);
  }

  const uploadBody = new FormData();
  const uploadBytes = await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 55, g: 105, b: 160 } },
  }).webp({ quality: 82 }).toBuffer();
  uploadBody.set("file", new Blob([uploadBytes], { type: "image/webp" }), "bounded-load.webp");
  uploadBody.set("visibility", "public");
  await measured("small_media_upload", "/media/profile-photo", {
    method: "POST",
    headers: bearer(tokens.D),
    body: uploadBody,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
} finally {
  socket.close();
}

const durationMs = performance.now() - started;
const successCount = httpRequests - errors.length;
console.log(`BOUNDED_LOAD_HTTP_REQUESTS=${httpRequests}`);
console.log(`BOUNDED_LOAD_SUCCESS_RATE=${((successCount / httpRequests) * 100).toFixed(2)}%`);
console.log(`BOUNDED_LOAD_P50_MS=${percentile(latencies, 0.50).toFixed(2)}`);
console.log(`BOUNDED_LOAD_P95_MS=${percentile(latencies, 0.95).toFixed(2)}`);
console.log(`BOUNDED_LOAD_DURATION_MS=${durationMs.toFixed(2)}`);
console.log(`BOUNDED_LOAD_WS_EVENTS=${websocketEvents}`);
console.log(`BOUNDED_LOAD_ERRORS=${errors.length}`);
if (errors.length) {
  console.log(`BOUNDED_LOAD_ERROR_CLASSES=${[...new Set(errors)].join(",")}`);
  process.exitCode = 1;
}
