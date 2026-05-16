import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminHealth,
  AdminMe,
  ApiError,
  AuditLogItem,
  ClientErrorItem,
  MediaDetail,
  MediaItem,
  OpsHealth,
  ReportDetail,
  ReportItem,
  Tokens,
  UserSearchItem,
  apiGet,
  apiPost,
  clearTokens,
  loadTokens,
  login,
  logout,
  saveTokens,
  toQuery,
} from "./api";

type Screen =
  | "dashboard"
  | "users"
  | "clientErrors"
  | "auditLog"
  | "reports"
  | "media"
  | "opsHealth"
  | "bootstrap";

const screens: Array<{ key: Screen; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "clientErrors", label: "Client Errors" },
  { key: "reports", label: "Reports" },
  { key: "media", label: "Media Moderation" },
  { key: "auditLog", label: "Audit Log" },
  { key: "opsHealth", label: "Ops Health" },
  { key: "bootstrap", label: "Bootstrap" },
];

export function App() {
  const [tokens, setTokens] = useState<Tokens | null>(() => loadTokens());
  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [authState, setAuthState] = useState<"checking" | "login" | "ready" | "forbidden">("checking");
  const [message, setMessage] = useState<string | null>(null);

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

  if (authState === "checking") {
    return <div className="center-panel">Checking admin session...</div>;
  }

  if (authState === "login") {
    return (
      <LoginScreen
        onLogin={(nextTokens) => {
          saveTokens(nextTokens);
          setTokens(nextTokens);
        }}
      />
    );
  }

  if (authState === "forbidden") {
    return <ForbiddenScreen onLogout={handleLogout} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>Amoria</strong>
            <span>Admin/Ops</span>
          </div>
        </div>
        <nav>
          {screens.map((item) => (
            <button
              key={item.key}
              className={screen === item.key ? "active" : ""}
              onClick={() => {
                setScreen(item.key);
                setMessage(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{screens.find((item) => item.key === screen)?.label}</h1>
            {adminMe ? (
              <p>
                {adminMe.user.displayName} · {adminMe.user.amoriaId} · {adminMe.adminUser.roles.join(", ")}
              </p>
            ) : null}
          </div>
          <button className="secondary" onClick={handleLogout}>Logout</button>
        </header>

        {message ? <div className="notice">{message}</div> : null}

        {screen === "dashboard" ? <Dashboard /> : null}
        {screen === "users" ? <UsersScreen /> : null}
        {screen === "clientErrors" ? <ClientErrorsScreen /> : null}
        {screen === "auditLog" ? <AuditLogScreen /> : null}
        {screen === "reports" ? <ReportsScreen setMessage={setMessage} /> : null}
        {screen === "media" ? <MediaScreen setMessage={setMessage} /> : null}
        {screen === "opsHealth" ? <OpsHealthScreen /> : null}
        {screen === "bootstrap" ? <BootstrapScreen /> : null}
      </main>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (tokens: Tokens) => void }) {
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
        setError("This account is not authorized for Admin/Ops.");
      } else {
        setError(error instanceof Error ? error.message : "Login failed");
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
            <span>Admin/Ops</span>
          </div>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
      </form>
    </div>
  );
}

function ForbiddenScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="center-panel">
      <h1>Not Authorized</h1>
      <p>The signed-in account passed auth but is not an active Admin/Ops user.</p>
      <button onClick={onLogout}>Back to login</button>
    </div>
  );
}

function Dashboard() {
  const { data: health, error, reload } = useLoad<AdminHealth>("/admin/health");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Admin Service</h2>
        <button className="secondary" onClick={reload}>Refresh</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {health ? (
        <dl className="facts">
          <Fact label="Service" value={health.service} />
          <Fact label="Time" value={formatDate(health.time)} />
          <Fact label="Admin User" value={health.admin.userId} />
          <Fact label="Roles" value={health.admin.roles.join(", ")} />
        </dl>
      ) : <EmptyState label="No health response loaded." />}
    </section>
  );
}

function UsersScreen() {
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
      setError(errorMessage(error));
    }
  }

  return (
    <section className="panel">
      <form className="filters" onSubmit={search}>
        <label>Amoria ID<input value={amoriaId} onChange={(event) => setAmoriaId(event.target.value)} /></label>
        <label>Search<input value={q} onChange={(event) => setQ(event.target.value)} /></label>
        <button>Search</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      {items.length ? (
        <DataTable
          columns={["Amoria ID", "Display Name", "Email", "Avatar", "Created", "Updated"]}
          rows={items.map((item) => [
            item.amoriaId,
            item.displayName,
            item.email,
            item.avatarUrl ?? "",
            formatDate(item.createdAt),
            formatDate(item.updatedAt),
          ])}
        />
      ) : <EmptyState label={searched ? "No users matched the query." : "Search by Amoria ID or text."} />}
    </section>
  );
}

