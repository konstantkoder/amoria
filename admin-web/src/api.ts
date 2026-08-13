import { AdminSessionClient, type AdminAccessSession } from "./admin-session";

const API_BASE_URL = (import.meta.env.VITE_ADMIN_API_URL || "").replace(/\/+$/, "");
const adminSession = new AdminSessionClient(API_BASE_URL);
adminSession.clearLegacyStorage(window.localStorage);

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
  smtp: {
    status: "ok" | "error";
    checkedAt: string;
  };
  accountDeletionCleanup: {
    pending: number | null;
    retrying: number | null;
    maxAttemptCount: number | null;
    degraded: boolean;
  };
  counts: {
    openClientErrors: number | null;
    openReports: number | null;
    pendingMediaModerationItems: number | null;
  };
};

export type AdminReleaseDashboard = {
  ok: true;
  service: string;
  time: string;
  admin: {
    id: string;
    userId: string;
    roles: string[];
  };
  health: {
    apiStatus: "ok";
    databaseStatus: "ok" | "failed";
    objectStorage: OpsHealth["objectStorage"];
    smtp: OpsHealth["smtp"];
  };
  reports: {
    open: number | null;
    underReview: number | null;
    escalated: number | null;
  };
  clientErrors: {
    open: number | null;
  };
  mediaModeration: {
    pending: number | null;
  };
  togetherQueue: {
    waiting: number | null;
  };
  togetherSessions: {
    active: number | null;
    recent24h: number | null;
  };
  nearby: {
    checkedAt: string | null;
    activeVisibilityCount: number | null;
    offVisibilityCount: number | null;
    expiredVisibilityCount: number | null;
    profileReadinessMissingCount: number | null;
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

export type NearbyProfileMissingReason =
  | "missing_birth_date"
  | "missing_gender"
  | "missing_preferred_genders"
  | "missing_avatar"
  | "missing_display_name";

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
  profileReadinessItems: Array<{
    amoriaId: string;
    displayName: string | null;
    emailMasked: string | null;
    missingReasons: NearbyProfileMissingReason[];
    visibilityStatus: "active" | "off" | "expired" | "none";
    createdAt: string;
    updatedAt: string;
  }>;
  feedExclusionReasons: Record<NearbyFeedExclusionReason, number>;
};

export type AdminNearbyRoomType = {
  key: string;
  title: string;
  status: string;
  adminApproved: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminNearbyRoom = {
  id: string;
  typeKey: string;
  title: string | null;
  description: string | null;
  locationLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  expiresAt: string | null;
  createdFromDemandSnapshot: AdminNearbyRoomDemandSnapshot | null;
  roomType: AdminNearbyRoomType;
  status: string;
  geoBucket: string;
  memberCount: number;
  threadId: string | null;
  createdByAdminUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminNearbyRoomDemandSnapshot = {
  activityKey: string;
  geoBucket: string;
  interestedUsersCount: number;
  activeNearbyUsersCount: number;
  recentlyUpdatedUsersCount: number;
  capturedAt: string;
};

export type AdminNearbyRoomAction = "close" | "disable" | "reopen" | "archive" | "delete";

export type CreateNearbyRoomFromDemandPayload = {
  activityKey: string;
  geoBucket: string;
  title?: string;
  description?: string;
  locationLabel?: string;
  startsAt?: string;
  endsAt?: string;
  expiresAt?: string;
};

export type AdminNearbyActivityDemandGeoBucket = {
  geoBucket: string;
  interestedUsersCount: number;
};

export type AdminNearbyActivityDemandRow = {
  activityKey: string;
  activityTitle: string;
  interestedUsersCount: number;
  activeNearbyUsersCount: number;
  recentlyUpdatedUsersCount: number;
  geoBuckets: AdminNearbyActivityDemandGeoBucket[];
  existingActiveRoomCount: number;
  lastUpdatedAt: string | null;
};

export type AdminNearbyActivityDemand = {
  items: AdminNearbyActivityDemandRow[];
  nextCursor: null;
};

export type UserSearchItem = {
  id: string;
  amoriaId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  accountStatus: "active" | "suspended";
  suspendedAt: string | null;
  suspensionReason: string | null;
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
  targetUser: AdminUserSnapshot | null;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  targetContext: ReportTargetContext;
};

export type ReportTargetContext = {
  summary: string;
  privacyNote: string;
  links: ReportTargetContextLink[];
};

export type ReportTargetContextLink = {
  kind:
    | "reporter_user"
    | "target_owner_user"
    | "target_user"
    | "target_media"
    | "target_thread"
    | "target_message"
    | "target_together_session"
    | "nearby_diagnostics";
  label: string;
  screen: "users" | "media" | "message_moderation" | "together_sessions" | "nearby_diagnostics" | "none";
  available: boolean;
  params: Record<string, string>;
  unavailableReason: string | null;
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

export type AdminUserDetail = UserSearchItem & {
  gender: string | null;
  goal: string | null;
  mood: string | null;
  lastSeenAt: string | null;
  adminUserId: string | null;
};

export type AdminBulkJobItem = {
  id: string; targetType: string; targetId: string; proposedAction: string;
  status: "pending" | "applied" | "skipped" | "failed"; errorCode: string | null;
  metadata: unknown; appliedAt: string | null; createdAt: string;
};
export type AdminBulkJob = {
  id: string; adminUserId: string | null; kind: string; action: string; scope: unknown;
  reason: string; idempotencyKey: string; maxItems: number; status: string;
  confirmedAt: string | null; completedAt: string | null; previewCount: number;
  appliedCount: number; skippedCount: number; failedCount: number;
  createdAt: string; updatedAt: string; items: AdminBulkJobItem[];
};

export type MessageModerationItem = {
  id: string;
  threadId: string;
  source: "direct" | "nearby";
  state: "visible" | "held" | "needs_review" | "restricted" | "removed";
  automationStatus: "completed" | "failed" | "not_configured" | "not_required";
  sender: { id: string; amoriaId: string; displayName: string };
  reportCount: number;
  latestReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageModerationDetail = MessageModerationItem & {
  text: string;
  clientMessageId: string;
  reviews: Array<{
    id: string;
    source: string;
    action: string;
    reason: string | null;
    metadata: unknown;
    adminUserId: string | null;
    createdAt: string;
  }>;
  reports: Array<{
    id: string;
    reporterUserId: string;
    reason: string;
    comment: string | null;
    status: string;
    createdAt: string;
  }>;
  privacyNote: string;
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
  moderationOrigin: string;
  automatedCheckedAt: string | null;
  automation: {
    jobId: string;
    status: string;
    attemptCount: number;
    providerEngine: string;
    modelVersion: string;
    policyVersion: string;
    policyDecision: string | null;
    errorCode: string | null;
    rawResult: unknown;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
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

export function clearTokens(): void {
  adminSession.clearAccessSession();
}

export async function restoreAdminSession(): Promise<AdminAccessSession | null> {
  return adminSession.restore();
}

export async function login(email: string, password: string): Promise<AdminAccessSession> {
  return adminSession.login(email, password);
}

export async function logout(): Promise<void> {
  await adminSession.logout();
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export async function getAdminNearbyActivityDemand(): Promise<AdminNearbyActivityDemand> {
  return apiGet<AdminNearbyActivityDemand>("/admin/nearby-activity-demand");
}

export async function createNearbyRoomFromDemand(
  payload: CreateNearbyRoomFromDemandPayload,
): Promise<{ room: AdminNearbyRoom }> {
  return apiPost<{ room: AdminNearbyRoom }>(
    "/admin/nearby-activity-demand/create-room",
    payload,
  );
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiBlob(path: string): Promise<Blob> {
  const accessTokenBefore = adminSession.getAccessToken();
  const response = await fetchWithAuth(path);

  if (response.status === 401 && await recoverUnauthorized(accessTokenBefore)) {
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
  try {
    const url = new URL(normalized, `${apiOrigin}/`);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      /^\/media\/public\/[^/?#]+$/u.test(url.pathname)
    ) {
      return `${apiOrigin}${url.pathname}${url.search}`;
    }
    return null;
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
  options: RequestInit = {},
): Promise<T> {
  const accessTokenBefore = adminSession.getAccessToken();
  const response = await fetchWithAuth(path, options);

  if (response.status === 401 && await recoverUnauthorized(accessTokenBefore)) {
    const retry = await fetchWithAuth(path, options);
    return parseResponse<T>(retry);
  }

  return parseResponse<T>(response);
}

async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");

  const accessToken = adminSession.getAccessToken();
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
}

async function refreshTokens(): Promise<boolean> {
  return adminSession.refresh();
}

async function recoverUnauthorized(accessTokenBefore: string | undefined): Promise<boolean> {
  const currentAccessToken = adminSession.getAccessToken();
  if (currentAccessToken && currentAccessToken !== accessTokenBefore) return true;
  return refreshTokens();
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
