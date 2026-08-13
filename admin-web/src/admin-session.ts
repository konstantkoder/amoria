export const LEGACY_ADMIN_TOKEN_STORAGE_KEY = "amoria.admin.tokens";
export const ADMIN_SESSION_HEADER = "x-amoria-admin-session";

export type AdminAccessSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    amoriaId: string;
    avatarUrl: string | null;
  };
};

type LegacyStorage = {
  removeItem(key: string): void;
};

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

export class AdminSessionClient {
  private accessSession: AdminAccessSession | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(
    private readonly apiBaseUrl: string,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  clearLegacyStorage(storage: LegacyStorage): void {
    storage.removeItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY);
  }

  getAccessToken(): string | undefined {
    return this.accessSession?.accessToken;
  }

  clearAccessSession(): void {
    this.accessSession = null;
  }

  async login(email: string, password: string): Promise<AdminAccessSession> {
    const response = await this.sessionRequest("/admin/session/login", { email, password });
    const session = await parseSessionResponse(response);
    this.accessSession = session;
    return session;
  }

  async restore(): Promise<AdminAccessSession | null> {
    return await this.refresh() ? this.accessSession : null;
  }

  async refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async logout(): Promise<void> {
    try {
      const response = await this.sessionRequest("/admin/session/logout", {});
      await parseOkResponse(response);
    } finally {
      this.accessSession = null;
    }
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await this.sessionRequest("/admin/session/refresh", {});
      this.accessSession = await parseSessionResponse(response);
      return true;
    } catch {
      this.accessSession = null;
      return false;
    }
  }

  private sessionRequest(path: string, body: unknown): Promise<Response> {
    return this.fetchImplementation(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        [ADMIN_SESSION_HEADER]: "1",
      },
      body: JSON.stringify(body),
    });
  }
}

async function parseOkResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const error = payload?.error;
  const sessionError = new Error(error?.message || `Request failed with ${response.status}`) as Error & {
    status?: number;
    code?: string;
  };
  sessionError.status = response.status;
  sessionError.code = error?.code;
  throw sessionError;
}

async function parseSessionResponse(response: Response): Promise<AdminAccessSession> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = payload?.error;
    const sessionError = new Error(error?.message || `Request failed with ${response.status}`) as Error & {
      status?: number;
      code?: string;
    };
    sessionError.status = response.status;
    sessionError.code = error?.code;
    throw sessionError;
  }
  const session = payload as AdminAccessSession;
  return {
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      amoriaId: session.user.amoriaId,
      avatarUrl: session.user.avatarUrl,
    },
  };
}