function ClientErrorsScreen() {
  const [filters, setFilters] = useState({
    screen: "",
    action: "",
    code: "",
    amoriaId: "",
    limit: "50",
  });
  const [items, setItems] = useState<ClientErrorItem[]>([]);
  const [selected, setSelected] = useState<ClientErrorItem | null>(null);
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
      setError(errorMessage(error));
    }
  }

  function update(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="grid-two">
      <div className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>Screen<input value={filters.screen} onChange={(event) => update("screen", event.target.value)} /></label>
          <label>Action<input value={filters.action} onChange={(event) => update("action", event.target.value)} /></label>
          <label>Code<input value={filters.code} onChange={(event) => update("code", event.target.value)} /></label>
          <label>Amoria ID<input value={filters.amoriaId} onChange={(event) => update("amoriaId", event.target.value)} /></label>
          <label>Limit<input value={filters.limit} onChange={(event) => update("limit", event.target.value)} inputMode="numeric" /></label>
          <button>Load</button>
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
            Photo upload errors
          </button>
        </form>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Amoria ID</th>
                <th>Screen</th>
                <th>Action</th>
                <th>Step</th>
                <th>Code</th>
                <th>Message</th>
                <th>Platform</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt)}</td>
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
        ) : <EmptyState label="No client errors loaded." />}
      </div>
      <DetailPanel title="Client Error Detail" data={selected} />
    </section>
  );
}

function AuditLogScreen() {
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
          <h2>Audit Log</h2>
          <button className="secondary" onClick={reload}>Refresh</button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Action</th>
                <th>Admin</th>
                <th>Target</th>
                <th>Reason</th>
                <th>Request</th>
                <th>IP</th>
                <th>User Agent</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt)}</td>
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
        ) : <EmptyState label="No audit entries loaded." />}
      </div>
      <DetailPanel title="Audit Metadata" data={selected} />
    </section>
  );
}

function ReportsScreen({ setMessage }: { setMessage: (message: string | null) => void }) {
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
      setError(errorMessage(error));
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
      setMessage(`Report ${response.report.id} updated.`);
      setReason("");
      setNote("");
      await load();
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return (
    <section className="grid-two">
      <div className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Any</option>
            <option value="open">Open</option>
            <option value="under_review">Under review</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="escalated">Escalated</option>
          </select></label>
          <label>Target Type<input value={filters.targetType} onChange={(event) => setFilters({ ...filters, targetType: event.target.value })} /></label>
          <label>Reporter Amoria ID<input value={filters.reporterAmoriaId} onChange={(event) => setFilters({ ...filters, reporterAmoriaId: event.target.value })} /></label>
          <label>Target Owner Amoria ID<input value={filters.targetOwnerAmoriaId} onChange={(event) => setFilters({ ...filters, targetOwnerAmoriaId: event.target.value })} /></label>
          <label>Limit<input value={filters.limit} onChange={(event) => setFilters({ ...filters, limit: event.target.value })} inputMode="numeric" /></label>
          <button>Load</button>
        </form>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Status</th>
                <th>Reporter</th>
                <th>Target</th>
                <th>Owner</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => void openDetail(item.id)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.status}</td>
                  <td>{item.reporter.amoriaId}</td>
                  <td>{item.targetType}:{item.targetId}</td>
                  <td>{item.targetOwner?.amoriaId ?? ""}</td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState label="No reports loaded." />}
      </div>
      <div className="panel">
        <h2>Report Detail</h2>
        {selected ? (
          <>
            <JsonBlock data={selected} />
            <form className="stack-form" onSubmit={submitAction}>
              <label>Action<select value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="mark_under_review">Mark under review</option>
                <option value="dismiss">Dismiss</option>
                <option value="resolve">Resolve</option>
                <option value="escalate">Escalate</option>
                <option value="add_note">Add note</option>
                <option value="assign">Assign</option>
              </select></label>
              <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <label>Note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
              <button>Apply</button>
            </form>
          </>
        ) : <EmptyState label="Select a report." />}
      </div>
    </section>
  );
}

