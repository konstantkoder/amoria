export const DEFAULT_JSON_TIMEOUT_MS = 15_000;
export const AUTH_REFRESH_TIMEOUT_MS = 12_000;
export const MEDIA_REQUEST_TIMEOUT_MS = 60_000;

export class RequestTimeoutError extends Error {
  readonly code = "request_timeout";
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super("The request timed out.");
    this.name = "RequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

type TimerHandle = any;

type BoundedFetchDependencies = {
  fetchImpl?: typeof fetch;
  setTimer?: (callback: () => void, timeoutMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

export async function boundedFetch(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = DEFAULT_JSON_TIMEOUT_MS,
  dependencies: BoundedFetchDependencies = {}
): Promise<Response> {
  const controller = new AbortController();
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  let timedOut = false;
  const timer = setTimer(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimer(timer);
  }
}
