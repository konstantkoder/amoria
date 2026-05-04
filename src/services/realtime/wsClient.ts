import { WS_URL } from "@/config/runtimeConfig";
import { getAccessToken } from "@/services/session/tokenStore";

export type RealtimeMessage = {
  type?: string;
  [key: string]: unknown;
};

type RealtimeHandler = (message: RealtimeMessage) => void;

const MAX_DEV_RECONNECT_ATTEMPTS = 3;

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualDisconnect = false;
const handlers = new Set<RealtimeHandler>();
const subscribedThreads = new Set<string>();
const subscribedTogetherSessions = new Set<string>();
let inboxSubscribed = false;

function getWsUrl() {
  const baseUrl = String(WS_URL ?? "").trim();
  const token = getAccessToken();
  if (!baseUrl || !token) return "";

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

function sendJson(payload: Record<string, unknown>) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function replaySubscriptions() {
  if (inboxSubscribed) {
    sendJson({ type: "subscribe", channel: "inbox" });
  }

  for (const threadId of subscribedThreads) {
    sendJson({ type: "subscribe", channel: "thread", threadId });
  }

  for (const sessionId of subscribedTogetherSessions) {
    sendJson({ type: "subscribe", channel: "together", sessionId });
  }
}

function scheduleReconnect() {
  if (manualDisconnect || !__DEV__) return;
  if (reconnectAttempts >= MAX_DEV_RECONNECT_ATTEMPTS) return;

  reconnectAttempts += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, reconnectAttempts * 1000);
}

export function connect(): WebSocket | null {
  const wsUrl = getWsUrl();
  if (!wsUrl) return null;

  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  ) {
    return socket;
  }

  manualDisconnect = false;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    reconnectAttempts = 0;
    replaySubscriptions();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(String(event.data ?? "{}")) as RealtimeMessage;
      for (const handler of handlers) {
        handler(data);
      }
    } catch {
      // Ignore malformed realtime payloads.
    }
  };

  socket.onerror = () => undefined;

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  return socket;
}

export function onMessage(handler: RealtimeHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function subscribeInbox(): void {
  inboxSubscribed = true;
  connect();
  sendJson({ type: "subscribe", channel: "inbox" });
}

export function subscribeThread(threadId: string): void {
  const stableThreadId = String(threadId ?? "").trim();
  if (!stableThreadId) return;

  subscribedThreads.add(stableThreadId);
  connect();
  sendJson({ type: "subscribe", channel: "thread", threadId: stableThreadId });
}

export function unsubscribeThread(threadId: string): void {
  const stableThreadId = String(threadId ?? "").trim();
  if (!stableThreadId) return;

  subscribedThreads.delete(stableThreadId);
  sendJson({ type: "unsubscribe", channel: "thread", threadId: stableThreadId });
}

export function subscribeTogetherSession(sessionId: string): void {
  const stableSessionId = String(sessionId ?? "").trim();
  if (!stableSessionId) return;

  subscribedTogetherSessions.add(stableSessionId);
  connect();
  sendJson({ type: "subscribe", channel: "together", sessionId: stableSessionId });
}

export function unsubscribeTogetherSession(sessionId: string): void {
  const stableSessionId = String(sessionId ?? "").trim();
  if (!stableSessionId) return;

  subscribedTogetherSessions.delete(stableSessionId);
  sendJson({ type: "unsubscribe", channel: "together", sessionId: stableSessionId });
}

export function disconnect(): void {
  manualDisconnect = true;
  reconnectAttempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (socket) {
    socket.close();
    socket = null;
  }
}
