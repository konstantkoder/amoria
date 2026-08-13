import {
  createContext,
  FormEvent,
  MouseEvent,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AdminMe,
  AdminNearbyActivityDemand,
  AdminNearbyActivityDemandRow,
  AdminNearbyRoom,
  AdminNearbyRoomAction,
  AdminNearbyRoomType,
  AdminReleaseDashboard,
  AdminUserItem,
  AdminUserDetail,
  AdminBulkJob,
  ApiError,
  AuditLogItem,
  ClientErrorItem,
  MediaDetail,
  MediaItem,
  MessageModerationDetail,
  MessageModerationItem,
  NearbyDiagnostics,
  NearbyFeedExclusionReason,
  NearbyProfileMissingReason,
  OpsHealth,
  PublicMediaProbeResult,
  ReportDetail,
  ReportItem,
  ReportTargetContextLink,
  TogetherQueueEntry,
  TogetherSessionItem,
  UserSearchItem,
  apiBlob,
  apiGet,
  apiPost,
  clearTokens,
  createNearbyRoomFromDemand,
  CreateNearbyRoomFromDemandPayload,
  getAdminNearbyActivityDemand,
  login,
  logout,
  probePublicMediaUrl,
  resolveApiUrl,
  restoreAdminSession,
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
import {
  graphicSafetyFromRawResult,
  type GraphicSafetyDisplayState,
} from "./graphic-safety";
import { getNearbyActivityArtUrl } from "./nearbyActivityArt";

type Screen =
  | "dashboard"
  | "users"
  | "adminUsers"
  | "bulkModeration"
  | "clientErrors"
  | "auditLog"
  | "reports"
  | "messageModeration"
  | "media"
  | "togetherQueue"
  | "togetherSessions"
  | "togetherTurnBased"
  | "opsHealth"
  | "nearbyDiagnostics"
  | "nearbyRooms"
  | "bootstrap";

type ScreenItem = {
  key: Screen;
  labelKey: TranslationKey;
  ownerOnly?: boolean;
  roles?: string[];
};

type UserSearchRequest = {
  nonce: number;
  amoriaId?: string;
  q?: string;
};

type MediaOpenRequest = {
  nonce: number;
  mediaId: string;
  ownerAmoriaId?: string;
  reason?: string;
};

type MessageModerationOpenRequest = {
  nonce: number;
  messageId: string;
  reason: string;
};

type CreateFromDemandForm = {
  activityKey: string;
  activityTitle: string;
  geoBucket: string;
  visibleGeoBuckets: AdminNearbyActivityDemandRow["geoBuckets"];
  title: string;
  description: string;
  locationLabel: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
};

type NearbyDemandSummary = {
  totalInterestedUsers: number;
  totalActiveNearbyUsers: number;
  activitiesWithDemand: number;
  existingActiveRooms: number;
  loadedRows: number;
};

const graphicSafetyLabelKeys: Record<GraphicSafetyDisplayState, TranslationKey> = {
  safe: "media.graphicSafe",
  needs_review: "media.graphicNeedsReview",
  unsafe: "media.graphicUnsafe",
};

const screens: ScreenItem[] = [
  { key: "dashboard", labelKey: "nav.dashboard" },
  { key: "users", labelKey: "nav.users", roles: ["owner", "support", "moderator"] },
  { key: "adminUsers", labelKey: "nav.adminUsers", ownerOnly: true },
  { key: "bulkModeration", labelKey: "nav.bulkModeration", roles: ["owner", "moderator"] },
  { key: "clientErrors", labelKey: "nav.clientErrors", roles: ["owner", "support", "ops"] },
  { key: "reports", labelKey: "nav.reports", roles: ["owner", "moderator", "support"] },
  { key: "messageModeration", labelKey: "nav.messageModeration", roles: ["owner", "moderator", "support", "ops"] },
  { key: "media", labelKey: "nav.media", roles: ["owner", "moderator", "support"] },
  { key: "togetherQueue", labelKey: "nav.togetherQueue", roles: ["owner", "ops"] },
  { key: "togetherSessions", labelKey: "nav.togetherSessions", roles: ["owner", "ops"] },
  { key: "togetherTurnBased", labelKey: "nav.togetherTurnBased", roles: ["owner", "ops", "support"] },
  { key: "auditLog", labelKey: "nav.auditLog", ownerOnly: true },
  { key: "opsHealth", labelKey: "nav.opsHealth", roles: ["owner", "support", "ops"] },
  { key: "nearbyDiagnostics", labelKey: "nav.nearbyDiagnostics", roles: ["owner", "ops"] },
  { key: "nearbyRooms", labelKey: "nav.nearbyRooms", roles: ["owner", "moderator", "support", "ops"] },
  { key: "bootstrap", labelKey: "nav.bootstrap", ownerOnly: true },
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
  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [authState, setAuthState] = useState<"checking" | "login" | "ready" | "forbidden">("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [togetherSessionFilter, setTogetherSessionFilter] = useState("");
  const [userSearchRequest, setUserSearchRequest] = useState<UserSearchRequest | null>(null);
  const [mediaOpenRequest, setMediaOpenRequest] = useState<MediaOpenRequest | null>(null);
  const [messageModerationOpenRequest, setMessageModerationOpenRequest] = useState<MessageModerationOpenRequest | null>(null);

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
    void restoreAdminSession().then(async (session) => {
      if (!session) {
        setAuthState("login");
        return;
      }
      try {
        const me = await apiGet<AdminMe>("/admin/me");
        setAdminMe(me);
        setAuthState("ready");
      } catch (error) {
        clearTokens();
        setAuthState(error instanceof ApiError && error.status === 403 ? "forbidden" : "login");
      }
    });
  }, []);

  async function handleLogout() {
    try {
      await logout();
      setAuthError(null);
    } catch (error) {
      const nextError = errorMessage(error, t);
      setAuthError(nextError);
      setMessage(`${t("common.logout")}: ${nextError}`);
      return;
    }
    clearTokens();
    setAdminMe(null);
    setAuthState("login");
  }

  const visibleScreens = screens.filter(
    (item) =>
      (!item.ownerOnly || adminMe?.adminUser.roles.includes("owner")) &&
      (!item.roles || item.roles.some((role) => adminMe?.adminUser.roles.includes(role))),
  );
  const canManageNearbyRooms =
    adminMe?.adminUser.roles.some((role) => role === "owner" || role === "moderator") ?? false;
  const canReviewMessages =
    adminMe?.adminUser.roles.some((role) => role === "owner" || role === "moderator") ?? false;
  const canControlUsers = canReviewMessages;
  const canManageReports = canReviewMessages;
  const canManageMedia = canReviewMessages;
  const activeScreen = visibleScreens.some((item) => item.key === screen) ? screen : "dashboard";
  const activeLabel = screens.find((item) => item.key === activeScreen)?.labelKey ?? "nav.dashboard";

  let content;
  if (authState === "checking") {
    content = <div className="center-panel">{t("auth.checking")}</div>;
  } else if (authState === "login") {
    content = (
      <LoginScreen
        initialError={authError}
        onLogin={(me) => {
          setAuthError(null);
          setAdminMe(me);
          setAuthState("ready");
        }}
      />
    );
  } else if (authState === "forbidden") {
    content = <ForbiddenScreen error={authError} onLogout={handleLogout} />;
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

          {activeScreen === "dashboard" ? (
            <Dashboard
              canOpenScreen={(nextScreen) => visibleScreens.some((item) => item.key === nextScreen)}
              onOpenScreen={(nextScreen) => {
                setScreen(nextScreen);
                setMessage(null);
              }}
            />
          ) : null}
          {activeScreen === "users" ? <UsersScreen initialSearch={userSearchRequest} canControlUsers={canControlUsers} setMessage={setMessage} /> : null}
          {activeScreen === "adminUsers" ? <AdminUsersScreen /> : null}
          {activeScreen === "bulkModeration" ? <BulkModerationScreen isOwner={adminMe?.adminUser.roles.includes("owner") ?? false} setMessage={setMessage} /> : null}
          {activeScreen === "clientErrors" ? <ClientErrorsScreen setMessage={setMessage} /> : null}
          {activeScreen === "auditLog" ? <AuditLogScreen /> : null}
          {activeScreen === "reports" ? (
            <ReportsScreen
              canManage={canManageReports}
              setMessage={setMessage}
              onOpenUser={(request) => {
                setUserSearchRequest({ ...request, nonce: Date.now() });
                setScreen("users");
              }}
              onOpenMedia={(request) => {
                setMediaOpenRequest({ ...request, nonce: Date.now() });
                setScreen("media");
              }}
              onOpenTogetherSession={(sessionId) => {
                setTogetherSessionFilter(sessionId);
                setScreen("togetherSessions");
              }}
              onOpenNearbyDiagnostics={() => setScreen("nearbyDiagnostics")}
              onOpenMessage={(request) => {
                setMessageModerationOpenRequest({ ...request, nonce: Date.now() });
                setScreen("messageModeration");
              }}
            />
          ) : null}
          {activeScreen === "messageModeration" ? (
            <MessageModerationScreen
              canReview={canReviewMessages}
              openRequest={messageModerationOpenRequest}
              setMessage={setMessage}
            />
          ) : null}
          {activeScreen === "media" ? <MediaScreen setMessage={setMessage} openRequest={mediaOpenRequest} canManage={canManageMedia} /> : null}
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
          {activeScreen === "togetherTurnBased" ? (
            <TogetherTurnBasedScreen
              canManage={adminMe?.adminUser.roles.some((role) => role === "owner" || role === "ops") ?? false}
              setMessage={setMessage}
            />
          ) : null}
          {activeScreen === "opsHealth" ? <OpsHealthScreen /> : null}
          {activeScreen === "nearbyDiagnostics" ? <NearbyDiagnosticsScreen /> : null}
          {activeScreen === "nearbyRooms" ? (
            <NearbyRoomsScreen canManageRooms={canManageNearbyRooms} setMessage={setMessage} />
          ) : null}
          {activeScreen === "bootstrap" ? <BootstrapScreen /> : null}
        </main>
      </div>
    );
  }

  return <I18nContext.Provider value={i18n}>{content}</I18nContext.Provider>;
}

type TurnBasedAdminMoment = {
  id: string; status: string; stage: string; lastTransition: string;
  updatedAt: string; openProblemCount: number; starterAmoriaId:string;
  partnerAmoriaId:string|null;currentTurnRole:string|null;coarseGeoBucket:string;
  radiusKm:number|null;eventCount:number;artifactPurgeAfter:string|null;
  artifactPurgedAt:string|null;safeActions:string[];
};
type TurnBasedAdminProblem = {
  id: string; code: string; severity: string; status: string;
  summary: string; occurrenceCount: number; lastSeenAt: string;
};

