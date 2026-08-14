import { createServer, type Server } from "node:http";
import { env } from "../config/env";
import { incrementMetric, renderMetrics, setMetric } from "../observability/metrics";

type LoopHealth = {
  consecutiveFailures: number;
  lastFailureAt?: string;
  lastSuccessAt?: string;
};

const loopHealth = new Map<string, LoopHealth>();
let server: Server | undefined;

export function recordWorkerLoopSuccess(worker: string): void {
  const state = loopHealth.get(worker) ?? { consecutiveFailures: 0 };
  state.consecutiveFailures = 0;
  state.lastSuccessAt = new Date().toISOString();
  loopHealth.set(worker, state);
  setMetric("amoria_worker_loop_consecutive_failures", 0, { worker });
}

export function recordWorkerLoopFailure(worker: string): void {
  const state = loopHealth.get(worker) ?? { consecutiveFailures: 0 };
  state.consecutiveFailures += 1;
  state.lastFailureAt = new Date().toISOString();
  loopHealth.set(worker, state);
  incrementMetric("amoria_worker_loop_failures_total", { worker });
  setMetric("amoria_worker_loop_consecutive_failures", state.consecutiveFailures, { worker });
}

export async function startWorkerObservabilityServer(): Promise<void> {
  if (server) return;
  server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health/live") {
      const unhealthy = [...loopHealth.entries()]
        .filter(([, state]) => state.consecutiveFailures >= 3)
        .map(([worker]) => worker);
      const ok = unhealthy.length === 0;
      response.writeHead(ok ? 200 : 503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok, unhealthyWorkers: unhealthy }));
      return;
    }

    if (request.method === "GET" && request.url === "/internal/metrics") {
      if (!env.METRICS_TOKEN || request.headers.authorization !== `Bearer ${env.METRICS_TOKEN}`) {
        response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      response.end(renderMetrics());
      return;
    }

    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    const current = server!;
    const onError = (error: Error) => {
      current.off("listening", onListening);
      server = undefined;
      reject(error);
    };
    const onListening = () => {
      current.off("error", onError);
      resolve();
    };
    current.once("error", onError);
    current.once("listening", onListening);
    current.listen(env.WORKER_METRICS_PORT, env.WORKER_METRICS_HOST);
  });
}

export async function stopWorkerObservabilityServer(): Promise<void> {
  const current = server;
  server = undefined;
  if (!current) return;
  await new Promise<void>((resolve, reject) => {
    current.close((error) => error ? reject(error) : resolve());
  });
}

export function __resetWorkerHealthForTests(): void {
  loopHealth.clear();
}
