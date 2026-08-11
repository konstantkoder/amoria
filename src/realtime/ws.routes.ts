import type { WebSocket } from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../auth/jwt";
import * as chatService from "../chat/chat.service";
import * as togetherService from "../together/together.service";
import { wsHub } from "./ws.hub";
import { findUserAccountStatus } from "../users/users.repo";

type ClientWsMessage =
  | {
      type: "subscribe";
      channel: "inbox";
    }
  | {
      type: "subscribe";
      channel: "thread";
      threadId: string;
    }
  | {
      type: "subscribe";
      channel: "together";
      sessionId: string;
    }
  | {
      type: "unsubscribe";
      channel: "inbox";
    }
  | {
      type: "unsubscribe";
      channel: "thread";
      threadId: string;
    }
  | {
      type: "unsubscribe";
      channel: "together";
      sessionId: string;
    };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const connectionAttempts = new Map<string, { count: number; resetAt: number }>();
const CONNECTION_ATTEMPT_WINDOW_MS = 60_000;
const CONNECTION_ATTEMPT_LIMIT = 60;
const MAX_PENDING_AUTH_MESSAGES = 10;

export async function wsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", { websocket: true }, (socket, request) => {
    if (!consumeConnectionAttempt(request.ip)) {
      socket.close(1008, "Connection rate limit exceeded");
      return;
    }

    const pendingMessages: string[] = [];
    let authenticatedUserId: string | undefined;
    let expiryTimer: NodeJS.Timeout | undefined;
    let registeredWithHub = false;

    socket.on("message", (raw: { toString(): string }) => {
      const message = raw.toString();
      if (!authenticatedUserId) {
        if (pendingMessages.length >= MAX_PENDING_AUTH_MESSAGES) {
          socket.close(1008, "Too many messages before authentication");
          return;
        }
        pendingMessages.push(message);
        return;
      }
      void handleClientMessageSafely(socket, authenticatedUserId, message);
    });
    const cleanup = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      if (registeredWithHub) wsHub.removeSocket(socket);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);

    void authenticateSocket(socket, request).then((auth) => {
      if (!auth || socket.readyState !== 1) return;
      if (!wsHub.addSocket(auth.userId, socket)) {
        socket.close(1008, "Connection limit exceeded");
        return;
      }
      registeredWithHub = true;
      authenticatedUserId = auth.userId;
      const expiresInMs = Math.max(0, auth.expiresAtMs - Date.now());
      expiryTimer = setTimeout(() => socket.close(1008, "Access token expired"), expiresInMs);
      expiryTimer.unref();
      for (const message of pendingMessages.splice(0)) {
        void handleClientMessageSafely(socket, auth.userId, message);
      }
    });
  });
}

async function handleClientMessageSafely(
  socket: WebSocket,
  userId: string,
  raw: string,
): Promise<void> {
  try {
    await handleClientMessage(socket, userId, raw);
  } catch {
    wsHub.sendError(socket, "invalid_message", "Websocket request failed");
  }
}

async function authenticateSocket(
  socket: WebSocket,
  request: FastifyRequest,
): Promise<{ userId: string; expiresAtMs: number } | undefined> {
  const token = authTokenFromRequest(request);
  if (!token) {
    socket.close(1008, "Authentication is required");
    return undefined;
  }

  try {
    const payload = verifyAccessToken(token);
    const userId = payload.sub;
    if (await findUserAccountStatus(userId) !== "active") {
      socket.close(1008, "Account is not active");
      return undefined;
    }
    return { userId, expiresAtMs: payload.exp * 1000 };
  } catch {
    socket.close(1008, "Invalid access token");
    return undefined;
  }
}

function authTokenFromRequest(request: FastifyRequest): string | undefined {
  const authorization = firstHeaderValue(request.headers.authorization);
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
}

function consumeConnectionAttempt(ip: string): boolean {
  const now = Date.now();
  const current = connectionAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    if (connectionAttempts.size >= 10_000) {
      for (const [key, value] of connectionAttempts) {
        if (value.resetAt <= now) connectionAttempts.delete(key);
      }
      if (connectionAttempts.size >= 10_000) return false;
    }
    connectionAttempts.set(ip, { count: 1, resetAt: now + CONNECTION_ATTEMPT_WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= CONNECTION_ATTEMPT_LIMIT;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized ? normalized : undefined;
}

async function handleClientMessage(
  socket: WebSocket,
  userId: string,
  raw: string,
): Promise<void> {
  const message = parseClientMessage(raw);
  if (!message) {
    wsHub.sendError(socket, "invalid_message", "Invalid websocket message");
    return;
  }

  if (message.channel === "inbox") {
    if (message.type === "subscribe") {
      wsHub.subscribeInbox(socket);
    } else {
      wsHub.unsubscribeInbox(socket);
    }
    return;
  }

  if (message.channel === "thread") {
    if (!(await chatService.canAccessThread(userId, message.threadId))) {
      wsHub.sendError(socket, "not_found", "Thread not found");
      return;
    }

    if (message.type === "subscribe") {
      wsHub.subscribeThread(socket, message.threadId);
    } else {
      wsHub.unsubscribeThread(socket, message.threadId);
    }
    return;
  }

  if (!(await togetherService.canAccessSession(userId, message.sessionId))) {
    wsHub.sendError(socket, "not_found", "Together session not found");
    return;
  }

  if (message.type === "subscribe") {
    wsHub.subscribeTogether(socket, message.sessionId);
  } else {
    wsHub.unsubscribeTogether(socket, message.sessionId);
  }
}

function parseClientMessage(raw: string): ClientWsMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  const candidate = parsed as Partial<ClientWsMessage>;
  if (candidate.type !== "subscribe" && candidate.type !== "unsubscribe") {
    return undefined;
  }

  if (candidate.channel === "inbox") {
    return {
      type: candidate.type,
      channel: "inbox",
    };
  }

  if (
    candidate.channel === "thread" &&
    typeof candidate.threadId === "string" &&
    uuidPattern.test(candidate.threadId)
  ) {
    return {
      type: candidate.type,
      channel: "thread",
      threadId: candidate.threadId,
    };
  }

  if (
    candidate.channel === "together" &&
    typeof candidate.sessionId === "string" &&
    uuidPattern.test(candidate.sessionId)
  ) {
    return {
      type: candidate.type,
      channel: "together",
      sessionId: candidate.sessionId,
    };
  }

  return undefined;
}