function TogetherTurnBasedScreen({ canManage, setMessage }: {
  canManage: boolean; setMessage: (message: string | null) => void;
}) {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<"overview" | "moments" | "problems">("overview");
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [problemCode, setProblemCode] = useState("");
  const [participantUserId, setParticipantUserId] = useState("");
  const [momentId, setMomentId] = useState("");
  const [problemStatus, setProblemStatus] = useState("");
  const [problemSeverity, setProblemSeverity] = useState("");
  const [moments, setMoments] = useState<TurnBasedAdminMoment[]>([]);
  const [problems, setProblems] = useState<TurnBasedAdminProblem[]>([]);
  const [overview, setOverview] = useState<Record<string,number>>({});
  const [detail, setDetail] = useState<unknown>(null);
  const [error, setError] = useState("");
  const actionRequest = useRequestLock();
  async function load() {
    setError("");
    try {
      const [momentResponse, problemResponse] = await Promise.all([
        apiGet<{ items: TurnBasedAdminMoment[]; overview:Record<string,number> }>(`/admin/together/turn-based${toQuery({
          status:status||undefined,stage:stage||undefined,problemCode:problemCode||undefined,
          participantUserId:participantUserId||undefined,momentId:momentId||undefined,limit:100,
        })}`),
        apiGet<{ items: TurnBasedAdminProblem[] }>(`/admin/together/turn-based/problems${toQuery({
          status:problemStatus||undefined,severity:problemSeverity||undefined,
          code:problemCode||undefined,momentId:momentId||undefined,limit:100,
        })}`),
      ]);
      setMoments(momentResponse.items); setOverview(momentResponse.overview); setProblems(problemResponse.items);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Error");
    }
  }
  useEffect(() => { void load(); }, []);
  async function runAction(path: string, action: string) {
    await actionRequest.run(async () => {
      const reason = window.prompt(t("togetherTurnBased.reasonPrompt"))?.trim();
      if (!reason) return;
      try {
        await apiPost(path, { action, reason });
        setMessage(t("togetherTurnBased.actionComplete")); await load();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Error");
      }
    });
  }
  async function openDetail(id:string) {
    try { setDetail(await apiGet(`/admin/together/turn-based/${id}`)); }
    catch(nextError){setError(nextError instanceof Error?nextError.message:"Error");}
  }
  const activeCount = moments.filter((item) =>
    ["starter_turn","waiting_for_partner","partner_turn","awaiting_draw_reveal","story_turn","awaiting_story_reveal"].includes(item.status)
  ).length;
  const openProblems = problems.filter((item) => item.status === "open").length;
  return <section className="panel">
    <div className="filters">
      <button className={tab === "overview" ? "" : "secondary"} onClick={() => setTab("overview")}>{t("togetherTurnBased.overview")}</button>
      <button className={tab === "moments" ? "" : "secondary"} onClick={() => setTab("moments")}>{t("togetherTurnBased.moments")} ({moments.length})</button>
      <button className={tab === "problems" ? "" : "secondary"} onClick={() => setTab("problems")}>{t("togetherTurnBased.problems")} ({openProblems})</button>
    </div>
    {error ? <div className="error">{error}</div> : null}
    {tab === "overview" ? <div className="dashboard-grid">
      {Object.entries({
        activeMoments:overview.activeMoments??activeCount,waitingForPartner:overview.waitingForPartner??0,
        currentUserTurns:overview.currentUserTurns??0,awaitingDecisions:overview.awaitingDecisions??0,
        activeStorySparks:overview.activeStorySparks??0,openProblems:overview.openProblems??openProblems,
        expiredLast24Hours:overview.expiredLast24Hours??0,artifactsAwaitingCleanup:overview.artifactsAwaitingCleanup??0,
      }).map(([label,value])=><article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </div> : null}
    {tab === "moments" ? <>
      <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label>{t("common.status")}<input value={status} onChange={(event) => setStatus(event.target.value)} /></label>
        <label>stage<input value={stage} onChange={(event)=>setStage(event.target.value)}/></label>
        <label>problem code<input value={problemCode} onChange={(event)=>setProblemCode(event.target.value)}/></label>
        <label>participant / Amoria ID<input value={participantUserId} onChange={(event)=>setParticipantUserId(event.target.value)}/></label>
        <label>moment ID<input value={momentId} onChange={(event)=>setMomentId(event.target.value)}/></label>
        <button>{t("common.load")}</button>
      </form>
      <table><thead><tr><th>{t("common.updated")}</th><th>ID</th><th>{t("common.status")}</th>
        <th>{t("togetherTurnBased.stage")}</th><th>participants</th><th>turn</th><th>geo/radius</th>
        <th>events</th><th>purge</th><th>{t("togetherTurnBased.problems")}</th>{canManage ? <th>{t("common.action")}</th> : null}
      </tr></thead><tbody>{moments.map((item) => <tr key={item.id}>
        <td>{formatDate(item.updatedAt, language)}</td><td><button className="secondary" onClick={()=>void openDetail(item.id)}><code>{item.id}</code></button></td><td>{item.status}</td>
        <td>{item.stage}</td><td>{item.starterAmoriaId} / {item.partnerAmoriaId??"-"}</td><td>{item.currentTurnRole??"-"}</td>
        <td>{item.coarseGeoBucket} / {item.radiusKm??"∞"}</td><td>{item.eventCount}</td>
        <td>{item.artifactPurgedAt?"purged":item.artifactPurgeAfter?"scheduled":"held/active"}</td><td>{item.openProblemCount}</td>
        {canManage ? <td>{item.safeActions.map((action)=><button key={action} className={action.includes("cancel")||action.includes("expire")?"danger":"secondary"}
          disabled={actionRequest.pending}
          onClick={()=>void runAction(`/admin/together/turn-based/${item.id}/actions`,action)}>{action}</button>)}</td> : null}
      </tr>)}</tbody></table>
      {detail?<pre>{JSON.stringify(detail,null,2)}</pre>:null}
    </> : null}
    {tab === "problems" ? <><form className="filters" onSubmit={(event)=>{event.preventDefault();void load();}}>
      <label>status<input value={problemStatus} onChange={(event)=>setProblemStatus(event.target.value)}/></label>
      <label>severity<input value={problemSeverity} onChange={(event)=>setProblemSeverity(event.target.value)}/></label>
      <label>code<input value={problemCode} onChange={(event)=>setProblemCode(event.target.value)}/></label>
      <label>moment ID<input value={momentId} onChange={(event)=>setMomentId(event.target.value)}/></label>
      <button>{t("common.load")}</button>
    </form><table><thead><tr><th>{t("common.updated")}</th><th>{t("common.status")}</th>
      <th>{t("togetherTurnBased.severity")}</th><th>{t("togetherTurnBased.code")}</th>
      <th>{t("togetherTurnBased.summary")}</th>{canManage ? <th>{t("common.action")}</th> : null}
    </tr></thead><tbody>{problems.map((item) => <tr key={item.id}>
      <td>{formatDate(item.lastSeenAt, language)}</td><td>{item.status}</td><td>{item.severity}</td>
      <td>{item.code} × {item.occurrenceCount}</td><td>{item.summary}</td>{canManage ? <td>
        <button className="secondary" disabled={actionRequest.pending} onClick={() => void runAction(`/admin/together/turn-based/problems/${item.id}/actions`, item.status === "open" ? "resolve" : "reopen")}>
          {item.status === "open" ? t("action.resolve") : t("action.reopen")}
        </button>
        {item.status === "open" ? <button className="secondary" disabled={actionRequest.pending} onClick={() => void runAction(`/admin/together/turn-based/problems/${item.id}/actions`, "ignore")}>{t("action.ignore")}</button> : null}
      </td> : null}
    </tr>)}</tbody></table></> : null}
  </section>;
}

function LoginScreen({
  initialError,
  onLogin,
}: {
  initialError: string | null;
  onLogin: (admin: AdminMe) => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const loginRequest = useRequestLock();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    await loginRequest.run(async () => {
      try {
        await login(email, password);
        const me = await apiGet<AdminMe>("/admin/me");
        onLogin(me);
      } catch (error) {
        clearTokens();
        const status = error instanceof ApiError
          ? error.status
          : (error as { status?: unknown } | null)?.status;
        if (status === 403) {
          setError(t("auth.loginForbidden"));
        } else {
          setError(error instanceof Error ? error.message : t("auth.loginFailed"));
        }
      }
    });
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
        <button disabled={loginRequest.pending}>{loginRequest.pending ? t("auth.signingIn") : t("auth.signIn")}</button>
      </form>
    </div>
  );
}

function ForbiddenScreen({ error, onLogout }: { error: string | null; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="center-panel">
      <LanguageSwitcher />
      <h1>{t("auth.forbiddenTitle")}</h1>
      <p>{t("auth.forbiddenMessage")}</p>
      {error ? <div className="error">{error}</div> : null}
      <button onClick={onLogout}>{t("common.backToLogin")}</button>
    </div>
  );
}

function Dashboard({
  canOpenScreen,
  onOpenScreen,
}: {
  canOpenScreen: (screen: Screen) => boolean;
  onOpenScreen: (screen: Screen) => void;
}) {
  const { language, t } = useI18n();
  const { data, error, reload } = useLoad<AdminReleaseDashboard>("/admin/dashboard/release-control");

  const cards = data
    ? [
        {
          key: "reports",
          title: t("dashboard.reportsTitle"),
          value: formatDashboardCount(data.reports.open, t),
          meta: [
            `${t("dashboard.underReview")}: ${formatDashboardCount(data.reports.underReview, t)}`,
            `${t("dashboard.escalated")}: ${formatDashboardCount(data.reports.escalated, t)}`,
          ],
          note: t("dashboard.reportsNote"),
          actionLabel: t("dashboard.openReports"),
          target: "reports" as Screen,
        },
        {
          key: "clientErrors",
          title: t("dashboard.clientErrorsTitle"),
          value: formatDashboardCount(data.clientErrors.open, t),
          meta: [t("dashboard.openOnly")],
          note: t("dashboard.clientErrorsNote"),
          actionLabel: t("dashboard.openClientErrors"),
          target: "clientErrors" as Screen,
        },
        {
          key: "media",
          title: t("dashboard.mediaTitle"),
          value: formatDashboardCount(data.mediaModeration.pending, t),
          meta: [t("dashboard.pendingReview")],
          note: t("dashboard.mediaNote"),
          actionLabel: t("dashboard.openMedia"),
          target: "media" as Screen,
        },
        {
          key: "togetherQueue",
          title: t("dashboard.togetherQueueTitle"),
          value: formatDashboardCount(data.togetherQueue.waiting, t),
          meta: [t("dashboard.waitingQueue")],
          note: t("dashboard.togetherQueueNote"),
          actionLabel: t("dashboard.openTogetherQueue"),
          target: "togetherQueue" as Screen,
        },
        {
          key: "togetherSessions",
          title: t("dashboard.togetherSessionsTitle"),
          value: formatDashboardCount(data.togetherSessions.recent24h, t),
          meta: [
            `${t("dashboard.activeSessions")}: ${formatDashboardCount(data.togetherSessions.active, t)}`,
            t("dashboard.recent24h"),
          ],
          note: t("dashboard.togetherSessionsNote"),
          actionLabel: t("dashboard.openTogetherSessions"),
          target: "togetherSessions" as Screen,
        },
        {
          key: "nearby",
          title: t("dashboard.nearbyTitle"),
          value: formatDashboardCount(data.nearby.activeVisibilityCount, t),
          meta: [
            `${t("dashboard.offVisibility")}: ${formatDashboardCount(data.nearby.offVisibilityCount, t)}`,
            `${t("dashboard.expiredVisibility")}: ${formatDashboardCount(data.nearby.expiredVisibilityCount, t)}`,
            `${t("dashboard.profileReadinessMissing")}: ${formatDashboardCount(data.nearby.profileReadinessMissingCount, t)}`,
          ],
          note: t("dashboard.nearbyNote"),
          actionLabel: t("dashboard.openNearbyDiagnostics"),
          target: "nearbyDiagnostics" as Screen,
        },
        {
          key: "health",
          title: t("dashboard.healthTitle"),
          value: formatDashboardHealthStatus(data.health, t),
          meta: [
            `${t("dashboard.apiStatus")}: ${formatStatus(data.health.apiStatus, t)}`,
            `${t("ops.database")}: ${formatStatus(data.health.databaseStatus, t)}`,
            `${t("ops.objectStorage")}: ${formatObjectStorageStatus(data.health.objectStorage, t)}`,
            `${t("ops.emailDelivery")}: ${formatSmtpStatus(data.health.smtp, t)}`,
          ],
          note: t("dashboard.healthNote"),
          actionLabel: t("dashboard.openOpsHealth"),
          target: "opsHealth" as Screen,
        },
      ]
    : [];

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("dashboard.title")}</h2>
        <button className="secondary" onClick={reload}>{t("common.refresh")}</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <>
          <dl className="facts dashboard-facts">
            <Fact label={t("common.service")} value={data.service} />
            <Fact label={t("common.time")} value={formatDate(data.time, language)} />
            <Fact label={t("common.adminUser")} value={data.admin.userId} />
            <Fact label={t("common.roles")} value={formatRoles(data.admin.roles, t)} />
          </dl>
          <div className="release-grid">
            {cards.map((card) => (
              <ReleaseControlCard
                key={card.key}
                title={card.title}
                value={card.value}
                meta={card.meta}
                note={card.note}
                actionLabel={card.actionLabel}
                disabled={!canOpenScreen(card.target)}
                onAction={() => onOpenScreen(card.target)}
              />
            ))}
          </div>
          <p className="muted dashboard-safe-note">{t("dashboard.safeNote")}</p>
        </>
      ) : <EmptyState label={t("dashboard.empty")} />}
    </section>
  );
}

function ReleaseControlCard({
  title,
  value,
  meta,
  note,
  actionLabel,
  disabled,
  onAction,
}: {
  title: string;
  value: string;
  meta: string[];
  note: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <article className="release-card">
      <div>
        <h3>{title}</h3>
        <strong>{value}</strong>
      </div>
      <div className="release-card-meta">
        {meta.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <p>{note}</p>
      <button className="secondary" type="button" disabled={disabled} onClick={onAction}>
        {actionLabel}
      </button>
    </article>
  );
}

function UsersScreen({ initialSearch, canControlUsers, setMessage }: {
  initialSearch: UserSearchRequest | null;
  canControlUsers: boolean;
  setMessage: (message: string | null) => void;
}) {
  const { language, t } = useI18n();
  const [amoriaId, setAmoriaId] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<UserSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [reason, setReason] = useState("");
  const statusRequest = useRequestLock();

  async function runSearch(nextAmoriaId = amoriaId, nextQ = q) {
    setError(null);
    setSearched(true);

    try {
      const response = await apiGet<{ items: UserSearchItem[] }>(
        `/admin/users${toQuery({ amoriaId: nextAmoriaId, q: nextQ, limit: 50 })}`,
      );
      setItems(response.items);
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    await runSearch();
  }

  async function openUser(userId: string) {
    setError(null);
    try {
      const response = await apiGet<{ user: AdminUserDetail }>(`/admin/users/${userId}`);
      setSelected(response.user);
    } catch (error) { setError(errorMessage(error, t)); }
  }

  async function changeStatus() {
    if (!selected || reason.trim().length < 3) return;
    await statusRequest.run(async () => {
      const action = selected.accountStatus === "suspended" ? "restore" : "suspend";
      if (action === "suspend" && !window.confirm(t("users.suspendConfirm"))) return;
      try {
        const response = await apiPost<{ user: AdminUserDetail }>(`/admin/users/${selected.id}/status`, { action, reason });
        setSelected(response.user);
        setReason("");
        setMessage(t(action === "suspend" ? "users.suspended" : "users.restored"));
        await runSearch();
      } catch (error) { setError(errorMessage(error, t)); }
    });
  }

  useEffect(() => {
    if (!initialSearch) {
      return;
    }

    const nextAmoriaId = initialSearch.amoriaId ?? "";
    const nextQ = initialSearch.q ?? "";
    setAmoriaId(nextAmoriaId);
    setQ(nextQ);
    void runSearch(nextAmoriaId, nextQ);
  }, [initialSearch?.nonce]);

  return (
    <section className="panel">
      <form className="filters" onSubmit={search}>
        <label>{t("common.amoriaId")}<input value={amoriaId} onChange={(event) => setAmoriaId(event.target.value)} /></label>
        <label>{t("users.searchLabel")}<input value={q} onChange={(event) => setQ(event.target.value)} /></label>
        <button>{t("common.search")}</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      {items.length ? <table><thead><tr><th>{t("common.amoriaId")}</th><th>{t("common.displayName")}</th><th>{t("common.email")}</th>
        <th>{t("common.status")}</th><th>{t("users.verified")}</th><th>{t("common.created")}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => void openUser(item.id)}>
          <td>{item.amoriaId}</td><td>{item.displayName}</td><td>{item.email}</td><td>{item.accountStatus}</td>
          <td>{item.emailVerifiedAt ? t("common.yes") : t("common.no")}</td><td>{formatDate(item.createdAt, language)}</td>
        </tr>)}</tbody></table> : <EmptyState label={searched ? t("users.emptyResults") : t("users.emptyInitial")} />}
      {selected ? <div className="panel inset-panel"><h3>{t("users.detailTitle")}</h3>
        <dl className="facts compact"><Fact label={t("common.amoriaId")} value={selected.amoriaId} />
          <Fact label={t("common.status")} value={selected.accountStatus ?? "active"} />
          <Fact label={t("users.lastSeen")} value={selected.lastSeenAt ? formatDate(selected.lastSeenAt, language) : ""} />
          <Fact label={t("users.suspensionReason")} value={selected.suspensionReason ?? ""} />
          <Fact label={t("common.adminUser")} value={selected.adminUserId ?? ""} /></dl>
        {canControlUsers ? <div className="stack-form"><label>{t("common.reason")}<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} /></label>
          <button className={selected.accountStatus === "suspended" ? "secondary" : "danger"} disabled={statusRequest.pending || reason.trim().length < 3} onClick={() => void changeStatus()}>
            {t(selected.accountStatus === "suspended" ? "users.restore" : "users.suspend")}</button></div> : null}
      </div> : null}
    </section>
  );
}

