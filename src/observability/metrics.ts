import { monitorEventLoopDelay } from "node:perf_hooks";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { isWebSocketUpgradeRequest } from "../common/http-admission";
import { env } from "../config/env";
import { dbPoolErrorCount, pool } from "../db/client";

type Labels = Record<string, string | number>;
type Sample = { value: number; labels: Labels };

const counters = new Map<string, Map<string, Sample>>();
const gauges = new Map<string, Map<string, Sample>>();
const histogramBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const histograms = new Map<string, Map<string, { labels: Labels; count: number; sum: number; buckets: number[] }>>();
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();
let httpInFlight = 0;
const metricInFlightRequests = new WeakSet<object>();

function releaseHttpInFlight(request: object): void {
  if (!metricInFlightRequests.delete(request)) return;
  httpInFlight = Math.max(0, httpInFlight - 1);
  setMetric("amoria_http_in_flight", httpInFlight);
}

function labelKey(labels: Labels): string {
  return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("|");
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (!entries.length) return "";
  return `{${entries.map(([key, value]) => `${key}="${String(value).replace(/[\\"\n]/g, "_")}"`).join(",")}}`;
}

function validMetricName(name: string): void {
  if (!/^amoria_[a-z0-9_:]+$/.test(name)) throw new Error("invalid_metric_name");
}

export function incrementMetric(name: string, labels: Labels = {}, amount = 1): void {
  validMetricName(name);
  const family = counters.get(name) ?? new Map<string, Sample>();
  const key = labelKey(labels);
  const sample = family.get(key) ?? { value: 0, labels };
  sample.value += amount;
  family.set(key, sample);
  counters.set(name, family);
}

export function setMetric(name: string, value: number, labels: Labels = {}): void {
  validMetricName(name);
  const family = gauges.get(name) ?? new Map<string, Sample>();
  family.set(labelKey(labels), { value, labels });
  gauges.set(name, family);
}

export function observeMetric(name: string, seconds: number, labels: Labels = {}): void {
  validMetricName(name);
  const family = histograms.get(name) ?? new Map();
  const key = labelKey(labels);
  const sample = family.get(key) ?? { labels, count: 0, sum: 0, buckets: histogramBuckets.map(() => 0) };
  sample.count += 1;
  sample.sum += seconds;
  histogramBuckets.forEach((boundary, index) => {
    if (seconds <= boundary) sample.buckets[index] += 1;
  });
  family.set(key, sample);
  histograms.set(name, family);
}

export function recordPotentialDatabaseFailure(error: unknown): void {
  const current = error as { code?: unknown; message?: unknown; cause?: unknown } | undefined;
  const code = typeof current?.code === "string" ? current.code : "";
  const message = typeof current?.message === "string" ? current.message.toLowerCase() : "";
  const looksLikeDatabaseFailure =
    /^08/.test(code) ||
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "57P01", "57P02", "57P03"].includes(code) ||
    /connection timeout|timeout acquiring|connection terminated|database system/.test(message);
  if (!looksLikeDatabaseFailure) {
    if (current?.cause && current.cause !== error) recordPotentialDatabaseFailure(current.cause);
    return;
  }
  const timeout = code === "ETIMEDOUT" || /connection timeout|timeout acquiring/.test(message);
  incrementMetric("amoria_db_operation_errors_total", { kind: timeout ? "connection_timeout" : "connection" });
  if (timeout) incrementMetric("amoria_db_connection_timeouts_total");
}

function routeLabel(request: FastifyRequest): string {
  return request.routeOptions?.url ?? "unmatched";
}

export function registerMetrics(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    (request as FastifyRequest & { scaleStartedAt?: bigint }).scaleStartedAt = process.hrtime.bigint();
    incrementMetric("amoria_http_requests_total", { route: routeLabel(request), method: request.method });
    if (isWebSocketUpgradeRequest(request)) return;
    httpInFlight += 1;
    metricInFlightRequests.add(request);
    setMetric("amoria_http_in_flight", httpInFlight);
  });
  app.addHook("onResponse", async (request, reply) => {
    releaseHttpInFlight(request);
    incrementMetric("amoria_http_responses_total", {
      route: routeLabel(request),
      method: request.method,
      status_class: `${Math.floor(reply.statusCode / 100)}xx`,
    });
    const startedAt = (request as FastifyRequest & { scaleStartedAt?: bigint }).scaleStartedAt;
    if (startedAt) observeMetric(
      "amoria_http_request_duration_seconds",
      Number(process.hrtime.bigint() - startedAt) / 1e9,
      { route: routeLabel(request), method: request.method },
    );
    if (startedAt) {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const route = routeLabel(request);
      if (route.startsWith("/nearby")) observeMetric("amoria_nearby_request_duration_seconds", seconds);
      if (route.includes("/messages") && request.method === "POST") {
        observeMetric("amoria_chat_send_duration_seconds", seconds);
        if (reply.statusCode < 300) incrementMetric("amoria_chat_messages_created_total");
      }
      if (route.startsWith("/together")) observeMetric("amoria_together_request_duration_seconds", seconds);
    }
  });
  app.addHook("onError", async (request) => { releaseHttpInFlight(request); });
  app.addHook("onRequestAbort", async (request) => { releaseHttpInFlight(request); });

  app.get("/internal/metrics", async (request, reply) => {
    if (!env.METRICS_TOKEN || request.headers.authorization !== `Bearer ${env.METRICS_TOKEN}`) {
      return reply.status(404).send({ error: "not_found" });
    }
    return reply.type("text/plain; version=0.0.4; charset=utf-8").send(renderMetrics());
  });
}

export function renderMetrics(): string {
  const memory = process.memoryUsage();
  setMetric("amoria_process_resident_memory_bytes", memory.rss);
  setMetric("amoria_process_heap_used_bytes", memory.heapUsed);
  setMetric("amoria_node_event_loop_delay_seconds", Number(eventLoopDelay.mean) / 1e9);
  setMetric("amoria_db_pool_total", pool.totalCount);
  setMetric("amoria_db_pool_idle", pool.idleCount);
  setMetric("amoria_db_pool_waiting", pool.waitingCount);
  setMetric("amoria_db_pool_errors_total", dbPoolErrorCount);

  const lines: string[] = [];
  for (const [name, family] of counters) {
    lines.push(`# TYPE ${name} counter`);
    for (const sample of family.values()) lines.push(`${name}${formatLabels(sample.labels)} ${sample.value}`);
  }
  for (const [name, family] of gauges) {
    lines.push(`# TYPE ${name} gauge`);
    for (const sample of family.values()) lines.push(`${name}${formatLabels(sample.labels)} ${Number.isFinite(sample.value) ? sample.value : 0}`);
  }
  for (const [name, family] of histograms) {
    lines.push(`# TYPE ${name} histogram`);
    for (const sample of family.values()) {
      histogramBuckets.forEach((boundary, index) => lines.push(
        `${name}_bucket${formatLabels({ ...sample.labels, le: boundary })} ${sample.buckets[index]}`,
      ));
      lines.push(`${name}_bucket${formatLabels({ ...sample.labels, le: "+Inf" })} ${sample.count}`);
      lines.push(`${name}_sum${formatLabels(sample.labels)} ${sample.sum}`);
      lines.push(`${name}_count${formatLabels(sample.labels)} ${sample.count}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
