export type AuthBootstrapState =
  | "loading"
  | "authenticated"
  | "guest"
  | "recoverable_error";

export function isProvenInvalidRefresh(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { name?: unknown }).name === "ApiError" &&
      (error as { status?: unknown }).status === 401
  );
}

export function classifyRefreshFailure(error: unknown): AuthBootstrapState {
  return isProvenInvalidRefresh(error) ? "guest" : "recoverable_error";
}

export function isAuthBootstrapReady(state: AuthBootstrapState): boolean {
  return state === "authenticated" || state === "guest";
}

export function isRefreshTimeout(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "request_timeout"
  );
}