function AdminUsersScreen() {
  const { language, t } = useI18n();
  const { data, error, reload } = useLoad<{ items: AdminUserItem[]; nextCursor: null }>("/admin/admin-users");
  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [roles, setRoles] = useState<string[]>(["support"]);
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [reason, setReason] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationRequest = useRequestLock();
  useEffect(() => { if (data) setItems(data.items); }, [data]);
  function edit(item: AdminUserItem) { setSelectedId(item.id); setUserId(item.userId); setRoles(item.roles); setStatus(item.status); setReason(""); }
  function reset() { setSelectedId(null); setUserId(""); setRoles(["support"]); setStatus("active"); setReason(""); }
  function toggleRole(role: string) { setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]); }
  async function save(event: FormEvent) {
    event.preventDefault(); setMutationError(null);
    await mutationRequest.run(async () => {
      try {
        const response = await apiPost<{ items: AdminUserItem[] }>(selectedId ? `/admin/admin-users/${selectedId}` : "/admin/admin-users",
          selectedId ? { status, roles, reason } : { userId, roles, reason });
        setItems(response.items); reset();
      } catch (error) { setMutationError(errorMessage(error, t)); }
    });
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("adminUsers.title")}</h2>
        <button className="secondary" onClick={reload}>{t("common.refresh")}</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {mutationError ? <div className="error">{mutationError}</div> : null}
      <form className="stack-form" onSubmit={save}>
        <h3>{t(selectedId ? "adminUsers.edit" : "adminUsers.create")}</h3>
        <label>{t("adminUsers.edit")}<select value={selectedId ?? ""} onChange={(event) => {
          const item = items.find((candidate) => candidate.id === event.target.value);
          if (item) edit(item); else reset();
        }}><option value="">{t("adminUsers.create")}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.user.amoriaId} · {item.user.email}</option>)}</select></label>
        <label>{t("adminUsers.linkedUser")}<input value={userId} onChange={(event) => setUserId(event.target.value)} readOnly={Boolean(selectedId)} required /></label>
        {selectedId ? <label>{t("common.status")}<select value={status} onChange={(event) => setStatus(event.target.value as "active" | "disabled")}>
          <option value="active">{t("status.active")}</option><option value="disabled">{t("status.disabled")}</option></select></label> : null}
        <fieldset><legend>{t("common.roles")}</legend>{["owner", "moderator", "support", "ops"].map((role) =>
          <label key={role} className="inline-check"><input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />{formatRoles([role], t)}</label>)}</fieldset>
        <label>{t("common.reason")}<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required /></label>
        <div className="filters"><button disabled={mutationRequest.pending || !roles.length}>{t("common.apply")}</button>{selectedId ? <button className="secondary" type="button" disabled={mutationRequest.pending} onClick={reset}>{t("common.cancel")}</button> : null}</div>
      </form>
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

