type SafeMetricValue = string | number | boolean | null | undefined;
type SafeMetadata = Record<string, SafeMetricValue>;

const STARTUP_WINDOW_MS = 30 * 1000;
const startupStartedAtMs = Date.now();
const apiRequestCounts = new Map<string, number>();
const mediaProbeAggregate = {
  count: 0,
  failedCount: 0,
  totalDurationMs: 0,
};

function diagnosticsEnabled() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function elapsedMs() {
  return Math.max(Date.now() - startupStartedAtMs, 0);
}

function inStartupWindow() {
  return elapsedMs() <= STARTUP_WINDOW_MS;
}

function roundMs(value: number) {
  return Math.max(Math.round(value), 0);
}

function compactMetadata(metadata: SafeMetadata = {}) {
  const compact: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      compact[key] = value;
    }
  }
  return compact;
}

function writeStartupDiagnostic(
  level: "info" | "warn",
  event: string,
  metadata: SafeMetadata = {}
) {
  if (!diagnosticsEnabled()) return;
  const payload = {
    elapsedMs: roundMs(elapsedMs()),
    ...compactMetadata(metadata),
  };
  if (level === "warn") {
    console.warn(`[startup] ${event}`, payload);
    return;
  }
  console.info(`[startup] ${event}`, payload);
}

function sanitizeApiPath(path: string) {
  const pathOnly = String(path ?? "").split(/[?#]/, 1)[0] || "/";
  return pathOnly
    .replace(/\/media\/(public|locked)\/[^/]+/g, "/media/$1/:mediaId")
    .replace(/\/users\/by-amoria-id\/[^/]+/g, "/users/by-amoria-id/:amoriaId")
    .replace(/\/users\/[^/]+\/locked-gallery\/unlock/g, "/users/:userId/locked-gallery/unlock")
    .replace(/\/users\/[^/]+\/public/g, "/users/:userId/public")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      ":uuid"
    )
    .replace(/\bAM-?[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}\b/gi, ":amoriaId");
}

export function markStartupEvent(event: string, metadata: SafeMetadata = {}) {
  if (!inStartupWindow()) return;
  writeStartupDiagnostic("info", event, metadata);
}

export function markStartupTiming(
  event: string,
  startedAtMs: number,
  metadata: SafeMetadata = {}
) {
  if (!inStartupWindow()) return;
  writeStartupDiagnostic("info", event, {
    durationMs: roundMs(Date.now() - startedAtMs),
    ...metadata,
  });
}

export function markStartupTimingFromStart(event: string, metadata: SafeMetadata = {}) {
  writeStartupDiagnostic("info", event, {
    durationMs: roundMs(elapsedMs()),
    ...metadata,
  });
}

export function startStartupSpan(event: string, metadata: SafeMetadata = {}) {
  const startedAtMs = Date.now();
  let finished = false;
  return (finishMetadata: SafeMetadata = {}) => {
    if (finished) return;
    finished = true;
    markStartupTiming(event, startedAtMs, {
      ...metadata,
      ...finishMetadata,
    });
  };
}

export function recordStartupApiRequest(input: {
  method: string;
  path: string;
  status?: number;
  durationMs: number;
}) {
  if (!inStartupWindow()) return;
  const request = `${input.method.toUpperCase()} ${sanitizeApiPath(input.path)}`;
  const count = (apiRequestCounts.get(request) ?? 0) + 1;
  apiRequestCounts.set(request, count);

  writeStartupDiagnostic("info", "api.request", {
    request,
    status: input.status ?? null,
    durationMs: roundMs(input.durationMs),
    count,
  });

  if (count > 1) {
    writeStartupDiagnostic("warn", "api.duplicate_request", {
      request,
      count,
    });
  }
}

export function recordStartupMediaProbe(input: {
  ok: boolean;
  urlKind: string;
  httpStatus?: number;
  contentType?: string;
  errorCode?: string;
  durationMs: number;
}) {
  if (!inStartupWindow()) return;
  mediaProbeAggregate.count += 1;
  mediaProbeAggregate.totalDurationMs += input.durationMs;
  if (!input.ok) {
    mediaProbeAggregate.failedCount += 1;
  }

  writeStartupDiagnostic("info", "media.probe_aggregate", {
    count: mediaProbeAggregate.count,
    failedCount: mediaProbeAggregate.failedCount,
    averageDurationMs: roundMs(mediaProbeAggregate.totalDurationMs / mediaProbeAggregate.count),
    lastDurationMs: roundMs(input.durationMs),
    lastUrlKind: input.urlKind,
    lastHttpStatus: input.httpStatus ?? null,
    lastContentType: input.contentType ?? null,
    lastErrorCode: input.errorCode ?? null,
  });
}

export function safeStartupErrorMetadata(error: unknown): SafeMetadata {
  if (!error || typeof error !== "object") {
    return { errorType: typeof error };
  }

  const candidate = error as {
    name?: unknown;
    status?: unknown;
    code?: unknown;
  };
  return {
    errorName: typeof candidate.name === "string" ? candidate.name : "Error",
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
  };
}
