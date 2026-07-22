const {
  boundedFetch,
  RequestTimeoutError,
} = require("../src/services/api/boundedFetch.ts") as typeof import("../src/services/api/boundedFetch");
const {
  classifyRefreshFailure,
  isAuthBootstrapReady,
  isProvenInvalidRefresh,
  isRefreshTimeout,
} = require("../src/services/authBootstrapState.ts") as typeof import("../src/services/authBootstrapState");
const {
  beginArchiveLoad,
  completeArchiveLoad,
  failArchiveLoad,
} = require("../src/services/archiveLoadState.ts") as typeof import("../src/services/archiveLoadState");
const { mergeAuthUserWithStoredProfile } = require("../src/services/authProfileMerge.ts") as typeof import("../src/services/authProfileMerge");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  let clearedTimers = 0;
  let capturedSignal: AbortSignal | undefined;
  const successResponse = { ok: true } as Response;
  const successful = await boundedFetch(
    "https://example.invalid/success",
    {},
    50,
    {
      fetchImpl: (async (_input, init) => {
        capturedSignal = init?.signal as AbortSignal;
        return successResponse;
      }) as typeof fetch,
      setTimer: ((callback: () => void) => setTimeout(callback, 50)) as typeof setTimeout,
      clearTimer: (handle) => {
        clearedTimers += 1;
        clearTimeout(handle);
      },
    }
  );
  assert(successful === successResponse, "a request may complete before its timeout");
  assert(Boolean(capturedSignal), "a bounded request always receives an AbortSignal");
  assert(clearedTimers === 1, "the success path clears its timeout timer");

  let firstController: AbortSignal | undefined;
  let timeoutError: unknown;
  let timeoutClearedTimers = 0;
  try {
    await boundedFetch(
      "https://example.invalid/timeout",
      {},
      5,
      {
        fetchImpl: ((_input, init) => {
          firstController = init?.signal as AbortSignal;
          return new Promise((_resolve, reject) => {
            firstController?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          });
        }) as typeof fetch,
        clearTimer: (handle) => {
          timeoutClearedTimers += 1;
          clearTimeout(handle);
        },
      }
    );
  } catch (error) {
    timeoutError = error;
  }
  assert(timeoutError instanceof RequestTimeoutError, "ordinary requests reject with a typed timeout");
  assert(isRefreshTimeout(timeoutError), "typed timeouts are classified without raw details");
  assert(firstController?.aborted === true, "timeout aborts the in-flight fetch");
  assert(timeoutClearedTimers === 1, "the timeout path clears its timer");

  let secondController: AbortSignal | undefined;
  await boundedFetch("https://example.invalid/retry", {}, 50, {
    fetchImpl: (async (_input, init) => {
      secondController = init?.signal as AbortSignal;
      return successResponse;
    }) as typeof fetch,
  });
  assert(secondController !== firstController, "Retry creates a fresh AbortController");
  assert(secondController?.aborted === false, "Retry does not inherit an aborted signal");

  const invalid = { name: "ApiError", status: 401, code: "invalid_refresh_token" };
  const outage = { name: "ApiError", status: 503, code: "service_unavailable" };
  assert(isProvenInvalidRefresh(invalid), "a proven refresh 401 is eligible for safe sign-out");
  assert(classifyRefreshFailure(invalid) === "guest", "invalid credentials transition directly to guest");
  assert(!isProvenInvalidRefresh(outage), "backend 5xx never masquerades as revoked credentials");
  assert(classifyRefreshFailure(outage) === "recoverable_error", "backend outage preserves recovery state");
  assert(classifyRefreshFailure(timeoutError) === "recoverable_error", "refresh timeout preserves recovery state");
  assert(classifyRefreshFailure(new TypeError("Network request failed")) === "recoverable_error", "network failure is recoverable");
  assert(!isAuthBootstrapReady("loading"), "loading never flashes guest or authenticated navigation");
  assert(!isAuthBootstrapReady("recoverable_error"), "recovery never renders protected navigation");
  assert(isAuthBootstrapReady("authenticated"), "successful refresh releases authenticated navigation");
  assert(isAuthBootstrapReady("guest"), "proven invalid refresh releases guest navigation");

  const storedProfile = { id: "user-a", email: "a@example.invalid", displayName: "Complete", amoriaId: "AMORIA-A", avatarUrl: null, birthDate: "1995-01-01" };
  const refreshedProfile = { id: "user-a", email: "a@example.invalid", displayName: "Complete", amoriaId: "AMORIA-A", avatarUrl: null };
  const mergedProfile = mergeAuthUserWithStoredProfile(storedProfile as any, refreshedProfile as any);
  assert(mergedProfile.birthDate === "1995-01-01", "successful refresh preserves a stored complete profile");

  let archiveState = beginArchiveLoad("idle");
  assert(archiveState === "loading", "Archive enters a distinct loading state");
  archiveState = completeArchiveLoad();
  assert(archiveState === "loaded", "Archive loading transitions to success");
  assert(beginArchiveLoad(archiveState) === "loaded", "foreground refresh preserves valid history");
  assert(failArchiveLoad("loading") === "error", "Archive timeout transitions out of loading");
  archiveState = beginArchiveLoad("error");
  archiveState = completeArchiveLoad();
  assert(archiveState === "loaded", "Archive Retry can transition from error to success");

  console.log("startupNetworkArchive.test.ts: PASS");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
