import { WS_URL } from "@/config/runtimeConfig";
import { getAccessToken } from "@/services/session/tokenStore";

export type RealtimeMessage = {
  type?: string;
  [key: string]: unknown;
};

type RealtimeHandler = (message: RealtimeMessage) => void;

const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

let socket: WebSocket | null = null;
let socketAccessToken: string | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualDisconnect = false;
const handlers = new Set<RealtimeHandler>();
const subscribedThreads = new Set<string>();
const subscribedTogetherSessions = new Set<string>();
let inboxSubscribed = false;

type NativeWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

export type RealtimeConnectionState =
  | "closed"
  | "connecting"
  | "open"
  | "closing"
  | "unknown";

export function getConnectionState(): RealtimeConnectionState {
  if (!socket) return "closed";
  if (socket.readyState === WebSocket.CONNECTING) return "connecting";
  if (socket.readyState === WebSocket.OPEN) return "open";
  if (socket.readyState === WebSocket.CLOSING) return "closing";
  if (socket.readyState === WebSocket.CLOSED) return "closed";
  return "unknown";
}

function getWsConnection() {
  const baseUrl = String(WS_URL ?? "").trim();
  const token = getAccessToken();
  if (!baseUrl || !token) return null;

  return { baseUrl, token };
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
  if (manualDisconnect) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

  reconnectAttempts += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  const exponentialDelay = RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempts - 1);
  const jitter = Math.floor(Math.random() * 300);
  const delayMs = Math.min(exponentialDelay + jitter, RECONNECT_MAX_DELAY_MS);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delayMs);
}

export function connect(): WebSocket | null {
  const connection = getWsConnection();
  if (!connection) return null;

  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  ) {
    if (socketAccessToken === connection.token) return socket;

    // Never reuse a socket authenticated for a previous login session.
    const staleSocket = socket;
    socket = null;
    socketAccessToken = null;
    staleSocket.close();
  }

  manualDisconnect = false;
  const NativeWebSocket = WebSocket as unknown as NativeWebSocketConstructor;
  let nextSocket: WebSocket;
  try {
    nextSocket = new NativeWebSocket(connection.baseUrl, undefined, {
      headers: {
        Authorization: `Bearer ${connection.token}`,
      },
    });
  } catch {
    socket = null;
    socketAccessToken = null;
    return null;
  }
  socket = nextSocket;
  socketAccessToken = connection.token;

  nextSocket.onopen = () => {
    if (socket !== nextSocket || socketAccessToken !== connection.token) {
      nextSocket.close();
      return;
    }
    reconnectAttempts = 0;
    replaySubscriptions();
  };

  nextSocket.onmessage = (event) => {
    if (socket !== nextSocket) return;
    try {
      const data = JSON.parse(String(event.data ?? "{}")) as RealtimeMessage;
      for (const handler of handlers) {
        handler(data);
      }
    } catch {
      // Ignore malformed realtime payloads.
    }
  };

  nextSocket.onerror = () => undefined;

  nextSocket.onclose = () => {
    if (socket !== nextSocket) return;
    socket = null;
    socketAccessToken = null;
    scheduleReconnect();
  };

  return nextSocket;
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
    const currentSocket = socket;
    socket = null;
    socketAccessToken = null;
    currentSocket.close();
  }
}

export function resetForSession(): void {
  disconnect();
  handlers.clear();
  subscribedThreads.clear();
  subscribedTogetherSessions.clear();
  inboxSubscribed = false;
}
