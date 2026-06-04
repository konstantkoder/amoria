const API_BASE_URL = (import.meta.env.VITE_ADMIN_API_URL || "").replace(/\/+$/, "");
const TOKEN_STORAGE_KEY = "amoria.admin.tokens";

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  amoriaId: string;
  avatarUrl: string | null;
};

export type AdminMe = {
  adminUser: {
    id: string;
    userId: string;
    status: "active" | "disabled";
    roles: string[];
    createdAt: string;
    updatedAt: string;
  };
  user: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  };
};

export type AdminHealth = {
  ok: true;
  service: string;
  time: string;
  admin: {
    id: string;
    userId: string;
    roles: string[];
  };
};

export type OpsHealth = {
  ok: true;
  service: string;
  time: string;
  admin: {
    id: string;
    userId: string;
    roles: string[];
  };
  nodeEnv: string;
  database: {
    ok: boolean;
  };
  objectStorage: {
    status: "ok" | "not_configured" | "error" | "not_checked";
    checkedAt: string;
    reason?: "missing_config" | "safe_check_unavailable";
    errorCode?:
      | "access_denied"
      | "bucket_not_found"
      | "credentials_error"
      | "health_check_exception"
      | "request_failed"
      | "storage_check_failed";
  };
  counts: {
    openClientErrors: number | null;
    openReports: number | null;
    pendingMediaModerationItems: number | null;
  };
};

export type NearbyFeedExclusionReason =
  | "self"
  | "blocked"
  | "visibility_off"
  | "visibility_expired"
  | "distance_too_far"
  | "age_mismatch"
  | "gender_mismatch"
  | "missing_birth_date"
  | "missing_gender"
  | "missing_preferred_genders";

export type NearbyDiagnostics = {
  ok: true;
  status: "ok";
  checkedAt: string;
  activeVisibilityCount: number;
  offVisibilityCount: number;
  expiredVisibilityCount: number;
  recentlyUpdatedCount: number;
  profileReadinessMissing: {
    missingBirthDate: number;
    missingGender: number;
    missingPreferredGenders: number;
    missingAvatar: number;
    missingDisplayName: number;
  };
  feedExclusionReasons: Record<NearbyFeedExclusionReason, number>;
};

