import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "amoria_activity_freshness_v1";
const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type DmThreadActivity = {
  lastMessageText?: string;
  lastMessageAt?: number;
  updatedAt?: number;
  createdAt?: number;
};

type PlaySessionActivity = {
  createdAt?: number;
  startedAt?: number;
  endedAt?: number;
  sortAt?: number;
};

export type SeenActivityState = {
  dmThreads: Record<string, number>;
  playSessions: Record<string, number>;
};

export type ActivitySignal =
  | {
      kind: "new_message" | "fresh_contact" | "recent_active" | "new_story" | "recent_story";
      tone: "fresh" | "recent";
      activityAt: number;
    }
  | null;

const EMPTY_STATE: SeenActivityState = {
  dmThreads: {},
  playSessions: {},
};

let cache: SeenActivityState = EMPTY_STATE;
let hydrated = false;
let hydratePromise: Promise<SeenActivityState> | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function sanitizeMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [String(key), Number(raw ?? 0)] as const)
      .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0)
  );
}

async function persistState(next: SeenActivityState) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

export async function ensureActivityFreshnessState(): Promise<SeenActivityState> {
  if (hydrated) return cache;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        cache = EMPTY_STATE;
      } else {
        const parsed = JSON.parse(raw) as Partial<SeenActivityState>;
        cache = {
          dmThreads: sanitizeMap(parsed?.dmThreads),
          playSessions: sanitizeMap(parsed?.playSessions),
        };
      }
    } catch {
      cache = EMPTY_STATE;
    }

    hydrated = true;
    hydratePromise = null;
    notifyListeners();
    return cache;
  })();

  return hydratePromise;
}

export function getActivityFreshnessSnapshot(): SeenActivityState {
  return cache;
}

export function subscribeActivityFreshness(listener: () => void) {
  listeners.add(listener);
  void ensureActivityFreshnessState();
  return () => {
    listeners.delete(listener);
  };
}

export function useActivityFreshnessState() {
  const [snapshot, setSnapshot] = React.useState<SeenActivityState>(getActivityFreshnessSnapshot());

  React.useEffect(() => {
    let alive = true;
    const applySnapshot = () => {
      if (!alive) return;
      setSnapshot(getActivityFreshnessSnapshot());
    };

    const unsubscribe = subscribeActivityFreshness(applySnapshot);
    void ensureActivityFreshnessState().then(applySnapshot);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return snapshot;
}

export async function markDmThreadSeen(threadId: string, seenAt = Date.now()) {
  const stableThreadId = String(threadId ?? "").trim();
  if (!stableThreadId) return;

  await ensureActivityFreshnessState();
  const current = cache.dmThreads[stableThreadId] ?? 0;
  if (current >= seenAt) return;

  cache = {
    ...cache,
    dmThreads: {
      ...cache.dmThreads,
      [stableThreadId]: seenAt,
    },
  };
  notifyListeners();
  await persistState(cache);
}

export async function markPlaySessionSeen(sessionId: string, seenAt = Date.now()) {
  const stableSessionId = String(sessionId ?? "").trim();
  if (!stableSessionId) return;

  await ensureActivityFreshnessState();
  const current = cache.playSessions[stableSessionId] ?? 0;
  if (current >= seenAt) return;

  cache = {
    ...cache,
    playSessions: {
      ...cache.playSessions,
      [stableSessionId]: seenAt,
    },
  };
  notifyListeners();
  await persistState(cache);
}

export function resetActivityFreshnessState(): void {
  cache = EMPTY_STATE;
  hydrated = false;
  hydratePromise = null;
  notifyListeners();
}

export function getDmThreadActivityAt(thread: Pick<DmThreadActivity, "lastMessageAt" | "updatedAt" | "createdAt">) {
  return thread.lastMessageAt ?? thread.updatedAt ?? thread.createdAt ?? 0;
}

function getPlaySessionActivityAt(session: PlaySessionActivity) {
  if (session.sortAt != null) return session.sortAt;
  return session.endedAt ?? session.startedAt ?? session.createdAt ?? 0;
}

export function getDmThreadActivitySignal(
  thread: DmThreadActivity,
  seenAt = 0,
  now = Date.now()
): ActivitySignal {
  const activityAt = getDmThreadActivityAt(thread);
  if (!activityAt) return null;

  const age = Math.max(now - activityAt, 0);
  const unseen = activityAt > seenAt;
  const hasMessage = Boolean(thread.lastMessageText?.trim());

  if (unseen && age <= FRESH_WINDOW_MS) {
    return {
      kind: hasMessage ? "new_message" : "fresh_contact",
      tone: "fresh",
      activityAt,
    };
  }

  if (age <= RECENT_WINDOW_MS) {
    return {
      kind: hasMessage ? "recent_active" : "fresh_contact",
      tone: "recent",
      activityAt,
    };
  }

  return null;
}

export function getPlaySessionActivitySignal(
  session: PlaySessionActivity,
  seenAt = 0,
  now = Date.now()
): ActivitySignal {
  const activityAt = getPlaySessionActivityAt(session);
  if (!activityAt) return null;

  const age = Math.max(now - activityAt, 0);
  const unseen = activityAt > seenAt;

  if (unseen && age <= FRESH_WINDOW_MS) {
    return {
      kind: "new_story",
      tone: "fresh",
      activityAt,
    };
  }

  if (age <= RECENT_WINDOW_MS) {
    return {
      kind: "recent_story",
      tone: "recent",
      activityAt,
    };
  }

  return null;
}

export function formatActivitySignalLabel(
  signal: ActivitySignal,
  translate: (key: string, fallback: string) => string
) {
  if (!signal) return "";

  switch (signal.kind) {
    case "new_message":
      return translate("activitySignals.newMessage", "Новое");
    case "fresh_contact":
      return signal.tone === "fresh"
        ? translate("activitySignals.freshContact", "Свежий контакт")
        : translate("activitySignals.recent", "Недавно");
    case "recent_active":
      return translate("activitySignals.recentActive", "Недавно активен");
    case "new_story":
      return translate("activitySignals.newStory", "Новое");
    case "recent_story":
      return translate("activitySignals.recentStory", "Недавно");
    default:
      return "";
  }
}
