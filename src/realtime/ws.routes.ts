import type { WebSocket } from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { verifyAccessToken } from "../auth/jwt";
import * as chatService from "../chat/chat.service";
import * as togetherService from "../together/together.service";
import { wsHub } from "./ws.hub";
import { findUserAccessState } from "../users/users.repo";
import {
  acquireSharedWsUserConnection,
  consumeSharedWsConnectionAttempt,
  releaseSharedWsUserConnection,
} from "./realtime-bus";

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
const MAX_PENDING_AUTH_MESSAGES = 10;

export async function wsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", { websocket: true }, (socket, request) => {
    void beginSocket(socket, request);
  });
}

async function beginSocket(socket: WebSocket, request: FastifyRequest): Promise<void> {
    const pendingMessages: string[] = [];
    let authenticatedUserId: string | undefined;
    let expiryTimer: NodeJS.Timeout | undefined;
    let registeredWithHub = false;
    let sharedUserLeaseId: string | undefined;

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
      void releaseSharedWsUserConnection(sharedUserLeaseId);
      sharedUserLeaseId = undefined;
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);

    const sharedDecision = await consumeSharedWsConnectionAttempt(request.ip);
    if (!(sharedDecision ?? consumeConnectionAttempt(request.ip))) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: "error", code: "rate_limited", retryAfterSeconds: 60 }));
        socket.close(1008, "Connection rate limit exceeded");
      }
      return;
    }

    void authenticateSocket(socket, request).then(async (auth) => {
      if (!auth || socket.readyState !== 1) return;
      const lease = await acquireSharedWsUserConnection(auth.userId);
      if (lease === null || socket.readyState !== 1) {
        if (lease) await releaseSharedWsUserConnection(lease);
        if (socket.readyState === 1) socket.close(1008, "Connection limit exceeded");
        return;
      }
      sharedUserLeaseId = lease;
      if (!wsHub.addSocket(auth.userId, socket, auth.authVersion)) {
        await releaseSharedWsUserConnection(sharedUserLeaseId);
        sharedUserLeaseId = undefined;
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
): Promise<{ userId: string; authVersion: number; expiresAtMs: number } | undefined> {
  const token = authTokenFromRequest(request);
  if (!token) {
    socket.close(1008, "Authentication is required");
    return undefined;
  }

  try {
    const payload = verifyAccessToken(token);
    const userId = payload.sub;
    const accessState = await findUserAccessState(userId);
    if (accessState?.accountStatus !== "active" || accessState.authVersion !== payload.ver) {
      socket.close(1008, "Account is not active");
      return undefined;
    }
    return { userId, authVersion: payload.ver, expiresAtMs: payload.exp * 1000 };
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
  return current.count <= env.WS_CONNECTION_ATTEMPT_LIMIT_PER_MINUTE;
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
      if (!wsHub.subscribeInbox(socket)) {
        wsHub.sendError(socket, "subscription_limit", "Subscription limit reached");
      } else {
        wsHub.sendSubscriptionAck(socket, "subscribed", "inbox");
      }
    } else {
      wsHub.unsubscribeInbox(socket);
      wsHub.sendSubscriptionAck(socket, "unsubscribed", "inbox");
    }
    return;
  }

  if (message.channel === "thread") {
    if (!(await chatService.canAccessThread(userId, message.threadId))) {
      wsHub.sendError(socket, "not_found", "Thread not found");
      return;
    }

    if (message.type === "subscribe") {
      if (!wsHub.subscribeThread(socket, message.threadId)) {
        wsHub.sendError(socket, "subscription_limit", "Subscription limit reached");
      } else {
        wsHub.sendSubscriptionAck(socket, "subscribed", "thread", { threadId: message.threadId });
      }
    } else {
      wsHub.unsubscribeThread(socket, message.threadId);
      wsHub.sendSubscriptionAck(socket, "unsubscribed", "thread", { threadId: message.threadId });
    }
    return;
  }

  if (!(await togetherService.canAccessSession(userId, message.sessionId))) {
    wsHub.sendError(socket, "not_found", "Together session not found");
    return;
  }

  if (message.type === "subscribe") {
    if (!wsHub.subscribeTogether(socket, message.sessionId)) {
      wsHub.sendError(socket, "subscription_limit", "Subscription limit reached");
    } else {
      wsHub.sendSubscriptionAck(socket, "subscribed", "together", { sessionId: message.sessionId });
    }
  } else {
    wsHub.unsubscribeTogether(socket, message.sessionId);
    wsHub.sendSubscriptionAck(socket, "unsubscribed", "together", { sessionId: message.sessionId });
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