function BulkModerationScreen({ isOwner, setMessage }: { isOwner: boolean; setMessage: (message: string | null) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState("media_scan");
  const [action, setAction] = useState("scan");
  const [reason, setReason] = useState("");
  const [ownerAmoriaId, setOwnerAmoriaId] = useState("");
  const [moderationStatus, setModerationStatus] = useState("");
  const [maxItems, setMaxItems] = useState("25");
  const [idempotencyKey, setIdempotencyKey] = useState(() => `admin-${Date.now()}`);
  const [job, setJob] = useState<AdminBulkJob | null>(null);
  const [confirmationToken, setConfirmationToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [countryStatus, setCountryStatus] = useState("");
  const [orphans, setOrphans] = useState<unknown>(null);
  const mutationRequest = useRequestLock();
  const actions: Record<string, string[]> = { media_scan: ["scan"], media_decision: ["mark_under_review", "restrict", "remove"], message_decision: ["restrict", "remove", "escalate"], physical_media_purge: ["purge"] };
  useEffect(() => { apiGet<{ status: string }>("/admin/country-scope").then((value) => setCountryStatus(value.status)).catch(() => setCountryStatus("")); }, []);
  function changeKind(value: string) { setKind(value); setAction(actions[value][0]); setJob(null); setConfirmationToken(""); }
  async function preview(event: FormEvent) {
    event.preventDefault(); setError(null);
    await mutationRequest.run(async () => {
      try {
        const scope = kind === "physical_media_purge" ? {} : { ownerAmoriaId: ownerAmoriaId || undefined, moderationStatus: moderationStatus || undefined };
        const response = await apiPost<{ job: AdminBulkJob; confirmationToken: string }>("/admin/bulk-jobs/preview", { kind, action, reason, idempotencyKey, maxItems: Number(maxItems), scope });
        setJob(response.job); setConfirmationToken(response.confirmationToken); setMessage(t("bulk.previewReady"));
      } catch (error) { setError(errorMessage(error, t)); }
    });
  }
  async function confirm() {
    if (!job || !window.confirm(t("bulk.confirmWarning"))) return;
    await mutationRequest.run(async () => {
      try {
        const response = await apiPost<{ job: AdminBulkJob }>(`/admin/bulk-jobs/${job.id}/confirm`, { confirmationToken });
        setJob(response.job); setMessage(t("bulk.completed"));
      } catch (error) { setError(errorMessage(error, t)); }
    });
  }
  async function diagnoseOrphans() {
    try { setOrphans(await apiGet("/admin/storage/orphans")); } catch (error) { setError(errorMessage(error, t)); }
  }
  return <section className="grid-two"><div className="panel">
    <h2>{t("bulk.title")}</h2><p className="muted">{t("bulk.safetyNote")}</p>
    {countryStatus ? <div className="notice">{countryStatus}</div> : null}{error ? <div className="error">{error}</div> : null}
    <form className="stack-form" onSubmit={preview}>
      <label>{t("bulk.kind")}<select value={kind} onChange={(event) => changeKind(event.target.value)}>
        <option value="media_scan">{t("bulk.mediaScan")}</option><option value="media_decision">{t("bulk.mediaDecision")}</option>
        <option value="message_decision">{t("bulk.messageDecision")}</option>{isOwner ? <option value="physical_media_purge">{t("bulk.physicalPurge")}</option> : null}</select></label>
      <label>{t("common.action")}<select value={action} onChange={(event) => setAction(event.target.value)}>{actions[kind].map((item) => <option key={item}>{item}</option>)}</select></label>
      {kind !== "physical_media_purge" ? <><label>{t("media.ownerAmoriaId")}<input value={ownerAmoriaId} onChange={(event) => setOwnerAmoriaId(event.target.value)} /></label>
        <label>{t("media.moderationStatus")}<input value={moderationStatus} onChange={(event) => setModerationStatus(event.target.value)} /></label></> : null}
      <label>{t("common.limit")}<input type="number" min="1" max="100" value={maxItems} onChange={(event) => setMaxItems(event.target.value)} /></label>
      <label>{t("bulk.idempotencyKey")}<input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} required /></label>
      <label>{t("common.reason")}<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required /></label>
      <button disabled={mutationRequest.pending}>{t("bulk.preview")}</button>
    </form>
    {isOwner ? <button className="secondary" type="button" onClick={() => void diagnoseOrphans()}>{t("bulk.orphanDiagnostics")}</button> : null}
    {orphans ? <JsonBlock data={orphans} /> : null}
  </div><div className="panel"><h2>{t("bulk.previewTitle")}</h2>{job ? <>
    <dl className="facts compact"><Fact label={t("bulk.jobId")} value={job.id} /><Fact label={t("common.status")} value={job.status} />
      <Fact label={t("bulk.previewCount")} value={String(job.previewCount)} /><Fact label={t("bulk.appliedCount")} value={String(job.appliedCount)} />
      <Fact label={t("bulk.failedCount")} value={String(job.failedCount)} /></dl>
    {job.status === "awaiting_confirmation" ? <button className="danger" disabled={mutationRequest.pending} onClick={() => void confirm()}>{t("bulk.confirm")}</button> : null}
    <table><thead><tr><th>{t("common.target")}</th><th>{t("common.action")}</th><th>{t("common.status")}</th><th>{t("common.code")}</th></tr></thead>
      <tbody>{job.items.map((item) => <tr key={item.id}><td>{item.targetType}:{item.targetId}</td><td>{item.proposedAction}</td><td>{item.status}</td><td>{item.errorCode ?? ""}</td></tr>)}</tbody></table>
  </> : <EmptyState label={t("bulk.emptyPreview")} />}</div></section>;
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
  const mutationRequest = useRequestLock();

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
    await mutationRequest.run(async () => {
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
    });
  }

  async function bulkArchiveCurrentFilter() {
    if (!window.confirm(t("clientErrors.bulkArchiveConfirm"))) {
      return;
    }

    setError(null);
    await mutationRequest.run(async () => {
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
    });
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
          <button type="button" disabled={mutationRequest.pending || !selected} onClick={() => void submitAction("resolve")}>{t("action.resolve")}</button>
          <button type="button" disabled={mutationRequest.pending || !selected} onClick={() => void submitAction("ignore")}>{t("action.ignore")}</button>
          <button type="button" disabled={mutationRequest.pending || !selected} onClick={() => void submitAction("archive")}>{t("action.archive")}</button>
          <button type="button" disabled={mutationRequest.pending || !selected} onClick={() => void submitAction("reopen")}>{t("action.reopen")}</button>
          <button className="secondary" type="button" disabled={mutationRequest.pending} onClick={() => void bulkArchiveCurrentFilter()}>
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

function MessageModerationScreen({
  canReview,
  openRequest,
  setMessage,
}: {
  canReview: boolean;
  openRequest: MessageModerationOpenRequest | null;
  setMessage: (message: string | null) => void;
}) {
  const { language, t } = useI18n();
  const [filters, setFilters] = useState({ status: "all", source: "", limit: "50" });
  const [items, setItems] = useState<MessageModerationItem[]>([]);
  const [selected, setSelected] = useState<MessageModerationDetail | null>(null);
  const [readReason, setReadReason] = useState("Moderation queue review");
  const [decision, setDecision] = useState("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decisionRequest = useRequestLock();

  async function load() {
    setError(null);
    try {
      const response = await apiGet<{ items: MessageModerationItem[] }>(
        `/admin/message-moderation${toQuery(filters)}`,
      );
      setItems(response.items);
      if (selected && !response.items.some((item) => item.id === selected.id)) setSelected(null);
    } catch (loadError) {
      setError(errorMessage(loadError, t));
    }
  }

  async function openDetail(messageId: string, reasonOverride?: string) {
    if (!canReview) {
      setMessage(t("messageModeration.metadataOnly"));
      return;
    }
    const reason = (reasonOverride || readReason).trim();
    if (!reason) {
      setError(t("messageModeration.readReasonRequired"));
      return;
    }
    setError(null);
    try {
      const response = await apiGet<{ message: MessageModerationDetail }>(
        `/admin/message-moderation/${encodeURIComponent(messageId)}${toQuery({ reason })}`,
      );
      setSelected(response.message);
    } catch (loadError) {
      setError(errorMessage(loadError, t));
    }
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!decisionReason.trim()) {
      setError(t("messageModeration.decisionReasonRequired"));
      return;
    }
    await decisionRequest.run(async () => {
      try {
        await apiPost(`/admin/message-moderation/${encodeURIComponent(selected.id)}/decision`, {
          action: decision,
          reason: decisionReason.trim(),
        });
        setMessage(t("messageModeration.updated"));
        setDecisionReason("");
        await load();
        await openDetail(selected.id, readReason);
      } catch (decisionError) {
        setError(errorMessage(decisionError, t));
      }
    });
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    setReadReason(openRequest.reason);
    void openDetail(openRequest.messageId, openRequest.reason);
  }, [openRequest?.nonce]);

  return (
    <section className="grid-two">
      <div className="panel">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label>{t("common.status")}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">{t("status.any")}</option>
            <option value="reported">{t("messageModeration.reported")}</option>
            <option value="held">{t("messageModeration.held")}</option>
            <option value="needs_review">{t("messageModeration.needsReview")}</option>
            <option value="restricted">{t("messageModeration.restricted")}</option>
            <option value="removed">{t("messageModeration.removed")}</option>
          </select></label>
          <label>{t("common.type")}<select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
            <option value="">{t("status.any")}</option>
            <option value="direct">{t("messageModeration.direct")}</option>
            <option value="nearby">{t("messageModeration.nearby")}</option>
          </select></label>
          <label>{t("common.limit")}<input value={filters.limit} onChange={(event) => setFilters({ ...filters, limit: event.target.value })} inputMode="numeric" /></label>
          <button>{t("common.load")}</button>
        </form>
        <label>{t("messageModeration.readReason")}<input value={readReason} onChange={(event) => setReadReason(event.target.value)} /></label>
        {!canReview ? <p className="muted">{t("messageModeration.metadataOnly")}</p> : null}
        {error ? <div className="error">{error}</div> : null}
        {items.length ? (
          <table>
            <thead><tr>
              <th>{t("common.updated")}</th><th>{t("common.status")}</th>
              <th>{t("common.type")}</th><th>{t("common.owner")}</th>
              <th>{t("messageModeration.reports")}</th><th>{t("common.reason")}</th>
            </tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => void openDetail(item.id)}>
                <td>{formatDate(item.updatedAt, language)}</td><td>{item.state}</td><td>{item.source}</td>
                <td>{item.sender.displayName} ({item.sender.amoriaId})</td><td>{item.reportCount}</td>
                <td>{item.latestReason ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <EmptyState label={t("messageModeration.empty")} />}
      </div>
      <div className="panel">
        <h2>{t("nav.messageModeration")}</h2>
        {selected ? <>
          <p className="muted">{selected.privacyNote}</p>
          <dl className="facts compact">
            <Fact label={t("common.status")} value={selected.state} />
            <Fact label={t("common.type")} value={selected.source} />
            <Fact label={t("common.owner")} value={`${selected.sender.displayName} (${selected.sender.amoriaId})`} />
            <Fact label={t("messageModeration.automation")} value={selected.automationStatus} />
            <Fact label={t("messageModeration.reports")} value={String(selected.reportCount)} />
          </dl>
          <h3>{t("messageModeration.selectedBody")}</h3>
          <pre className="detail-json">{selected.text}</pre>
          <form className="stack-form" onSubmit={submitDecision}>
            <label>{t("common.action")}<select value={decision} onChange={(event) => setDecision(event.target.value)}>
              <option value="approve">{t("messageModeration.approve")}</option>
              <option value="restore">{t("messageModeration.restore")}</option>
              <option value="restrict">{t("messageModeration.restrict")}</option>
              <option value="remove">{t("messageModeration.remove")}</option>
              <option value="escalate">{t("reports.escalate")}</option>
            </select></label>
            <label>{t("common.reason")}<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></label>
            <button disabled={decisionRequest.pending}>{t("common.apply")}</button>
          </form>
          <h3>{t("messageModeration.history")}</h3>
          {selected.reviews.length ? <table><thead><tr>
            <th>{t("common.created")}</th><th>{t("common.type")}</th><th>{t("common.action")}</th><th>{t("common.reason")}</th>
          </tr></thead><tbody>{selected.reviews.map((review) => <tr key={review.id}>
            <td>{formatDate(review.createdAt, language)}</td><td>{review.source}</td><td>{review.action}</td><td>{review.reason ?? "—"}</td>
          </tr>)}</tbody></table> : <EmptyState label={t("messageModeration.noHistory")} />}
        </> : <EmptyState label={t("messageModeration.selectMessage")} />}
      </div>
    </section>
  );
}

function ReportsScreen({
  canManage,
  setMessage,
  onOpenUser,
  onOpenMedia,
  onOpenTogetherSession,
  onOpenNearbyDiagnostics,
  onOpenMessage,
}: {
  canManage: boolean;
  setMessage: (message: string | null) => void;
  onOpenUser: (request: Omit<UserSearchRequest, "nonce">) => void;
  onOpenMedia: (request: Omit<MediaOpenRequest, "nonce">) => void;
  onOpenTogetherSession: (sessionId: string) => void;
  onOpenNearbyDiagnostics: () => void;
  onOpenMessage: (request: Omit<MessageModerationOpenRequest, "nonce">) => void;
}) {
  const { language, t, tx } = useI18n();
  const [filters, setFilters] = useState({ status: "", targetType: "", reporterAmoriaId: "", targetOwnerAmoriaId: "", limit: "50" });
  const [items, setItems] = useState<ReportItem[]>([]);
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState("mark_under_review");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const actionRequest = useRequestLock();
  useEffect(() => { if (!canManage) setAction("add_note"); }, [canManage]);

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
    setError(null);
    try {
      const response = await apiGet<{ report: ReportDetail }>(`/admin/reports/${id}`);
      setSelected(response.report);
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    await actionRequest.run(async () => {
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
    });
  }

  function openTargetContext(link: ReportTargetContextLink) {
    if (!link.available) {
      setMessage(link.unavailableReason ?? t("reports.contextUnavailable"));
      return;
    }

    switch (link.screen) {
      case "users":
        onOpenUser({
          amoriaId: link.params.amoriaId,
          q: link.params.q,
        });
        break;
      case "media":
        if (link.params.mediaId) {
          onOpenMedia({
            mediaId: link.params.mediaId,
            ownerAmoriaId: selected?.targetOwner?.amoriaId,
            reason: link.params.reason,
          });
        }
        break;
      case "message_moderation":
        if (link.params.messageId) {
          onOpenMessage({
            messageId: link.params.messageId,
            reason: link.params.reason || "Safety report review",
          });
        }
        break;
      case "together_sessions":
        if (link.params.sessionId) {
          onOpenTogetherSession(link.params.sessionId);
        }
        break;
      case "nearby_diagnostics":
        onOpenNearbyDiagnostics();
        break;
      case "none":
        setMessage(link.unavailableReason ?? t("reports.contextUnavailable"));
        break;
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
                <th>{t("reports.reporterEmail")}</th>
                <th>{t("reports.reportedTarget")}</th>
                <th>{t("reports.reportedUser")} / {t("reports.targetOwner")}</th>
                <th>{t("reports.targetEmail")}</th>
                <th>{t("common.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => void openDetail(item.id)} className={selected?.id === item.id ? "selected" : ""}>
                  <td>{formatDate(item.createdAt, language)}</td>
                  <td>{formatStatus(item.status, t)}</td>
                  <td>{formatReportUserIdentity(item.reporter)}</td>
                  <td><ReportEmail email={formatReportUserEmail(item.reporter)} /></td>
                  <td>{item.targetContext.summary}</td>
                  <td>{item.targetUser ? formatReportUserIdentity(item.targetUser) : item.targetOwner ? formatReportUserIdentity(item.targetOwner) : "—"}</td>
                  <td><ReportEmail email={formatReportUserEmail(item.targetUser ?? item.targetOwner)} /></td>
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
            <h3>{t("reports.reporter")}</h3>
            <ReportUserFacts user={selected.reporter} />
            <p className="muted">{t("reports.adminOnlyEmailNote")}</p>

            <h3>{t("reports.reportedUser")}</h3>
            {selected.targetUser ? <ReportUserFacts user={selected.targetUser} /> : <p className="muted">{t("reports.noReportedUser")}</p>}

            <h3>{t("reports.targetOwner")}</h3>
            {selected.targetOwner ? (
              sameAdminUser(selected.targetOwner, selected.targetUser) ? <p className="muted">{t("reports.sameAsReportedUser")}</p> : <ReportUserFacts user={selected.targetOwner} />
            ) : <p className="muted">{t("reports.noTargetOwner")}</p>}

            <h3>{t("reports.targetObject")}</h3>
            <dl className="facts compact">
              <Fact label={t("common.status")} value={formatStatus(selected.status, t)} />
              <Fact label={t("reports.targetType")} value={selected.targetType} />
              <Fact label={t("reports.targetId")} value={selected.targetId} />
              <Fact label={t("reports.targetContext")} value={selected.targetContext.summary} />
              <Fact label={t("common.reason")} value={selected.reason} />
              <Fact label={t("reports.comment")} value={selected.comment ?? ""} />
              <Fact label={t("common.created")} value={formatDate(selected.createdAt, language)} />
              <Fact label={t("common.updated")} value={formatDate(selected.updatedAt, language)} />
            </dl>

            <h3>{t("reports.targetContext")}</h3>
            <p className="muted">{selected.targetContext.privacyNote}</p>
            <div className="filters">
              {selected.targetContext.links.map((link) => (
                <button
                  key={`${link.kind}-${link.label}`}
                  className="secondary"
                  type="button"
                  onClick={() => openTargetContext(link)}
                >
                  {formatReportContextLinkLabel(link, t)}
                </button>
              ))}
            </div>
            {selected.targetContext.links.some((link) => !link.available) ? (
              <div className="hint-list">
                {selected.targetContext.links.filter((link) => !link.available).map((link) => (
                  <span key={`${link.kind}-unavailable`}>
                    <strong>{formatReportContextLinkLabel(link, t)}</strong>: {link.unavailableReason ?? t("reports.contextUnavailable")} {link.params.targetId ?? ""}
                  </span>
                ))}
              </div>
            ) : null}

            <form className="stack-form" onSubmit={submitAction}>
              <label>{t("common.action")}<select value={action} onChange={(event) => setAction(event.target.value)}>
                {canManage ? <><option value="mark_under_review">{t("reports.markUnderReview")}</option>
                <option value="dismiss">{t("reports.dismiss")}</option><option value="resolve">{t("reports.resolve")}</option>
                <option value="escalate">{t("reports.escalate")}</option><option value="assign">{t("reports.assign")}</option></> : null}
                <option value="add_note">{t("reports.addNote")}</option>
              </select></label>
              <label>{t("common.reason")}<input value={reason} onChange={(event) => setReason(event.target.value)} required={action !== "add_note"} /></label>
              <label>{t("common.note")}<textarea value={note} onChange={(event) => setNote(event.target.value)} required={action === "add_note"} /></label>
              <button disabled={actionRequest.pending}>{t("common.apply")}</button>
            </form>

            <h3>{t("reports.auditTrail")}</h3>
            {selected.reviewActions.length ? (
              <table>
                <thead>
                  <tr>
                    <th>{t("common.created")}</th>
                    <th>{t("common.admin")}</th>
                    <th>{t("common.action")}</th>
                    <th>{t("reports.previousStatus")}</th>
                    <th>{t("reports.nextStatus")}</th>
                    <th>{t("common.reason")}</th>
                    <th>{t("common.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.reviewActions.map((reviewAction) => (
                    <tr key={reviewAction.id}>
                      <td>{formatDate(reviewAction.createdAt, language)}</td>
                      <td>{reviewAction.adminUserId ?? ""}</td>
                      <td>{formatReportReviewAction(reviewAction.action, t)}</td>
                      <td>{formatMaybeStatus(metadataString(reviewAction.metadata, "previousStatus"), t)}</td>
                      <td>{formatMaybeStatus(metadataString(reviewAction.metadata, "nextStatus"), t)}</td>
                      <td>{reviewAction.reason ?? ""}</td>
                      <td>{reviewAction.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState label={t("reports.noAuditActions")} />}
          </>
        ) : <EmptyState label={t("reports.select")} />}
      </div>
    </section>
  );
}

function ReportUserFacts({ user }: { user: ReportItem["reporter"] }) {
  const { t } = useI18n();
  return (
    <dl className="facts compact">
      <Fact label={t("common.displayName")} value={user.displayName} />
      <Fact label={t("common.amoriaId")} value={user.amoriaId} />
      <Fact label={t("reports.userId")} value={user.id} />
      <dt>{t("common.email")}</dt><dd><ReportEmail email={user.email} /></dd>
    </dl>
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
    ageGroup: "",
    waitingReason: "",
    limit: "100",
  });
  const [items, setItems] = useState<TogetherQueueEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const actionRequest = useRequestLock();

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
    await actionRequest.run(async () => {
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
    });
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
        <span>{t("queue.ageDiagnosticsBody")}</span>
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
        <label>{t("queue.userAgeGroup")}<select value={filters.ageGroup} onChange={(event) => setFilters({ ...filters, ageGroup: event.target.value })}>
          <option value="">{t("status.any")}</option>
          <option value="18-24">18-24</option>
          <option value="25-34">25-34</option>
          <option value="35-44">35-44</option>
          <option value="45-54">45-54</option>
          <option value="55+">55+</option>
        </select></label>
        <label>{t("queue.waitingReason")}<select value={filters.waitingReason} onChange={(event) => setFilters({ ...filters, waitingReason: event.target.value })}>
          <option value="">{t("status.any")}</option>
          <option value="age_mismatch">{t("queue.reasonAgeMismatch")}</option>
          <option value="missing_user_age">{t("queue.reasonMissingUserAge")}</option>
          <option value="missing_age_preference">{t("queue.reasonMissingAgePreference")}</option>
          <option value="radius_distance_too_far">{t("queue.reasonRadiusTooFar")}</option>
          <option value="activity_mismatch">{t("queue.reasonActivityMismatch")}</option>
          <option value="missing_coordinates_old_entry">{t("queue.reasonMissingCoordinates")}</option>
          <option value="no_candidate">{t("queue.reasonNoCandidate")}</option>
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
              <th>{t("queue.userAgeGroup")}</th>
              <th>{t("queue.preferredAgeRange")}</th>
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
                <td>{item.userAgeGroup ?? ""}</td>
                <td>{formatPreferredAgeRange(item.preferredAgeRange, t)}</td>
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
                    disabled={actionRequest.pending || item.status !== "waiting" || busyEntryId === item.entryId}
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
  const [probe, setProbe] = useState<PublicMediaProbeResult | null>(null);

  useEffect(() => {
    setFailed(false);
    setProbe(null);
  }, [item.id, previewUrl]);

  useEffect(() => {
    if (!failed || probe || !previewUrl) return;
    let cancelled = false;
    void probePublicMediaUrl(item.publicUrl ?? item.previewUrl).then((result) => {
      if (!cancelled) {
        setProbe(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [failed, item.previewUrl, item.publicUrl, previewUrl, probe]);

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
          {probe ? <span>{formatProbeDetails(probe)}</span> : null}
        </div>
      )}
      <button className="link-button" type="button" onClick={(event) => void checkUrl(event)}>
        {t("media.checkUrl")}
      </button>
      {probe ? (
        <span className={probe.ok ? "media-probe-ok" : "media-probe-failed"}>
          {formatProbeDetails(probe)}
        </span>
      ) : null}
    </div>
  );
}

function formatProbeDetails(probe: PublicMediaProbeResult): string {
  return [
    `HTTP ${probe.httpStatus ?? "?"}`,
    probe.contentType,
    probe.errorCode ? `code=${probe.errorCode}` : null,
    probe.error,
  ].filter(Boolean).join(" · ");
}

function MediaScreen({
  setMessage,
  openRequest,
  canManage,
}: {
  setMessage: (message: string | null) => void;
  openRequest: MediaOpenRequest | null;
  canManage: boolean;
}) {
  const { language, t, tx } = useI18n();
  const [filters, setFilters] = useState({ ownerAmoriaId: "", type: "", visibility: "", moderationStatus: "", createdFrom: "", createdTo: "", limit: "50" });
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaDetail | null>(null);
  const [detailReason, setDetailReason] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [decisionAction, setDecisionAction] = useState("mark_under_review");
  const [decisionReason, setDecisionReason] = useState("");
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewProbe, setPreviewProbe] = useState<PublicMediaProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decisionRequest = useRequestLock();
  const decisionRequiresReason = true;
  const graphicSafety = graphicSafetyFromRawResult(selected?.automation?.rawResult);

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
    await openDetailById(item.id, detailReason);
  }

  async function openDetailById(mediaId: string, reason: string) {
    setError(null);
    try {
      const response = await apiGet<{ media: MediaDetail }>(
        `/admin/media/${mediaId}${toQuery({ reason })}`,
      );
      setSelected(response.media);
      setSelectedReason(reason);
    } catch (error) {
      setError(errorMessage(error, t));
    }
  }

  useEffect(() => {
    if (!openRequest) {
      return;
    }

    const reason = openRequest.reason ?? "";
    setDetailReason(reason);
    if (openRequest.ownerAmoriaId) {
      setFilters((current) => ({ ...current, ownerAmoriaId: openRequest.ownerAmoriaId ?? "" }));
    }
    void openDetailById(openRequest.mediaId, reason);
  }, [openRequest?.nonce]);

  async function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    await decisionRequest.run(async () => {
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
    });
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
          <label>{t("media.visibility")}<select value={filters.visibility} onChange={(event) => setFilters({ ...filters, visibility: event.target.value })}>
            <option value="">{t("status.any")}</option><option value="avatar">Avatar</option><option value="public">Public</option><option value="locked">Locked</option></select></label>
          <label>{t("media.moderationStatus")}<select value={filters.moderationStatus} onChange={(event) => setFilters({ ...filters, moderationStatus: event.target.value })}>
            <option value="">{t("status.any")}</option>
            <option value="pending">Pending</option>
            <option value="needs_review">Needs review</option>
            <option value="approved">{t("status.approved")}</option>
            <option value="restricted">{t("status.restricted")}</option>
            <option value="removed">Removed</option>
            <option value="automation_failed">Automation failed</option>
          </select></label>
          <label>{t("media.createdFrom")}<input type="datetime-local" value={filters.createdFrom} onChange={(event) => setFilters({ ...filters, createdFrom: event.target.value })} /></label>
          <label>{t("media.createdTo")}<input type="datetime-local" value={filters.createdTo} onChange={(event) => setFilters({ ...filters, createdTo: event.target.value })} /></label>
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
                  {formatProbeDetails(previewProbe)}
                </div>
              ) : null}
            </div>
            <dl className="facts compact">
              <Fact label={t("media.mediaId")} value={selected.id} />
              <Fact label={t("media.ownerUserId")} value={selected.ownerUserId} />
              <Fact label={t("media.intent")} value={selected.type} />
              <Fact label={t("media.visibility")} value={selected.visibility ?? ""} />
              <Fact label={t("common.status")} value={formatStatus(selected.moderationStatus, t)} />
              <Fact label={t("media.origin")} value={selected.moderationOrigin} />
              <Fact label={t("media.model")} value={selected.automation?.providerEngine ?? ""} />
              <Fact label={t("media.modelVersion")} value={selected.automation?.modelVersion ?? ""} />
              <Fact label={t("media.policy")} value={selected.automation?.policyVersion ?? ""} />
              <Fact label={t("media.automatedDecision")} value={selected.automation?.policyDecision ?? ""} />
              <Fact
                label={t("media.graphicSafety")}
                value={graphicSafety
                  ? t(graphicSafetyLabelKeys[graphicSafety.displayState])
                  : t("media.graphicNotAvailable")}
              />
              <Fact
                label={t("media.graphicScore")}
                value={graphicSafety?.nsflProbability === null || graphicSafety?.nsflProbability === undefined
                  ? t("media.graphicNotAvailable")
                  : graphicSafety.nsflProbability.toFixed(6)}
              />
              <Fact
                label={t("media.graphicDecision")}
                value={graphicSafety?.policyDecision ?? t("media.graphicNotAvailable")}
              />
              <Fact
                label={t("media.graphicModel")}
                value={graphicSafety?.modelVersion ?? t("media.graphicNotAvailable")}
              />
              <Fact label={t("media.personPresence")} value={personPresenceFromRawResult(selected.automation?.rawResult)} />
              <Fact label={t("media.nsfwScore")} value={nsfwScoreFromRawResult(selected.automation?.rawResult)} />
              <Fact label={t("media.policyReason")} value={policyReasonFromRawResult(selected.automation?.rawResult)} />
              <Fact label={t("media.mime")} value={selected.mimeType} />
              <Fact label={t("media.size")} value={String(selected.sizeBytes)} />
              <Fact label={t("media.publicUrl")} value={resolveApiUrl(selected.publicUrl) ?? ""} />
            </dl>
            {canManage ? <form className="stack-form" onSubmit={submitDecision}>
              <label>{t("common.decision")}<select value={decisionAction} onChange={(event) => setDecisionAction(event.target.value)}>
                <option value="approve">{t("media.approve")}</option>
                <option value="restrict">{t("media.restrict")}</option>
                <option value="remove">{t("media.remove")}</option>
                <option value="mark_under_review">{t("reports.markUnderReview")}</option>
              </select></label>
              <label>{t("common.reason")}<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} required={decisionRequiresReason} /></label>
              <button disabled={decisionRequest.pending}>{t("media.saveDecision")}</button>
            </form> : null}
            <h3>{t("media.debugMetadata")}</h3>
            <JsonBlock data={selected} />
          </>
        ) : <EmptyState label={t("media.select")} />}
      </div>
    </section>
  );
}

