import type { WebSocket } from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../auth/jwt";
import * as chatService from "../chat/chat.service";
import * as togetherService from "../together/together.service";
import { wsHub } from "./ws.hub";

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

export async function wsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", { websocket: true }, (socket, request) => {
    const userId = authenticateSocket(socket, request);
    if (!userId) {
      return;
    }

    wsHub.addSocket(userId, socket);

    socket.on("message", (raw: { toString(): string }) => {
      void handleClientMessage(socket, userId, raw.toString());
    });

    socket.on("close", () => {
      wsHub.removeSocket(socket);
    });

    socket.on("error", () => {
      wsHub.removeSocket(socket);
    });
  });
}

function authenticateSocket(socket: WebSocket, request: FastifyRequest): string | undefined {
  const token = authTokenFromRequest(request);
  if (!token) {
    socket.close(1008, "Authentication is required");
    return undefined;
  }

  try {
    return verifyAccessToken(token).sub;
  } catch {
    socket.close(1008, "Invalid access token");
    return undefined;
  }
}

function authTokenFromRequest(request: FastifyRequest): string | undefined {
  const queryToken = new URL(request.url, "http://localhost").searchParams.get("token")?.trim();
  if (queryToken) {
    return queryToken;
  }

  const authorization = firstHeaderValue(request.headers.authorization);
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
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
