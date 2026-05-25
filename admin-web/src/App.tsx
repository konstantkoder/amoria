import {
  createContext,
  FormEvent,
  MouseEvent,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AdminHealth,
  AdminMe,
  AdminUserItem,
  ApiError,
  AuditLogItem,
  ClientErrorItem,
  MediaDetail,
  MediaItem,
  OpsHealth,
  ReportDetail,
  ReportItem,
  Tokens,
  TogetherQueueEntry,
  TogetherSessionItem,
  UserSearchItem,
  apiBlob,
  apiGet,
  apiPost,
  clearTokens,
  loadTokens,
  login,
  logout,
  probePublicMediaUrl,
  resolveApiUrl,
  saveTokens,
  toQuery,
} from "./api";
import {
  interpolate,
  loadLanguage,
  saveLanguage,
  translate,
  type Language,
  type TranslationKey,
} from "./i18n";

type Screen =
  | "dashboard"
  | "users"
  | "adminUsers"
  | "clientErrors"
  | "auditLog"
  | "reports"
  | "media"
  | "togetherQueue"
  | "togetherSessions"
  | "opsHealth"
  | "bootstrap";

type ScreenItem = {
  key: Screen;
  labelKey: TranslationKey;
  ownerOnly?: boolean;
  roles?: string[];
};

