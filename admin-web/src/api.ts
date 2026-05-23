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
    status: "ok" | "failed" | "not_checked";
    reason: string;
  };
  counts: {
    openClientErrors: number | null;
    openReports: number | null;
    pendingMediaModerationItems: number | null;
  };
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
  activity: string;
  status: string;
  radiusKm: number | null;
  hasCoordinates: boolean;
  createdAt: string;
  expiresAt: string;
  matchedSessionId: string | null;
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