function personPresenceFromRawResult(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const signal = (value as Record<string, unknown>).containsPerson;
  return signal === "true" || signal === "false" || signal === "unknown" ? signal : "";
}

function nsfwScoreFromRawResult(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const confidence = (value as Record<string, unknown>).confidence;
  if (!confidence || typeof confidence !== "object" || Array.isArray(confidence)) {
    return "";
  }
  const score = (confidence as Record<string, unknown>).nsfw;
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(6) : "";
}

function policyReasonFromRawResult(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const reason = (value as Record<string, unknown>).policyReasonCode;
  return typeof reason === "string" ? reason : "";
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
          <Fact label={t("ops.objectStorage")} value={formatObjectStorageStatus(data.objectStorage, t)} />
          <Fact label={t("ops.objectStorageCheckedAt")} value={formatDate(data.objectStorage.checkedAt, language)} />
          <Fact label={t("ops.emailDelivery")} value={formatSmtpStatus(data.smtp, t)} />
          <Fact label={t("ops.emailDeliveryCheckedAt")} value={formatDate(data.smtp.checkedAt, language)} />
          <Fact label={t("ops.accountDeletionCleanup")} value={data.accountDeletionCleanup.degraded ? t("status.degraded") : t("status.ok")} />
          <Fact label={t("ops.accountDeletionPending")} value={formatCount(data.accountDeletionCleanup.pending)} />
          <Fact label={t("ops.accountDeletionRetrying")} value={formatCount(data.accountDeletionCleanup.retrying)} />
          <Fact label={t("ops.accountDeletionMaxAttempts")} value={formatCount(data.accountDeletionCleanup.maxAttemptCount)} />
          <Fact label={t("ops.openClientErrors")} value={formatCount(data.counts.openClientErrors)} />
          <Fact label={t("ops.openReports")} value={formatCount(data.counts.openReports)} />
          <Fact label={t("ops.pendingMedia")} value={formatCount(data.counts.pendingMediaModerationItems)} />
        </dl>
      ) : <EmptyState label={t("ops.empty")} />}
    </section>
  );
}

function NearbyDiagnosticsScreen() {
  const { language, t } = useI18n();
  const [missingFilter, setMissingFilter] = useState<NearbyProfileMissingReason | "all">("all");
  const {
    data: nearbyDiagnostics,
    error: nearbyError,
    reload: reloadNearby,
  } = useLoad<NearbyDiagnostics>("/admin/nearby/diagnostics");
  const profileReadinessItems = nearbyDiagnostics?.profileReadinessItems ?? [];
  const filteredProfileReadinessItems =
    missingFilter === "all"
      ? profileReadinessItems
      : profileReadinessItems.filter((item) => item.missingReasons.includes(missingFilter));

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("ops.nearbyTitle")}</h2>
        <button className="secondary" onClick={reloadNearby}>{t("common.refresh")}</button>
      </div>
      <p className="muted">{t("ops.nearbySafeNote")}</p>
      {nearbyError ? <div className="error">{nearbyError}</div> : null}
      {nearbyDiagnostics ? (
        <>
          <dl className="facts">
            <Fact label={t("ops.nearbyCheckedAt")} value={formatDate(nearbyDiagnostics.checkedAt, language)} />
            <Fact label={t("ops.nearbyActive")} value={formatCount(nearbyDiagnostics.activeVisibilityCount)} />
            <Fact label={t("ops.nearbyOff")} value={formatCount(nearbyDiagnostics.offVisibilityCount)} />
            <Fact label={t("ops.nearbyExpired")} value={formatCount(nearbyDiagnostics.expiredVisibilityCount)} />
            <Fact label={t("ops.nearbyRecentlyUpdated")} value={formatCount(nearbyDiagnostics.recentlyUpdatedCount)} />
          </dl>
          <h3>{t("ops.nearbyReadiness")}</h3>
          <dl className="facts">
            <Fact label={t("ops.missingBirthDate")} value={formatCount(nearbyDiagnostics.profileReadinessMissing.missingBirthDate)} />
            <Fact label={t("ops.missingGender")} value={formatCount(nearbyDiagnostics.profileReadinessMissing.missingGender)} />
            <Fact label={t("ops.missingPreferredGenders")} value={formatCount(nearbyDiagnostics.profileReadinessMissing.missingPreferredGenders)} />
            <Fact label={t("ops.missingAvatar")} value={formatCount(nearbyDiagnostics.profileReadinessMissing.missingAvatar)} />
            <Fact label={t("ops.missingDisplayName")} value={formatCount(nearbyDiagnostics.profileReadinessMissing.missingDisplayName)} />
          </dl>
          <h3>{t("ops.nearbyReadinessDrilldown")}</h3>
          <div className="tab-row">
            {nearbyProfileMissingFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={missingFilter === filter ? "active" : "secondary"}
                onClick={() => setMissingFilter(filter)}
              >
                {filter === "all" ? t("ops.filterAll") : formatNearbyProfileMissingReason(filter, t)}
              </button>
            ))}
          </div>
          {filteredProfileReadinessItems.length ? (
            <DataTable
              columns={[
                t("common.amoriaId"),
                t("common.displayName"),
                t("ops.maskedEmail"),
                t("common.reason"),
                t("common.status"),
                t("common.created"),
                t("common.updated"),
              ]}
              rows={filteredProfileReadinessItems.map((item) => [
                item.amoriaId,
                item.displayName ?? "",
                item.emailMasked ?? "",
                item.missingReasons.map((reason) => formatNearbyProfileMissingReason(reason, t)).join(", "),
                formatNearbyVisibilityStatus(item.visibilityStatus, t),
                formatDate(item.createdAt, language),
                formatDate(item.updatedAt, language),
              ])}
            />
          ) : (
            <EmptyState label={t("ops.nearbyDrilldownEmpty")} />
          )}
          <h3>{t("ops.nearbyExclusions")}</h3>
          <DataTable
            columns={[t("common.reason"), t("common.count")]}
            rows={nearbyFeedExclusionReasons.map((reason) => [
              formatNearbyFeedExclusionReason(reason, t),
              formatCount(nearbyDiagnostics.feedExclusionReasons[reason]),
            ])}
          />
        </>
      ) : <EmptyState label={t("ops.nearbyEmpty")} />}
    </section>
  );
}

