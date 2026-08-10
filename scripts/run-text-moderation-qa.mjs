import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const installRoot = process.env.TEXT_MODERATION_INSTALL_ROOT?.trim()
  || "F:\\Dev\\Amoria-Models\\text-moderation-v1";
const python = process.env.TEXT_MODERATION_PYTHON?.trim()
  || `${installRoot}\\Scripts\\python.exe`;
const modelDir = process.env.TEXT_MODERATION_MODEL_DIR?.trim()
  || `${installRoot}\\model`;

const cases = [
  { id: "normal-en-1", language: "EN", category: "normal", text: "Hi, how was your day?" },
  { id: "normal-en-2", language: "EN", category: "normal", text: "Would you like to meet for coffee this weekend?" },
  { id: "normal-ru-1", language: "RU", category: "normal", text: "Привет, как прошёл твой день?" },
  { id: "normal-ru-2", language: "RU", category: "normal", text: "Мне понравилась твоя фотография, как настроение?" },
  { id: "normal-hr-1", language: "HR", category: "normal", text: "Bok, kako ti je prošao dan?" },
  { id: "normal-hr-2", language: "HR", category: "normal", text: "Želiš li popiti kavu ovaj vikend?" },
  { id: "flirt-en", language: "EN", category: "mild_flirt", text: "You have a lovely smile 😊 I would enjoy getting to know you." },
  { id: "flirt-ru", language: "RU", category: "mild_flirt", text: "У тебя красивая улыбка 😊 Мне приятно с тобой общаться." },
  { id: "flirt-hr", language: "HR", category: "mild_flirt", text: "Imaš prekrasan osmijeh 😊 Volio bih te bolje upoznati." },
  { id: "risky-en-insult", language: "EN", category: "lawful_synthetic_risky", text: "You are a disgusting idiot and nobody likes you." },
  { id: "risky-ru-insult", language: "RU", category: "lawful_synthetic_risky", text: "Ты отвратительный идиот, и никто тебя не любит." },
  { id: "risky-hr-insult", language: "HR", category: "lawful_synthetic_risky", text: "Ti si odvratan idiot i nitko te ne voli." },
];

const child = spawn(python, ["moderation-worker/text_worker.py"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    TEXT_MODERATION_MODEL_DIR: modelDir,
  },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

const pending = new Map();
let readyResolve;
let readyReject;
const readyPromise = new Promise((resolve, reject) => {
  readyResolve = resolve;
  readyReject = reject;
});
let stderr = "";

createInterface({ input: child.stdout }).on("line", (line) => {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    readyReject(new Error("worker_invalid_json"));
    return;
  }
  if (value.event === "ready") {
    readyResolve(value);
    return;
  }
  const deferred = pending.get(value.requestId);
  if (deferred) {
    pending.delete(value.requestId);
    value.ok ? deferred.resolve(value) : deferred.reject(new Error(value.error || "classifier_failed"));
  }
});

child.stderr.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-2_000);
});
child.on("error", readyReject);
child.on("exit", (code) => {
  if (code && pending.size === 0) readyReject(new Error(stderr.trim() || `worker_exit_${code}`));
  for (const deferred of pending.values()) deferred.reject(new Error(`worker_exit_${code}`));
  pending.clear();
});

function classify(item, sequence) {
  const requestId = `qa-${sequence}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ requestId, messageId: item.id, text: item.text })}\n`, "utf8");
  });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

try {
  let startupTimer;
  const startupTimeout = new Promise((_, reject) => {
    startupTimer = setTimeout(() => reject(new Error("worker_start_timeout")), 180_000);
  });
  const ready = await Promise.race([
    readyPromise,
    startupTimeout,
  ]);
  clearTimeout(startupTimer);
  const results = [];
  let sequence = 0;
  for (const item of cases) {
    const response = await classify(item, sequence++);
    results.push({
      id: item.id,
      language: item.language,
      category: item.category,
      durationMs: response.durationMs,
      signals: response.signals,
      peakRssBytes: response.peakRssBytes,
    });
  }

  const latencySamples = [];
  for (let index = 0; index < 20; index += 1) {
    const response = await classify(cases[index % 6], sequence++);
    latencySamples.push(response.durationMs);
  }
  const peakRssBytes = Math.max(
    ready.peakRssBytes || 0,
    ...results.map((result) => result.peakRssBytes || 0),
  );
  const output = {
    generatedAt: new Date().toISOString(),
    runtime: "onnxruntime CPUExecutionProvider; one long-lived worker; sequential; max 2 intra-op threads",
    modelVersion: ready.modelVersion,
    modelSizeBytes: ready.modelSizeBytes,
    loadMs: ready.loadMs,
    peakRssBytes,
    sampleCount: latencySamples.length,
    meanInferenceMs: latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length,
    p95InferenceMs: percentile(latencySamples, 0.95),
    cases: results,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  child.stdin.end();
  child.kill();
}