export type UserSearchItem = {
  id: string;
  amoriaId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientErrorItem = {
  id: string;
  userId: string | null;
  amoriaId: string | null;
  displayName: string | null;
  email: string | null;
  screen: string;
  action: string;
  step: string | null;
  code: string | null;
  message: string;
  stack: string | null;
  metadata: unknown;
  platform: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  requestId: string | null;
  backendUrl: string | null;
  status: "open" | "resolved" | "ignored" | "archived";
  resolvedAt: string | null;
  resolvedByAdminUserId: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserItem = {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: "active" | "disabled";
  roles: string[];
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  };
};

export type AuditLogItem = {
  id: string;
  adminUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadata: unknown;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type ReportItem = {
  id: string;
  reporterUserId: string;
  reporter: AdminUserSnapshot;
  targetType: string;
  targetId: string;
  targetOwnerUserId: string | null;
  targetOwner: AdminUserSnapshot | null;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportReviewAction = {
  id: string;
  reportId: string;
  adminUserId: string | null;
  action: string;
  reason: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: string;
};

export type ReportDetail = ReportItem & {
  reviewActions: ReportReviewAction[];
};

export type MediaItem = {
  id: string;
  ownerUserId: string;
  owner: AdminUserSnapshot;
  type: string;
  url: string | null;
  previewUrl: string | null;
  publicUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  checksumSha256: string | null;
  visibility: "avatar" | "public" | "locked" | null;
  moderationStatus: string;
  reviewedAt: string | null;
  createdAt: string;
};

export type MediaReview = {
  id: string;
  mediaId: string;
  ownerUserId: string | null;
  adminUserId: string | null;
  action: string;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
};

export type MediaDetail = MediaItem & {
  path: string | null;
  reviews: MediaReview[];
};

export type TogetherQueueEntry = {
  entryId: string;
  userId: string;
  amoriaId: string | null;
  displayName: string | null;
  activity: string;
  status: string;
  radiusKm: number | null;
  hasCoordinates: boolean;
  geoMode:
    | "no_limit_with_location"
    | "finite_with_location"
    | "missing_location_invalid_old_entry";
  userAgeGroup: "18-24" | "25-34" | "35-44" | "45-54" | "55+" | null;
  preferredAgeRange: { min: number; max: number | null } | null;
  waitingReason:
    | "no_candidate"
    | "activity_mismatch"
    | "radius_distance_too_far"
    | "missing_coordinates_old_entry"
    | "same_user_excluded"
    | "candidate_expired"
    | "candidate_cancelled"
    | "location_required"
    | "age_mismatch"
    | "missing_user_age"
    | "missing_age_preference"
    | "unknown";
  cancelledAt: string | null;
  cancelSource:
    | "user_stop"
    | "user_back"
    | "retry_restart"
    | "radius_expansion"
    | "screen_cleanup"
    | "navigation_blur"
    | "admin_cancel"
    | "server_expired"
    | "matched"
    | "unknown"
    | null;
  cancelReason: string | null;
  lastAction: string | null;
  lastActionAt: string | null;
  lastClientPollAt: string | null;
  ageSeconds: number;
  createdAt: string;
  expiresAt: string;
  matchedSessionId: string | null;
};

export type TogetherSessionParticipant = {
  userId: string;
  lastHeartbeatAt: string | null;
  leftAt: string | null;
  isStale: boolean;
};

export type TogetherSessionItem = {
  sessionId: string;
  activity: string;
  status: string;
  createdAt: string;
  deadlineAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  sourceSessionId: string | null;
  participantUserIds: string[];
  participantCount: number;
  participants: TogetherSessionParticipant[];
  hasStaleParticipant: boolean;
  lastHeartbeatAt: string | null;
  leftAt: string | null;
  eventCount: number;
  strokeEventCount: number;
  storyChoiceCount: number;
  revealDecisions: {
    open: number;
    skip: number;
    continueStory: number;
    pending: number;
    total: number;
  };
};

type AdminUserSnapshot = {
  id: string;
  amoriaId: string;
  displayName: string;
  email: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function loadTokens(): Tokens | null {
  const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Tokens;
    if (parsed.accessToken && parsed.refreshToken) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function saveTokens(tokens: Tokens): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function login(email: string, password: string): Promise<Tokens & { user: AuthUser }> {
  return apiFetch<Tokens & { user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) {
    return;
  }

  await apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
    skipRefresh: true,
  }).catch(() => undefined);
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetchWithAuth(path);

  if (response.status === 401 && await refreshTokens()) {
    const retry = await fetchWithAuth(path);
    return parseBlobResponse(retry);
  }

  return parseBlobResponse(response);
}

export function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim()) {
      search.set(key, String(value).trim());
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export function resolveApiUrl(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const apiOrigin = API_BASE_URL || window.location.origin;
  if (normalized.startsWith("/")) {
    return `${apiOrigin}${normalized}`;
  }

  try {
    const url = new URL(normalized);
    if (url.pathname.startsWith("/media/public/")) {
      return `${apiOrigin}${url.pathname}${url.search}`;
    }
    return normalized;
  } catch {
    return null;
  }
}

export type PublicMediaProbeResult = {
  ok: boolean;
  httpStatus: number | null;
  contentType: string | null;
  errorCode: string | null;
  error: string | null;
};

export async function probePublicMediaUrl(
  value: string | null | undefined,
): Promise<PublicMediaProbeResult> {
  const url = resolveApiUrl(value);
  if (!url) {
    return {
      ok: false,
      httpStatus: null,
      contentType: null,
      errorCode: "invalid_url",
      error: "invalid_url",
    };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type");
    const errorCode = await readProbeErrorCode(response, contentType);
    await response.blob().catch(() => undefined);
    return {
      ok: response.ok && Boolean(contentType?.startsWith("image/")),
      httpStatus: response.status,
      contentType,
      errorCode,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      contentType: null,
      errorCode: null,
      error: error instanceof Error ? error.name : "network_error",
    };
  }
}

async function readProbeErrorCode(
  response: Response,
  contentType: string | null,
): Promise<string | null> {
  if (!contentType?.includes("application/json")) {
    return null;
  }

  const data = await response.clone().json().catch(() => undefined);
  const errorCode = (data as { error?: { code?: unknown } } | undefined)?.error?.code;
  return typeof errorCode === "string" && errorCode.trim() ? errorCode : null;
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; skipRefresh?: boolean } = {},
): Promise<T> {
  const response = await fetchWithAuth(path, options);

  if (response.status === 401 && !options.skipRefresh && await refreshTokens()) {
    const retry = await fetchWithAuth(path, options);
    return parseResponse<T>(retry);
  }

  return parseResponse<T>(response);
}

async function fetchWithAuth(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");

  const tokens = loadTokens();
  if (!options.skipAuth && tokens?.accessToken) {
    headers.set("authorization", `Bearer ${tokens.accessToken}`);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
}

async function refreshTokens(): Promise<boolean> {
  const tokens = loadTokens();
  if (!tokens?.refreshToken) {
    return false;
  }

  try {
    const refreshed = await apiFetch<Tokens & { user: AuthUser }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      skipAuth: true,
      skipRefresh: true,
    });
    saveTokens(refreshed);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      error?.message || `Request failed with ${response.status}`,
      response.status,
      error?.code,
    );
  }

  return payload as T;
}

async function parseBlobResponse(response: Response): Promise<Blob> {
  if (!response.ok) {
    await parseResponse(response);
  }

  return response.blob();
}