function NearbyRoomsScreen({
  canManageRooms,
  setMessage,
}: {
  canManageRooms: boolean;
  setMessage: (message: string | null) => void;
}) {
  const { language, t, tx } = useI18n();
  const [activityDemand, setActivityDemand] = useState<AdminNearbyActivityDemand | null>(null);
  const [demandError, setDemandError] = useState<string | null>(null);
  const [demandLoading, setDemandLoading] = useState(false);
  const [roomTypes, setRoomTypes] = useState<AdminNearbyRoomType[]>([]);
  const [rooms, setRooms] = useState<AdminNearbyRoom[]>([]);
  const [selected, setSelected] = useState<AdminNearbyRoom | null>(null);
  const [typeKey, setTypeKey] = useState("");
  const [geoBucket, setGeoBucket] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customTypeKey, setCustomTypeKey] = useState("");
  const [customTypeTitle, setCustomTypeTitle] = useState("");
  const [creatingCustomType, setCreatingCustomType] = useState(false);
  const [includeArchivedRooms, setIncludeArchivedRooms] = useState(false);
  const [createFromDemandForm, setCreateFromDemandForm] = useState<CreateFromDemandForm | null>(null);
  const [creatingFromDemand, setCreatingFromDemand] = useState(false);
  const [busyAction, setBusyAction] = useState<AdminNearbyRoomAction | null>(null);
  const [roomActionReason, setRoomActionReason] = useState("");
  const mutationRequest = useRequestLock();
  const demandRows = activityDemand?.items ?? [];
  const visibleDemandRows = demandRows.filter(hasVisibleActivityDemand);
  const demandSummary = summarizeNearbyDemand(demandRows);

  async function loadDemand(): Promise<boolean> {
    setDemandLoading(true);
    setDemandError(null);

    try {
      setActivityDemand(await getAdminNearbyActivityDemand());
      return true;
    } catch (error) {
      setDemandError(errorMessage(error, t));
      return false;
    } finally {
      setDemandLoading(false);
    }
  }

  async function load(preferredRoomId: string | null = selected?.id ?? null): Promise<boolean> {
    setLoading(true);
    setError(null);

    try {
      const roomsPath = `/admin/nearby-rooms${toQuery({
        includeArchived: includeArchivedRooms ? "true" : undefined,
      })}`;
      const [typesResponse, roomsResponse] = await Promise.all([
        apiGet<{ items: AdminNearbyRoomType[]; nextCursor: null }>("/admin/nearby-room-types"),
        apiGet<{ items: AdminNearbyRoom[]; nextCursor: null }>(roomsPath),
      ]);

      setRoomTypes(typesResponse.items);
      setRooms(roomsResponse.items);
      setTypeKey((current) => {
        if (current && typesResponse.items.some((item) => item.key === current)) {
          return current;
        }

        return typesResponse.items.find(isAvailableNearbyRoomType)?.key ?? typesResponse.items[0]?.key ?? "";
      });

      const nextRoomId =
        preferredRoomId && roomsResponse.items.some((item) => item.id === preferredRoomId)
          ? preferredRoomId
          : roomsResponse.items[0]?.id ?? null;

      if (!nextRoomId) {
        setSelected(null);
        return true;
      }

      return await loadDetail(nextRoomId);
    } catch (error) {
      setError(errorMessage(error, t));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(roomId: string): Promise<boolean> {
    setDetailLoading(true);
    setError(null);

    try {
      const response = await apiGet<{ room: AdminNearbyRoom }>(`/admin/nearby-rooms/${roomId}`);
      setSelected(response.room);
      return true;
    } catch (error) {
      setError(errorMessage(error, t));
      return false;
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void load(null);
  }, [includeArchivedRooms]);

  useEffect(() => {
    void loadDemand();
  }, []);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await mutationRequest.run(async () => {
      setCreating(true);
      setError(null);
      setMessage(null);

      try {
        const response = await apiPost<{ room: AdminNearbyRoom }>("/admin/nearby-rooms", {
          typeKey,
          geoBucket: geoBucket.trim(),
        });
        const reloaded = await load(response.room.id);
        if (reloaded) {
          setGeoBucket("");
          setMessage(tx("nearbyRooms.created", { id: response.room.id }));
        }
      } catch (error) {
        setError(errorMessage(error, t));
      } finally {
        setCreating(false);
      }
    });
  }

  async function submitCreateCustomType(event: FormEvent) {
    event.preventDefault();
    await mutationRequest.run(async () => {
      setCreatingCustomType(true);
      setError(null);
      setMessage(null);

      try {
        const response = await apiPost<{ roomType: AdminNearbyRoomType }>(
          "/admin/nearby-room-types",
          { key: customTypeKey.trim(), title: customTypeTitle.trim() },
        );
        const reloaded = await load(null);
        if (reloaded) {
          setTypeKey(response.roomType.key);
          setCustomTypeKey("");
          setCustomTypeTitle("");
          setMessage(tx("nearbyRooms.customTypeCreated", { title: response.roomType.title }));
        }
      } catch (error) {
        setError(errorMessage(error, t));
      } finally {
        setCreatingCustomType(false);
      }
    });
  }

  function openCreateFromDemand(item: AdminNearbyActivityDemandRow) {
    setError(null);
    setMessage(null);
    setCreateFromDemandForm(createDemandFormFromRow(item, t));
  }

  async function submitCreateFromDemand(event: FormEvent) {
    event.preventDefault();
    if (!createFromDemandForm) {
      return;
    }

    if (isUnsafeDemandGeoBucket(createFromDemandForm.geoBucket)) {
      setError(t("nearbyDemand.hiddenGeoBucketBlocked"));
      return;
    }

    await mutationRequest.run(async () => {
      setCreatingFromDemand(true);
      setError(null);
      setMessage(null);

      try {
        const response = await createNearbyRoomFromDemand(
          buildCreateFromDemandPayload(createFromDemandForm),
        );
        const roomsReloaded = await load(response.room.id);
        await loadDemand();
        if (roomsReloaded) {
          setCreateFromDemandForm(null);
          setMessage(tx("nearbyRooms.created", { id: response.room.id }));
        }
      } catch (error) {
        setError(errorMessage(error, t));
      } finally {
        setCreatingFromDemand(false);
      }
    });
  }

  async function submitRoomAction(action: AdminNearbyRoomAction) {
    if (!selected || roomActionReason.trim().length < 3) {
      return;
    }
    if (action === "delete" && !window.confirm(t("nearbyRooms.deleteConfirm"))) {
      return;
    }

    await mutationRequest.run(async () => {
      setBusyAction(action);
      setError(null);
      setMessage(null);

      try {
        const response = await apiPost<{ room: AdminNearbyRoom }>(
          `/admin/nearby-rooms/${selected.id}/actions`,
          { action, reason: roomActionReason.trim() },
        );
        const reloaded = await load(action === "delete" ? null : response.room.id);
        if (reloaded) {
          setRoomActionReason("");
          setMessage(action === "delete"
            ? t("nearbyRooms.deleted")
            : tx("nearbyRooms.actionApplied", {
              action: formatNearbyRoomAction(action, t),
              id: response.room.id,
            }));
        }
      } catch (error) {
        setError(errorMessage(error, t));
      } finally {
        setBusyAction(null);
      }
    });
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>{t("nearbyDemand.title")}</h2>
          <button className="secondary" onClick={() => void loadDemand()}>{t("common.refresh")}</button>
        </div>
        <p className="muted">{t("nearbyDemand.note")}</p>
        {!canManageRooms ? <p className="muted">{t("nearbyDemand.readOnlyNote")}</p> : null}
        <dl className="facts compact">
          <Fact label={t("nearbyDemand.summaryInterestedUsers")} value={formatCount(demandSummary.totalInterestedUsers)} />
          <Fact label={t("nearbyDemand.summaryActiveNearbyUsers")} value={formatCount(demandSummary.totalActiveNearbyUsers)} />
          <Fact label={t("nearbyDemand.summaryActivitiesWithDemand")} value={formatCount(demandSummary.activitiesWithDemand)} />
          <Fact label={t("nearbyDemand.summaryExistingActiveRooms")} value={formatCount(demandSummary.existingActiveRooms)} />
        </dl>
        <p className="muted">
          {t("nearbyDemand.debugSource")} · {tx("nearbyDemand.debugLoadedRows", { count: demandSummary.loadedRows })}
        </p>
        {demandError ? <div className="error">{demandError}</div> : null}
        {demandLoading ? <div className="empty">{t("common.loading")}</div> : null}
        {!demandLoading && visibleDemandRows.length ? (
          <table className="nearby-demand-table">
            <thead>
              <tr>
                <th>{t("nearbyDemand.activity")}</th>
                <th>{t("nearbyDemand.interestedUsers")}</th>
                <th>{t("nearbyDemand.activeNearbyUsers")}</th>
                <th>{t("nearbyDemand.recentUpdates")}</th>
                <th>{t("nearbyDemand.geoBuckets")}</th>
                <th>{t("nearbyDemand.existingActiveRooms")}</th>
                <th>{t("nearbyDemand.lastUpdated")}</th>
                <th>{t("common.action")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleDemandRows.map((item) => {
                const activityTitle = formatNearbyActivityTitle(item.activityKey, item.activityTitle, t);

                return (
                  <tr key={item.activityKey}>
                    <td><div className="nearby-demand-activity-cell">
                      <img className="nearby-demand-thumbnail" src={getNearbyActivityArtUrl(item.activityKey)} alt="" loading="lazy" />
                      <div><div>{activityTitle}</div><div className="muted">{item.activityKey}</div></div>
                    </div></td>
                    <td>{formatCount(item.interestedUsersCount)}</td>
                    <td>{formatCount(item.activeNearbyUsersCount)}</td>
                    <td>{formatCount(item.recentlyUpdatedUsersCount)}</td>
                    <td>{formatNearbyDemandGeoBuckets(item.geoBuckets, t)}</td>
                    <td>{formatCount(item.existingActiveRoomCount)}</td>
                    <td>{item.lastUpdatedAt ? formatDate(item.lastUpdatedAt, language) : ""}</td>
                    <td>
                      {canManageRooms ? (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => openCreateFromDemand(item)}
                        >
                          {t("nearbyDemand.createActivity")}
                        </button>
                      ) : (
                        <span className="muted">{t("nearbyDemand.readOnlyAction")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        {!demandLoading && activityDemand && !visibleDemandRows.length ? (
          <EmptyState label={t("nearbyDemand.empty")} />
        ) : null}
      </section>

      <section className="grid-two">
      <div className="panel">
        <div className="panel-header">
          <h2>{t("nearbyRooms.title")}</h2>
          <div className="panel-actions">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeArchivedRooms}
                onChange={(event) => setIncludeArchivedRooms(event.target.checked)}
              />
              {t("nearbyRooms.showArchived")}
            </label>
            <button className="secondary" onClick={() => void load()}>{t("common.refresh")}</button>
          </div>
        </div>
        <p className="muted">{t("nearbyRooms.technicalSubtitle")}</p>
        <p className="muted">{t("nearbyRooms.archiveNote")}</p>
        {error ? <div className="error">{error}</div> : null}
        {loading ? <div className="empty">{t("common.loading")}</div> : null}
        {!loading && rooms.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("nearbyRooms.titleAndType")}</th>
                <th>{t("nearbyRooms.geoBucket")}</th>
                <th>{t("nearbyRooms.locationLabel")}</th>
                <th>{t("nearbyRooms.startsAt")}</th>
                <th>{t("nearbyRooms.expiresAt")}</th>
                <th>{t("common.status")}</th>
                <th>{t("nearbyRooms.memberCount")}</th>
                <th>{t("common.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr
                  key={room.id}
                  onClick={() => void loadDetail(room.id)}
                  className={[
                    selected?.id === room.id ? "selected" : "",
                    room.status === "archived" ? "archived" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <td>
                    <div>{formatNearbyRoomDisplayTitle(room, t)}</div>
                    <div className="muted">{formatNearbyRoomTypeLabel(room, t)} · {room.typeKey}</div>
                  </td>
                  <td>{room.geoBucket}</td>
                  <td>{room.locationLabel ?? ""}</td>
                  <td>{room.startsAt ? formatDate(room.startsAt, language) : ""}</td>
                  <td>{room.expiresAt ? formatDate(room.expiresAt, language) : ""}</td>
                  <td>{formatStatus(room.status, t)}</td>
                  <td>{formatCount(room.memberCount)}</td>
                  <td>{formatDate(room.updatedAt, language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {!loading && !rooms.length ? <EmptyState label={t("nearbyRooms.empty")} /> : null}
      </div>

      <div className="panel">
        {canManageRooms ? (
          <>
            {createFromDemandForm ? (
              <div className="create-from-demand-panel">
                <h2>{t("nearbyDemand.createActivity")}</h2>
                <div className="nearby-activity-preview">
                  <img src={getNearbyActivityArtUrl(createFromDemandForm.activityKey)} alt="" />
                  <div className="nearby-activity-preview-overlay">
                    <strong>{createFromDemandForm.activityTitle}</strong>
                    <span>{createFromDemandForm.activityKey}</span>
                  </div>
                </div>
                <form className="stack-form" onSubmit={submitCreateFromDemand}>
                  <label>
                    {t("nearbyDemand.activity")}
                    <input
                      value={`${createFromDemandForm.activityTitle} · ${createFromDemandForm.activityKey}`}
                      readOnly
                    />
                  </label>
                  {createFromDemandForm.visibleGeoBuckets.length ? (
                    <label>
                      {t("nearbyRooms.geoBucket")}
                      <select
                        value={createFromDemandForm.geoBucket}
                        onChange={(event) => setCreateFromDemandForm({
                          ...createFromDemandForm,
                          geoBucket: event.target.value,
                        })}
                        required
                      >
                        {createFromDemandForm.visibleGeoBuckets.map((bucket) => (
                          <option key={bucket.geoBucket} value={bucket.geoBucket}>
                            {bucket.geoBucket} ({formatCount(bucket.interestedUsersCount)})
                          </option>
                        ))}
                      </select>
                      <span className="muted">{t("nearbyDemand.visibleGeoBucketHelp")}</span>
                    </label>
                  ) : (
                    <label>
                      {t("nearbyDemand.manualGeoBucket")}
                      <input
                        value={createFromDemandForm.geoBucket}
                        onChange={(event) => setCreateFromDemandForm({
                          ...createFromDemandForm,
                          geoBucket: event.target.value,
                        })}
                        maxLength={200}
                        placeholder="zagreb-center"
                        required
                      />
                      <span className="muted">{t("nearbyDemand.manualGeoBucketHelp")}</span>
                    </label>
                  )}
                  <label>
                    {t("common.title")}
                    <input
                      value={createFromDemandForm.title}
                      onChange={(event) => setCreateFromDemandForm({
                        ...createFromDemandForm,
                        title: event.target.value,
                      })}
                      maxLength={80}
                    />
                  </label>
                  <label>
                    {t("nearbyRooms.description")}
                    <textarea
                      value={createFromDemandForm.description}
                      onChange={(event) => setCreateFromDemandForm({
                        ...createFromDemandForm,
                        description: event.target.value,
                      })}
                      maxLength={500}
                    />
                  </label>
                  <label>
                    {t("nearbyRooms.locationLabel")}
                    <input
                      value={createFromDemandForm.locationLabel}
                      onChange={(event) => setCreateFromDemandForm({
                        ...createFromDemandForm,
                        locationLabel: event.target.value,
                      })}
                      maxLength={120}
                    />
                  </label>
                  <label>
                    {t("nearbyRooms.startsAt")}
                    <input
                      type="datetime-local"
                      value={createFromDemandForm.startsAt}
                      onChange={(event) => setCreateFromDemandForm({
                        ...createFromDemandForm,
                        startsAt: event.target.value,
                      })}
                    />
                  </label>
                  <label>
                    {t("nearbyRooms.endsAt")}
                    <input
                      type="datetime-local"
                      value={createFromDemandForm.endsAt}
                      onChange={(event) => setCreateFromDemandForm({
                        ...createFromDemandForm,
                        endsAt: event.target.value,
                      })}
                    />
                  </label>
                  <label>
                    {t("nearbyRooms.expiresAt")}
                    <input
                      type="datetime-local"
                      value={createFromDemandForm.expiresAt}
                      onChange={(event) => setCreateFromDemandForm({
                        ...createFromDemandForm,
                        expiresAt: event.target.value,
                      })}
                    />
                  </label>
                  <div className="tab-row">
                    <button
                      disabled={
                        mutationRequest.pending ||
                        creatingFromDemand ||
                        loading ||
                        demandLoading ||
                        !createFromDemandForm.geoBucket.trim() ||
                        isUnsafeDemandGeoBucket(createFromDemandForm.geoBucket)
                      }
                    >
                      {creatingFromDemand ? t("nearbyRooms.creating") : t("nearbyDemand.createActivity")}
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      disabled={mutationRequest.pending || creatingFromDemand}
                      onClick={() => setCreateFromDemandForm(null)}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
            <h2>{t("nearbyRooms.customTypeTitle")}</h2>
            <form className="stack-form" onSubmit={submitCreateCustomType}>
              <label>
                {t("nearbyRooms.customTypeKey")}
                <input
                  value={customTypeKey}
                  onChange={(event) => setCustomTypeKey(event.target.value)}
                  minLength={3}
                  maxLength={120}
                  pattern="[a-z0-9]+(?:_[a-z0-9]+)*"
                  placeholder="sunset_picnic"
                  required
                />
                <span className="muted">{t("nearbyRooms.customTypeKeyHelp")}</span>
              </label>
              <label>
                {t("nearbyRooms.customTypeName")}
                <input
                  value={customTypeTitle}
                  onChange={(event) => setCustomTypeTitle(event.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              <button disabled={mutationRequest.pending || creatingCustomType || loading}>
                {creatingCustomType
                  ? t("nearbyRooms.customTypeCreating")
                  : t("nearbyRooms.customTypeCreate")}
              </button>
            </form>
            <h2>{t("nearbyRooms.createTitle")}</h2>
            <form className="stack-form" onSubmit={submitCreate}>
              <label>
                {t("nearbyRooms.typeKey")}
                <select
                  value={typeKey}
                  onChange={(event) => setTypeKey(event.target.value)}
                  required
                >
                  {roomTypes.map((roomType) => (
                    <option
                      key={roomType.key}
                      value={roomType.key}
                    >
                      {formatNearbyRoomTypeSelectLabel(roomType, t)}
                    </option>
                  ))}
                </select>
                <span className="muted">{t("nearbyRooms.typeKeyHelp")}</span>
              </label>
              <label>
                {t("nearbyRooms.geoBucket")}
                <input
                  value={geoBucket}
                  onChange={(event) => setGeoBucket(event.target.value)}
                  maxLength={200}
                  placeholder="zagreb-center"
                  required
                />
                <span className="muted">{t("nearbyRooms.geoBucketHelp")}</span>
              </label>
              <button disabled={mutationRequest.pending || creating || loading || !typeKey}>
                {creating ? t("nearbyRooms.creating") : t("nearbyRooms.create")}
              </button>
            </form>
          </>
        ) : (
          <p className="muted">{t("nearbyRooms.readOnlyNote")}</p>
        )}

        <h3>{t("nearbyRooms.detailTitle")}</h3>
        {detailLoading ? <div className="empty">{t("common.loading")}</div> : null}
        {!detailLoading && selected ? (
          <>
            <dl className="facts compact">
              <Fact label={t("nearbyRooms.roomId")} value={selected.id} />
              <Fact label={t("common.type")} value={`${formatNearbyRoomTypeLabel(selected, t)} · ${selected.typeKey}`} />
              <Fact label={t("common.title")} value={formatNearbyRoomDisplayTitle(selected, t)} />
              <Fact label={t("nearbyRooms.description")} value={selected.description ?? ""} />
              <Fact label={t("nearbyRooms.locationLabel")} value={selected.locationLabel ?? ""} />
              <Fact label={t("nearbyRooms.geoBucket")} value={selected.geoBucket} />
              <Fact label={t("nearbyRooms.startsAt")} value={selected.startsAt ? formatDate(selected.startsAt, language) : ""} />
              <Fact label={t("nearbyRooms.endsAt")} value={selected.endsAt ? formatDate(selected.endsAt, language) : ""} />
              <Fact label={t("nearbyRooms.expiresAt")} value={selected.expiresAt ? formatDate(selected.expiresAt, language) : ""} />
              <Fact
                label={t("nearbyRooms.createdFromDemandSnapshot")}
                value={formatNearbyRoomDemandSnapshot(selected.createdFromDemandSnapshot, language, t)}
              />
              <Fact label={t("common.status")} value={formatStatus(selected.status, t)} />
              <Fact label={t("nearbyRooms.memberCount")} value={formatCount(selected.memberCount)} />
              <Fact label={t("nearbyRooms.threadId")} value={selected.threadId ?? ""} />
              <Fact label={t("common.created")} value={formatDate(selected.createdAt, language)} />
              <Fact label={t("common.updated")} value={formatDate(selected.updatedAt, language)} />
            </dl>
            {canManageRooms ? (
              <div className="stack-form">
                <label>
                  {t("common.reason")}
                  <input
                    value={roomActionReason}
                    onChange={(event) => setRoomActionReason(event.target.value)}
                    minLength={3}
                    maxLength={500}
                    required
                  />
                </label>
                <div className="tab-row">
                  {nearbyRoomActions.filter((action) => action !== "delete" || selected.status === "archived").map((action) => (
                    <button
                      key={action}
                      type="button"
                      className={action === "delete" ? "danger" : action === "disable" ? "" : "secondary"}
                      disabled={
                        mutationRequest.pending ||
                        busyAction !== null ||
                        loading ||
                        detailLoading ||
                        roomActionReason.trim().length < 3 ||
                        isNearbyRoomActionCurrent(selected, action)
                      }
                      onClick={() => void submitRoomAction(action)}
                    >
                      {busyAction === action ? t("nearbyRooms.applying") : formatNearbyRoomAction(action, t)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        {!detailLoading && !selected ? <EmptyState label={t("empty.selectRow")} /> : null}

        <h3>{t("nearbyRooms.typesTitle")}</h3>
        {loading ? <div className="empty">{t("common.loading")}</div> : null}
        {!loading && roomTypes.length ? (
          <DataTable
            columns={[
              t("nearbyRooms.typeKey"),
              t("common.type"),
              t("common.status"),
              t("nearbyRooms.adminApproved"),
              t("common.updated"),
            ]}
            rows={roomTypes.map((roomType) => [
              roomType.key,
              formatNearbyActivityTitle(roomType.key, roomType.title, t),
              formatStatus(roomType.status, t),
              roomType.adminApproved ? t("common.yes") : t("common.no"),
              formatDate(roomType.updatedAt, language),
            ])}
          />
        ) : null}
        {!loading && !roomTypes.length ? <EmptyState label={t("nearbyRooms.typesEmpty")} /> : null}
      </div>
      </section>
    </>
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
        <option value="hr">{t("language.hr")}</option>
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

function useRequestLock() {
  const active = useRef(false);
  const [pending, setPending] = useState(false);

  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (active.current) {
      return undefined;
    }

    active.current = true;
    setPending(true);
    try {
      return await operation();
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  return { pending, run };
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

const nearbyActivityTranslationKeys: Record<string, TranslationKey> = {
  coffee_nearby: "nearbyActivity.coffee_nearby",
  walk_nearby: "nearbyActivity.walk_nearby",
  bike_nearby: "nearbyActivity.bike_nearby",
  cinema_today: "nearbyActivity.cinema_today",
  talk_nearby: "nearbyActivity.talk_nearby",
  evening_nearby: "nearbyActivity.evening_nearby",
  roller_skating_nearby: "nearbyActivity.roller_skating_nearby",
  kayaking_nearby: "nearbyActivity.kayaking_nearby",
  fishing_nearby: "nearbyActivity.fishing_nearby",
  sport_nearby: "nearbyActivity.sport_nearby",
  language_exchange_nearby: "nearbyActivity.language_exchange_nearby",
  local_event_nearby: "nearbyActivity.local_event_nearby",
  lunch_nearby: "nearbyActivity.lunch_nearby",
  dinner_nearby: "nearbyActivity.dinner_nearby",
  dessert_nearby: "nearbyActivity.dessert_nearby",
  board_games_nearby: "nearbyActivity.board_games_nearby",
  chess_nearby: "nearbyActivity.chess_nearby",
  book_club_nearby: "nearbyActivity.book_club_nearby",
  study_work_nearby: "nearbyActivity.study_work_nearby",
  skateboarding_nearby: "nearbyActivity.skateboarding_nearby",
  running_nearby: "nearbyActivity.running_nearby",
  gym_nearby: "nearbyActivity.gym_nearby",
  yoga_nearby: "nearbyActivity.yoga_nearby",
  dance_nearby: "nearbyActivity.dance_nearby",
  football_nearby: "nearbyActivity.football_nearby",
  basketball_nearby: "nearbyActivity.basketball_nearby",
  volleyball_nearby: "nearbyActivity.volleyball_nearby",
  tennis_nearby: "nearbyActivity.tennis_nearby",
  table_tennis_nearby: "nearbyActivity.table_tennis_nearby",
  badminton_nearby: "nearbyActivity.badminton_nearby",
  beach_swim_nearby: "nearbyActivity.beach_swim_nearby",
  picnic_nearby: "nearbyActivity.picnic_nearby",
  hiking_nearby: "nearbyActivity.hiking_nearby",
  dog_walk_nearby: "nearbyActivity.dog_walk_nearby",
  concert_nearby: "nearbyActivity.concert_nearby",
  museum_exhibition_nearby: "nearbyActivity.museum_exhibition_nearby",
  theater_nearby: "nearbyActivity.theater_nearby",
  live_music_nearby: "nearbyActivity.live_music_nearby",
  festival_nearby: "nearbyActivity.festival_nearby",
  photography_nearby: "nearbyActivity.photography_nearby",
  cooking_nearby: "nearbyActivity.cooking_nearby",
  volunteering_nearby: "nearbyActivity.volunteering_nearby",
  gaming_nearby: "nearbyActivity.gaming_nearby",
};

function formatNearbyActivityTitle(
  activityKey: string,
  fallbackTitle: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  const translationKey = nearbyActivityTranslationKeys[activityKey];
  if (translationKey) {
    return t(translationKey);
  }

  return fallbackTitle?.trim() || activityKey;
}

function summarizeNearbyDemand(items: AdminNearbyActivityDemandRow[]): NearbyDemandSummary {
  return items.reduce<NearbyDemandSummary>((summary, item) => ({
    totalInterestedUsers: summary.totalInterestedUsers + item.interestedUsersCount,
    totalActiveNearbyUsers: summary.totalActiveNearbyUsers + item.activeNearbyUsersCount,
    activitiesWithDemand: summary.activitiesWithDemand + (item.interestedUsersCount > 0 ? 1 : 0),
    existingActiveRooms: summary.existingActiveRooms + item.existingActiveRoomCount,
    loadedRows: summary.loadedRows + 1,
  }), {
    totalInterestedUsers: 0,
    totalActiveNearbyUsers: 0,
    activitiesWithDemand: 0,
    existingActiveRooms: 0,
    loadedRows: 0,
  });
}

function hasVisibleActivityDemand(item: AdminNearbyActivityDemandRow): boolean {
  return (
    item.interestedUsersCount > 0 ||
    item.activeNearbyUsersCount > 0 ||
    item.recentlyUpdatedUsersCount > 0 ||
    item.geoBuckets.length > 0 ||
    item.existingActiveRoomCount > 0 ||
    item.lastUpdatedAt !== null
  );
}

const SMALL_BUCKET_HIDDEN = "small_bucket_hidden";

function createDemandFormFromRow(
  item: AdminNearbyActivityDemandRow,
  t: (key: TranslationKey) => string,
): CreateFromDemandForm {
  const visibleGeoBuckets = visibleActivityDemandGeoBuckets(item.geoBuckets);
  const activityTitle = formatNearbyActivityTitle(item.activityKey, item.activityTitle, t);

  return {
    activityKey: item.activityKey,
    activityTitle,
    geoBucket: visibleGeoBuckets[0]?.geoBucket ?? "",
    visibleGeoBuckets,
    title: activityTitle,
    description: "",
    locationLabel: "",
    startsAt: "",
    endsAt: "",
    expiresAt: "",
  };
}

function visibleActivityDemandGeoBuckets(
  geoBuckets: AdminNearbyActivityDemandRow["geoBuckets"],
): AdminNearbyActivityDemandRow["geoBuckets"] {
  return geoBuckets.filter((bucket) => bucket.geoBucket !== SMALL_BUCKET_HIDDEN);
}

function isUnsafeDemandGeoBucket(value: string): boolean {
  return value.trim() === SMALL_BUCKET_HIDDEN;
}

function buildCreateFromDemandPayload(
  form: CreateFromDemandForm,
): CreateNearbyRoomFromDemandPayload {
  const payload: CreateNearbyRoomFromDemandPayload = {
    activityKey: form.activityKey,
    geoBucket: form.geoBucket.trim(),
  };
  const title = optionalTrimmed(form.title);
  const description = optionalTrimmed(form.description);
  const locationLabel = optionalTrimmed(form.locationLabel);
  const startsAt = optionalLocalDateTimeToIso(form.startsAt);
  const endsAt = optionalLocalDateTimeToIso(form.endsAt);
  const expiresAt = optionalLocalDateTimeToIso(form.expiresAt);

  if (title) payload.title = title;
  if (description) payload.description = description;
  if (locationLabel) payload.locationLabel = locationLabel;
  if (startsAt) payload.startsAt = startsAt;
  if (endsAt) payload.endsAt = endsAt;
  if (expiresAt) payload.expiresAt = expiresAt;

  return payload;
}

function optionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalLocalDateTimeToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatNearbyDemandGeoBuckets(
  geoBuckets: AdminNearbyActivityDemandRow["geoBuckets"],
  t: (key: TranslationKey) => string,
): string {
  return geoBuckets
    .map((bucket) => {
      const label =
        bucket.geoBucket === SMALL_BUCKET_HIDDEN
          ? t("nearbyDemand.smallBucketHidden")
          : bucket.geoBucket;
      return `${label} (${formatCount(bucket.interestedUsersCount)})`;
    })
    .join(", ");
}

function formatDashboardCount(
  value: number | null,
  t: (key: TranslationKey) => string,
): string {
  return value === null ? t("dashboard.notAvailable") : String(value);
}

function formatDashboardHealthStatus(
  health: AdminReleaseDashboard["health"],
  t: (key: TranslationKey) => string,
): string {
  if (health.databaseStatus !== "ok") {
    return t("status.failed");
  }

  if (health.objectStorage.status !== "ok") {
    return formatObjectStorageStatus(health.objectStorage, t);
  }

  if (health.smtp.status !== "ok") {
    return t("status.degraded");
  }

  return t("status.ok");
}

function formatSmtpStatus(
  smtp: OpsHealth["smtp"],
  t: (key: TranslationKey) => string,
): string {
  return smtp.status === "ok" ? t("status.ok") : t("status.degraded");
}

function formatObjectStorageStatus(
  objectStorage: OpsHealth["objectStorage"],
  t: (key: TranslationKey) => string,
): string {
  const detail = objectStorage.errorCode ?? objectStorage.reason;
  const status = formatStatus(objectStorage.status, t);
  return detail ? `${status}: ${detail}` : status;
}

const nearbyFeedExclusionReasons: NearbyFeedExclusionReason[] = [
  "self",
  "blocked",
  "visibility_off",
  "visibility_expired",
  "distance_too_far",
  "age_mismatch",
  "gender_mismatch",
  "missing_birth_date",
  "missing_gender",
  "missing_preferred_genders",
];

const nearbyProfileMissingFilters: Array<NearbyProfileMissingReason | "all"> = [
  "all",
  "missing_birth_date",
  "missing_gender",
  "missing_preferred_genders",
  "missing_avatar",
];

const nearbyRoomActions: AdminNearbyRoomAction[] = ["close", "disable", "reopen", "archive", "delete"];

function isAvailableNearbyRoomType(roomType: AdminNearbyRoomType): boolean {
  return roomType.status === "active" && roomType.adminApproved;
}

function formatNearbyRoomTypeSelectLabel(
  roomType: AdminNearbyRoomType,
  t: (key: TranslationKey) => string,
): string {
  const availability = roomType.adminApproved ? t("common.yes") : t("common.no");
  const title = formatNearbyActivityTitle(roomType.key, roomType.title, t);
  return `${title} (${roomType.key}, ${formatStatus(roomType.status, t)}, ${t("nearbyRooms.adminApproved")}: ${availability})`;
}

function formatNearbyRoomTypeLabel(
  room: AdminNearbyRoom,
  t: (key: TranslationKey) => string,
): string {
  return formatNearbyActivityTitle(room.typeKey, room.roomType.title, t);
}

function formatNearbyRoomDisplayTitle(
  room: AdminNearbyRoom,
  t: (key: TranslationKey) => string,
): string {
  const localizedTypeTitle = formatNearbyRoomTypeLabel(room, t);
  const title = room.title?.trim();

  if (!title || title === room.roomType.title) {
    return localizedTypeTitle;
  }

  return title;
}

function formatNearbyRoomDemandSnapshot(
  snapshot: AdminNearbyRoom["createdFromDemandSnapshot"],
  language: Language,
  t: (key: TranslationKey) => string,
): string {
  if (!snapshot) {
    return "";
  }

  return [
    `${t("nearbyDemand.activity")}: ${formatNearbyActivityTitle(snapshot.activityKey, null, t)} · ${snapshot.activityKey}`,
    `${t("nearbyRooms.geoBucket")}: ${snapshot.geoBucket}`,
    `${t("nearbyDemand.interestedUsers")}: ${formatCount(snapshot.interestedUsersCount)}`,
    `${t("nearbyDemand.activeNearbyUsers")}: ${formatCount(snapshot.activeNearbyUsersCount)}`,
    `${t("nearbyDemand.recentUpdates")}: ${formatCount(snapshot.recentlyUpdatedUsersCount)}`,
    `${t("nearbyRooms.demandCapturedAt")}: ${formatDate(snapshot.capturedAt, language)}`,
  ].join(" · ");
}

function isNearbyRoomActionCurrent(room: AdminNearbyRoom, action: AdminNearbyRoomAction): boolean {
  if (action === "close") {
    return room.status === "closed";
  }

  if (action === "disable") {
    return room.status === "disabled";
  }

  if (action === "archive") {
    return room.status === "archived";
  }

  if (action === "delete") {
    return room.status === "deleted";
  }

  return room.status === "active";
}

function formatNearbyRoomAction(
  action: AdminNearbyRoomAction,
  t: (key: TranslationKey) => string,
): string {
  switch (action) {
    case "close":
      return t("action.close");
    case "disable":
      return t("action.disable");
    case "reopen":
      return t("action.reopen");
    case "archive":
      return t("nearbyRooms.action.archive");
    case "delete":
      return t("nearbyRooms.action.delete");
  }
}

function formatNearbyFeedExclusionReason(
  reason: NearbyFeedExclusionReason,
  t: (key: TranslationKey) => string,
): string {
  switch (reason) {
    case "self":
      return t("ops.reasonSelf");
    case "blocked":
      return t("ops.reasonBlocked");
    case "visibility_off":
      return t("ops.reasonVisibilityOff");
    case "visibility_expired":
      return t("ops.reasonVisibilityExpired");
    case "distance_too_far":
      return t("ops.reasonDistanceTooFar");
    case "age_mismatch":
      return t("ops.reasonAgeMismatch");
    case "gender_mismatch":
      return t("ops.reasonGenderMismatch");
    case "missing_birth_date":
      return t("ops.reasonMissingBirthDate");
    case "missing_gender":
      return t("ops.reasonMissingGender");
    case "missing_preferred_genders":
      return t("ops.reasonMissingPreferredGenders");
  }
}

function formatNearbyProfileMissingReason(
  reason: NearbyProfileMissingReason,
  t: (key: TranslationKey) => string,
): string {
  switch (reason) {
    case "missing_birth_date":
      return t("ops.missingBirthDate");
    case "missing_gender":
      return t("ops.missingGender");
    case "missing_preferred_genders":
      return t("ops.missingPreferredGenders");
    case "missing_avatar":
      return t("ops.missingAvatar");
    case "missing_display_name":
      return t("ops.missingDisplayName");
  }
}

function formatNearbyVisibilityStatus(
  status: NearbyDiagnostics["profileReadinessItems"][number]["visibilityStatus"],
  t: (key: TranslationKey) => string,
): string {
  switch (status) {
    case "active":
      return t("status.active");
    case "off":
      return t("ops.visibilityOff");
    case "expired":
      return t("ops.visibilityExpired");
    case "none":
      return t("ops.visibilityNone");
  }
}

function errorMessage(error: unknown, t: (key: TranslationKey) => string): string {
  return error instanceof Error ? error.message : t("error.requestFailed");
}

function formatReportUserIdentity(user: ReportItem["reporter"]): string {
  return `${user.displayName} · ${user.amoriaId}`;
}

function formatReportUserEmail(user: ReportItem["reporter"] | null): string {
  return user?.email ?? "";
}

function sameAdminUser(left: ReportItem["reporter"] | null, right: ReportItem["reporter"] | null): boolean {
  if (!left || !right) return false;
  return left.id && right.id ? left.id === right.id : left.amoriaId === right.amoriaId;
}

function ReportEmail({ email }: { email: string }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <span className="muted">—</span>;
}

function formatReportContextLinkLabel(
  link: ReportTargetContextLink,
  t: (key: TranslationKey) => string,
): string {
  switch (link.kind) {
    case "reporter_user":
      return t("reports.openReporter");
    case "target_owner_user":
      return t("reports.openTargetOwner");
    case "target_user":
      return t("reports.openReportedUser");
    case "target_media":
      return t("reports.openTargetMedia");
    case "target_thread":
      return t("reports.targetThread");
    case "target_message":
      return t("reports.targetMessage");
    case "target_together_session":
      return t("reports.openTogetherSession");
    case "nearby_diagnostics":
      return t("reports.openNearbyDiagnostics");
  }
}

function formatReportReviewAction(
  action: string,
  t: (key: TranslationKey) => string,
): string {
  switch (action) {
    case "assign":
      return t("reports.assign");
    case "mark_under_review":
      return t("reports.markUnderReview");
    case "dismiss":
      return t("reports.dismiss");
    case "resolve":
      return t("reports.resolve");
    case "escalate":
      return t("reports.escalate");
    case "add_note":
      return t("reports.addNote");
    default:
      return action;
  }
}

function metadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function formatMaybeStatus(status: string, t: (key: TranslationKey) => string): string {
  return status ? formatStatus(status, t) : "";
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
    case "closed":
      return t("status.closed");
    case "disabled":
      return t("status.disabled");
    case "degraded":
      return t("status.degraded");
    case "dismissed":
      return t("status.dismissed");
    case "escalated":
      return t("status.escalated");
    case "error":
      return t("status.error");
    case "failed":
      return t("status.failed");
    case "ignored":
      return t("status.ignored");
    case "not_configured":
      return t("status.notConfigured");
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
    case "age_mismatch":
      return t("queue.reasonAgeMismatch");
    case "missing_user_age":
      return t("queue.reasonMissingUserAge");
    case "missing_age_preference":
      return t("queue.reasonMissingAgePreference");
    case "unknown":
      return t("queue.reasonUnknown");
    default:
      return reason;
  }
}

function formatPreferredAgeRange(
  range: TogetherQueueEntry["preferredAgeRange"],
  t: (key: TranslationKey) => string,
): string {
  if (!range) {
    return "";
  }
  if (range.max === null) {
    return range.min === 18 ? t("queue.ageAnyAdult") : `${range.min}+`;
  }
  return `${range.min}-${range.max}`;
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