function MediaScreen({ setMessage }: { setMessage: (message: string | null) => void }) {
  const [filters, setFilters] = useState({ ownerAmoriaId: "", type: "", limit: "50" });
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaDetail | null>(null);
  const [detailReason, setDetailReason] = useState("");
  const [decisionAction, setDecisionAction] = useState("mark_under_review");
  const [decisionReason, setDecisionReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const response = await apiGet<{ items: MediaItem[] }>(`/admin/media${toQuery(filters)}`);
      setItems(response.items);
      setSelected(null);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function openDetail(item: MediaItem) {
    setError(null);
    try {
      const response = await apiGet<{ media: MediaDetail }>(
        `/admin/media/${item.id}${toQuery({ reason: detailReason })}`,
      );
      setSelected(response.media);
    } catch (error) {
      setError(errorMessage(error));
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
      setMessage(`Media ${response.media.id} reviewed.`);
      setDecisionReason("");
      await load();
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return (
    <section className="grid-two">
      <div className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>Owner Amoria ID<input value={filters.ownerAmoriaId} onChange={(event) => setFilters({ ...filters, ownerAmoriaId: event.target.value })} /></label>
          <label>Type<input value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })} /></label>
          <label>Limit<input value={filters.limit} onChange={(event) => setFilters({ ...filters, limit: event.target.value })} inputMode="numeric" /></label>
          <label>Detail reason<input value={detailReason} onChange={(event) => setDetailReason(event.target.value)} /></label>
          <button>Load</button>
        </form>
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Owner</th>
                <th>Type</th>
                <th>Visibility</th>
                <th>MIME</th>
                <th>Size</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => void openDetail(item)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.owner.amoriaId}</td>
                  <td>{item.type}</td>
                  <td>{item.visibility ?? ""}</td>
                  <td>{item.mimeType}</td>
                  <td>{item.sizeBytes}</td>
                  <td>{item.moderationStatus ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState label="No media loaded." />}
      </div>
      <div className="panel">
        <h2>Media Detail</h2>
        {selected ? (
          <>
            {selected.url ? <img className="media-preview" src={selected.url} alt="" /> : null}
            <JsonBlock data={selected} />
            <form className="stack-form" onSubmit={submitDecision}>
              <label>Decision<select value={decisionAction} onChange={(event) => setDecisionAction(event.target.value)}>
                <option value="approve">Approve</option>
                <option value="restrict">Restrict</option>
                <option value="remove">Remove</option>
                <option value="mark_under_review">Mark under review</option>
              </select></label>
              <label>Reason<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></label>
              <button>Save decision</button>
            </form>
          </>
        ) : <EmptyState label="Select media. Locked media requires a detail reason." />}
      </div>
    </section>
  );
}

function OpsHealthScreen() {
  const { data, error, reload } = useLoad<OpsHealth>("/admin/ops/health");

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Ops Health</h2>
        <button className="secondary" onClick={reload}>Refresh</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <dl className="facts">
          <Fact label="Service" value={data.service} />
          <Fact label="Time" value={formatDate(data.time)} />
          <Fact label="Node Env" value={data.nodeEnv} />
          <Fact label="Database" value={data.database.ok ? "ok" : "failed"} />
          <Fact label="Object Storage" value={`${data.objectStorage.status}: ${data.objectStorage.reason}`} />
        </dl>
      ) : <EmptyState label="No ops health response loaded." />}
    </section>
  );
}

function BootstrapScreen() {
  return (
    <section className="panel prose">
      <h2>First Owner</h2>
      <p>Create the owner account through the backend script, then sign in here with that email and password.</p>
      <pre>npm run admin:create-owner</pre>
      <p>The script reads ADMIN_OWNER_EMAIL, ADMIN_OWNER_PASSWORD, and ADMIN_OWNER_DISPLAY_NAME. If no password is provided, it generates one and saves it outside the repository under F:\Dev\AmoriaAdminSecrets.</p>
    </section>
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
  return (
    <div className="panel">
      <h2>{title}</h2>
      {data ? <JsonBlock data={data} /> : <EmptyState label="Select a row." />}
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
          setError(errorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  return {
    data,
    error,
    reload: () => setNonce((value) => value + 1),
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}