const screens: ScreenItem[] = [
  { key: "dashboard", labelKey: "nav.dashboard" },
  { key: "users", labelKey: "nav.users" },
  { key: "adminUsers", labelKey: "nav.adminUsers", ownerOnly: true },
  { key: "clientErrors", labelKey: "nav.clientErrors" },
  { key: "reports", labelKey: "nav.reports" },
  { key: "media", labelKey: "nav.media" },
  { key: "togetherQueue", labelKey: "nav.togetherQueue", roles: ["owner", "ops"] },
  { key: "togetherSessions", labelKey: "nav.togetherSessions", roles: ["owner", "ops"] },
  { key: "auditLog", labelKey: "nav.auditLog" },
  { key: "opsHealth", labelKey: "nav.opsHealth" },
  { key: "bootstrap", labelKey: "nav.bootstrap" },
];

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
  tx: (key: TranslationKey, values: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function App() {
  const [language, setLanguageState] = useState<Language>(() => loadLanguage());
  const [tokens, setTokens] = useState<Tokens | null>(() => loadTokens());
  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [authState, setAuthState] = useState<"checking" | "login" | "ready" | "forbidden">("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [togetherSessionFilter, setTogetherSessionFilter] = useState("");

  const i18n = useMemo<I18nContextValue>(() => {
    const setLanguage = (nextLanguage: Language) => {
      saveLanguage(nextLanguage);
      setLanguageState(nextLanguage);
    };
    const t = (key: TranslationKey) => translate(language, key);
    return {
      language,
      setLanguage,
      t,
      tx: (key, values) => interpolate(t(key), values),
    };
  }, [language]);

  const { t } = i18n;

  useEffect(() => {
    if (!tokens) {
      setAuthState("login");
      return;
    }

    apiGet<AdminMe>("/admin/me")
      .then((me) => {
        setAdminMe(me);
        setAuthState("ready");
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 403) {
          setAuthState("forbidden");
          return;
        }
        clearTokens();
        setTokens(null);
        setAuthState("login");
      });
  }, [tokens]);

  async function handleLogout() {
    await logout(tokens?.refreshToken);
    clearTokens();
    setTokens(null);
    setAdminMe(null);
    setAuthState("login");
  }

  const visibleScreens = screens.filter(
    (item) =>
      (!item.ownerOnly || adminMe?.adminUser.roles.includes("owner")) &&
      (!item.roles || item.roles.some((role) => adminMe?.adminUser.roles.includes(role))),
  );
  const activeScreen = visibleScreens.some((item) => item.key === screen) ? screen : "dashboard";
  const activeLabel = screens.find((item) => item.key === activeScreen)?.labelKey ?? "nav.dashboard";

  let content;
  if (authState === "checking") {
    content = <div className="center-panel">{t("auth.checking")}</div>;
  } else if (authState === "login") {
    content = (
      <LoginScreen
        onLogin={(nextTokens) => {
          saveTokens(nextTokens);
          setTokens(nextTokens);
        }}
      />
    );
  } else if (authState === "forbidden") {
    content = <ForbiddenScreen onLogout={handleLogout} />;
  } else {
    content = (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div>
              <strong>Amoria</strong>
              <span>{t("app.brandSubtitle")}</span>
            </div>
          </div>
          <nav>
            {visibleScreens.map((item) => (
              <button
                key={item.key}
                className={activeScreen === item.key ? "active" : ""}
                onClick={() => {
                  setScreen(item.key);
                  setMessage(null);
                }}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div>
              <h1>{t(activeLabel)}</h1>
              {adminMe ? (
                <p>
                  {adminMe.user.displayName} · {adminMe.user.amoriaId} · {formatRoles(adminMe.adminUser.roles, t)}
                </p>
              ) : null}
            </div>
            <div className="topbar-actions">
              <LanguageSwitcher />
              <button className="secondary" onClick={handleLogout}>{t("common.logout")}</button>
            </div>
          </header>

          {message ? <div className="notice">{message}</div> : null}

          {activeScreen === "dashboard" ? <Dashboard /> : null}
          {activeScreen === "users" ? <UsersScreen /> : null}
          {activeScreen === "adminUsers" ? <AdminUsersScreen /> : null}
          {activeScreen === "clientErrors" ? <ClientErrorsScreen setMessage={setMessage} /> : null}
          {activeScreen === "auditLog" ? <AuditLogScreen /> : null}
          {activeScreen === "reports" ? <ReportsScreen setMessage={setMessage} /> : null}
          {activeScreen === "media" ? <MediaScreen setMessage={setMessage} /> : null}
          {activeScreen === "togetherQueue" ? (
            <TogetherQueueScreen
              onOpenSession={(sessionId) => {
                setTogetherSessionFilter(sessionId);
                setScreen("togetherSessions");
              }}
            />
          ) : null}
          {activeScreen === "togetherSessions" ? (
            <TogetherSessionsScreen initialSessionId={togetherSessionFilter} />
          ) : null}
          {activeScreen === "opsHealth" ? <OpsHealthScreen /> : null}
          {activeScreen === "bootstrap" ? <BootstrapScreen /> : null}
        </main>
      </div>
    );
  }

  return <I18nContext.Provider value={i18n}>{content}</I18nContext.Provider>;
}

function LoginScreen({ onLogin }: { onLogin: (tokens: Tokens) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await login(email, password);
      saveTokens(response);
      await apiGet<AdminMe>("/admin/me");
      onLogin(response);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setError(t("auth.loginForbidden"));
      } else {
        setError(error instanceof Error ? error.message : t("auth.loginFailed"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-form" onSubmit={submit}>
        <div className="brand login-brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>Amoria</strong>
            <span>{t("app.brandSubtitle")}</span>
          </div>
        </div>
        <LanguageSwitcher />
        <label>
          {t("common.email")}
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          {t("auth.password")}
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button disabled={loading}>{loading ? t("auth.signingIn") : t("auth.signIn")}</button>
      </form>
    </div>
  );
}

function ForbiddenScreen({ onLogout }: { onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="center-panel">
      <LanguageSwitcher />
      <h1>{t("auth.forbiddenTitle")}</h1>
      <p>{t("auth.forbiddenMessage")}</p>
      <button onClick={onLogout}>{t("common.backToLogin")}</button>
    </div>
  );
}

function Dashboard() {
  const { language, t } = useI18n();
  const { data: health, error, reload } = useLoad<AdminHealth>("/admin/health");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("dashboard.title")}</h2>
        <button className="secondary" onClick={reload}>{t("common.refresh")}</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {health ? (
        <dl className="facts">
          <Fact label={t("common.service")} value={health.service} />
          <Fact label={t("common.time")} value={formatDate(health.time, language)} />
          <Fact label={t("common.adminUser")} value={health.admin.userId} />
          <Fact label={t("common.roles")} value={formatRoles(health.admin.roles, t)} />
        </dl>
      ) : <EmptyState label={t("dashboard.empty")} />}
    </section>
  );
}

function UsersScreen() {
  const { language, t } = useI18n();
  const [amoriaId, setAmoriaId] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<UserSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSearched(true);

    try {
      const response = await apiGet<{ items: UserSearchItem[] }>(
        `/admin/users${toQuery({ amoriaId, q, limit: 50 })}`,
      );
      setItems(response.items);
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  return (
    <section className="panel">
      <form className="filters" onSubmit={search}>
        <label>{t("common.amoriaId")}<input value={amoriaId} onChange={(event) => setAmoriaId(event.target.value)} /></label>
        <label>{t("users.searchLabel")}<input value={q} onChange={(event) => setQ(event.target.value)} /></label>
        <button>{t("common.search")}</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      {items.length ? (
        <DataTable
          columns={[
            t("common.amoriaId"),
            t("common.displayName"),
            t("common.email"),
            t("users.avatar"),
            t("common.created"),
            t("common.updated"),
          ]}
          rows={items.map((item) => [
            item.amoriaId,
            item.displayName,
            item.email,
            item.avatarUrl ?? "",
            formatDate(item.createdAt, language),
            formatDate(item.updatedAt, language),
          ])}
        />
      ) : <EmptyState label={searched ? t("users.emptyResults") : t("users.emptyInitial")} />}
    </section>
  );
}

function AdminUsersScreen() {
  const { language, t } = useI18n();
  const { data, error, reload } = useLoad<{ items: AdminUserItem[]; nextCursor: null }>("/admin/admin-users");
  const items = data?.items ?? [];

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("adminUsers.title")}</h2>
        <button className="secondary" onClick={reload}>{t("common.refresh")}</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {items.length ? (
        <DataTable
          columns={[
            t("common.adminUser"),
            t("common.email"),
            t("common.displayName"),
            t("common.status"),
            t("common.roles"),
            t("adminUsers.linkedUser"),
            t("common.created"),
            t("common.updated"),
          ]}
          rows={items.map((item) => [
            item.id,
            item.email ?? "",
            item.displayName ?? "",
            formatStatus(item.status, t),
            formatRoles(item.roles, t),
            `${item.user.amoriaId} · ${item.user.email}`,
            formatDate(item.createdAt, language),
            formatDate(item.updatedAt, language),
          ])}
        />
      ) : <EmptyState label={t("adminUsers.empty")} />}
    </section>
  );
}

function ClientErrorsScreen({ setMessage }: { setMessage: (message: string | null) => void }) {
  const { language, t, tx } = useI18n();
  const [filters, setFilters] = useState({
    screen: "",
    action: "",
    code: "",
    amoriaId: "",
    status: "open",
    limit: "50",
  });
  const [items, setItems] = useState<ClientErrorItem[]>([]);
  const [selected, setSelected] = useState<ClientErrorItem | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(nextFilters = filters) {
    setError(null);
    try {
      const response = await apiGet<{ items: ClientErrorItem[] }>(
        `/admin/client-errors${toQuery(nextFilters)}`,
      );
      setItems(response.items);
      setSelected(response.items[0] ?? null);
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  function update(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function submitAction(action: "resolve" | "ignore" | "archive" | "reopen") {
    if (!selected) {
      return;
    }

    setError(null);
    try {
      const response = await apiPost<{ item: ClientErrorItem }>(
        `/admin/client-errors/${selected.id}/actions`,
        {
          action,
          note: note || undefined,
        },
      );
      setMessage(tx("clientErrors.updatedOne", { id: response.item.id }));
      setNote("");
      await load();
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  async function bulkArchiveCurrentFilter() {
    if (!window.confirm(t("clientErrors.bulkArchiveConfirm"))) {
      return;
    }

    setError(null);
    try {
      const response = await apiPost<{ count: number }>("/admin/client-errors/actions/bulk", {
        action: "archive",
        filters: {
          screen: filters.screen || undefined,
          action: filters.action || undefined,
          code: filters.code || undefined,
          amoriaId: filters.amoriaId || undefined,
          status: filters.status || undefined,
        },
        note: note || undefined,
      });
      setMessage(tx("clientErrors.bulkArchived", { count: response.count }));
      setNote("");
      await load();
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  return (
    <section className="grid-two">
      <div className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>{t("common.status")}<select value={filters.status} onChange={(event) => update("status", event.target.value)}>
            <option value="">{t("status.any")}</option>
            <option value="open">{t("status.open")}</option>
            <option value="resolved">{t("status.resolved")}</option>
            <option value="ignored">{t("status.ignored")}</option>
            <option value="archived">{t("status.archived")}</option>
          </select></label>
          <label>{t("common.screen")}<input value={filters.screen} onChange={(event) => update("screen", event.target.value)} /></label>
          <label>{t("common.action")}<input value={filters.action} onChange={(event) => update("action", event.target.value)} /></label>
          <label>{t("common.code")}<input value={filters.code} onChange={(event) => update("code", event.target.value)} /></label>
          <label>{t("common.amoriaId")}<input value={filters.amoriaId} onChange={(event) => update("amoriaId", event.target.value)} /></label>
          <label>{t("common.limit")}<input value={filters.limit} onChange={(event) => update("limit", event.target.value)} inputMode="numeric" /></label>
          <button>{t("common.load")}</button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              const photoFilters = {
                ...filters,
                screen: "PhotoManagerScreen",
                action: "uploadProfilePhoto",
              };
              setFilters(photoFilters);
              void load(photoFilters);
            }}
          >
            {t("clientErrors.photoUploadErrors")}
          </button>
        </form>
        <div className="action-bar">
          <label className="wide-field">
            {t("common.note")}
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("clientErrors.notePlaceholder")}
            />
          </label>
          <button type="button" disabled={!selected} onClick={() => void submitAction("resolve")}>{t("action.resolve")}</button>
          <button type="button" disabled={!selected} onClick={() => void submitAction("ignore")}>{t("action.ignore")}</button>
          <button type="button" disabled={!selected} onClick={() => void submitAction("archive")}>{t("action.archive")}</button>
          <button type="button" disabled={!selected} onClick={() => void submitAction("reopen")}>{t("action.reopen")}</button>
          <button className="secondary" type="button" onClick={() => void bulkArchiveCurrentFilter()}>
            {t("clientErrors.archiveCurrent")}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("common.created")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.amoriaId")}</th>
                <th>{t("common.screen")}</th>
                <th>{t("common.action")}</th>
                <th>{t("common.step")}</th>
                <th>{t("common.code")}</th>
                <th>{t("common.message")}</th>
                <th>{t("common.platform")}</th>
                <th>{t("common.device")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt, language)}</td>
                  <td>{formatStatus(item.status, t)}</td>
                  <td>{item.amoriaId ?? ""}</td>
                  <td>{item.screen}</td>
                  <td>{item.action}</td>
                  <td>{item.step ?? ""}</td>
                  <td>{item.code ?? ""}</td>
                  <td>{item.message}</td>
                  <td>{item.platform ?? ""}</td>
                  <td>{item.deviceModel ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState label={t("clientErrors.empty")} />}
      </div>
      <ClientErrorDetailPanel item={selected} />
    </section>
  );
}

function ClientErrorDetailPanel({ item }: { item: ClientErrorItem | null }) {
  const { language, t } = useI18n();
  return (
    <div className="panel">
      <h2>{t("clientErrors.detailTitle")}</h2>
      {item ? (
        <>
          <dl className="facts compact">
            <Fact label={t("common.status")} value={formatStatus(item.status, t)} />
            <Fact label={t("clientErrors.resolvedAt")} value={item.resolvedAt ? formatDate(item.resolvedAt, language) : ""} />
            <Fact label={t("clientErrors.resolvedBy")} value={item.resolvedByAdminUserId ?? ""} />
            <Fact label={t("clientErrors.resolutionNote")} value={item.resolutionNote ?? ""} />
            <Fact label={t("clientErrors.updated")} value={formatDate(item.updatedAt, language)} />
          </dl>
          <JsonBlock data={item} />
        </>
      ) : <EmptyState label={t("empty.selectRow")} />}
    </div>
  );
}

function AuditLogScreen() {
  const { language, t } = useI18n();
  const { data, error, reload } = useLoad<{ items: AuditLogItem[] }>("/admin/audit-log?limit=50");
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const items = data?.items ?? [];

  useEffect(() => {
    setSelected(items[0] ?? null);
  }, [data]);

  return (
    <section className="grid-two">
      <div className="panel">
        <div className="panel-header">
          <h2>{t("audit.title")}</h2>
          <button className="secondary" onClick={reload}>{t("common.refresh")}</button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("common.created")}</th>
                <th>{t("common.action")}</th>
                <th>{t("common.admin")}</th>
                <th>{t("common.target")}</th>
                <th>{t("audit.reason")}</th>
                <th>{t("common.request")}</th>
                <th>{t("common.ip")}</th>
                <th>{t("common.userAgent")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt, language)}</td>
                  <td>{item.action}</td>
                  <td>{item.adminUserId ?? ""}</td>
                  <td>{[item.targetType, item.targetId].filter(Boolean).join(":")}</td>
                  <td>{item.reason ?? ""}</td>
                  <td>{item.requestId ?? ""}</td>
                  <td>{item.ipAddress ?? ""}</td>
                  <td>{item.userAgent ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState label={t("audit.empty")} />}
      </div>
      <DetailPanel title={t("audit.metadataTitle")} data={selected} />
    </section>
  );
}

function ReportsScreen({ setMessage }: { setMessage: (message: string | null) => void }) {
  const { language, t, tx } = useI18n();
  const [filters, setFilters] = useState({ status: "", targetType: "", reporterAmoriaId: "", targetOwnerAmoriaId: "", limit: "50" });
  const [items, setItems] = useState<ReportItem[]>([]);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState("mark_under_review");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    setError(null);
    try {
      const response = await apiGet<{ items: ReportItem[] }>(`/admin/reports${toQuery(filters)}`);
      setItems(response.items);
      if (response.items[0]) {
        await openDetail(response.items[0].id);
      } else {
        setSelected(null);
      }
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  async function openDetail(id: string) {
    const response = await apiGet<{ report: ReportDetail }>(`/admin/reports/${id}`);
    setSelected(response.report);
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    try {
      const response = await apiPost<{ report: ReportItem }>(`/admin/reports/${selected.id}/actions`, {
        action,
        reason: reason || undefined,
        note: note || undefined,
      });
      setMessage(tx("reports.updated", { id: response.report.id }));
      setReason("");
      setNote("");
      await load();
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  return (
    <section className="grid-two">
      <div className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>{t("common.status")}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">{t("status.any")}</option>
            <option value="open">{t("status.open")}</option>
            <option value="under_review">{t("status.underReview")}</option>
            <option value="resolved">{t("status.resolved")}</option>
            <option value="dismissed">{t("status.dismissed")}</option>
            <option value="escalated">{t("status.escalated")}</option>
          </select></label>
          <label>{t("reports.targetType")}<input value={filters.targetType} onChange={(event) => setFilters({ ...filters, targetType: event.target.value })} /></label>
          <label>{t("reports.reporterAmoriaId")}<input value={filters.reporterAmoriaId} onChange={(event) => setFilters({ ...filters, reporterAmoriaId: event.target.value })} /></label>
          <label>{t("reports.targetOwnerAmoriaId")}<input value={filters.targetOwnerAmoriaId} onChange={(event) => setFilters({ ...filters, targetOwnerAmoriaId: event.target.value })} /></label>
          <label>{t("common.limit")}<input value={filters.limit} onChange={(event) => setFilters({ ...filters, limit: event.target.value })} inputMode="numeric" /></label>
          <button>{t("common.load")}</button>
        </form>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("common.created")}</th>
                <th>{t("common.status")}</th>
                <th>{t("reports.reporter")}</th>
                <th>{t("common.target")}</th>
                <th>{t("reports.owner")}</th>
                <th>{t("common.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => void openDetail(item.id)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt, language)}</td>
                  <td>{formatStatus(item.status, t)}</td>
                  <td>{item.reporter.amoriaId}</td>
                  <td>{item.targetType}:{item.targetId}</td>
                  <td>{item.targetOwner?.amoriaId ?? ""}</td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState label={t("reports.empty")} />}
      </div>
      <div className="panel">
        <h2>{t("reports.reportDetail")}</h2>
        {selected ? (
          <>
            <JsonBlock data={selected} />
            <form className="stack-form" onSubmit={submitAction}>
              <label>{t("common.action")}<select value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="mark_under_review">{t("reports.markUnderReview")}</option>
                <option value="dismiss">{t("reports.dismiss")}</option>
                <option value="resolve">{t("reports.resolve")}</option>
                <option value="escalate">{t("reports.escalate")}</option>
                <option value="add_note">{t("reports.addNote")}</option>
                <option value="assign">{t("reports.assign")}</option>
              </select></label>
              <label>{t("common.reason")}<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <label>{t("common.note")}<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
              <button>{t("common.apply")}</button>
            </form>
          </>
        ) : <EmptyState label={t("reports.select")} />}
      </div>
    </section>
  );
}

function TogetherQueueScreen({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const { language, t } = useI18n();
  const [filters, setFilters] = useState({
    status: "",
    activity: "",
    radiusKm: "",
    geoMode: "",
    hasCoordinates: "",
    limit: "100",
  });
  const [items, setItems] = useState<TogetherQueueEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  async function load(nextFilters = filters) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<{ items: TogetherQueueEntry[]; nextCursor: null }>(
        `/admin/together/queue${toQuery(nextFilters)}`,
      );
      setItems(response.items);
    } catch (error) {
      setError(errorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCancel(item: TogetherQueueEntry) {
    if (item.status !== "waiting") {
      return;
    }

    const reason = window.prompt(t("queue.cancelReasonPrompt"))?.trim();
    if (!reason) {
      window.alert(t("queue.cancelReasonRequired"));
      return;
    }

    if (!window.confirm(t("queue.cancelConfirm"))) {
      return;
    }

      setBusyEntryId(item.entryId);
    try {
      await apiPost<{ ok: true; entry: TogetherQueueEntry }>(
        `/admin/together/queue/${item.entryId}/actions`,
        { action: "cancel", reason },
      );
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t("error.requestFailed"));
    } finally {
      setBusyEntryId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("queue.title")}</h2>
        <button className="secondary" onClick={() => void load()}>{t("common.refresh")}</button>
      </div>
      <div className="hint-list">
        <strong>{t("queue.whyNotMatchingTitle")}</strong>
        <span>{t("queue.whyNotMatchingBody")}</span>
        <span>{t("queue.cancelDiagnosticsBody")}</span>
      </div>
      <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label>{t("common.status")}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">{t("status.any")}</option>
          <option value="waiting">{t("queue.statusWaiting")}</option>
          <option value="matched">{t("queue.statusMatched")}</option>
          <option value="expired">{t("queue.statusExpired")}</option>
          <option value="cancelled">{t("queue.statusCancelled")}</option>
        </select></label>
        <label>{t("queue.activity")}<input value={filters.activity} onChange={(event) => setFilters({ ...filters, activity: event.target.value })} /></label>
        <label>{t("queue.radiusKm")}<select value={filters.radiusKm} onChange={(event) => setFilters({ ...filters, radiusKm: event.target.value })}>
          <option value="">{t("status.any")}</option>
          <option value="none">{t("queue.noLimit")}</option>
          <option value="5">5</option>
          <option value="25">25</option>
          <option value="100">100</option>
          <option value="250">250</option>
        </select></label>
        <label>{t("queue.geoMode")}<select value={filters.geoMode} onChange={(event) => setFilters({ ...filters, geoMode: event.target.value })}>
          <option value="">{t("status.any")}</option>
          <option value="finite_with_location">{t("queue.geoModeFinite")}</option>
          <option value="no_limit_with_location">{t("queue.geoModeNoLimit")}</option>
          <option value="missing_location_invalid_old_entry">{t("queue.geoModeMissing")}</option>
        </select></label>
        <label>{t("queue.hasCoordinates")}<select value={filters.hasCoordinates} onChange={(event) => setFilters({ ...filters, hasCoordinates: event.target.value })}>
          <option value="">{t("status.any")}</option>
          <option value="true">{t("common.yes")}</option>
          <option value="false">{t("common.no")}</option>
        </select></label>
        <label>{t("common.limit")}<input value={filters.limit} onChange={(event) => setFilters({ ...filters, limit: event.target.value })} inputMode="numeric" /></label>
        <button>{t("common.load")}</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="empty">{t("common.loading")}</div> : null}
      {!loading && items.length ? (
        <table>
          <thead>
            <tr>
              <th>{t("common.created")}</th>
              <th>{t("queue.age")}</th>
              <th>{t("queue.expiresAt")}</th>
              <th>{t("queue.user")}</th>
              <th>{t("queue.activity")}</th>
              <th>{t("common.status")}</th>
              <th>{t("queue.radiusKm")}</th>
              <th>{t("queue.hasCoordinates")}</th>
              <th>{t("queue.geoMode")}</th>
              <th>{t("queue.waitingReason")}</th>
              <th>{t("queue.cancelSource")}</th>
              <th>{t("queue.cancelReason")}</th>
              <th>{t("queue.cancelledAt")}</th>
              <th>{t("queue.lastAction")}</th>
              <th>{t("queue.stale")}</th>
              <th>{t("queue.matchedSessionId")}</th>
              <th>{t("common.action")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const stale = isStaleQueueEntry(item);
              const invalidOldEntry = item.geoMode === "missing_location_invalid_old_entry";
              const suspiciousCancel = isSuspiciousQueueCancel(item);
              return (
              <tr key={item.entryId} className={stale || invalidOldEntry || suspiciousCancel ? "warning-row" : ""}>
                <td>{formatDate(item.createdAt, language)}</td>
                <td>{formatAgeSeconds(item.ageSeconds, t)}</td>
                <td>{formatDate(item.expiresAt, language)}</td>
                <td>
                  <div>{item.displayName || item.amoriaId || item.userId}</div>
                  <div className="muted">{item.amoriaId || item.userId}</div>
                </td>
                <td>{item.activity}</td>
                <td>{formatQueueStatus(item.status, t)}</td>
                <td>{item.radiusKm === null ? t("queue.noLimit") : item.radiusKm}</td>
                <td>{item.hasCoordinates ? t("common.yes") : t("common.no")}</td>
                <td>
                  {invalidOldEntry ? (
                    <span className="badge badge-warning">{t("queue.oldMissingLocation")}</span>
                  ) : formatQueueGeoMode(item.geoMode, t)}
                </td>
                <td>{formatQueueWaitingReason(item.waitingReason, t)}</td>
                <td>
                  {suspiciousCancel ? (
                    <span className="badge badge-warning">{formatQueueCancelSource(item.cancelSource, t)}</span>
                  ) : formatQueueCancelSource(item.cancelSource, t)}
                </td>
                <td>{item.cancelReason ?? ""}</td>
                <td>{item.cancelledAt ? formatDate(item.cancelledAt, language) : ""}</td>
                <td>{formatQueueLastAction(item.lastAction, t)}</td>
                <td>{stale ? <span className="badge badge-warning">{t("common.yes")}</span> : t("common.no")}</td>
                <td>
                  {item.matchedSessionId ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenSession(item.matchedSessionId ?? "");
                      }}
                    >
                      {item.matchedSessionId}
                    </button>
                  ) : ""}
                </td>
                <td>
                  <button
                    className="secondary"
                    disabled={item.status !== "waiting" || busyEntryId === item.entryId}
                    onClick={() => void handleCancel(item)}
                  >
                    {busyEntryId === item.entryId ? t("queue.cancelling") : t("queue.cancelWaiting")}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {!loading && !items.length ? <EmptyState label={t("queue.empty")} /> : null}
    </section>
  );
}

function TogetherSessionsScreen({ initialSessionId }: { initialSessionId: string }) {
  const { language, t } = useI18n();
  const [filters, setFilters] = useState({
    status: "",
    activity: "",
    sessionId: initialSessionId,
  });
  const [items, setItems] = useState<TogetherSessionItem[]>([]);
  const [selected, setSelected] = useState<TogetherSessionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      sessionId: initialSessionId,
    }));
  }, [initialSessionId]);

  async function load(nextFilters = filters) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<{ items: TogetherSessionItem[]; nextCursor: null }>(
        `/admin/together/sessions${toQuery(nextFilters)}`,
      );
      setItems(response.items);
      setSelected(response.items[0] ?? null);
    } catch (error) {
      setError(errorMessage(error, t));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load({
      status: "",
      activity: "",
      sessionId: initialSessionId,
    });
  }, [initialSessionId]);

  return (
    <section className="grid-two">
      <div className="panel">
        <div className="panel-header">
          <h2>{t("sessions.title")}</h2>
          <button className="secondary" onClick={() => void load()}>{t("common.refresh")}</button>
        </div>
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>{t("common.status")}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">{t("status.any")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="finished">{t("sessions.statusFinished")}</option>
            <option value="abandoned">{t("sessions.statusAbandoned")}</option>
            <option value="cancelled">{t("queue.statusCancelled")}</option>
          </select></label>
          <label>{t("queue.activity")}<input value={filters.activity} onChange={(event) => setFilters({ ...filters, activity: event.target.value })} /></label>
          <label>{t("sessions.sessionId")}<input value={filters.sessionId} onChange={(event) => setFilters({ ...filters, sessionId: event.target.value })} /></label>
          <button>{t("common.load")}</button>
        </form>
        {error ? <div className="error">{error}</div> : null}
        {loading ? <div className="empty">{t("common.loading")}</div> : null}
        {!loading && items.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("common.created")}</th>
                <th>{t("sessions.sessionId")}</th>
                <th>{t("queue.activity")}</th>
                <th>{t("common.status")}</th>
                <th>{t("sessions.participants")}</th>
                <th>{t("sessions.heartbeat")}</th>
                <th>{t("sessions.lastHeartbeatAt")}</th>
                <th>{t("sessions.leftAt")}</th>
                <th>{t("sessions.events")}</th>
                <th>{t("sessions.reveals")}</th>
                <th>{t("sessions.endedReason")}</th>
                <th>{t("sessions.sourceSessionId")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.sessionId}
                  onClick={() => setSelected(item)}
                  className={item.hasStaleParticipant ? "warning-row" : selected?.sessionId === item.sessionId ? "selected" : ""}
                >
                  <td>{formatDate(item.createdAt, language)}</td>
                  <td>{item.sessionId}</td>
                  <td>{item.activity}</td>
                  <td>{formatTogetherSessionStatus(item.status, t)}</td>
                  <td>{item.participantUserIds.join(", ")}</td>
                  <td>
                    {item.hasStaleParticipant ? (
                      <span className="badge badge-warning">{t("sessions.staleHeartbeat")}</span>
                    ) : t("sessions.heartbeatOk")}
                  </td>
                  <td>{item.lastHeartbeatAt ? formatDate(item.lastHeartbeatAt, language) : ""}</td>
                  <td>{item.leftAt ? formatDate(item.leftAt, language) : ""}</td>
                  <td>
                    {t("sessions.eventCounts")
                      .replace("{total}", String(item.eventCount))
                      .replace("{strokes}", String(item.strokeEventCount))
                      .replace("{stories}", String(item.storyChoiceCount))}
                  </td>
                  <td>{formatRevealSummary(item, t)}</td>
                  <td>{item.endedReason ?? ""}</td>
                  <td>{item.sourceSessionId ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {!loading && !items.length && initialSessionId ? (
          <div className="error">{t("sessions.matchedSessionMissing")}</div>
        ) : null}
        {!loading && !items.length ? <EmptyState label={t("sessions.empty")} /> : null}
      </div>
      <div className="panel">
        <h2>{t("sessions.detailTitle")}</h2>
        {selected ? (
          <>
            <dl className="facts compact">
              <Fact label={t("sessions.sessionId")} value={selected.sessionId} />
              <Fact label={t("common.status")} value={formatTogetherSessionStatus(selected.status, t)} />
              <Fact label={t("sessions.deadlineAt")} value={selected.deadlineAt ? formatDate(selected.deadlineAt, language) : ""} />
              <Fact label={t("sessions.endedAt")} value={selected.endedAt ? formatDate(selected.endedAt, language) : ""} />
              <Fact label={t("sessions.heartbeat")} value={selected.hasStaleParticipant ? t("sessions.staleHeartbeat") : t("sessions.heartbeatOk")} />
              <Fact label={t("sessions.lastHeartbeatAt")} value={selected.lastHeartbeatAt ? formatDate(selected.lastHeartbeatAt, language) : ""} />
              <Fact label={t("sessions.leftAt")} value={selected.leftAt ? formatDate(selected.leftAt, language) : ""} />
            </dl>
            <JsonBlock data={selected} />
          </>
        ) : <EmptyState label={t("empty.selectRow")} />}
      </div>
    </section>
  );
}

function MediaPreviewCell({ item }: { item: MediaItem }) {
  const { t } = useI18n();
  const previewUrl = resolveApiUrl(item.previewUrl);
  const [failed, setFailed] = useState(false);
  const [probe, setProbe] = useState<{
    ok: boolean;
    httpStatus: number | null;
    contentType: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    setFailed(false);
    setProbe(null);
  }, [item.id, previewUrl]);

  async function checkUrl(event: MouseEvent) {
    event.stopPropagation();
    setProbe(await probePublicMediaUrl(item.publicUrl ?? item.previewUrl));
  }

  if (!previewUrl) {
    return (
      <span className="muted">
        {item.visibility === "locked" ? t("media.lockedPreview") : ""}
      </span>
    );
  }

  return (
    <div className="media-thumb-cell">
      {!failed ? (
        <img
          className="media-thumb"
          src={previewUrl}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="media-thumb-fallback">
          <strong>{t("media.previewFailed")}</strong>
          <span>{item.id}</span>
          <span>{formatStatus(item.moderationStatus, t)}</span>
          <span>{item.mimeType}</span>
          {probe ? (
            <span>
              HTTP {probe.httpStatus ?? "?"}
              {probe.contentType ? ` · ${probe.contentType}` : ""}
              {probe.error ? ` · ${probe.error}` : ""}
            </span>
          ) : null}
        </div>
      )}
      <button className="link-button" type="button" onClick={(event) => void checkUrl(event)}>
        {t("media.checkUrl")}
      </button>
      {probe ? (
        <span className={probe.ok ? "media-probe-ok" : "media-probe-failed"}>
          HTTP {probe.httpStatus ?? "?"}
        </span>
      ) : null}
    </div>
  );
}

function MediaScreen({ setMessage }: { setMessage: (message: string | null) => void }) {
  const { language, t, tx } = useI18n();
  const [filters, setFilters] = useState({ ownerAmoriaId: "", type: "", moderationStatus: "", limit: "50" });
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaDetail | null>(null);
  const [detailReason, setDetailReason] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [decisionAction, setDecisionAction] = useState("mark_under_review");
  const [decisionReason, setDecisionReason] = useState("");
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewProbe, setPreviewProbe] = useState<{
    ok: boolean;
    httpStatus: number | null;
    contentType: string | null;
    error: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decisionRequiresReason = decisionAction === "restrict" || decisionAction === "remove" || selected?.visibility === "locked";

  useEffect(() => {
    if (!selected) {
      setPreviewBlobUrl(null);
      setPreviewError(false);
      setPreviewProbe(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewBlobUrl(null);
    setPreviewError(false);
    setPreviewProbe(null);

    apiBlob(`/admin/media/${selected.id}/content${toQuery({ reason: selectedReason })}`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setPreviewBlobUrl(objectUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(true);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selected?.id, selectedReason]);

  async function load() {
    setError(null);
    try {
      const response = await apiGet<{ items: MediaItem[] }>(`/admin/media${toQuery(filters)}`);
      setItems(response.items);
      setSelected(null);
      setSelectedReason("");
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  async function openDetail(item: MediaItem) {
    setError(null);
    try {
      const response = await apiGet<{ media: MediaDetail }>(
        `/admin/media/${item.id}${toQuery({ reason: detailReason })}`,
      );
      setSelected(response.media);
      setSelectedReason(detailReason);
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    try {
      const response = await apiPost<{ media: MediaItem }>(`/admin/media/${selected.id}/decision`, {
        action: decisionAction,
        reason: decisionReason || undefined,
      });
      setMessage(tx("media.reviewed", { id: response.media.id }));
      setDecisionReason("");
      await load();
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  async function checkSelectedPublicUrl() {
    if (!selected) return;
    setPreviewProbe(await probePublicMediaUrl(selected.publicUrl ?? selected.previewUrl));
  }

  return (
    <section className="grid-two">
      <div className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>{t("media.ownerAmoriaId")}<input value={filters.ownerAmoriaId} onChange={(event) => setFilters({ ...filters, ownerAmoriaId: event.target.value })} /></label>
          <label>{t("common.type")}<input value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })} /></label>
          <label>{t("media.moderationStatus")}<select value={filters.moderationStatus} onChange={(event) => setFilters({ ...filters, moderationStatus: event.target.value })}>
            <option value="">{t("status.any")}</option>
            <option value="pending_review">{t("status.pendingReview")}</option>
            <option value="needs_manual_review">{t("status.needsManualReview")}</option>
            <option value="approved">{t("status.approved")}</option>
            <option value="restricted">{t("status.restricted")}</option>
            <option value="rejected">{t("status.rejected")}</option>
          </select></label>
          <label>{t("common.limit")}<input value={filters.limit} onChange={(event) => setFilters({ ...filters, limit: event.target.value })} inputMode="numeric" /></label>
          <label>{t("media.detailReason")}<input value={detailReason} onChange={(event) => setDetailReason(event.target.value)} /></label>
          <button>{t("common.load")}</button>
        </form>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("media.preview")}</th>
                <th>{t("common.created")}</th>
                <th>{t("media.mediaId")}</th>
                <th>{t("common.owner")}</th>
                <th>{t("media.ownerUserId")}</th>
                <th>{t("common.type")}</th>
                <th>{t("media.visibility")}</th>
                <th>{t("media.mime")}</th>
                <th>{t("media.size")}</th>
                <th>{t("common.status")}</th>
                <th>{t("media.publicUrl")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const publicUrl = resolveApiUrl(item.publicUrl);
                return (
                  <tr key={item.id} onClick={() => void openDetail(item)} className={selected?.id === item.id ? "selected" : ""}>
                    <td>
                      <MediaPreviewCell item={item} />
                    </td>
                    <td>{formatDate(item.createdAt, language)}</td>
                    <td>{item.id}</td>
                    <td>{item.owner.amoriaId}</td>
                    <td>{item.ownerUserId}</td>
                    <td>{item.type}</td>
                    <td>{item.visibility ?? ""}</td>
                    <td>{item.mimeType}</td>
                    <td>{item.sizeBytes}</td>
                    <td>{formatStatus(item.moderationStatus, t)}</td>
                    <td>
                      {publicUrl ? (
                        <div className="media-url-cell">
                          <a href={publicUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                            {t("media.openImage")}
                          </a>
                          <code>{item.publicUrl}</code>
                        </div>
                      ) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyState label={t("media.empty")} />}
      </div>
      <div className="panel">
        <h2>{t("media.mediaDetail")}</h2>
        {selected ? (
          <>
            <div className="media-preview-frame">
              {previewBlobUrl ? <img className="media-preview" src={previewBlobUrl} alt="" /> : null}
              {previewError ? (
                <div className="error">
                  {t("media.previewFailed")}
                  <div className="media-diagnostic">
                    <span>{selected.id}</span>
                    <span>{formatStatus(selected.moderationStatus, t)}</span>
                    <span>{selected.mimeType}</span>
                  </div>
                </div>
              ) : null}
              {!previewBlobUrl && !previewError ? <div className="empty">{t("media.previewLoading")}</div> : null}
              {previewBlobUrl ? (
                <button className="secondary" type="button" onClick={() => window.open(previewBlobUrl, "_blank", "noopener,noreferrer")}>
                  {t("media.openImage")}
                </button>
              ) : null}
              {selected.publicUrl ? (
                <button className="secondary" type="button" onClick={() => void checkSelectedPublicUrl()}>
                  {t("media.checkUrl")}
                </button>
              ) : null}
              {previewProbe ? (
                <div className={previewProbe.ok ? "notice" : "error"}>
                  HTTP {previewProbe.httpStatus ?? "?"}
                  {previewProbe.contentType ? ` · ${previewProbe.contentType}` : ""}
                  {previewProbe.error ? ` · ${previewProbe.error}` : ""}
                </div>
              ) : null}
            </div>
            <dl className="facts compact">
              <Fact label={t("media.mediaId")} value={selected.id} />
              <Fact label={t("media.ownerUserId")} value={selected.ownerUserId} />
              <Fact label={t("common.status")} value={formatStatus(selected.moderationStatus, t)} />
              <Fact label={t("media.mime")} value={selected.mimeType} />
              <Fact label={t("media.size")} value={String(selected.sizeBytes)} />
              <Fact label={t("media.publicUrl")} value={resolveApiUrl(selected.publicUrl) ?? ""} />
            </dl>
            <form className="stack-form" onSubmit={submitDecision}>
              <label>{t("common.decision")}<select value={decisionAction} onChange={(event) => setDecisionAction(event.target.value)}>
                <option value="approve">{t("media.approve")}</option>
                <option value="restrict">{t("media.restrict")}</option>
                <option value="remove">{t("media.remove")}</option>
                <option value="mark_under_review">{t("reports.markUnderReview")}</option>
              </select></label>
              <label>{t("common.reason")}<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} required={decisionRequiresReason} /></label>
              <button>{t("media.saveDecision")}</button>
            </form>
            <h3>{t("media.debugMetadata")}</h3>
            <JsonBlock data={selected} />
          </>
        ) : <EmptyState label={t("media.select")} />}
      </div>
    </section>
  );
}

function OpsHealthScreen() {
  const { language, t } = useI18n();
  const { data, error, reload } = useLoad<OpsHealth>("/admin/ops/health");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("ops.title")}</h2>
        <button className="secondary" onClick={reload}>{t("common.refresh")}</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <dl className="facts">
          <Fact label={t("common.service")} value={data.service} />
          <Fact label={t("common.time")} value={formatDate(data.time, language)} />
          <Fact label={t("ops.nodeEnv")} value={data.nodeEnv} />
          <Fact label={t("ops.database")} value={data.database.ok ? t("status.ok") : t("status.failed")} />
          <Fact label={t("ops.objectStorage")} value={`${formatStatus(data.objectStorage.status, t)}: ${data.objectStorage.reason}`} />
          <Fact label={t("ops.openClientErrors")} value={formatCount(data.counts.openClientErrors)} />
          <Fact label={t("ops.openReports")} value={formatCount(data.counts.openReports)} />
          <Fact label={t("ops.pendingMedia")} value={formatCount(data.counts.pendingMediaModerationItems)} />
        </dl>
      ) : <EmptyState label={t("ops.empty")} />}
    </section>
  );
}

function BootstrapScreen() {
  const { t } = useI18n();
  return (
    <section className="panel prose">
      <h2>{t("bootstrap.title")}</h2>
      <p>{t("bootstrap.create")}</p>
      <pre>npm run admin:create-owner</pre>
      <p>{t("bootstrap.env")}</p>
    </section>
  );
}

function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language-switcher">
      {t("language.label")}
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
        <option value="en">{t("language.en")}</option>
        <option value="ru">{t("language.ru")}</option>
      </select>
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <table>
      <thead>
        <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailPanel({ title, data }: { title: string; data: unknown }) {
  const { t } = useI18n();
  return (
    <div className="panel">
      <h2>{title}</h2>
      {data ? <JsonBlock data={data} /> : <EmptyState label={t("empty.selectRow")} />}
    </div>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  const value = useMemo(() => JSON.stringify(data, null, 2), [data]);
  return <pre className="json-block">{value}</pre>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty">{label}</div>;
}

function useLoad<T>(path: string) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiGet<T>(path)
      .then((value) => {
        if (!cancelled) {
          setData(value);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setError(errorMessage(error, t));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, nonce, t]);

  return {
    data,
    error,
    reload: () => setNonce((value) => value + 1),
  };
}

function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("i18n context is missing");
  }
  return value;
}

function formatDate(value: string, language: Language): string {
  return new Date(value).toLocaleString(language === "ru" ? "ru-RU" : "en-US");
}

function isStaleQueueEntry(item: TogetherQueueEntry): boolean {
  if (item.status !== "waiting") {
    return false;
  }

  const now = Date.now();
  const createdAt = new Date(item.createdAt).getTime();
  const expiresAt = new Date(item.expiresAt).getTime();
  return expiresAt <= now || now - createdAt > 5 * 60 * 1000;
}

function isSuspiciousQueueCancel(item: TogetherQueueEntry): boolean {
  return (
    item.status === "cancelled" &&
    (item.cancelSource === "screen_cleanup" ||
      item.cancelSource === "navigation_blur" ||
      item.cancelSource === "unknown")
  );
}

function formatCount(value: number | null): string {
  return value === null ? "" : String(value);
}

function errorMessage(error: unknown, t: (key: TranslationKey) => string): string {
  return error instanceof Error ? error.message : t("error.requestFailed");
}

function formatRoles(roles: string[], t: (key: TranslationKey) => string): string {
  return roles.map((role) => formatRole(role, t)).join(", ");
}

function formatRole(role: string, t: (key: TranslationKey) => string): string {
  switch (role) {
    case "owner":
      return t("role.owner");
    case "support":
      return t("role.support");
    case "moderator":
      return t("role.moderator");
    case "ops":
      return t("role.ops");
    default:
      return role;
  }
}

function formatStatus(status: string, t: (key: TranslationKey) => string): string {
  switch (status) {
    case "active":
      return t("status.active");
    case "approved":
      return t("status.approved");
    case "archived":
      return t("status.archived");
    case "disabled":
      return t("status.disabled");
    case "dismissed":
      return t("status.dismissed");
    case "escalated":
      return t("status.escalated");
    case "failed":
      return t("status.failed");
    case "ignored":
      return t("status.ignored");
    case "not_checked":
      return t("status.notChecked");
    case "needs_manual_review":
      return t("status.needsManualReview");
    case "ok":
      return t("status.ok");
    case "open":
      return t("status.open");
    case "pending_review":
      return t("status.pendingReview");
    case "rejected":
      return t("status.rejected");
    case "resolved":
      return t("status.resolved");
    case "restricted":
      return t("status.restricted");
    case "under_review":
      return t("status.underReview");
    default:
      return status;
  }
}

function formatQueueStatus(status: string, t: (key: TranslationKey) => string): string {
  switch (status) {
    case "waiting":
      return t("queue.statusWaiting");
    case "matched":
      return t("queue.statusMatched");
    case "expired":
      return t("queue.statusExpired");
    case "cancelled":
      return t("queue.statusCancelled");
    default:
      return status;
  }
}

function formatQueueGeoMode(geoMode: string, t: (key: TranslationKey) => string): string {
  switch (geoMode) {
    case "finite_with_location":
      return t("queue.geoModeFinite");
    case "no_limit_with_location":
      return t("queue.geoModeNoLimit");
    case "missing_location_invalid_old_entry":
      return t("queue.geoModeMissing");
    default:
      return geoMode;
  }
}

function formatQueueWaitingReason(reason: string, t: (key: TranslationKey) => string): string {
  switch (reason) {
    case "no_candidate":
      return t("queue.reasonNoCandidate");
    case "activity_mismatch":
      return t("queue.reasonActivityMismatch");
    case "radius_distance_too_far":
      return t("queue.reasonRadiusTooFar");
    case "missing_coordinates_old_entry":
      return t("queue.reasonMissingCoordinates");
    case "same_user_excluded":
      return t("queue.reasonSameUser");
    case "candidate_expired":
      return t("queue.reasonCandidateExpired");
    case "candidate_cancelled":
      return t("queue.reasonCandidateCancelled");
    case "location_required":
      return t("queue.reasonLocationRequired");
    case "unknown":
      return t("queue.reasonUnknown");
    default:
      return reason;
  }
}

function formatQueueCancelSource(
  source: TogetherQueueEntry["cancelSource"],
  t: (key: TranslationKey) => string,
): string {
  switch (source) {
    case "user_stop":
      return t("queue.cancelSourceUserStop");
    case "user_back":
      return t("queue.cancelSourceUserBack");
    case "retry_restart":
      return t("queue.cancelSourceRetryRestart");
    case "radius_expansion":
      return t("queue.cancelSourceRadiusExpansion");
    case "screen_cleanup":
      return t("queue.cancelSourceScreenCleanup");
    case "navigation_blur":
      return t("queue.cancelSourceNavigationBlur");
    case "admin_cancel":
      return t("queue.cancelSourceAdminCancel");
    case "server_expired":
      return t("queue.cancelSourceServerExpired");
    case "matched":
      return t("queue.cancelSourceMatched");
    case "unknown":
      return t("queue.cancelSourceUnknown");
    case null:
    default:
      return "";
  }
}

function formatQueueLastAction(
  action: string | null,
  t: (key: TranslationKey) => string,
): string {
  switch (action) {
    case "queued":
      return t("queue.lastActionQueued");
    case "same_search_rejoin":
      return t("queue.lastActionSameSearchRejoin");
    case "client_poll":
      return t("queue.lastActionClientPoll");
    case "matched":
      return t("queue.lastActionMatched");
    case "cancelled":
      return t("queue.lastActionCancelled");
    case "expired":
      return t("queue.lastActionExpired");
    case null:
      return "";
    default:
      return action;
  }
}

function formatAgeSeconds(seconds: number, t: (key: TranslationKey) => string): string {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (safeSeconds < 60) {
    return t("queue.ageSeconds").replace("{count}", String(safeSeconds));
  }

  return t("queue.ageMinutes").replace("{count}", String(Math.floor(safeSeconds / 60)));
}

function formatTogetherSessionStatus(status: string, t: (key: TranslationKey) => string): string {
  switch (status) {
    case "active":
      return t("status.active");
    case "finished":
      return t("sessions.statusFinished");
    case "abandoned":
      return t("sessions.statusAbandoned");
    case "cancelled":
      return t("queue.statusCancelled");
    default:
      return status;
  }
}

function formatRevealSummary(
  item: TogetherSessionItem,
  t: (key: TranslationKey) => string,
): string {
  return t("sessions.revealCounts")
    .replace("{open}", String(item.revealDecisions.open))
    .replace("{skip}", String(item.revealDecisions.skip))
    .replace("{continueStory}", String(item.revealDecisions.continueStory))
    .replace("{pending}", String(item.revealDecisions.pending));
}
