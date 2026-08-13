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

export function isAccountSuspended(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { name?: unknown }).name === "ApiError" &&
      (error as { status?: unknown }).status === 403 &&
      (error as { code?: unknown }).code === "account_suspended"
  );
}

export function isTerminalAuthFailure(error: unknown): boolean {
  return isProvenInvalidRefresh(error) || isAccountSuspended(error);
}

export function classifyRefreshFailure(error: unknown): AuthBootstrapState {
  return isTerminalAuthFailure(error) ? "guest" : "recoverable_error";
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
